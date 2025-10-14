/**
 * Database Maintenance Scheduler
 *
 * Provides automated maintenance tasks including:
 * - Cleanup of soft-deleted records (based on retention policy)
 * - ANALYZE to update query optimizer statistics
 * - VACUUM to reclaim disk space after significant deletions
 */

import type Database from 'better-sqlite3';
import { logger } from '../lib/logger.js';

/**
 * Maintenance configuration
 */
export interface MaintenanceConfig {
	/** How often to run cleanup (in milliseconds) */
	cleanupIntervalMs: number;
	/** Retention period for deleted records (in days) */
	retentionDays: number;
	/** Minimum deleted records to trigger VACUUM */
	vacuumThreshold: number;
	/** Enable automatic maintenance */
	enabled: boolean;
}

/**
 * Default maintenance configuration
 */
export const DEFAULT_MAINTENANCE_CONFIG: MaintenanceConfig = {
	cleanupIntervalMs: 86400000, // 24 hours
	retentionDays: 30,
	vacuumThreshold: 1000,
	enabled: true,
};

/**
 * Maintenance statistics
 */
export interface MaintenanceStats {
	lastRunTimestamp: number;
	deletedFilesCount: number;
	deletedSymbolsCount: number;
	deletedChunksCount: number;
	analyzeExecuted: boolean;
	vacuumExecuted: boolean;
	durationMs: number;
}

/**
 * Database Maintenance Scheduler
 *
 * Manages periodic database maintenance operations
 */
export class MaintenanceScheduler {
	private db: Database.Database;
	private config: MaintenanceConfig;
	private intervalId: NodeJS.Timeout | null = null;
	private isRunning = false;

	constructor(db: Database.Database, config: Partial<MaintenanceConfig> = {}) {
		this.db = db;
		this.config = { ...DEFAULT_MAINTENANCE_CONFIG, ...config };
	}

	/**
	 * Start the maintenance scheduler
	 */
	start(): void {
		if (this.intervalId) {
			logger.warn('Maintenance scheduler is already running');
			return;
		}

		if (!this.config.enabled) {
			logger.info('Maintenance scheduler is disabled');
			return;
		}

		logger.info('Starting maintenance scheduler', {
			intervalHours: this.config.cleanupIntervalMs / 3600000,
			retentionDays: this.config.retentionDays,
		});

		// Run initial maintenance
		this.runMaintenance();

		// Schedule periodic maintenance
		this.intervalId = setInterval(() => {
			this.runMaintenance();
		}, this.config.cleanupIntervalMs);
	}

