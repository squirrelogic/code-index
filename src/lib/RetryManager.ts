import { isRetryableError, ErrorCategory, getErrorCategory } from './errors/WatcherErrors.js';

/**
 * Options for retry operations
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxAttempts?: number;

  /**
   * Initial delay in milliseconds before first retry
   * @default 1000
   */
  initialDelay?: number;

  /**
   * Maximum delay in milliseconds between retries
   * @default 32000
   */
  maxDelay?: number;

  /**
   * Exponential backoff factor
   * @default 2
   */
  backoffFactor?: number;

  /**
   * Whether to add jitter to delays
   * @default true
   */
  jitter?: boolean;

  /**
   * Custom function to determine if error is retryable
   */
  isRetryable?: (error: unknown, attempt: number) => boolean;

  /**
   * Callback for each retry attempt
   */
  onRetry?: (error: unknown, attempt: number, nextDelay: number) => void;
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  success: boolean;
  value?: T;
  error?: unknown;
  attempts: number;
  totalTime: number;
}

/**
 * Manages retry operations with exponential backoff
 */
export class RetryManager {
  private readonly defaultOptions: Required<RetryOptions> = {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 32000,
    backoffFactor: 2,
    jitter: true,
    isRetryable: isRetryableError,
    onRetry: () => {}
  };

  /**
   * Creates a new RetryManager instance
   */
  constructor(private readonly globalOptions?: RetryOptions) {}

  /**
   * Executes an operation with retry logic
   * @param operation The async operation to execute
   * @param options Override options for this operation
   * @returns The result of the operation
   */
  async retry<T>(
    operation: () => Promise<T>,
    options?: RetryOptions
  ): Promise<RetryResult<T>> {
    const opts = this.mergeOptions(options);
    const startTime = Date.now();
    let lastError: unknown;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      try {
        const value = await operation();
        return {
          success: true,
          value,
          attempts: attempt,
          totalTime: Date.now() - startTime
        };
      } catch (error) {
        lastError = error;

        // Check if we should retry
        if (attempt >= opts.maxAttempts || !opts.isRetryable(error, attempt)) {
          break;
        }

        // Calculate next delay
        const nextDelay = this.calculateDelay(attempt, opts);

        // Notify about retry
        opts.onRetry(error, attempt, nextDelay);

        // Wait before next attempt
        await this.delay(nextDelay);
      }
    }

    // All attempts failed
    return {
      success: false,
      error: lastError,
      attempts: opts.maxAttempts,
      totalTime: Date.now() - startTime
    };
  }

  /**
   * Executes an operation with retry logic and throws on failure
   * @param operation The async operation to execute
   * @param options Override options for this operation
   * @returns The result of the operation
   * @throws The last error if all retries fail
   */
  async retryOrThrow<T>(
    operation: () => Promise<T>,
    options?: RetryOptions
  ): Promise<T> {
    const result = await this.retry(operation, options);
    if (!result.success) {
      throw result.error;
    }
    return result.value!;
  }

  /**
   * Alias for retryOrThrow - executes an operation with retry logic
   * @param operation The async operation to execute
   * @returns The result of the operation
   * @throws The last error if all retries fail
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return this.retryOrThrow(operation);
  }

  /**
   * Calculates the delay for the next retry attempt
   */
  private calculateDelay(attempt: number, options: Required<RetryOptions>): number {
    // Exponential backoff: delay = initialDelay * (backoffFactor ^ (attempt - 1))
    let delay = options.initialDelay * Math.pow(options.backoffFactor, attempt - 1);

    // Apply maximum delay cap
    delay = Math.min(delay, options.maxDelay);

    // Add jitter if enabled (±25% randomization)
    if (options.jitter) {
      const jitterRange = delay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      delay = Math.max(0, delay + jitter);
    }

    return Math.floor(delay);
  }

  /**
   * Delays execution for the specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Merges options with defaults
   */
  private mergeOptions(options?: RetryOptions): Required<RetryOptions> {
    return {
      ...this.defaultOptions,
      ...this.globalOptions,
      ...options
    };
  }
}

/**
 * Default retry manager instance with standard configuration
 */
export const defaultRetryManager = new RetryManager();

/**
 * Retry decorator for class methods
 * @param options Retry options
 */
export function Retryable(options?: RetryOptions) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const manager = new RetryManager(options);
      return manager.retryOrThrow(
        () => originalMethod.apply(this, args),
        options
      );
    };

    return descriptor;
  };
}

/**
 * Creates a retry manager with specific error categories to retry
 */
export function createCategoryRetryManager(
  categories: ErrorCategory[],
  options?: RetryOptions
): RetryManager {
  return new RetryManager({
    ...options,
    isRetryable: (error) => {
      const category = getErrorCategory(error);
      return categories.includes(category);
    }
  });
}

/**
 * Retry manager for transient errors only
 */
export const transientRetryManager = createCategoryRetryManager([ErrorCategory.TRANSIENT], {
  maxAttempts: 3,
  initialDelay: 1000,
  backoffFactor: 2
});

/**
 * Retry manager for file operations
 */
export const fileRetryManager = new RetryManager({
  maxAttempts: 5,
  initialDelay: 500,
  maxDelay: 5000,
  backoffFactor: 1.5,
  isRetryable: (error: unknown) => {
    if (!isRetryableError(error)) {
      return false;
    }

    // Additional checks for file operations
    if (error instanceof Error) {
      const code = (error as any).code;
      // Don't retry permission or not found errors for files
      if (['EACCES', 'EPERM', 'ENOENT'].includes(code)) {
        return false;
      }
    }

    return true;
  }
});