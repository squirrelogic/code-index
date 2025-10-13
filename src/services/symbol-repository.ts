/**
 * SymbolRepository Service
 *
 * Provides data access methods for the symbols table with performance
 * monitoring and soft-delete support.
 */

import type Database from 'better-sqlite3';
import type { Symbol } from '../models/database-schema.js';

/**
 * Repository class for managing code symbols in the database
 */
export class SymbolRepository {
	private db: Database.Database;
	private insertStmt: Database.Statement;
	private updateStmt: Database.Statement;
	private findByNameStmt: Database.Statement;
	private findByFileStmt: Database.Statement;
	private findByFileAndTypeStmt: Database.Statement;
	private softDeleteStmt: Database.Statement;
	private cleanupExpiredStmt: Database.Statement;

	constructor(db: Database.Database) {
		this.db = db;

		// Prepare all statements once for performance
		this.insertStmt = db.prepare(`
			INSERT INTO symbols (
				id, file_id, symbol_name, symbol_type, signature,
				documentation, line_start, line_end, created_at, deleted_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		this.updateStmt = db.prepare(`
			UPDATE symbols
			SET
				symbol_name = COALESCE(?, symbol_name),
				symbol_type = COALESCE(?, symbol_type),
				signature = COALESCE(?, signature),
				documentation = COALESCE(?, documentation),
				line_start = COALESCE(?, line_start),
				line_end = COALESCE(?, line_end)
			WHERE id = ? AND deleted_at IS NULL
		`);

		this.findByNameStmt = db.prepare(`
			SELECT * FROM symbols
			WHERE symbol_name = ? AND deleted_at IS NULL
		`);

		this.findByFileStmt = db.prepare(`
			SELECT * FROM symbols
			WHERE file_id = ? AND deleted_at IS NULL
			ORDER BY line_start ASC
		`);

		this.findByFileAndTypeStmt = db.prepare(`
			SELECT * FROM symbols
			WHERE file_id = ? AND symbol_type = ? AND deleted_at IS NULL
			ORDER BY line_start ASC
		`);

		this.softDeleteStmt = db.prepare(`
			UPDATE symbols
			SET deleted_at = unixepoch()
			WHERE id = ? AND deleted_at IS NULL
		`);

		this.cleanupExpiredStmt = db.prepare(`
			DELETE FROM symbols
			WHERE deleted_at IS NOT NULL
			  AND deleted_at < ?
		`);
	}

	/**
	 * Insert a new symbol record
	 * @param symbol - Symbol data to insert
	 * @returns The ID of the inserted symbol
	 */
	insert(symbol: Symbol): string {
		this.insertStmt.run(
			symbol.id,
			symbol.file_id,
			symbol.symbol_name,
			symbol.symbol_type,
			symbol.signature,
			symbol.documentation,
			symbol.line_start,
			symbol.line_end,
			symbol.created_at,
			symbol.deleted_at
		);
		return symbol.id;
	}

	/**
	 * Update an existing symbol record
	 * @param symbolId - ID of the symbol to update
	 * @param updates - Partial symbol data to update
	 */
	update(symbolId: string, updates: Partial<Omit<Symbol, 'id' | 'file_id' | 'created_at' | 'deleted_at'>>): void {
		this.updateStmt.run(
			updates.symbol_name ?? null,
			updates.symbol_type ?? null,
			updates.signature ?? null,
			updates.documentation ?? null,
			updates.line_start ?? null,
			updates.line_end ?? null,
			symbolId
		);
	}

	/**
	 * Find symbols by name (with performance target <50ms)
	 * @param name - Symbol name to search for
	 * @returns Array of matching symbols
	 */
	findByName(name: string): Symbol[] {
		const start = performance.now();
		const results = this.findByNameStmt.all(name) as Symbol[];
		const duration = performance.now() - start;

		// Log slow queries (>50ms threshold)
		if (duration > 50) {
			this.logSlowQuery('findByName', duration, results.length, { name });
		}

		return results;
	}

	/**
	 * Find all symbols in a file (with performance target <50ms)
	 * @param fileId - File ID to search
	 * @returns Array of symbols in the file
	 */
	findByFile(fileId: string): Symbol[] {
		const start = performance.now();
		const results = this.findByFileStmt.all(fileId) as Symbol[];
		const duration = performance.now() - start;

		// Log slow queries (>50ms threshold)
		if (duration > 50) {
			this.logSlowQuery('findByFile', duration, results.length, { fileId });
		}

		return results;
	}

	/**
	 * Find symbols by file and type (with performance target <50ms)
	 * @param fileId - File ID to search
	 * @param symbolType - Symbol type to filter by
	 * @returns Array of matching symbols
	 */
	findByFileAndType(fileId: string, symbolType: string): Symbol[] {
		const start = performance.now();
		const results = this.findByFileAndTypeStmt.all(fileId, symbolType) as Symbol[];
		const duration = performance.now() - start;

		// Log slow queries (>50ms threshold)
		if (duration > 50) {
			this.logSlowQuery('findByFileAndType', duration, results.length, { fileId, symbolType });
		}

		return results;
	}

	/**
	 * Soft-delete a symbol by setting deleted_at timestamp
	 * @param symbolId - ID of the symbol to delete
	 */
	softDelete(symbolId: string): void {
		this.softDeleteStmt.run(symbolId);
	}

	/**
	 * Clean up symbols older than the retention period
	 * @param retentionDays - Number of days to retain deleted symbols (default: 30)
	 * @returns Number of symbols deleted
	 */
	cleanupExpired(retentionDays: number = 30): number {
		const cutoffTimestamp = Math.floor(Date.now() / 1000) - (retentionDays * 86400);
		const result = this.cleanupExpiredStmt.run(cutoffTimestamp);
		return result.changes;
	}

	/**
	 * Rename a symbol by creating a new symbol and soft-deleting the old one.
	 * This preserves the lineage for refactoring analysis.
	 *
	 * @param oldSymbolId - ID of the existing symbol to rename
	 * @param newSymbol - New symbol data with new ID and name
	 * @returns The ID of the new symbol
	 */
	renameSymbol(oldSymbolId: string, newSymbol: Symbol): string {
		// Validate that the new symbol has a different ID
		if (oldSymbolId === newSymbol.id) {
			throw new Error('New symbol must have a different ID from the old symbol');
		}

		// Use a transaction to ensure atomicity
		const transaction = this.db.transaction(() => {
			// Insert the new symbol
			this.insert(newSymbol);

			// Soft-delete the old symbol
			this.softDelete(oldSymbolId);
		});

		transaction();
		return newSymbol.id;
	}

	/**
	 * Log slow queries for performance monitoring
	 * @private
	 */
	private logSlowQuery(operation: string, duration: number, resultCount: number, params: Record<string, any>): void {
		const logEntry = {
			type: 'slow_query',
			service: 'SymbolRepository',
			operation,
			duration_ms: Math.round(duration),
			result_count: resultCount,
			threshold_ms: 50,
			parameters: params,
			timestamp: new Date().toISOString(),
		};

		// Log to console for now (can be extended to write to file)
		console.warn('[SLOW QUERY]', JSON.stringify(logEntry));
	}
}
