/**
 * Migration 002: Create chunks table for function/method-level code chunks
 *
 * This migration creates:
 * - chunks table with all metadata and constraints
 * - chunks_fts virtual table for full-text search
 * - Triggers to keep FTS table in sync
 * - chunk_stats table for monitoring
 */

import type { Database } from 'better-sqlite3';

export function up(db: Database): void {
  // Create chunks table
  db.exec(`
    CREATE TABLE chunks (
      id TEXT PRIMARY KEY,
      chunk_hash TEXT NOT NULL UNIQUE,
      file_id TEXT NOT NULL,
      chunk_type TEXT NOT NULL CHECK(chunk_type IN (
        'function', 'method', 'constructor', 'property',
        'class', 'module', 'async_function', 'async_method', 'generator'
      )),
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      normalized_content TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      start_byte INTEGER NOT NULL,
      end_byte INTEGER NOT NULL,
      language TEXT NOT NULL CHECK(language IN ('typescript', 'javascript', 'python')),
      context TEXT NOT NULL, -- JSON: ChunkContext
      documentation TEXT,
      signature TEXT,
      line_count INTEGER NOT NULL,
      character_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),

      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      CHECK (start_line <= end_line),
      CHECK (start_byte <= end_byte),
      CHECK (line_count = end_line - start_line + 1)
    );
  `);

  // Create indexes
  db.exec(`
    CREATE UNIQUE INDEX idx_chunks_hash ON chunks(chunk_hash);
    CREATE INDEX idx_chunks_file ON chunks(file_id);
    CREATE INDEX idx_chunks_type ON chunks(chunk_type);
    CREATE INDEX idx_chunks_language ON chunks(language);
    CREATE INDEX idx_chunks_file_position ON chunks(file_id, start_line);
  `);

  // Create FTS5 virtual table for full-text search
  db.exec(`
    CREATE VIRTUAL TABLE chunks_fts USING fts5(
      chunk_id UNINDEXED,
      name,
      content,
      documentation,
      signature,
      tokenize = 'porter unicode61'
    );
  `);

  // Trigger to keep FTS table in sync on insert
  db.exec(`
    CREATE TRIGGER chunks_fts_insert AFTER INSERT ON chunks
    BEGIN
      INSERT INTO chunks_fts(chunk_id, name, content, documentation, signature)
      VALUES (new.id, new.name, new.content, new.documentation, new.signature);
    END;
  `);

  // Trigger to keep FTS table in sync on update
  db.exec(`
    CREATE TRIGGER chunks_fts_update AFTER UPDATE ON chunks
    BEGIN
      UPDATE chunks_fts
      SET name = new.name,
          content = new.content,
          documentation = new.documentation,
          signature = new.signature
      WHERE chunk_id = new.id;
    END;
  `);

  // Trigger to keep FTS table in sync on delete
  db.exec(`
    CREATE TRIGGER chunks_fts_delete AFTER DELETE ON chunks
    BEGIN
      DELETE FROM chunks_fts WHERE chunk_id = old.id;
    END;
  `);

  // Create chunk_stats table for monitoring
  db.exec(`
    CREATE TABLE chunk_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total_chunks INTEGER NOT NULL,
      chunks_by_language TEXT NOT NULL, -- JSON: {typescript: 1000, javascript: 500, python: 300}
      chunks_by_type TEXT NOT NULL, -- JSON: {function: 800, method: 600, ...}
      avg_chunk_size INTEGER NOT NULL,
      large_chunks_count INTEGER NOT NULL, -- Chunks > 5,000 lines
      last_updated TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function down(db: Database): void {
  // Drop triggers first
  db.exec('DROP TRIGGER IF EXISTS chunks_fts_delete;');
  db.exec('DROP TRIGGER IF EXISTS chunks_fts_update;');
  db.exec('DROP TRIGGER IF EXISTS chunks_fts_insert;');

  // Drop FTS table
  db.exec('DROP TABLE IF EXISTS chunks_fts;');

  // Drop indexes
  db.exec('DROP INDEX IF EXISTS idx_chunks_file_position;');
  db.exec('DROP INDEX IF EXISTS idx_chunks_language;');
  db.exec('DROP INDEX IF EXISTS idx_chunks_type;');
  db.exec('DROP INDEX IF EXISTS idx_chunks_file;');
  db.exec('DROP INDEX IF EXISTS idx_chunks_hash;');

  // Drop stats table
  db.exec('DROP TABLE IF EXISTS chunk_stats;');

  // Drop main table
  db.exec('DROP TABLE IF EXISTS chunks;');
}
