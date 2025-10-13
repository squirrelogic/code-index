/**
 * File Repository
 *
 * Handles database operations for file entities including
 * insertion, updates, lookups, and soft deletion.
 */

import Database from 'better-sqlite3';
import { File } from '../models/database-schema.js';

/**
 * File Repository
 *
 * Manages file records in the database with prepared statements
 * for optimal performance.
 */
export class FileRepository {
	private db: Database.Database;
	private insertStmt: Database.Statement;
	private updateStmt: Database.Statement;
	private findByPathStmt: Database.Statement;
	private findByHashStmt: Database.Statement;
	private softDeleteStmt: Database.Statement;

	constructor(db: Database.Database) {
		this.db = db;

		// Prepare statements once for reuse
		this.insertStmt = db.prepare(`
			INSERT INTO files (
				id, file_path, content_hash, language, size, modified_at
			)
			VALUES (?, ?, ?, ?, ?, ?)
		`);

		this.updateStmt = db.prepare(`
			UPDATE files
			SET content_hash = ?,
			    size = ?,
			    modified_at = ?,
			    indexed_at = unixepoch()
			WHERE id = ?
		`);

		this.findByPathStmt = db.prepare(`
			SELECT * FROM files
			WHERE file_path = ? AND deleted_at IS NULL
		`);

		this.findByHashStmt = db.prepare(`
			SELECT * FROM files
			WHERE content_hash = ? AND deleted_at IS NULL
		`);

		this.softDeleteStmt = db.prepare(`
			UPDATE files
			SET deleted_at = unixepoch()
			WHERE id = ? AND deleted_at IS NULL
		`);
	}

	/**
	 * Insert a new file record
	 *
	 * @param file - File entity to insert
	 * @returns File ID
	 */
	insert(file: Omit<File, 'indexed_at' | 'deleted_at'>): string {
		const startTime = performance.now();

		this.insertStmt.run(
			file.id,
			file.file_path,
			file.content_hash,
			file.language,
			file.size,
			file.modified_at
		);

		const duration = performance.now() - startTime;
		this.logOperation('insert', duration, { file_path: file.file_path });

		return file.id;
	}

	/**
	 * Update existing file metadata
	 *
	 * @param fileId - File ID to update
	 * @param file - Partial file data to update
	 */
	update(
		fileId: string,
		file: Pick<File, 'content_hash' | 'size' | 'modified_at'>
	): void {
		const startTime = performance.now();

		this.updateStmt.run(file.content_hash, file.size, file.modified_at, fileId);

		const duration = performance.now() - startTime;
		this.logOperation('update', duration, { file_id: fileId });
	}

	/**
	 * Find file by path
	 *
	 * @param path - Project-relative file path
	 * @returns File entity or null if not found
	 */
	findByPath(path: string): File | null {
		const startTime = performance.now();

		const result = this.findByPathStmt.get(path) as File | undefined;

		const duration = performance.now() - startTime;
		this.logQueryPerformance('findByPath', duration, 10); // Target: <10ms

		return result || null;
	}

	/**
	 * Find files by content hash (for deduplication)
	 *
	 * @param hash - SHA-256 content hash
	 * @returns Array of files with matching hash
	 */
	findByHash(hash: string): File[] {
		const startTime = performance.now();

		const results = this.findByHashStmt.all(hash) as File[];

		const duration = performance.now() - startTime;
		this.logQueryPerformance('findByHash', duration, 10);

		return results;
	}

	/**
	 * Soft delete a file (mark as deleted)
	 *
	 * @param fileId - File ID to delete
	 */
	softDelete(fileId: string): void {
		const startTime = performance.now();

		this.softDeleteStmt.run(fileId);

		const duration = performance.now() - startTime;
		this.logOperation('softDelete', duration, { file_id: fileId });
	}

	/**
	 * Batch insert multiple files in a single transaction
	 *
	 * @param files - Array of files to insert
	 * @returns Number of files inserted
	 */
	insertBatch(files: Array<Omit<File, 'indexed_at' | 'deleted_at'>>): number {
		const insertMany = this.db.transaction((filesToInsert: typeof files) => {
			for (const file of filesToInsert) {
				this.insertStmt.run(
					file.id,
					file.file_path,
					file.content_hash,
					file.language,
					file.size,
					file.modified_at
				);
			}
		});

		const startTime = performance.now();
		insertMany(files);
		const duration = performance.now() - startTime;

		console.log(
			`Batch inserted ${files.length} files in ${duration.toFixed(2)}ms`
		);

		return files.length;
	}

	/**
	 * Log database operation for monitoring
	 *
	 * @param operation - Operation type
	 * @param duration - Operation duration in ms
	 * @param context - Additional context
	 */
	private logOperation(
		operation: string,
		duration: number,
		context: Record<string, unknown>
	): void {
		// Structured logging would go here
		// For now, just console log for development
		if (duration > 10) {
			console.warn(
				`[FileRepository] ${operation} took ${duration.toFixed(2)}ms`,
				context
			);
		}
	}

	/**
	 * Log query performance and warn if exceeds target
	 *
	 * @param queryName - Query name
	 * @param duration - Query duration in ms
	 * @param targetMs - Target duration in ms
	 */
	private logQueryPerformance(
		queryName: string,
		duration: number,
		targetMs: number
	): void {
		if (duration > targetMs) {
			console.warn(
				`[FileRepository] ${queryName} exceeded target (${duration.toFixed(2)}ms > ${targetMs}ms)`
			);
		}
	}
}
