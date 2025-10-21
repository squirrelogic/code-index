/**
 * Simplified Database Service
 *
 * Only manages file tracking for incremental indexing.
 * All complex symbol/embedding logic has been removed.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * File record in database
 */
export interface FileRecord {
  id: number;
  file_path: string;
  mtime_ms: number;
  indexed_at: number;
}

/**
 * Simplified database service - only file tracking
 */
export class DatabaseService {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    // Initialize schema if needed
    this.initializeSchema();
  }

  /**
   * Initialize or update database schema
   */
  private initializeSchema(): void {
    // Check if meta table exists
    const tableExists = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='meta'`)
      .get();

    if (!tableExists) {
      // Run initial migration
      this.runMigration('001_initial_schema.sql');
    }

    // Run any pending migrations
    this.runPendingMigrations();
  }

  /**
   * Run a specific migration file
   */
  private runMigration(filename: string): void {
    const migrationPath = path.join(__dirname, '../../sql/migrations', filename);
    try {
      const sql = readFileSync(migrationPath, 'utf-8');
      this.db.exec(sql);
      console.log(`Applied migration: ${filename}`);
    } catch (error) {
      console.warn(`Migration ${filename} not found or failed: ${error}`);
    }
  }

  /**
   * Run all pending migrations
   */
  private runPendingMigrations(): void {
    const currentVersion = this.getSchemaVersion();

    // List of migrations to check (in order)
    const migrations = [
      { version: '2', file: '002_add_chunks_embeddings.sql' },
      { version: '3', file: '003_add_calls_table.sql' },
      { version: '4', file: '004_add_embedding_tables.sql' },
      { version: '6', file: '006_simplify_for_hybrid.sql' }, // Skip 005, it was deleted
    ];

    for (const migration of migrations) {
      if (parseInt(currentVersion) < parseInt(migration.version)) {
        this.runMigration(migration.file);
      }
    }
  }

  /**
   * Get current schema version
   */
  private getSchemaVersion(): string {
    try {
      const result = this.db
        .prepare(`SELECT value FROM meta WHERE key = 'schema_version'`)
        .get() as { value: string } | undefined;
      return result?.value || '0';
    } catch {
      return '0';
    }
  }

  /**
   * Insert or update a file record
   */
  upsertFile(filePath: string, mtimeMs: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO files (file_path, mtime_ms, indexed_at)
      VALUES (?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        mtime_ms = excluded.mtime_ms,
        indexed_at = excluded.indexed_at
    `);

    stmt.run(filePath, mtimeMs, Date.now());
  }

  /**
   * Get all files
   */
  getAllFiles(): FileRecord[] {
    const stmt = this.db.prepare(`
      SELECT id, file_path, mtime_ms, indexed_at
      FROM files
      ORDER BY file_path
    `);

    return stmt.all() as FileRecord[];
  }

  /**
   * Get a specific file by path
   */
  getFile(filePath: string): FileRecord | null {
    const stmt = this.db.prepare(`
      SELECT id, file_path, mtime_ms, indexed_at
      FROM files
      WHERE file_path = ?
    `);

    return (stmt.get(filePath) as FileRecord | undefined) || null;
  }

  /**
   * Delete a file record
   */
  deleteFile(filePath: string): void {
    const stmt = this.db.prepare(`DELETE FROM files WHERE file_path = ?`);
    stmt.run(filePath);
  }

  /**
   * Clear all files
   */
  clearFiles(): void {
    this.db.prepare(`DELETE FROM files`).run();
  }

  /**
   * Get file count
   */
  getFileCount(): number {
    const result = this.db
      .prepare(`SELECT COUNT(*) as count FROM files`)
      .get() as { count: number };
    return result.count;
  }

  /**
   * Get database statistics
   */
  getStats(): {
    fileCount: number;
    dbSizeBytes: number;
    schemaVersion: string;
  } {
    const fileCount = this.getFileCount();

    // Get database file size
    const pageCount = this.db.pragma('page_count', { simple: true }) as number;
    const pageSize = this.db.pragma('page_size', { simple: true }) as number;
    const dbSizeBytes = pageCount * pageSize;

    const schemaVersion = this.getSchemaVersion();

    return {
      fileCount,
      dbSizeBytes,
      schemaVersion,
    };
  }

  /**
   * Run database maintenance
   */
  vacuum(): void {
    this.db.exec('VACUUM');
  }

  /**
   * Update statistics
   */
  analyze(): void {
    this.db.exec('ANALYZE');
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get raw database instance (for advanced use)
   */
  getRawDb(): Database.Database {
    return this.db;
  }

  /**
   * Clear the entire index (for testing/reset)
   */
  clearIndex(): void {
    this.clearFiles();
  }
}
