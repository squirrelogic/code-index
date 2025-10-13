/**
 * Database Initialization Helper
 *
 * Provides a convenient interface for initializing the code-index database
 * with all required configuration, migrations, and validation.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import {
	DEFAULT_PRAGMA_CONFIG,
	type SQLitePragmaConfig,
} from '../models/database-schema.js';
import { MigrationRunner } from '../services/migration-runner.js';
import { SchemaValidator } from './schema-validator.js';
import { logger } from './logger.js';

/**
 * Database initialization options
 */
export interface DatabaseInitOptions {
	/** Path to the database file */
	dbPath: string;
	/** Path to migration files directory */
	migrationsPath?: string;
	/** Custom PRAGMA configuration */
	pragmaConfig?: Partial<SQLitePragmaConfig>;
	/** Run migrations automatically */
	runMigrations?: boolean;
	/** Validate schema after initialization */
	validateSchema?: boolean;
	/** Create database directory if it doesn't exist */
	createDir?: boolean;
}

/**
 * Database initialization result
 */
export interface DatabaseInitResult {
	/** Database instance */
	db: Database.Database;
	/** Whether database was newly created */
	isNew: boolean;
	/** Current schema version */
	schemaVersion: string;
	/** Number of migrations applied */
	migrationsApplied: number;
	/** Schema validation result */
	schemaValid: boolean;
	/** Initialization duration in milliseconds */
	durationMs: number;
}

/**
 * Initialize the code-index database with all required setup
 *
 * This function:
 * 1. Creates database directory if needed
 * 2. Opens/creates database file
 * 3. Applies PRAGMA configuration
 * 4. Runs migrations
 * 5. Validates schema integrity
 *
 * @param options - Initialization options
 * @returns Database initialization result
 */
