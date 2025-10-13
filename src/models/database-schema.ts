/**
 * Database Schema Type Definitions
 *
 * This module contains TypeScript interfaces for all database entities
 * and configuration types used throughout the code-index application.
 */

/**
 * SQLite PRAGMA configuration settings
 * These settings optimize database performance and behavior
 */
export interface SQLitePragmaConfig {
	/** Write-Ahead Logging mode for concurrent readers */
	journal_mode: 'WAL';
	/** Synchronous mode - NORMAL is safe with WAL */
	synchronous: 'NORMAL' | 'FULL' | 'OFF';
	/** Page cache size in kibibytes (negative = KB, positive = pages) */
	cache_size: number;
	/** Temporary storage location */
	temp_store: 'MEMORY' | 'FILE' | 'DEFAULT';
	/** Memory-mapped I/O size in bytes (virtual addressing) */
	mmap_size: number;
	/** WAL auto-checkpoint interval in pages */
	wal_autocheckpoint: number;
	/** Enable foreign key constraint enforcement */
	foreign_keys: 'ON' | 'OFF';
}

/**
 * Default PRAGMA configuration for optimal performance
 */
export const DEFAULT_PRAGMA_CONFIG: SQLitePragmaConfig = {
	journal_mode: 'WAL',
	synchronous: 'NORMAL',
	cache_size: -64000, // 64MB
	temp_store: 'MEMORY',
	mmap_size: 30000000000, // 30GB virtual
	wal_autocheckpoint: 1000,
	foreign_keys: 'ON',
};

/**
 * Migration metadata structure
 */
export interface Migration {
	version: string;
	description: string;
	sql: string;
}

/**
 * Database initialization options
 */
export interface DatabaseConfig {
	dbPath: string;
	pragmaConfig?: Partial<SQLitePragmaConfig>;
}

// ============================================================================
// Entity Interfaces
// ============================================================================

/**
 * File entity representing a source code file
 */
export interface File {
	/** Unique identifier (UUID v4 or ULID) */
	id: string;
	/** Project-relative file path */
	file_path: string;
	/** SHA-256 hash of file content for change detection */
	content_hash: string;
	/** Programming language identifier */
	language: string;
	/** File size in bytes */
	size: number;
	/** Last modification timestamp (Unix epoch seconds) */
	modified_at: number;
	/** Indexing timestamp (Unix epoch seconds) */
	indexed_at: number;
	/** Soft delete timestamp (NULL = active, Unix epoch = deleted) */
	deleted_at: number | null;
}
