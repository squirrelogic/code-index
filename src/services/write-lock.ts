/**
 * Single-Writer Enforcement Pattern
 *
 * SQLite supports multiple concurrent readers but only one writer at a time.
 * This module provides utilities for managing write locks to handle
 * concurrent write attempts gracefully using exponential backoff.
 *
 * ## Pattern Overview
 *
 * SQLite uses three transaction types:
 * - DEFERRED (default): Lock acquired on first write operation
 * - IMMEDIATE: Lock acquired immediately, blocks other writers
 * - EXCLUSIVE: Lock acquired immediately, blocks all access
 *
 * This implementation uses BEGIN IMMEDIATE to acquire write locks upfront,
 * preventing SQLITE_BUSY errors during transaction execution.
 *
 * ## Usage Example
 *
 * ```typescript
 * const writeLock = new WriteLock(db);
 *
 * await writeLock.withWriteLock(async () => {
 *   // Perform write operations
 *   db.prepare('INSERT INTO files ...').run();
 *   db.prepare('UPDATE symbols ...').run();
 * });
 * ```
 *
 * ## Retry Strategy
 *
 * When a write lock cannot be acquired (SQLITE_BUSY):
 * 1. Wait with exponential backoff: 10ms, 20ms, 40ms, 80ms, ...
 * 2. Maximum backoff: 500ms per attempt
 * 3. Total timeout: Configurable (default 5000ms)
 * 4. After timeout: Throw error
 */

import type Database from 'better-sqlite3';
import { logger } from '../lib/logger.js';

/**
 * Write lock configuration
 */
export interface WriteLockConfig {
	/** Total timeout in milliseconds (default: 5000ms) */
	timeoutMs: number;
	/** Initial backoff delay in milliseconds (default: 10ms) */
	initialBackoffMs: number;
	/** Maximum backoff delay in milliseconds (default: 500ms) */
	maxBackoffMs: number;
	/** Backoff multiplier (default: 2 for exponential) */
	backoffMultiplier: number;
}

/**
 * Default write lock configuration
 */
export const DEFAULT_WRITE_LOCK_CONFIG: WriteLockConfig = {
	timeoutMs: 5000,
	initialBackoffMs: 10,
	maxBackoffMs: 500,
	backoffMultiplier: 2,
};

/**
 * Write Lock Manager
 *
 * Manages write locks using BEGIN IMMEDIATE with exponential backoff
 * for handling SQLITE_BUSY errors gracefully.
 */
export class WriteLock {
	private db: Database.Database;
	private config: WriteLockConfig;

	constructor(db: Database.Database, config: Partial<WriteLockConfig> = {}) {
		this.db = db;
		this.config = { ...DEFAULT_WRITE_LOCK_CONFIG, ...config };
	}

	/**
	 * Acquire a write lock with exponential backoff retry
	 *
	 * Uses BEGIN IMMEDIATE to acquire the lock immediately.
	 * If the database is busy, retries with exponential backoff.
	 *
	 * @returns True if lock acquired, false if timeout
	 * @throws Error if database error other than SQLITE_BUSY
	 */
	async acquireWriteLock(): Promise<boolean> {
		const startTime = Date.now();
		let backoffMs = this.config.initialBackoffMs;
		let attempt = 0;

		while (Date.now() - startTime < this.config.timeoutMs) {
			attempt++;

			try {
				// Try to begin an IMMEDIATE transaction
				// This will fail with SQLITE_BUSY if another writer is active
				this.db.prepare('BEGIN IMMEDIATE').run();

				logger.debug('Write lock acquired', {
					attempt,
					elapsedMs: Date.now() - startTime,
				});

				return true;
			} catch (error: any) {
				// Check if error is SQLITE_BUSY
				if (error.code === 'SQLITE_BUSY') {
					logger.debug('Database busy, retrying', {
						attempt,
						backoffMs,
						elapsedMs: Date.now() - startTime,
					});

					// Wait before retrying
					await this.sleep(backoffMs);

					// Calculate next backoff with exponential increase
					backoffMs = Math.min(
						backoffMs * this.config.backoffMultiplier,
						this.config.maxBackoffMs
					);
				} else {
					// Non-BUSY error, throw immediately
					logger.error('Write lock acquisition failed', {
						error: error.message,
						code: error.code,
					});
					throw error;
				}
			}
		}

		// Timeout reached
		logger.warn('Write lock acquisition timeout', {
			attempts: attempt,
			timeoutMs: this.config.timeoutMs,
		});

		return false;
	}

