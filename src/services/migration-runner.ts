/**
 * Migration Runner Service
 *
 * Executes database migrations sequentially, tracks version history,
 * and ensures transactional safety during schema evolution.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { Migration } from '../models/database-schema.js';

/**
 * Migration Runner
 *
 * Manages database schema migrations with transaction safety
 */
export class MigrationRunner {
	private db: Database.Database;
	private migrationsDir: string;

	constructor(db: Database.Database, migrationsDir: string) {
		this.db = db;
		this.migrationsDir = migrationsDir;
	}

	/**
	 * Load all migration files from the migrations directory
	 *
	 * @returns Array of Migration objects sorted by version
	 */
	loadMigrations(): Migration[] {
		if (!fs.existsSync(this.migrationsDir)) {
			return [];
		}

		const files = fs
			.readdirSync(this.migrationsDir)
			.filter((f) => f.endsWith('.sql'))
			.sort();

		return files.map((file) => {
			const [version, ...descParts] = path.basename(file, '.sql').split('_');
			const sql = fs.readFileSync(path.join(this.migrationsDir, file), 'utf-8');

			return {
				version,
				description: descParts.join(' '),
				sql,
			};
		});
	}

	/**
	 * Get current schema version from meta table
	 *
	 * @returns Current schema version or '0' if meta table doesn't exist
	 */
	getCurrentVersion(): string {
		try {
			const result = this.db
				.prepare('SELECT value FROM meta WHERE key = ?')
				.get('schema_version') as { value: string } | undefined;

			return result ? result.value : '0';
		} catch (error) {
			// Meta table doesn't exist yet (fresh database)
			return '0';
		}
	}

	/**
	 * Get list of pending migrations
	 *
	 * @param currentVersion - Current schema version
	 * @returns Array of pending migrations
	 */
	getPendingMigrations(currentVersion: string): Migration[] {
		const allMigrations = this.loadMigrations();
		return allMigrations.filter((m) => m.version > currentVersion);
	}

	/**
	 * Validate migrations before execution
	 *
	 * Checks:
	 * - Migration file format (version_description.sql)
	 * - Sequential version numbers (no gaps)
	 * - No duplicate versions
	 *
	 * @param migrations - Array of migrations to validate
	 * @throws Error if validation fails
	 */
	validateMigrations(migrations: Migration[]): void {
		if (migrations.length === 0) {
			return;
		}

		// Check for duplicate versions
		const versions = new Set<string>();
		for (const migration of migrations) {
			if (versions.has(migration.version)) {
				throw new Error(`Duplicate migration version: ${migration.version}`);
			}
			versions.add(migration.version);
		}

		// Check version format (should be numeric or zero-padded)
		for (const migration of migrations) {
			if (!/^\d+$/.test(migration.version)) {
				throw new Error(
					`Invalid migration version format: ${migration.version} (expected numeric)`
				);
			}
		}

		// Check for sequential versions (warn if gaps, but don't fail)
		const sortedVersions = Array.from(versions).sort();
		for (let i = 1; i < sortedVersions.length; i++) {
			const prev = parseInt(sortedVersions[i - 1], 10);
			const curr = parseInt(sortedVersions[i], 10);
			if (curr !== prev + 1) {
				console.warn(
					`  ⚠️  Warning: Gap in migration versions between ${sortedVersions[i - 1]} and ${sortedVersions[i]}`
				);
			}
		}
	}

	/**
	 * Run post-migration operations
	 *
	 * - Updates query optimizer statistics (ANALYZE)
	 * - Verifies database integrity (PRAGMA integrity_check)
	 *
	 * @throws Error if integrity check fails
	 */
	runPostMigrationOps(): void {
		console.log('  Running post-migration operations...');

		// Update query optimizer statistics
		this.db.exec('ANALYZE');
		console.log('    ✓ Query optimizer statistics updated (ANALYZE)');

		// Verify database integrity
		const result = this.db.pragma('integrity_check') as Array<{
			integrity_check: string;
		}>;

		if (result.length === 0 || result[0].integrity_check !== 'ok') {
			const message =
				result.length > 0 ? result[0].integrity_check : 'Unknown error';
			throw new Error(`Database integrity check failed: ${message}`);
		}

		console.log('    ✓ Database integrity verified (PRAGMA integrity_check)');
	}

	/**
	 * Apply all pending migrations sequentially
	 *
	 * Each migration runs in its own transaction for atomicity.
	 * If any migration fails, the process halts and rolls back that migration.
	 *
	 * @returns Number of migrations applied
	 */
	applyMigrations(): number {
		const currentVersion = this.getCurrentVersion();
		const pending = this.getPendingMigrations(currentVersion);

		if (pending.length === 0) {
			console.log('Database schema is up to date');
			return 0;
		}

		// Validate migrations before execution
		console.log('Validating migrations...');
		this.validateMigrations(pending);
		console.log('  ✓ All migrations validated');

		console.log(`Applying ${pending.length} migration(s)...`);

		for (const migration of pending) {
			console.log(`  Applying v${migration.version}: ${migration.description}`);

			this.db.exec('BEGIN TRANSACTION');

			try {
				// Execute migration SQL
				this.db.exec(migration.sql);

				// Update schema version in meta table
				this.updateSchemaVersion(migration.version);

				// Record migration in history
				this.recordMigration(migration);

				this.db.exec('COMMIT');
				console.log(`    ✓ Migration v${migration.version} applied`);

				// Run post-migration operations
				this.runPostMigrationOps();
			} catch (error) {
				this.db.exec('ROLLBACK');
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				console.error(`    ✗ Migration v${migration.version} failed: ${errorMessage}`);
				throw new Error(`Migration ${migration.version} failed: ${errorMessage}`);
			}
		}

		console.log('All migrations completed successfully');

		return pending.length;
	}

	/**
	 * Update schema version in meta table
	 *
	 * @param version - New schema version
	 */
	private updateSchemaVersion(version: string): void {
		const stmt = this.db.prepare(`
			INSERT OR REPLACE INTO meta (key, value, updated_at)
			VALUES ('schema_version', ?, unixepoch())
		`);
		stmt.run(version);
	}

	/**
	 * Record migration in migration_history table
	 *
	 * @param migration - Migration to record
	 */
	private recordMigration(migration: Migration): void {
		const stmt = this.db.prepare(`
			INSERT INTO migration_history (version, description)
			VALUES (?, ?)
		`);
		stmt.run(migration.version, migration.description);
	}
}