	/**
	 * Stop the maintenance scheduler
	 */
	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
			logger.info('Maintenance scheduler stopped');
		}
	}

	/**
	 * Run maintenance tasks immediately
	 *
	 * @returns Maintenance statistics
	 */
	async runMaintenance(): Promise<MaintenanceStats> {
		if (this.isRunning) {
			logger.warn('Maintenance is already running, skipping this cycle');
			throw new Error('Maintenance is already running');
		}

		this.isRunning = true;
		const startTime = performance.now();

		logger.info('Starting database maintenance', {
			retentionDays: this.config.retentionDays,
		});

		try {
			// Step 1: Cleanup expired records
			const deletedFilesCount = this.cleanupDeletedFiles();
			const deletedSymbolsCount = this.cleanupDeletedSymbols();
			const deletedChunksCount = this.cleanupDeletedChunks();

			const totalDeleted =
				deletedFilesCount + deletedSymbolsCount + deletedChunksCount;

			logger.info('Cleanup completed', {
				deletedFiles: deletedFilesCount,
				deletedSymbols: deletedSymbolsCount,
				deletedChunks: deletedChunksCount,
				total: totalDeleted,
			});

			// Step 2: Update query optimizer statistics
			this.runAnalyze();
			const analyzeExecuted = true;

			// Step 3: Run VACUUM if significant deletions occurred
			let vacuumExecuted = false;
			if (totalDeleted >= this.config.vacuumThreshold) {
				this.runVacuum();
				vacuumExecuted = true;
			} else {
				logger.info('VACUUM skipped', {
					deletedRecords: totalDeleted,
					threshold: this.config.vacuumThreshold,
				});
			}

			const durationMs = performance.now() - startTime;

			const stats: MaintenanceStats = {
				lastRunTimestamp: Math.floor(Date.now() / 1000),
				deletedFilesCount,
				deletedSymbolsCount,
				deletedChunksCount,
				analyzeExecuted,
				vacuumExecuted,
				durationMs,
			};

			logger.info('Database maintenance completed', stats);

			return stats;
		} catch (error) {
			logger.error('Database maintenance failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		} finally {
			this.isRunning = false;
		}
	}

	/**
	 * Clean up expired deleted files
	 * @private
	 */
	private cleanupDeletedFiles(): number {
		const cutoffTimestamp =
			Math.floor(Date.now() / 1000) - this.config.retentionDays * 86400;

		const stmt = this.db.prepare(`
			DELETE FROM files
			WHERE deleted_at IS NOT NULL
			  AND deleted_at < ?
		`);

		const result = stmt.run(cutoffTimestamp);
		return result.changes;
	}

	/**
	 * Clean up expired deleted symbols
	 * @private
	 */
	private cleanupDeletedSymbols(): number {
		const cutoffTimestamp =
			Math.floor(Date.now() / 1000) - this.config.retentionDays * 86400;

		const stmt = this.db.prepare(`
			DELETE FROM symbols
			WHERE deleted_at IS NOT NULL
			  AND deleted_at < ?
		`);

		const result = stmt.run(cutoffTimestamp);
		return result.changes;
	}

	/**
	 * Clean up expired deleted chunks
	 * @private
	 */
	private cleanupDeletedChunks(): number {
		const cutoffTimestamp =
			Math.floor(Date.now() / 1000) - this.config.retentionDays * 86400;

		// First delete embeddings for expired chunks
		const deleteEmbeddingsStmt = this.db.prepare(`
			DELETE FROM embeddings
			WHERE chunk_id IN (
				SELECT id FROM chunks
				WHERE deleted_at IS NOT NULL
				  AND deleted_at < ?
			)
		`);
		deleteEmbeddingsStmt.run(cutoffTimestamp);

		// Then delete the chunks
		const stmt = this.db.prepare(`
			DELETE FROM chunks
			WHERE deleted_at IS NOT NULL
			  AND deleted_at < ?
		`);

		const result = stmt.run(cutoffTimestamp);
		return result.changes;
	}

	/**
	 * Run ANALYZE to update query optimizer statistics
	 * @private
	 */
	private runAnalyze(): void {
		logger.info('Running ANALYZE to update query optimizer statistics');
		const start = performance.now();

		this.db.prepare('ANALYZE').run();

		const duration = performance.now() - start;
		logger.info('ANALYZE completed', { durationMs: Math.round(duration) });
	}

	/**
	 * Run VACUUM to reclaim disk space
	 * @private
	 */
	private runVacuum(): void {
		logger.info('Running VACUUM to reclaim disk space');
		const start = performance.now();

		// Get database size before VACUUM
		const beforeStats = this.getDatabaseSize();

		this.db.prepare('VACUUM').run();

		const duration = performance.now() - start;
		const afterStats = this.getDatabaseSize();
		const savedMB = (beforeStats.sizeMB - afterStats.sizeMB).toFixed(2);

		logger.info('VACUUM completed', {
			durationMs: Math.round(duration),
			beforeSizeMB: beforeStats.sizeMB.toFixed(2),
			afterSizeMB: afterStats.sizeMB.toFixed(2),
			reclaimedMB: savedMB,
		});
	}

	/**
	 * Get database size statistics
	 * @private
	 */
	private getDatabaseSize(): { sizeBytes: number; sizeMB: number } {
		const pageCount = (
			this.db.pragma('page_count') as Array<{ page_count: number }>
		)[0]?.page_count ?? 0;
		const pageSize = (this.db.pragma('page_size') as Array<{ page_size: number }>)[0]
			?.page_size ?? 0;
		const sizeBytes = pageCount * pageSize;

		return {
			sizeBytes,
			sizeMB: sizeBytes / 1024 / 1024,
		};
	}

	/**
	 * Get maintenance status
	 */
	getStatus(): {
		enabled: boolean;
		running: boolean;
		intervalMs: number;
		retentionDays: number;
	} {
		return {
			enabled: this.config.enabled,
			running: this.isRunning,
			intervalMs: this.config.cleanupIntervalMs,
			retentionDays: this.config.retentionDays,
		};
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<MaintenanceConfig>): void {
		this.config = { ...this.config, ...config };

		// Restart scheduler if it's running
		if (this.intervalId) {
			this.stop();
			this.start();
		}
	}
}
