/**
 * CrossReferenceRepository Service
 *
 * Provides data access methods for the xrefs (cross-references) table
 * to track symbol usage relationships.
 */

import type Database from 'better-sqlite3';
import type { CrossReference } from '../models/database-schema.js';

/**
 * Repository class for managing cross-references between symbols
 */
export class CrossReferenceRepository {
	private insertStmt: Database.Statement;
	private findReferencesToStmt: Database.Statement;
	private findReferencesFromStmt: Database.Statement;
	private findByTypeStmt: Database.Statement;

	constructor(db: Database.Database) {

		// Prepare all statements once for performance
		this.insertStmt = db.prepare(`
			INSERT INTO xrefs (
				id, source_symbol_id, target_symbol_id, reference_type,
				context, line_number, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`);

		this.findReferencesToStmt = db.prepare(`
			SELECT * FROM xrefs
			WHERE target_symbol_id = ?
			ORDER BY created_at DESC
		`);

		this.findReferencesFromStmt = db.prepare(`
			SELECT * FROM xrefs
			WHERE source_symbol_id = ?
			ORDER BY created_at DESC
		`);

		this.findByTypeStmt = db.prepare(`
			SELECT * FROM xrefs
			WHERE reference_type = ?
			ORDER BY created_at DESC
		`);
	}

	/**
	 * Insert a new cross-reference record
	 * @param xref - CrossReference data to insert
	 * @returns The ID of the inserted cross-reference
	 */
	insert(xref: CrossReference): string {
		this.insertStmt.run(
			xref.id,
			xref.source_symbol_id,
			xref.target_symbol_id,
			xref.reference_type,
			xref.context,
			xref.line_number,
			xref.created_at
		);
		return xref.id;
	}

	/**
	 * Find all references TO a symbol (with performance target <100ms)
	 * @param symbolId - Target symbol ID
	 * @returns Array of cross-references pointing to this symbol
	 */
	findReferencesTo(symbolId: string): CrossReference[] {
		const start = performance.now();
		const results = this.findReferencesToStmt.all(symbolId) as CrossReference[];
		const duration = performance.now() - start;

		// Log slow queries (>100ms threshold)
		if (duration > 100) {
			this.logSlowQuery('findReferencesTo', duration, results.length, { symbolId });
		}

		return results;
	}

	/**
	 * Find all references FROM a symbol (with performance target <100ms)
	 * @param symbolId - Source symbol ID
	 * @returns Array of cross-references originating from this symbol
	 */
	findReferencesFrom(symbolId: string): CrossReference[] {
		const start = performance.now();
		const results = this.findReferencesFromStmt.all(symbolId) as CrossReference[];
		const duration = performance.now() - start;

		// Log slow queries (>100ms threshold)
		if (duration > 100) {
			this.logSlowQuery('findReferencesFrom', duration, results.length, { symbolId });
		}

		return results;
	}

	/**
	 * Find cross-references by type (read, write, call, etc.)
	 * @param refType - Reference type to filter by
	 * @returns Array of matching cross-references
	 */
	findByType(refType: string): CrossReference[] {
		const start = performance.now();
		const results = this.findByTypeStmt.all(refType) as CrossReference[];
		const duration = performance.now() - start;

		// Log slow queries (>100ms threshold)
		if (duration > 100) {
			this.logSlowQuery('findByType', duration, results.length, { refType });
		}

		return results;
	}

	/**
	 * Log slow queries for performance monitoring
	 * @private
	 */
	private logSlowQuery(operation: string, duration: number, resultCount: number, params: Record<string, any>): void {
		const logEntry = {
			type: 'slow_query',
			service: 'CrossReferenceRepository',
			operation,
			duration_ms: Math.round(duration),
			result_count: resultCount,
			threshold_ms: 100,
			parameters: params,
			timestamp: new Date().toISOString(),
		};

		// Log to console for now (can be extended to write to file)
		console.warn('[SLOW QUERY]', JSON.stringify(logEntry));
	}
}
