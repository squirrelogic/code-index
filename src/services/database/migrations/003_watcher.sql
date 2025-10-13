-- Migration 003: Add file watcher support
-- Date: 2025-10-12
-- Purpose: Support file watching, change tracking, and Git hooks

-- Create file change events table
CREATE TABLE IF NOT EXISTS file_change_events (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  canonical_path TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('create', 'modify', 'delete', 'rename')),
  timestamp INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  retry_count INTEGER DEFAULT 0,
  error TEXT,
  size INTEGER,
  is_directory INTEGER DEFAULT 0,
  is_symlink INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Index for querying pending events
CREATE INDEX IF NOT EXISTS idx_file_change_events_status ON file_change_events(status, timestamp);
-- Index for finding events by path
CREATE INDEX IF NOT EXISTS idx_file_change_events_path ON file_change_events(canonical_path);

-- Create ignore patterns table
CREATE TABLE IF NOT EXISTS ignore_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'custom', -- custom, gitignore, default
  priority INTEGER DEFAULT 50, -- Higher priority wins (0-100)
  enabled INTEGER DEFAULT 1,
  match_count INTEGER DEFAULT 0,
  last_matched_at INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Index for enabled patterns by priority
CREATE INDEX IF NOT EXISTS idx_ignore_patterns_enabled ON ignore_patterns(enabled, priority DESC);

-- Create Git hooks configuration table
CREATE TABLE IF NOT EXISTS git_hooks (
  hook_type TEXT PRIMARY KEY CHECK (hook_type IN ('post-merge', 'post-checkout', 'post-rewrite')),
  installed INTEGER DEFAULT 0,
  version TEXT,
  installation_path TEXT,
  last_executed_at INTEGER,
  execution_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Create watcher state table
CREATE TABLE IF NOT EXISTS watcher_state (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Only one row allowed
  is_watching INTEGER DEFAULT 0,
  started_at INTEGER,
  stopped_at INTEGER,
  events_processed INTEGER DEFAULT 0,
  events_failed INTEGER DEFAULT 0,
  events_skipped INTEGER DEFAULT 0,
  last_event_at INTEGER,
  memory_usage_mb INTEGER,
  last_memory_check_at INTEGER,
  config_json TEXT, -- JSON serialized WatcherConfig
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Initialize watcher state
INSERT OR IGNORE INTO watcher_state (id, is_watching) VALUES (1, 0);

-- Add canonical_path column to index_entries if not exists
-- This requires checking if column exists first
CREATE TABLE IF NOT EXISTS index_entries_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  canonical_path TEXT,
  content TEXT,
  size INTEGER NOT NULL,
  modified_at INTEGER NOT NULL,
  indexed_at INTEGER NOT NULL,
  checksum TEXT,
  language TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Copy existing data if table exists
INSERT OR IGNORE INTO index_entries_new (id, path, canonical_path, content, size, modified_at, indexed_at, checksum, language, created_at, updated_at)
SELECT id, path, path as canonical_path, content, size, modified_at, indexed_at, checksum, language, created_at, updated_at
FROM index_entries WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='index_entries');

-- Drop old table if exists
DROP TABLE IF EXISTS index_entries;

-- Rename new table
ALTER TABLE index_entries_new RENAME TO index_entries;

-- Create index for canonical path
CREATE INDEX IF NOT EXISTS idx_index_entries_canonical_path ON index_entries(canonical_path);

-- Create change tracking table for incremental updates
CREATE TABLE IF NOT EXISTS change_tracking (
  path TEXT PRIMARY KEY,
  last_modified INTEGER NOT NULL,
  last_indexed INTEGER NOT NULL,
  change_count INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Index for finding changed files
CREATE INDEX IF NOT EXISTS idx_change_tracking_modified ON change_tracking(last_modified, last_indexed);

-- Default ignore patterns
INSERT OR IGNORE INTO ignore_patterns (pattern, source, priority) VALUES
  ('node_modules/**', 'default', 90),
  ('.git/**', 'default', 90),
  ('dist/**', 'default', 80),
  ('build/**', 'default', 80),
  ('.codeindex/**', 'default', 100),
  ('**/*.log', 'default', 70),
  ('**/.DS_Store', 'default', 70),
  ('**/Thumbs.db', 'default', 70),
  ('**/*.tmp', 'default', 60),
  ('**/*.swp', 'default', 60),
  ('**/*.swo', 'default', 60),
  ('coverage/**', 'default', 75),
  ('*.sqlite', 'default', 65),
  ('*.sqlite3', 'default', 65),
  ('*.db', 'default', 65);