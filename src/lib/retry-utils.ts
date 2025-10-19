/**
 * Retry Utilities with Exponential Backoff
 *
 * Provides retry logic with exponential backoff for transient failures.
 * Based on research.md lines 310-352
 */

import { Result, err } from 'neverthrow';
import { AdapterError } from '../services/embedding/adapter-interface.js';

/**
 * Retry configuration
 */
export interface RetryConfig {
	/** Maximum number of retry attempts */
	maxRetries: number;

	/** Initial delay in milliseconds */
	initialDelayMs: number;

	/** Maximum delay in milliseconds */
	maxDelayMs: number;

	/** Backoff multiplier (typically 2 for exponential) */
	backoffMultiplier: number;

	/** Error codes that should trigger retry */
	retryableErrors: string[];
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
	maxRetries: 3,
	initialDelayMs: 1000,
	maxDelayMs: 30000,
	backoffMultiplier: 2,
	retryableErrors: [
		'ADAPTER_NETWORK_ERROR',
		'ADAPTER_TIMEOUT',
		'ADAPTER_RATE_LIMIT',
	],
};

/**
 * Sleep for specified milliseconds
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after delay
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute function with exponential backoff retry
 *
 * Retries the function on retryable errors with exponential backoff.
 * Non-retryable errors are returned immediately without retry.
 *
 * @param fn - Function to execute (should return Result)
 * @param config - Retry configuration
 * @returns Result from successful execution or final error
 */
export async function withRetry<T>(
	fn: () => Promise<Result<T, AdapterError>>,
	config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<Result<T, AdapterError>> {
	let lastError: AdapterError | undefined;

	for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
		const result = await fn();

		// Success - return immediately
		if (result.isOk()) {
			return result;
		}

		const error = result.error;
		lastError = error;

		// Don't retry non-retryable errors
		if (!error.retryable || !config.retryableErrors.includes(error.code)) {
			return result;
		}

		// Don't retry on last attempt
		if (attempt === config.maxRetries) {
			break;
		}

		// Calculate exponential backoff delay
		const delay = Math.min(
			config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
			config.maxDelayMs
		);

		// Special handling for rate limit errors with retry-after header
		const actualDelay =
			error.code === 'ADAPTER_RATE_LIMIT' &&
			'retryAfterMs' in error &&
			typeof error.retryAfterMs === 'number'
				? error.retryAfterMs
				: delay;

		// Log retry attempt (in production, use proper logger)
		if (process.env.NODE_ENV !== 'test') {
			console.log(
				`  Retry attempt ${attempt + 1}/${config.maxRetries} after ${actualDelay}ms (${error.code})`
			);
		}

		await sleep(actualDelay);
	}

	return err(lastError!);
}

/**
 * Add jitter to delay to avoid thundering herd
 *
 * @param delayMs - Base delay in milliseconds
 * @param jitterFactor - Jitter factor (0-1, default 0.1 = 10%)
 * @returns Delay with random jitter applied
 */
export function addJitter(delayMs: number, jitterFactor: number = 0.1): number {
	const jitter = delayMs * jitterFactor * Math.random();
	return Math.floor(delayMs + jitter);
}

/**
 * Create a retry configuration with custom settings
 *
 * @param overrides - Partial configuration to override defaults
 * @returns Complete retry configuration
 */
export function createRetryConfig(
	overrides: Partial<RetryConfig>
): RetryConfig {
	return {
		...DEFAULT_RETRY_CONFIG,
		...overrides,
	};
}

/**
 * Retry statistics for monitoring
 */
export interface RetryStats {
	/** Total attempts made */
	attempts: number;

	/** Whether operation succeeded */
	success: boolean;

	/** Total time spent including delays */
	totalDurationMs: number;

	/** Final error if failed */
	error?: AdapterError;
}

/**
 * Execute function with retry and collect statistics
 *
 * @param fn - Function to execute
 * @param config - Retry configuration
 * @returns Result and retry statistics
 */
export async function withRetryStats<T>(
	fn: () => Promise<Result<T, AdapterError>>,
	config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<{ result: Result<T, AdapterError>; stats: RetryStats }> {
	const startTime = Date.now();
	let attempts = 0;

	const result = await withRetry(async () => {
		attempts++;
		return fn();
	}, config);

	const stats: RetryStats = {
		attempts,
		success: result.isOk(),
		totalDurationMs: Date.now() - startTime,
		error: result.isErr() ? result.error : undefined,
	};

	return { result, stats };
}
