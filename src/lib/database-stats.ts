/**
 * Database Statistics Utilities
 *
 * Provides functions for reporting database statistics including
 * table sizes, row counts, and index overhead.
 */

import type Database from 'better-sqlite3';

/**
 * Table statistics
 */
export interface TableStats {
	tableName: string;
	rowCount: number;
	sizeBytes: number;
	sizeMB: number;
	averageRowSize: number;
}

/**
 * Index statistics
 */
export interface IndexStats {
	indexName: string;
	tableName: string;
	sizeBytes: number;
	sizeMB: number;
}

/**
 * Overall database statistics
 */
export interface DatabaseStatistics {
	totalSizeBytes: number;
	totalSizeMB: number;
	pageSize: number;
	pageCount: number;
	tables: TableStats[];
	indexes: IndexStats[];
	indexOverheadPercent: number;
}

/**
 * Get row count for a specific table
 */
function getRowCount(db: Database.Database, tableName: string): number {
	try {
		const result = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as {
			count: number;
		};
		return result.count;
	} catch (error) {
		// Table might not exist or be inaccessible
		return 0;
	}
}

/**
 * Get table size statistics
 */
function getTableStats(db: Database.Database, tableName: string): TableStats {
	const rowCount = getRowCount(db, tableName);

	// Get table page count using dbstat virtual table if available
	// Otherwise estimate based on total database size
	let sizeBytes = 0;
	try {
		const result = db
			.prepare(
				`
			SELECT SUM(pgsize) as size
			FROM dbstat
			WHERE name = ?
		`
			)
			.get(tableName) as { size: number | null };

		sizeBytes = result.size ?? 0;
	} catch (error) {
		// dbstat might not be available, use estimation
		// This is a rough estimate
		sizeBytes = 0;
	}

	const sizeMB = sizeBytes / 1024 / 1024;
	const averageRowSize = rowCount > 0 ? sizeBytes / rowCount : 0;

	return {
		tableName,
		rowCount,
		sizeBytes,
		sizeMB,
		averageRowSize,
	};
}

/**
 * Get index size statistics
 */
function getIndexStats(
	db: Database.Database,
	indexName: string,
	tableName: string
): IndexStats {
	let sizeBytes = 0;
	try {
		const result = db
			.prepare(
				`
			SELECT SUM(pgsize) as size
			FROM dbstat
			WHERE name = ?
		`
			)
			.get(indexName) as { size: number | null };

		sizeBytes = result.size ?? 0;
	} catch (error) {
		// dbstat might not be available
		sizeBytes = 0;
	}

	const sizeMB = sizeBytes / 1024 / 1024;

	return {
		indexName,
		tableName,
		sizeBytes,
		sizeMB,
	};
}

/**
 * Get comprehensive database statistics
 *
 * @param db - Database instance
 * @returns Complete database statistics
 */
export function getDatabaseStatistics(db: Database.Database): DatabaseStatistics {
	// Get overall database size
	const pageCountResult = db.pragma('page_count') as Array<{ page_count: number }>;
	const pageSizeResult = db.pragma('page_size') as Array<{ page_size: number }>;

	const pageCount = pageCountResult[0]?.page_count ?? 0;
	const pageSize = pageSizeResult[0]?.page_size ?? 4096;
	const totalSizeBytes = pageCount * pageSize;
	const totalSizeMB = totalSizeBytes / 1024 / 1024;

	// Get all tables
	const tables = db
		.prepare(
			`
		SELECT name FROM sqlite_master
		WHERE type = 'table'
		  AND name NOT LIKE 'sqlite_%'
		ORDER BY name
	`
		)
		.all() as Array<{ name: string }>;

	// Get statistics for each table
	const tableStats: TableStats[] = tables.map((table) =>
		getTableStats(db, table.name)
	);

	// Get all indexes
	const indexes = db
		.prepare(
			`
		SELECT
			idx.name as index_name,
			tbl.name as table_name
		FROM sqlite_master idx
		JOIN sqlite_master tbl ON idx.tbl_name = tbl.name
		WHERE idx.type = 'index'
		  AND idx.name NOT LIKE 'sqlite_%'
		ORDER BY idx.name
	`
		)
		.all() as Array<{ index_name: string; table_name: string }>;

	// Get statistics for each index
	const indexStats: IndexStats[] = indexes.map((index) =>
		getIndexStats(db, index.index_name, index.table_name)
	);

	// Calculate total index size
	const totalIndexSize = indexStats.reduce((sum, idx) => sum + idx.sizeBytes, 0);

	// Calculate index overhead percentage
	const indexOverheadPercent =
		totalSizeBytes > 0 ? (totalIndexSize / totalSizeBytes) * 100 : 0;

	return {
		totalSizeBytes,
		totalSizeMB,
		pageSize,
		pageCount,
		tables: tableStats,
		indexes: indexStats,
		indexOverheadPercent,
	};
}

