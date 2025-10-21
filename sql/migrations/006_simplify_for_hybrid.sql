-- ============================================================================
-- Migration 006: Simplify Database for Hybrid Sparse+Dense Index
-- Description: Drop complex tables, simplify to minimal file tracking only
-- Breaking Change: Requires full re-index
-- ============================================================================

-- ============================================================================
-- Drop FTS Triggers
-- ============================================================================
DROP TRIGGER IF EXISTS files_fts_insert;
DROP TRIGGER IF EXISTS files_fts_update;
DROP TRIGGER IF EXISTS files_fts_delete;
DROP TRIGGER IF EXISTS files_fts_hard_delete;

-- ============================================================================
-- Drop Complex Tables
-- ============================================================================

-- Drop embedding-related tables
DROP TABLE IF EXISTS vec_embeddings;
DROP TABLE IF EXISTS chunks;

-- Drop code analysis tables
DROP TABLE IF EXISTS xrefs;
DROP TABLE IF EXISTS symbols;

-- Drop FTS virtual table
DROP TABLE IF EXISTS files_fts;

-- ============================================================================
-- Simplify Files Table
-- ============================================================================

-- Create new simplified files table
CREATE TABLE IF NOT EXISTS files_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT UNIQUE NOT NULL,
    mtime_ms INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Create index for file path lookups
CREATE INDEX IF NOT EXISTS idx_files_new_path ON files_new(file_path);

-- Create index for mtime-based incremental indexing
CREATE INDEX IF NOT EXISTS idx_files_new_mtime ON files_new(mtime_ms);

-- Migrate existing file paths (if any) - lose all other metadata
INSERT INTO files_new (file_path, mtime_ms, indexed_at)
SELECT
    file_path,
    modified_at * 1000 AS mtime_ms,  -- Convert to milliseconds
    indexed_at * 1000 AS indexed_at  -- Convert to milliseconds
FROM files
WHERE deleted_at IS NULL;

-- Drop old files table
DROP TABLE IF EXISTS files;

-- Rename new table to files
ALTER TABLE files_new RENAME TO files;

-- ============================================================================
-- Update Schema Version
-- ============================================================================
UPDATE meta SET value = '6', updated_at = unixepoch() WHERE key = 'schema_version';

-- Add migration record
INSERT INTO migration_history (version, description, applied_at)
VALUES ('006', 'Simplify database for hybrid sparse+dense index', unixepoch());

-- ============================================================================
-- Validation
-- ============================================================================
SELECT 'Migration 006 completed' AS status;
SELECT COUNT(*) as remaining_files FROM files;

-- Vacuum to reclaim space
VACUUM;
ANALYZE;
