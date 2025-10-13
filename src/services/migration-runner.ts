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
				console.log(`  ✓ Migration v${migration.version} applied`);
			} catch (error) {
				this.db.exec('ROLLBACK');
				throw new Error(
					`Migration ${migration.version} failed: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}

		// Update query optimizer statistics
		this.db.exec('ANALYZE');
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
