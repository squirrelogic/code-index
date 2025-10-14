/**
 * Schema Validator
 *
 * Provides database integrity checking and validation functions.
 * Includes PRAGMA integrity_check and foreign key validation.
 */

import Database from 'better-sqlite3';

/**
 * Database validation result
 */
export interface ValidationResult {
	valid: boolean;
	errors: string[];
}

/**
 * Schema structure validation result
 */
export interface SchemaStructureResult {
	valid: boolean;
	missingTables: string[];
	missingIndexes: string[];
	extraTables: string[];
	extraIndexes: string[];
}

/**
 * Schema Validator
 *
 * Validates database integrity and constraints
 */
export class SchemaValidator {
	private db: Database.Database;

	constructor(db: Database.Database) {
		this.db = db;
	}

	/**
	 * Run PRAGMA integrity_check on the database
	 *
	 * This checks the database structure and data integrity.
	 * A valid database returns [{ integrity_check: 'ok' }]
	 *
	 * @returns Validation result
	 */
	checkIntegrity(): ValidationResult {
		try {
			const result = this.db.pragma('integrity_check') as Array<{
				integrity_check: string;
			}>;

			const isValid = result.length === 1 && result[0]?.integrity_check === 'ok';

			return {
				valid: isValid,
				errors: isValid ? [] : result.map((r) => r.integrity_check),
			};
		} catch (error) {
			return {
				valid: false,
				errors: [
					`Integrity check failed: ${error instanceof Error ? error.message : String(error)}`,
				],
			};
		}
	}

	/**
	 * Run PRAGMA foreign_key_check on the database
	 *
	 * This checks for foreign key constraint violations.
	 * Returns empty array if all constraints are satisfied.
	 *
	 * @returns Validation result
	 */
	checkForeignKeys(): ValidationResult {
		try {
			const result = this.db.pragma('foreign_key_check') as Array<{
				table: string;
				rowid: number;
				parent: string;
				fkid: number;
			}>;

			const isValid = result.length === 0;

			return {
				valid: isValid,
				errors: isValid
					? []
					: result.map(
							(r) =>
								`Foreign key violation in table '${r.table}' (rowid ${r.rowid}): references '${r.parent}' (fkid ${r.fkid})`
					  ),
			};
		} catch (error) {
			return {
				valid: false,
				errors: [
					`Foreign key check failed: ${error instanceof Error ? error.message : String(error)}`,
				],
			};
		}
	}

	/**
	 * Run all validation checks
	 *
	 * Combines integrity check and foreign key check
	 *
	 * @returns Combined validation result
	 */
	validateAll(): ValidationResult {
		const integrityResult = this.checkIntegrity();
		const fkResult = this.checkForeignKeys();

		return {
			valid: integrityResult.valid && fkResult.valid,
			errors: [...integrityResult.errors, ...fkResult.errors],
		};
	}

	/**
	 * Verify that WAL mode is enabled
	 *
	 * @returns True if WAL mode is active
	 */
	checkWALMode(): boolean {
		const result = this.db.pragma('journal_mode') as Array<{
			journal_mode: string;
		}>;
		return result.length > 0 && result[0]?.journal_mode.toLowerCase() === 'wal';
	}

	/**
	 * Verify that foreign keys are enabled
	 *
	 * @returns True if foreign key enforcement is on
	 */
	checkForeignKeysEnabled(): boolean {
		const result = this.db.pragma('foreign_keys') as Array<{
			foreign_keys: number;
		}>;
		return result.length > 0 && result[0]?.foreign_keys === 1;
	}

	/**
	 * Get database file size and page statistics
	 *
	 * @returns Database statistics
	 */
	getDatabaseStats(): {
		pageCount: number;
		pageSize: number;
		sizeBytes: number;
		sizeMB: number;
	} {
		const pageCount = (
			this.db.pragma('page_count') as Array<{ page_count: number }>
		)[0]?.page_count ?? 0;
		const pageSize = (
			this.db.pragma('page_size') as Array<{ page_size: number }>
		)[0]?.page_size ?? 0;
		const sizeBytes = pageCount * pageSize;

		return {
			pageCount,
			pageSize,
			sizeBytes,
			sizeMB: sizeBytes / 1024 / 1024,
		};
	}

	/**
	 * Verify that all expected tables exist in the database
	 *
	 * @param expectedTables - Array of table names that should exist
	 * @returns Schema structure validation result
	 */
	validateSchemaStructure(
		expectedTables: string[],
		expectedIndexes: string[]
	): SchemaStructureResult {
		// Get all existing tables
		const existingTables = this.db
			.prepare(
				`
			SELECT name FROM sqlite_master
			WHERE type = 'table'
			  AND name NOT LIKE 'sqlite_%'
			ORDER BY name
		`
			)
			.all() as Array<{ name: string }>;

		const existingTableNames = new Set(existingTables.map((t) => t.name));

		// Get all existing indexes
		const existingIndexes = this.db
			.prepare(
				`
			SELECT name FROM sqlite_master
			WHERE type = 'index'
			  AND name NOT LIKE 'sqlite_%'
			ORDER BY name
		`
			)
			.all() as Array<{ name: string }>;

		const existingIndexNames = new Set(existingIndexes.map((i) => i.name));

		// Find missing tables
		const missingTables = expectedTables.filter((t) => !existingTableNames.has(t));

		// Find extra tables (not expected)
		const extraTables = Array.from(existingTableNames).filter(
			(t) => !expectedTables.includes(t)
		);

		// Find missing indexes
		const missingIndexes = expectedIndexes.filter((i) => !existingIndexNames.has(i));

		// Find extra indexes (not expected)
		const extraIndexes = Array.from(existingIndexNames).filter(
			(i) => !expectedIndexes.includes(i)
		);

		return {
			valid: missingTables.length === 0 && missingIndexes.length === 0,
			missingTables,
			missingIndexes,
			extraTables,
			extraIndexes,
		};
	}

	/**
	 * Get the expected schema structure based on migrations
	 *
	 * @returns Object with expected tables and indexes
	 */
	static getExpectedSchema(): {
		tables: string[];
		indexes: string[];
	} {
		return {
			tables: [
				// From migration 001
				'files',
				'symbols',
				'xrefs',
				'search', // FTS5 virtual table
				'meta',
				'migration_history',
				// From migration 002
				'chunks',
				'embeddings',
				// From migration 003
				'calls',
			],
			indexes: [
				// Files table indexes
				'idx_files_path',
				'idx_files_hash',
				'idx_files_language',
				// Symbols table indexes
				'idx_symbols_name',
				'idx_symbols_file_type',
				'idx_symbols_deleted',
				// Cross-references indexes
				'idx_xrefs_source',
				'idx_xrefs_target',
				'idx_xrefs_type',
				// Migration history index
				'idx_migration_version',
				// Chunks table indexes
				'idx_chunks_file',
				'idx_chunks_symbol',
				'idx_chunks_id',
				// Embeddings table index
				'idx_embeddings_model',
				// Calls table indexes
				'idx_calls_caller',
				'idx_calls_callee',
			],
		};
	}

	/**
	 * Validate complete schema structure against expected schema
	 *
	 * @returns Schema structure validation result
	 */
	validateCompleteSchema(): SchemaStructureResult {
		const expected = SchemaValidator.getExpectedSchema();
		return this.validateSchemaStructure(expected.tables, expected.indexes);
	}
}
