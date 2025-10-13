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

			const isValid = result.length === 1 && result[0].integrity_check === 'ok';

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
		return result.length > 0 && result[0].journal_mode.toLowerCase() === 'wal';
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
		return result.length > 0 && result[0].foreign_keys === 1;
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
		)[0].page_count;
		const pageSize = (
			this.db.pragma('page_size') as Array<{ page_size: number }>
		)[0].page_size;
		const sizeBytes = pageCount * pageSize;

		return {
			pageCount,
			pageSize,
			sizeBytes,
			sizeMB: sizeBytes / 1024 / 1024,
		};
	}
}
