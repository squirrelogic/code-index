/**
 * Write-Ahead Logging (WAL) Utilities
 *
 * Provides helper functions for managing SQLite's WAL mode,
 * including checkpoint operations and WAL file management.
 */

import type Database from 'better-sqlite3';
import { logger } from './logger.js';

/**
 * WAL checkpoint modes
 */
export type WALCheckpointMode = 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE';

/**
 * WAL checkpoint result
 */
export interface WALCheckpointResult {
	mode: WALCheckpointMode;
	success: boolean;
	walPagesBeforeCheckpoint: number;
	walPagesAfterCheckpoint: number;
	pagesCheckpointed: number;
	durationMs: number;
}

/**
 * WAL file information
 */
export interface WALInfo {
	walMode: boolean;
	walExists: boolean;
	walSizeBytes: number;
	walSizeMB: number;
	checkpointThreshold: number;
}

/**
 * Perform a WAL checkpoint operation
 *
 * Checkpoint modes:
 * - PASSIVE: Checkpoint as much as possible without blocking
 * - FULL: Checkpoint all frames, wait for writers
 * - RESTART: Checkpoint all and reset WAL file
 * - TRUNCATE: Checkpoint all and truncate WAL file to zero bytes
 *
 * @param db - Database instance
 * @param mode - Checkpoint mode (default: TRUNCATE)
 * @returns Checkpoint result with statistics
 */
export function walCheckpoint(
	db: Database.Database,
	mode: WALCheckpointMode = 'TRUNCATE'
): WALCheckpointResult {
	const start = performance.now();

	logger.info('Starting WAL checkpoint', { mode });

	try {
		// Get WAL size before checkpoint
		const beforeInfo = getWALInfo(db);

		// Execute checkpoint
		const result = db.pragma(`wal_checkpoint(${mode})`) as Array<{
			busy: number;
			log: number;
			checkpointed: number;
		}>;

		if (result.length === 0 || !result[0]) {
			throw new Error('WAL checkpoint returned no results');
		}

		const { busy, log, checkpointed } = result[0];

		// Get WAL size after checkpoint
		const afterInfo = getWALInfo(db);

		const durationMs = performance.now() - start;

		const checkpointResult: WALCheckpointResult = {
			mode,
			success: busy === 0,
			walPagesBeforeCheckpoint: log,
			walPagesAfterCheckpoint: afterInfo.walExists ? log - checkpointed : 0,
			pagesCheckpointed: checkpointed,
			durationMs,
		};

		logger.info('WAL checkpoint completed', {
			...checkpointResult,
			walSizeBeforeMB: beforeInfo.walSizeMB.toFixed(2),
			walSizeAfterMB: afterInfo.walSizeMB.toFixed(2),
		});

		return checkpointResult;
	} catch (error) {
		logger.error('WAL checkpoint failed', {
			mode,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

/**
 * Get WAL file information
 *
 * @param db - Database instance
 * @returns WAL information
 */
export function getWALInfo(db: Database.Database): WALInfo {
	// Check if WAL mode is enabled
	const journalMode = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
	const walMode = journalMode.length > 0 && journalMode[0]?.journal_mode === 'wal';

	// Get checkpoint threshold
	const walAutocheckpoint = db.pragma('wal_autocheckpoint') as Array<{
		wal_autocheckpoint: number;
	}>;
	const checkpointThreshold =
		walAutocheckpoint.length > 0 ? walAutocheckpoint[0]?.wal_autocheckpoint ?? 1000 : 1000;

	// Get page size for size calculations
	const pageSize = (db.pragma('page_size') as Array<{ page_size: number }>)[0]
		?.page_size ?? 4096;

	// Check WAL size (approximation)
	// Note: SQLite doesn't provide direct WAL size query, so we estimate
	let walSizeBytes = 0;
	let walExists = false;

	if (walMode) {
		try {
			// Try to get WAL page count
			const walPages = db
				.prepare(
					`
				SELECT COUNT(*) as count
				FROM pragma_wal_checkpoint('PASSIVE')
			`
				)
				.get() as { count: number } | undefined;

			if (walPages && walPages.count > 0) {
				walExists = true;
				walSizeBytes = walPages.count * pageSize;
			}
		} catch (error) {
			// WAL info not available, use default
			walExists = false;
		}
	}

	return {
		walMode,
		walExists,
		walSizeBytes,
		walSizeMB: walSizeBytes / 1024 / 1024,
		checkpointThreshold,
	};
}

/**
 * Checkpoint WAL if it exceeds a certain size threshold
 *
 * @param db - Database instance
 * @param thresholdMB - Size threshold in megabytes (default: 10MB)
 * @param mode - Checkpoint mode (default: TRUNCATE)
 * @returns Checkpoint result if performed, null if not needed
 */
export function checkpointIfNeeded(
	db: Database.Database,
	thresholdMB: number = 10,
	mode: WALCheckpointMode = 'TRUNCATE'
): WALCheckpointResult | null {
	const walInfo = getWALInfo(db);

	if (!walInfo.walMode) {
		logger.warn('Database is not in WAL mode, checkpoint skipped');
		return null;
	}

	if (walInfo.walSizeMB < thresholdMB) {
		logger.debug('WAL size below threshold, checkpoint not needed', {
			currentSizeMB: walInfo.walSizeMB.toFixed(2),
			thresholdMB,
		});
		return null;
	}

	logger.info('WAL size exceeds threshold, performing checkpoint', {
		currentSizeMB: walInfo.walSizeMB.toFixed(2),
		thresholdMB,
	});

	return walCheckpoint(db, mode);
}

/**
 * Enable WAL mode on a database
 *
 * @param db - Database instance
 * @returns True if WAL mode was enabled successfully
 */
export function enableWALMode(db: Database.Database): boolean {
	try {
		logger.info('Enabling WAL mode');

		const result = db.pragma('journal_mode = WAL') as Array<{
			journal_mode: string;
		}>;

		const success = result.length > 0 && result[0]?.journal_mode === 'wal';

		if (success) {
			logger.info('WAL mode enabled successfully');
		} else {
			logger.error('Failed to enable WAL mode');
		}

		return success;
	} catch (error) {
		logger.error('Error enabling WAL mode', {
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}

/**
 * Set WAL auto-checkpoint threshold
 *
 * @param db - Database instance
 * @param threshold - Number of pages before auto-checkpoint (default: 1000)
 */
export function setWALAutocheckpoint(
	db: Database.Database,
	threshold: number = 1000
): void {
	logger.info('Setting WAL auto-checkpoint threshold', { threshold });

	db.pragma(`wal_autocheckpoint = ${threshold}`);

	logger.info('WAL auto-checkpoint threshold set');
}

/**
 * Perform a full WAL checkpoint and return the database to normal mode
 * This is useful for database backups or migrations
 *
 * @param db - Database instance
 * @returns True if successful
 */
export function disableWALMode(db: Database.Database): boolean {
	try {
		logger.info('Disabling WAL mode');

		// First, checkpoint the WAL file
		walCheckpoint(db, 'TRUNCATE');

		// Then switch to DELETE mode (default)
		const result = db.pragma('journal_mode = DELETE') as Array<{
			journal_mode: string;
		}>;

		const success = result.length > 0 && result[0]?.journal_mode === 'delete';

		if (success) {
			logger.info('WAL mode disabled successfully');
		} else {
			logger.error('Failed to disable WAL mode');
		}

		return success;
	} catch (error) {
		logger.error('Error disabling WAL mode', {
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}
