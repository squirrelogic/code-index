/**
 * Base error class for watcher-related errors
 */
export abstract class WatcherError extends Error {
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly retryable: boolean;

  constructor(message: string, code: string, category: ErrorCategory, retryable: boolean = false) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.category = category;
    this.retryable = retryable;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  /**
   * Transient errors that may resolve on retry
   */
  TRANSIENT = 'transient',

  /**
   * Permanent errors that won't resolve on retry
   */
  PERMANENT = 'permanent',

  /**
   * Fatal errors that require restart
   */
  FATAL = 'fatal'
}

/**
 * File access error (permissions, locking, etc.)
 */
export class FileAccessError extends WatcherError {
  public readonly path: string;
  public readonly operation: string;
  public readonly originalError?: Error;

  constructor(path: string, operation: string, originalError?: Error) {
    const message = `Failed to ${operation} file: ${path}${originalError ? ` - ${originalError.message}` : ''}`;
    super(message, 'FILE_ACCESS_ERROR', ErrorCategory.TRANSIENT, true);
    this.path = path;
    this.operation = operation;
    this.originalError = originalError;
  }
}

/**
 * Watcher timeout error
 */
export class WatcherTimeoutError extends WatcherError {
  public readonly operation: string;
  public readonly timeout: number;

  constructor(operation: string, timeout: number) {
    const message = `Operation '${operation}' timed out after ${timeout}ms`;
    super(message, 'WATCHER_TIMEOUT', ErrorCategory.TRANSIENT, true);
    this.operation = operation;
    this.timeout = timeout;
  }
}

/**
 * Git hook error
 */
export class GitHookError extends WatcherError {
  public readonly hook: string;
  public readonly originalError?: Error;

  constructor(hook: string, message: string, originalError?: Error, retryable: boolean = false) {
    const fullMessage = `Git hook '${hook}' error: ${message}${originalError ? ` - ${originalError.message}` : ''}`;
    super(fullMessage, 'GIT_HOOK_ERROR', ErrorCategory.PERMANENT, retryable);
    this.hook = hook;
    this.originalError = originalError;
  }
}

/**
 * Memory threshold exceeded error
 */
export class MemoryThresholdError extends WatcherError {
  public readonly currentMemoryMB: number;
  public readonly thresholdMB: number;

  constructor(currentMemoryMB: number, thresholdMB: number) {
    const message = `Memory usage (${currentMemoryMB}MB) exceeds threshold (${thresholdMB}MB)`;
    super(message, 'MEMORY_THRESHOLD', ErrorCategory.TRANSIENT, false);
    this.currentMemoryMB = currentMemoryMB;
    this.thresholdMB = thresholdMB;
  }
}

/**
 * Queue overflow error
 */
export class QueueOverflowError extends WatcherError {
  public readonly queueSize: number;
  public readonly maxSize: number;

  constructor(queueSize: number, maxSize: number) {
    const message = `Event queue size (${queueSize}) exceeds maximum (${maxSize})`;
    super(message, 'QUEUE_OVERFLOW', ErrorCategory.TRANSIENT, false);
    this.queueSize = queueSize;
    this.maxSize = maxSize;
  }
}

/**
 * Configuration validation error
 */
export class ConfigurationError extends WatcherError {
  public readonly field: string;
  public readonly value: any;

  constructor(field: string, value: any, reason: string) {
    const message = `Invalid configuration for '${field}': ${reason} (value: ${JSON.stringify(value)})`;
    super(message, 'CONFIG_ERROR', ErrorCategory.PERMANENT, false);
    this.field = field;
    this.value = value;
  }
}

/**
 * Pattern matching error
 */
export class PatternError extends WatcherError {
  public readonly pattern: string;

  constructor(pattern: string, reason: string) {
    const message = `Invalid pattern '${pattern}': ${reason}`;
    super(message, 'PATTERN_ERROR', ErrorCategory.PERMANENT, false);
    this.pattern = pattern;
  }
}

/**
 * Database operation error
 */
export class DatabaseError extends WatcherError {
  public readonly operation: string;
  public readonly originalError?: Error;

  constructor(operation: string, originalError?: Error) {
    const message = `Database operation '${operation}' failed${originalError ? `: ${originalError.message}` : ''}`;
    super(message, 'DATABASE_ERROR', ErrorCategory.TRANSIENT, true);
    this.operation = operation;
    this.originalError = originalError;
  }
}

/**
 * Determines if an error is retryable based on its type and properties
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof WatcherError) {
    return error.retryable;
  }

  // Check for common retryable system errors
  if (error instanceof Error) {
    const code = (error as any).code;
    const retryableCodes = [
      'EBUSY',      // Resource busy
      'EAGAIN',     // Try again
      'ETIMEDOUT',  // Operation timed out
      'ENOTFOUND',  // DNS lookup failed
      'ECONNRESET', // Connection reset
      'EPIPE',      // Broken pipe
      'EMFILE',     // Too many open files
      'ENFILE',     // Too many open files in system
    ];
    return retryableCodes.includes(code);
  }

  return false;
}

/**
 * Gets the error category for any error
 */
export function getErrorCategory(error: unknown): ErrorCategory {
  if (error instanceof WatcherError) {
    return error.category;
  }

  if (error instanceof Error) {
    const code = (error as any).code;

    // Fatal errors
    if (['EACCES', 'EPERM', 'ENOENT'].includes(code)) {
      return ErrorCategory.PERMANENT;
    }

    // Transient errors
    if (isRetryableError(error)) {
      return ErrorCategory.TRANSIENT;
    }
  }

  return ErrorCategory.PERMANENT;
}