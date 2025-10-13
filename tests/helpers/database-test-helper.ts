/**
 * Database test helper
 * Provides utilities for creating test databases with production schema
 * Uses the exact same schema as migration 002_create_chunks_table.ts
 */

import Database from 'better-sqlite3';
import { Chunk } from '../../src/models/Chunk.js';
import { ChunkType, Language } from '../../src/models/ChunkTypes.js';
import { randomUUID } from 'crypto';

/**
 * Create an in-memory test database with production schema
 * This uses the EXACT same schema as src/services/database/migrations/002_create_chunks_table.ts
 * to ensure tests match production behavior
 *
 * @returns Database instance with chunks table and FTS configured
 */
export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');

  // Create chunks table (from migration 002)
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
      context TEXT NOT NULL,
      documentation TEXT,
      signature TEXT,
      line_count INTEGER NOT NULL,
      character_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),

      CHECK (start_line <= end_line),
      CHECK (start_byte <= end_byte),
      CHECK (line_count = end_line - start_line + 1)
    );
  `);

  // Create indexes (from migration 002)
  db.exec(`
    CREATE UNIQUE INDEX idx_chunks_hash ON chunks(chunk_hash);
    CREATE INDEX idx_chunks_file ON chunks(file_id);
    CREATE INDEX idx_chunks_type ON chunks(chunk_type);
    CREATE INDEX idx_chunks_language ON chunks(language);
    CREATE INDEX idx_chunks_file_position ON chunks(file_id, start_line);
  `);

  // Create FTS5 virtual table (from migration 002)
  // NOTE: This is a STANDALONE FTS table (no content= parameter)
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

  // Trigger to keep FTS table in sync on insert (from migration 002)
  db.exec(`
    CREATE TRIGGER chunks_fts_insert AFTER INSERT ON chunks
    BEGIN
      INSERT INTO chunks_fts(chunk_id, name, content, documentation, signature)
      VALUES (new.id, new.name, new.content, new.documentation, new.signature);
    END;
  `);

  // Trigger to keep FTS table in sync on update (from migration 002)
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

  // Trigger to keep FTS table in sync on delete (from migration 002)
  db.exec(`
    CREATE TRIGGER chunks_fts_delete AFTER DELETE ON chunks
    BEGIN
      DELETE FROM chunks_fts WHERE chunk_id = old.id;
    END;
  `);

  return db;
}

/**
 * Create a test chunk with sensible defaults
 * @param overrides Partial chunk properties to override defaults
 * @returns Chunk instance ready for testing
 */
export function createTestChunk(overrides?: Partial<{
  id: string;
  chunkHash: string;
  fileId: string;
  chunkType: ChunkType;
  language: Language;
  name: string;
  content: string;
  startLine: number;
  endLine: number;
  documentation: string | null;
}>): Chunk {
  const content = overrides?.content || 'function test() { return 42; }';
  const startLine = overrides?.startLine || 1;
  const endLine = overrides?.endLine || 3;
  const lineCount = endLine - startLine + 1;

  return new Chunk(
    overrides?.id || randomUUID(),
    overrides?.chunkHash || 'a'.repeat(64), // Simple hash for testing
    overrides?.fileId || randomUUID(),
    overrides?.chunkType || ChunkType.Function,
    overrides?.name || 'test',
    content,
    content.replace(/\s+/g, ' ').trim(), // Normalized
    startLine,
    endLine,
    0,
    content.length,
    overrides?.language || Language.TypeScript,
    {
      className: null,
      classInheritance: [],
      modulePath: '/test/file.ts',
      namespace: null,
      methodSignature: null,
      isTopLevel: true,
      parentChunkHash: null,
    },
    overrides?.documentation ?? null,
    'function test(): number',
    lineCount,
    content.length,
    new Date(),
    new Date()
  );
}
