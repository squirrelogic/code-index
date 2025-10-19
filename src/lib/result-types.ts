/**
 * Result Type Utilities
 *
 * Re-exports and utilities for the Result/Either monad pattern using neverthrow.
 * Provides type-safe error handling without exceptions.
 *
 * Based on research.md section 2.1 (Result/Either Pattern)
 */

// Re-export core neverthrow types
import {
	Result as NeverthrowResult,
	Ok,
	Err,
	ok as neverthrowOk,
	err as neverthrowErr,
	ResultAsync,
	okAsync,
	errAsync,
	fromPromise as neverthrowFromPromise,
	fromThrowable as neverthrowFromThrowable,
} from 'neverthrow';

export type Result<T, E> = NeverthrowResult<T, E>;
export { Ok, Err, ResultAsync, okAsync, errAsync };
export const ok = neverthrowOk;
export const err = neverthrowErr;
export const fromPromise = neverthrowFromPromise;
export const fromThrowable = neverthrowFromThrowable;

/**
 * Type guard to check if a Result is Ok
 */
export function isOk<T, E>(result: Result<T, E>): result is Result<T, never> {
	return result.isOk();
}

/**
 * Type guard to check if a Result is Err
 */
export function isErr<T, E>(result: Result<T, E>): result is Result<never, E> {
	return result.isErr();
}

/**
 * Extract value from Result or provide default
 *
 * @param result - Result to extract from
 * @param defaultValue - Default value if Result is Err
 * @returns Extracted value or default
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
	return result.unwrapOr(defaultValue);
}

/**
 * Extract value from Result or compute default
 *
 * @param result - Result to extract from
 * @param fn - Function to compute default value from error
 * @returns Extracted value or computed default
 */
export function unwrapOrElse<T, E>(
	result: Result<T, E>,
	fn: (error: E) => T
): T {
	if (result.isOk()) {
		return result.value;
	}
	return fn(result.error);
}

/**
 * Convert a Promise to a Result, catching any thrown errors
 *
 * @param promise - Promise to convert
 * @param errorHandler - Optional function to convert caught errors
 * @returns ResultAsync
 */
export function fromPromiseWithHandler<T, E>(
	promise: Promise<T>,
	errorHandler: (error: unknown) => E
): ResultAsync<T, E> {
	return ResultAsync.fromPromise(promise, errorHandler);
}

/**
 * Combine multiple Results into a single Result
 *
 * @param results - Array of Results to combine
 * @returns Result with array of values or first error
 */
export function combineResults<T, E>(
	results: Result<T, E>[]
): Result<T[], E> {
	const values: T[] = [];

	for (const result of results) {
		if (result.isErr()) {
			return result as unknown as Result<T[], E>;
		}
		values.push(result.value);
	}

	return ok(values);
}

/**
 * Execute an async function and wrap result in Result type
 *
 * @param fn - Async function to execute
 * @param errorHandler - Function to convert errors to type E
 * @returns ResultAsync
 */
export async function tryAsync<T, E>(
	fn: () => Promise<T>,
	errorHandler: (error: unknown) => E
): Promise<Result<T, E>> {
	try {
		const value = await fn();
		return ok(value);
	} catch (error) {
		return err(errorHandler(error));
	}
}

/**
 * Execute a synchronous function and wrap result in Result type
 *
 * @param fn - Synchronous function to execute
 * @param errorHandler - Function to convert errors to type E
 * @returns Result
 */
export function trySync<T, E>(
	fn: () => T,
	errorHandler: (error: unknown) => E
): Result<T, E> {
	try {
		const value = fn();
		return ok(value);
	} catch (error) {
		return err(errorHandler(error));
	}
}
