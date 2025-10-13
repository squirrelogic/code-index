-- ============================================================================
-- Initial Database Schema for Code Index
-- Version: 001
-- Description: Create core tables (files, meta, migration_history)
-- ============================================================================

-- ============================================================================
-- Files Table: Source code file metadata
-- ============================================================================
CREATE TABLE files (
    id TEXT PRIMARY KEY NOT NULL,
    file_path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    language TEXT NOT NULL,
    size INTEGER NOT NULL CHECK (size >= 0),
    modified_at INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER,
    CHECK (modified_at <= indexed_at),
    CHECK (deleted_at IS NULL OR deleted_at >= indexed_at)
);

-- Unique index for file paths (excludes soft-deleted)
CREATE UNIQUE INDEX idx_files_path ON files(file_path) WHERE deleted_at IS NULL;

-- Index for content hash lookups (deduplication)
CREATE INDEX idx_files_hash ON files(content_hash) WHERE deleted_at IS NULL;

-- Index for language-based queries
CREATE INDEX idx_files_language ON files(language) WHERE deleted_at IS NULL;

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