	/**
	 * Release the write lock by committing or rolling back the transaction
	 *
	 * @param commit - If true, commit; if false, rollback
	 */
	releaseWriteLock(commit: boolean = true): void {
		try {
			if (commit) {
				this.db.prepare('COMMIT').run();
				logger.debug('Write lock released (committed)');
			} else {
				this.db.prepare('ROLLBACK').run();
				logger.debug('Write lock released (rolled back)');
			}
		} catch (error) {
			logger.error('Error releasing write lock', {
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	/**
	 * Execute a function with write lock protection
	 *
	 * Automatically handles lock acquisition, execution, and release.
	 * Commits on success, rolls back on error.
	 *
	 * @param fn - Function to execute with write lock
	 * @returns Promise resolving to the function's return value
	 * @throws Error if lock cannot be acquired or function throws
	 */
	async withWriteLock<T>(fn: () => T | Promise<T>): Promise<T> {
		// Acquire lock
		const acquired = await this.acquireWriteLock();

		if (!acquired) {
			throw new Error(
				`Failed to acquire write lock within ${this.config.timeoutMs}ms timeout`
			);
		}

		try {
			// Execute function
			const result = await fn();

			// Commit on success
			this.releaseWriteLock(true);

			return result;
		} catch (error) {
			// Rollback on error
			this.releaseWriteLock(false);

			logger.error('Write lock function failed', {
				error: error instanceof Error ? error.message : String(error),
			});

			throw error;
		}
	}

	/**
	 * Execute a function with write lock, but don't commit automatically
	 *
	 * Useful when you want manual control over commit/rollback.
	 * Caller must manually call releaseWriteLock().
	 *
	 * @param fn - Function to execute with write lock
	 * @returns Promise resolving to the function's return value
	 * @throws Error if lock cannot be acquired or function throws
	 */
	async withWriteLockNoCommit<T>(fn: () => T | Promise<T>): Promise<T> {
		// Acquire lock
		const acquired = await this.acquireWriteLock();

		if (!acquired) {
			throw new Error(
				`Failed to acquire write lock within ${this.config.timeoutMs}ms timeout`
			);
		}

		try {
			// Execute function
			return await fn();
		} catch (error) {
			// Rollback on error
			this.releaseWriteLock(false);
			throw error;
		}
	}

	/**
	 * Check if a transaction is currently active
	 *
	 * @returns True if in transaction
	 */
	isInTransaction(): boolean {
		try {
			// Try to begin a transaction
			// If we're already in one, this will fail
			this.db.prepare('BEGIN DEFERRED').run();
			this.db.prepare('ROLLBACK').run();
			return false;
		} catch (error: any) {
			// SQLITE_ERROR with "cannot start a transaction within a transaction"
			return error.code === 'SQLITE_ERROR';
		}
	}

	/**
	 * Sleep for a specified duration
	 * @private
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<WriteLockConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Get current configuration
	 */
	getConfig(): WriteLockConfig {
		return { ...this.config };
	}
}

/**
 * Helper function to create a write lock with custom timeout
 *
 * @param db - Database instance
 * @param timeoutMs - Timeout in milliseconds
 * @returns WriteLock instance
 */
export function createWriteLock(
	db: Database.Database,
	timeoutMs?: number
): WriteLock {
	return new WriteLock(db, timeoutMs ? { timeoutMs } : {});
}
