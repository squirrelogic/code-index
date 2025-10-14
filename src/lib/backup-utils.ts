/**
 * Backup Utilities
 *
 * Provides utilities for creating database backups, managing backup retention,
 * and restoring from backups.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Backup metadata
 */
export interface BackupInfo {
	/** Backup file path */
	path: string;
	/** Backup filename */
	filename: string;
	/** Backup creation timestamp */
	timestamp: Date;
	/** Original database path */
	originalPath: string;
	/** Backup size in bytes */
	sizeBytes: number;
}

/**
 * Backup configuration
 */
export interface BackupConfig {
	/** Backup directory (default: .codeindex/backups) */
	backupDir?: string;
	/** Number of backups to keep (default: 10) */
	keepLast?: number;
}

/**
 * Database backup manager
 */
export class BackupManager {
	private backupDir: string;
	private keepLast: number;

	constructor(config: BackupConfig = {}) {
		this.backupDir = config.backupDir ?? '.codeindex/backups';
		this.keepLast = config.keepLast ?? 10;

		// Ensure backup directory exists
		this.ensureBackupDirectory();
	}

	/**
	 * Ensure backup directory exists
	 */
	private ensureBackupDirectory(): void {
		if (!fs.existsSync(this.backupDir)) {
			fs.mkdirSync(this.backupDir, { recursive: true });
		}
	}

	/**
	 * Generate backup filename with timestamp
	 */
	private generateBackupFilename(dbPath: string): string {
		const basename = path.basename(dbPath, '.db');
		const timestamp = new Date()
			.toISOString()
			.replace(/[:.]/g, '-')
			.replace('T', '_')
			.split('Z')[0];
		return `${basename}_${timestamp}.db`;
	}

	/**
	 * Create a backup of the database using VACUUM INTO
	 *
	 * This creates a compacted copy of the database, which is more efficient
	 * than a simple file copy.
	 *
	 * @param dbPath - Path to the database file
	 * @returns Path to the backup file
	 */
	createBackup(dbPath: string): string {
		if (!fs.existsSync(dbPath)) {
			throw new Error(`Database file not found: ${dbPath}`);
		}

		const backupFilename = this.generateBackupFilename(dbPath);
		const backupPath = path.join(this.backupDir, backupFilename);

		console.log(`Creating backup: ${backupFilename}`);

		// Open database (read-only for safety)
		const db = new Database(dbPath, { readonly: true });

		try {
			// Use VACUUM INTO to create a compacted backup
			db.exec(`VACUUM INTO '${backupPath}'`);
			console.log(`  ✓ Backup created: ${backupPath}`);
		} finally {
			db.close();
		}

		// Cleanup old backups
		this.cleanupOldBackups();

		return backupPath;
	}

	/**
	 * List all backups in the backup directory
	 *
	 * @param originalPath - Optional filter by original database path
	 * @returns Array of backup info, sorted by timestamp (newest first)
	 */
	listBackups(originalPath?: string): BackupInfo[] {
		const files = fs.readdirSync(this.backupDir).filter((f) => f.endsWith('.db'));

		const backups: BackupInfo[] = [];

		for (const filename of files) {
			const backupPath = path.join(this.backupDir, filename);
			const stats = fs.statSync(backupPath);

			// Parse timestamp from filename (basename_YYYY-MM-DD_HH-MM-SS.db)
			const match = filename.match(/(.+)_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.db$/);
			if (!match) {
				continue;
			}

			const [, basename, timestampStr] = match;
			if (!timestampStr) {
				continue;
			}
			const timestamp = new Date(timestampStr.replace(/_/g, 'T').replace(/-/g, ':'));

			const backupInfo: BackupInfo = {
				path: backupPath,
				filename,
				timestamp,
				originalPath: `${basename}.db`,
				sizeBytes: stats.size,
			};

			// Filter by original path if specified
			if (!originalPath || backupInfo.originalPath === path.basename(originalPath)) {
				backups.push(backupInfo);
			}
		}

		// Sort by timestamp (newest first)
		backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

		return backups;
	}

	/**
	 * Clean up old backups, keeping only the most recent N backups
	 *
	 * @param keepLast - Number of backups to keep (default: from config)
	 * @returns Number of backups deleted
	 */
	cleanupOldBackups(keepLast?: number): number {
		const keep = keepLast ?? this.keepLast;
		const backups = this.listBackups();

		if (backups.length <= keep) {
			return 0;
		}

		const toDelete = backups.slice(keep);
		let deleted = 0;

		for (const backup of toDelete) {
			try {
				fs.unlinkSync(backup.path);
				console.log(`  Deleted old backup: ${backup.filename}`);
				deleted++;
			} catch (error) {
				console.error(`  Failed to delete backup ${backup.filename}:`, error);
			}
		}

		if (deleted > 0) {
			console.log(`  ✓ Cleaned up ${deleted} old backup(s)`);
		}

		return deleted;
	}

	/**
	 * Restore database from a backup
	 *
	 * WARNING: This will overwrite the target database file.
	 * Make sure to create a backup of the current database before restoring.
	 *
	 * @param backupPath - Path to the backup file
	 * @param targetPath - Path where the database should be restored
	 */
	restore(backupPath: string, targetPath: string): void {
		if (!fs.existsSync(backupPath)) {
			throw new Error(`Backup file not found: ${backupPath}`);
		}

		console.log(`Restoring database from backup: ${path.basename(backupPath)}`);

		// Create a backup of the current database before restoring
		if (fs.existsSync(targetPath)) {
			const safetyBackupPath = `${targetPath}.before-restore-${Date.now()}.db`;
			fs.copyFileSync(targetPath, safetyBackupPath);
			console.log(`  Safety backup created: ${safetyBackupPath}`);
		}

		// Copy backup to target location
		fs.copyFileSync(backupPath, targetPath);
		console.log(`  ✓ Database restored to: ${targetPath}`);

		// Verify integrity of restored database
		const db = new Database(targetPath, { readonly: true });
		try {
			const result = db.pragma('integrity_check') as Array<{
				integrity_check: string;
			}>;

			if (result.length === 0 || result[0]?.integrity_check !== 'ok') {
				throw new Error('Restored database failed integrity check');
			}

			console.log('  ✓ Restored database integrity verified');
		} finally {
			db.close();
		}
	}

	/**
	 * Get backup statistics
	 *
	 * @returns Summary of backup status
	 */
	getBackupStats(): {
		totalBackups: number;
		totalSizeBytes: number;
		oldestBackup: Date | null;
		newestBackup: Date | null;
	} {
		const backups = this.listBackups();

		return {
			totalBackups: backups.length,
			totalSizeBytes: backups.reduce((sum, b) => sum + b.sizeBytes, 0),
			oldestBackup: backups.length > 0 ? backups[backups.length - 1]?.timestamp ?? null : null,
			newestBackup: backups.length > 0 ? backups[0]?.timestamp ?? null : null,
		};
	}
}

/**
 * Default backup manager instance
 */
export const backupManager = new BackupManager();