export async function initializeDatabase(
	options: DatabaseInitOptions
): Promise<DatabaseInitResult> {
	const startTime = performance.now();

	logger.info('Initializing database', {
		dbPath: options.dbPath,
		runMigrations: options.runMigrations ?? true,
		validateSchema: options.validateSchema ?? true,
	});

	try {
		// Step 1: Create directory if needed
		if (options.createDir !== false) {
			const dbDir = path.dirname(options.dbPath);
			if (!fs.existsSync(dbDir)) {
				fs.mkdirSync(dbDir, { recursive: true });
				logger.info('Created database directory', { path: dbDir });
			}
		}

		// Step 2: Check if database exists
		const isNew = !fs.existsSync(options.dbPath);

		// Step 3: Open database
		const db = new Database(options.dbPath);
		logger.info('Database opened', { path: options.dbPath, isNew });

		// Step 4: Apply PRAGMA configuration
		const pragmaConfig = {
			...DEFAULT_PRAGMA_CONFIG,
			...options.pragmaConfig,
		};
		applyPragmaConfig(db, pragmaConfig);
		logger.info('PRAGMA configuration applied', pragmaConfig);

		// Step 5: Run migrations
		let migrationsApplied = 0;
		let schemaVersion = '0';

		if (options.runMigrations !== false) {
			const migrationsPath =
				options.migrationsPath ?? path.join(process.cwd(), 'sql', 'migrations');

			const migrationRunner = new MigrationRunner(db, migrationsPath);

			migrationsApplied = migrationRunner.applyMigrations();

			logger.info('Migrations completed', {
				applied: migrationsApplied,
			});

			// Get current schema version
			schemaVersion = migrationRunner.getCurrentVersion();
		}

		// Step 6: Validate schema
		let schemaValid = true;

		if (options.validateSchema !== false) {
			const validator = new SchemaValidator(db);

			// Validate integrity
			const integrityResult = validator.checkIntegrity();
			if (!integrityResult.valid) {
				logger.error('Database integrity check failed', {
					errors: integrityResult.errors,
				});
				schemaValid = false;
			}

			// Validate foreign keys
			const fkResult = validator.checkForeignKeys();
			if (!fkResult.valid) {
				logger.error('Foreign key check failed', { errors: fkResult.errors });
				schemaValid = false;
			}

			// Validate schema structure (only if migrations were run)
			if (migrationsApplied > 0) {
				const structureResult = validator.validateCompleteSchema();
				if (!structureResult.valid) {
					logger.warn('Schema structure validation found issues', {
						missingTables: structureResult.missingTables,
						missingIndexes: structureResult.missingIndexes,
					});
					// Don't fail on structure validation - might be partial migration
				}
			}

			if (schemaValid) {
				logger.info('Schema validation passed');
			}
		}

		const durationMs = performance.now() - startTime;

		const result: DatabaseInitResult = {
			db,
			isNew,
			schemaVersion,
			migrationsApplied,
			schemaValid,
			durationMs,
		};

		logger.info('Database initialization complete', {
			isNew,
			schemaVersion,
			migrationsApplied,
			schemaValid,
			durationMs: Math.round(durationMs),
		});

		return result;
	} catch (error) {
		logger.error('Database initialization failed', {
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

/**
 * Apply PRAGMA configuration to database
 *
 * @param db - Database instance
 * @param config - PRAGMA configuration
 */
function applyPragmaConfig(
	db: Database.Database,
	config: SQLitePragmaConfig
): void {
	// Set journal mode (must be first for WAL)
	db.pragma(`journal_mode = ${config.journal_mode}`);

	// Set synchronous mode
	db.pragma(`synchronous = ${config.synchronous}`);

	// Set cache size
	db.pragma(`cache_size = ${config.cache_size}`);

	// Set temp store
	db.pragma(`temp_store = ${config.temp_store}`);

	// Set memory-mapped I/O
	db.pragma(`mmap_size = ${config.mmap_size}`);

	// Set WAL auto-checkpoint
	db.pragma(`wal_autocheckpoint = ${config.wal_autocheckpoint}`);

	// Enable foreign keys
	db.pragma(`foreign_keys = ${config.foreign_keys}`);
}

/**
 * Create a quick database instance with default settings
 *
 * Convenience function for common use cases.
 *
 * @param dbPath - Path to database file
 * @returns Database instance
 */
export async function createDatabase(dbPath: string): Promise<Database.Database> {
	const result = await initializeDatabase({
		dbPath,
		createDir: true,
		runMigrations: true,
		validateSchema: true,
	});

	return result.db;
}

/**
 * Close database gracefully
 *
 * Performs checkpoint and closes the database connection.
 *
 * @param db - Database instance
 */
export function closeDatabase(db: Database.Database): void {
	try {
		// Checkpoint WAL file
		if (db.open) {
			const journalMode = db.pragma('journal_mode') as Array<{
				journal_mode: string;
			}>;
			if (
				journalMode.length > 0 &&
				journalMode[0] &&
				journalMode[0].journal_mode === 'wal'
			) {
				db.pragma('wal_checkpoint(TRUNCATE)');
				logger.info('WAL checkpoint completed before close');
			}
		}

		// Close database
		db.close();
		logger.info('Database closed');
	} catch (error) {
		logger.error('Error closing database', {
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

/**
 * Check if database needs initialization
 *
 * @param dbPath - Path to database file
 * @returns True if database doesn't exist or is empty
 */
export function needsInitialization(dbPath: string): boolean {
	if (!fs.existsSync(dbPath)) {
		return true;
	}

	try {
		const db = new Database(dbPath, { readonly: true });

		// Check if meta table exists
		const result = db
			.prepare(
				`
			SELECT COUNT(*) as count
			FROM sqlite_master
			WHERE type = 'table' AND name = 'meta'
		`
			)
			.get() as { count: number };

		db.close();

		return result.count === 0;
	} catch (error) {
		// Error opening database - needs initialization
		return true;
	}
}

/**
 * Reset database by dropping all tables and running migrations
 *
 * ⚠️  WARNING: This will delete all data!
 *
 * @param dbPath - Path to database file
 * @param migrationsPath - Path to migration files
 * @returns Database initialization result
 */
export async function resetDatabase(
	dbPath: string,
	migrationsPath?: string
): Promise<DatabaseInitResult> {
	logger.warn('Resetting database - all data will be deleted!', { dbPath });

	// Delete existing database file
	if (fs.existsSync(dbPath)) {
		fs.unlinkSync(dbPath);
		logger.info('Deleted existing database file');
	}

	// Delete WAL and SHM files if they exist
	const walPath = `${dbPath}-wal`;
	const shmPath = `${dbPath}-shm`;

	if (fs.existsSync(walPath)) {
		fs.unlinkSync(walPath);
		logger.info('Deleted WAL file');
	}

	if (fs.existsSync(shmPath)) {
		fs.unlinkSync(shmPath);
		logger.info('Deleted SHM file');
	}

	// Initialize fresh database
	return initializeDatabase({
		dbPath,
		migrationsPath,
		createDir: true,
		runMigrations: true,
		validateSchema: true,
	});
}