/**
 * Format database statistics as a human-readable report
 *
 * @param stats - Database statistics
 * @returns Formatted report string
 */
export function formatStatisticsReport(stats: DatabaseStatistics): string {
	const lines: string[] = [];

	lines.push('='.repeat(80));
	lines.push('DATABASE STATISTICS REPORT');
	lines.push('='.repeat(80));
	lines.push('');

	// Overall statistics
	lines.push('OVERALL:');
	lines.push(`  Total Size: ${stats.totalSizeMB.toFixed(2)} MB`);
	lines.push(`  Page Count: ${stats.pageCount.toLocaleString()}`);
	lines.push(`  Page Size: ${stats.pageSize} bytes`);
	lines.push(`  Index Overhead: ${stats.indexOverheadPercent.toFixed(2)}%`);
	lines.push('');

	// Table statistics
	lines.push('TABLES:');
	lines.push(
		'  ' +
			'Name'.padEnd(30) +
			'Rows'.padStart(12) +
			'Size (MB)'.padStart(12) +
			'Avg Row'.padStart(12)
	);
	lines.push('  ' + '-'.repeat(66));

	for (const table of stats.tables) {
		lines.push(
			'  ' +
				table.tableName.padEnd(30) +
				table.rowCount.toLocaleString().padStart(12) +
				table.sizeMB.toFixed(2).padStart(12) +
				Math.round(table.averageRowSize).toLocaleString().padStart(12)
		);
	}
	lines.push('');

	// Index statistics
	lines.push('INDEXES:');
	lines.push(
		'  ' + 'Name'.padEnd(40) + 'Table'.padEnd(20) + 'Size (MB)'.padStart(12)
	);
	lines.push('  ' + '-'.repeat(72));

	for (const index of stats.indexes) {
		lines.push(
			'  ' +
				index.indexName.padEnd(40) +
				index.tableName.padEnd(20) +
				index.sizeMB.toFixed(2).padStart(12)
		);
	}
	lines.push('');
	lines.push('='.repeat(80));

	return lines.join('\n');
}

/**
 * Export statistics to JSON format
 *
 * @param stats - Database statistics
 * @returns JSON string
 */
export function exportStatisticsJSON(stats: DatabaseStatistics): string {
	return JSON.stringify(stats, null, 2);
}

/**
 * Get simple table row counts (lightweight alternative)
 *
 * @param db - Database instance
 * @returns Map of table name to row count
 */
export function getTableRowCounts(db: Database.Database): Map<string, number> {
	const tables = db
		.prepare(
			`
		SELECT name FROM sqlite_master
		WHERE type = 'table'
		  AND name NOT LIKE 'sqlite_%'
		ORDER BY name
	`
		)
		.all() as Array<{ name: string }>;

	const counts = new Map<string, number>();

	for (const table of tables) {
		counts.set(table.name, getRowCount(db, table.name));
	}

	return counts;
}
