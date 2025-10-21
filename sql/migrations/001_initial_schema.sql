-- ============================================================================
-- Initial Database Schema for Code Index
-- Version: 001
-- Description: Create core tables (files, meta, migration_history)
-- ============================================================================

-- ============================================================================
-- Files Table: Source code file metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY NOT NULL,
    file_path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    language TEXT NOT NULL,
    size INTEGER NOT NULL CHECK (size >= 0),
    modified_at INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER,
    content TEXT,
    CHECK (modified_at <= indexed_at),
    CHECK (deleted_at IS NULL OR deleted_at >= indexed_at)
);

-- Unique index for file paths (excludes soft-deleted)
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_path ON files(file_path) WHERE deleted_at IS NULL;

-- Index for content hash lookups (deduplication)
CREATE INDEX IF NOT EXISTS idx_files_hash ON files(content_hash) WHERE deleted_at IS NULL;

-- Index for language-based queries
CREATE INDEX IF NOT EXISTS idx_files_language ON files(language) WHERE deleted_at IS NULL;

-- ============================================================================
-- Meta Table: Schema version and configuration
-- ============================================================================
CREATE TABLE meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Initial schema version and configuration
INSERT INTO meta (key, value) VALUES ('schema_version', '1');
INSERT INTO meta (key, value) VALUES ('created_at', unixepoch());
INSERT INTO meta (key, value) VALUES ('retention_days', '30');

-- ============================================================================
-- Migration History Table: Applied migration tracking
-- ============================================================================
CREATE TABLE migration_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Index for version lookups
CREATE UNIQUE INDEX idx_migration_version ON migration_history(version);

-- ============================================================================
-- Symbols Table: Code symbols with soft delete
-- ============================================================================
CREATE TABLE IF NOT EXISTS symbols (
    id TEXT PRIMARY KEY NOT NULL,
    file_id TEXT NOT NULL,
    symbol_name TEXT NOT NULL,
    symbol_type TEXT NOT NULL CHECK (
        symbol_type IN ('function', 'class', 'variable', 'constant', 'type', 'interface', 'method')
    ),
    signature TEXT,
    documentation TEXT,
    line_start INTEGER NOT NULL CHECK (line_start >= 1),
    line_end INTEGER NOT NULL CHECK (line_end >= line_start),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER,
    CHECK (deleted_at IS NULL OR deleted_at >= created_at),
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- Partial index for active symbols by name
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(symbol_name) WHERE deleted_at IS NULL;

-- Compound index for file + type lookups (leftmost prefix matching)
CREATE INDEX IF NOT EXISTS idx_symbols_file_type ON symbols(file_id, symbol_type) WHERE deleted_at IS NULL;

-- Index for soft-delete cleanup queries
CREATE INDEX IF NOT EXISTS idx_symbols_deleted ON symbols(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- Cross-Reference Table: Symbol usage relationships
-- ============================================================================
CREATE TABLE xrefs (
    id TEXT PRIMARY KEY NOT NULL,
    source_symbol_id TEXT NOT NULL,
    target_symbol_id TEXT NOT NULL,
    reference_type TEXT NOT NULL CHECK (
        reference_type IN ('read', 'write', 'call', 'inherit', 'implement', 'import')
    ),
    context TEXT,
    line_number INTEGER CHECK (line_number IS NULL OR line_number >= 1),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    CHECK (source_symbol_id != target_symbol_id),
    FOREIGN KEY (source_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
    FOREIGN KEY (target_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);

-- Index for "find all references to X"
CREATE INDEX idx_xrefs_target ON xrefs(target_symbol_id);

-- Index for "find all references from X"
CREATE INDEX idx_xrefs_source ON xrefs(source_symbol_id);

-- Compound index for reference type filtering
CREATE INDEX idx_xrefs_type ON xrefs(reference_type, target_symbol_id);

-- ============================================================================
-- Files FTS Table: FTS5 virtual table for full-text search on files
-- ============================================================================
CREATE VIRTUAL TABLE files_fts USING fts5(
    file_path,               -- Searchable: file path
    content,                 -- Searchable: file content
    file_id UNINDEXED,       -- Not searchable: for JOIN with files table
    tokenize = 'porter unicode61'
);

-- ============================================================================
-- FTS Sync Triggers: Keep files_fts in sync with files table
-- ============================================================================

-- Trigger: Insert new file into FTS index
CREATE TRIGGER files_fts_insert AFTER INSERT ON files
WHEN new.deleted_at IS NULL AND new.content IS NOT NULL
BEGIN
    INSERT INTO files_fts(file_path, content, file_id)
    VALUES (new.file_path, new.content, new.id);
END;

-- Trigger: Update file in FTS index
CREATE TRIGGER files_fts_update AFTER UPDATE ON files
WHEN new.deleted_at IS NULL AND new.content IS NOT NULL
BEGIN
    INSERT INTO files_fts(files_fts, file_path, content, file_id)
    VALUES ('delete', old.file_path, old.content, old.id);
    INSERT INTO files_fts(file_path, content, file_id)
    VALUES (new.file_path, new.content, new.id);
END;

-- Trigger: Remove soft-deleted or content-less files from FTS index
CREATE TRIGGER files_fts_delete AFTER UPDATE ON files
WHEN new.deleted_at IS NOT NULL OR new.content IS NULL
BEGIN
    INSERT INTO files_fts(files_fts, file_path, content, file_id)
    VALUES ('delete', old.file_path, old.content, old.id);
END;

-- Trigger: Remove hard-deleted files from FTS index
CREATE TRIGGER files_fts_hard_delete AFTER DELETE ON files
BEGIN
    INSERT INTO files_fts(files_fts, file_path, content, file_id)
    VALUES ('delete', old.file_path, old.content, old.id);
END;
