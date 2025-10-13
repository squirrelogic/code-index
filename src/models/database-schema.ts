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

/**
 * Symbol types supported by the indexer
 */
export type SymbolType =
	| 'function'
	| 'class'
	| 'variable'
	| 'constant'
	| 'type'
	| 'interface'
	| 'method';

/**
 * Symbol entity representing a code symbol
 */
export interface Symbol {
	/** Unique identifier (UUID v4 or ULID) */
	id: string;
	/** Parent file identifier */
	file_id: string;
	/** Symbol name (e.g., 'calculateTotal') */
	symbol_name: string;
	/** Symbol type (function, class, etc.) */
	symbol_type: SymbolType;
	/** Full signature (optional) */
	signature: string | null;
	/** Extracted documentation/comments (optional) */
	documentation: string | null;
	/** Starting line number (1-indexed) */
	line_start: number;
	/** Ending line number (1-indexed, inclusive) */
	line_end: number;
	/** Creation timestamp (Unix epoch seconds) */
	created_at: number;
	/** Soft delete timestamp (NULL = active, Unix epoch = deleted) */
	deleted_at: number | null;
}

/**
 * Reference types for cross-references
 */
export type ReferenceType =
	| 'read'
	| 'write'
	| 'call'
	| 'inherit'
	| 'implement'
	| 'import';

/**
 * CrossReference entity representing symbol usage relationships
 */
export interface CrossReference {
	/** Unique identifier (UUID v4 or ULID) */
	id: string;
	/** Symbol making the reference */
	source_symbol_id: string;
	/** Symbol being referenced */
	target_symbol_id: string;
	/** Type of reference */
	reference_type: ReferenceType;
	/** Surrounding code context (optional) */
	context: string | null;
	/** Line number where reference occurs (optional) */
	line_number: number | null;
	/** Creation timestamp (Unix epoch seconds) */
	created_at: number;
}

/**
 * SearchResult representing a full-text search result
 */
export interface SearchResult {
	/** File identifier */
	file_id: string;
	/** Symbol identifier (optional) */
	symbol_id: string | null;
	/** File path for display */
	file_path: string;
	/** Highlighted snippet of matched content */
	snippet: string;
	/** BM25 relevance rank (lower/more negative = more relevant) */
	rank: number;
}
