/**
 * Schema Manager Service
 *
 * Handles database connection initialization, PRAGMA configuration,
 * and schema management operations.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import {
	DatabaseConfig,
	DEFAULT_PRAGMA_CONFIG,
	SQLitePragmaConfig,
} from '../models/database-schema.js';

/**
 * Schema Manager
 *
 * Manages database connections and schema configuration
 */
export class SchemaManager {
	private db: Database.Database | null = null;
	private config: DatabaseConfig;

	constructor(config: DatabaseConfig) {
		this.config = config;
	}

	/**
	 * Initialize database connection with PRAGMA settings
	 *
	 * Creates the database file if it doesn't exist and applies
	 * all necessary PRAGMA settings for optimal performance.
	 *
	 * @returns Database instance
	 */
	initializeDatabase(): Database.Database {
		// Ensure database directory exists
		const dbDir = path.dirname(this.config.dbPath);
		if (!fs.existsSync(dbDir)) {
			fs.mkdirSync(dbDir, { recursive: true });
		}

		// Open database connection
		this.db = new Database(this.config.dbPath);

		// Apply PRAGMA configuration
		const pragmaConfig = {
			...DEFAULT_PRAGMA_CONFIG,
			...this.config.pragmaConfig,
		};

		this.applyPragmaSettings(pragmaConfig);

		return this.db;
	}

	/**
	 * Apply PRAGMA settings to database connection
	 *
	 * @param config - PRAGMA configuration
	 */
	private applyPragmaSettings(config: SQLitePragmaConfig): void {
		if (!this.db) {
			throw new Error('Database not initialized');
		}

		// Apply each PRAGMA setting
		this.db.pragma(`journal_mode = ${config.journal_mode}`);
		this.db.pragma(`synchronous = ${config.synchronous}`);
		this.db.pragma(`cache_size = ${config.cache_size}`);
		this.db.pragma(`temp_store = ${config.temp_store}`);
		this.db.pragma(`mmap_size = ${config.mmap_size}`);
		this.db.pragma(`wal_autocheckpoint = ${config.wal_autocheckpoint}`);
		this.db.pragma(`foreign_keys = ${config.foreign_keys}`);
	}

	/**
	 * Get the database connection
	 *
	 * @returns Database instance
	 */
	getDatabase(): Database.Database {
		if (!this.db) {
			throw new Error(
				'Database not initialized. Call initializeDatabase() first.'
			);
		}
		return this.db;
	}

	/**
	 * Close the database connection
	 */
	close(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}
}
