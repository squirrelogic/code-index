import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import type { CodeIndexEntry } from '../models/index-entry.js';
import type { ProjectConfiguration } from '../models/project-config.js';

/**
 * Database service for SQLite operations
 */
export class DatabaseService {
  private db: Database.Database | null = null;
  private readonly dbPath: string;
  private readonly statements: Map<string, Database.Statement> = new Map();

  constructor(projectRoot: string) {
    const codeIndexDir = join(projectRoot, '.codeindex');
    this.dbPath = join(codeIndexDir, 'index.db');

    // Ensure directory exists
    if (!existsSync(codeIndexDir)) {
      mkdirSync(codeIndexDir, { recursive: true });
    }
  }

  /**
   * Opens database connection
   */
  open(): void {
    if (this.db) return;

    this.db = new Database(this.dbPath);

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Performance optimizations
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('temp_store = MEMORY');

    // Initialize schema
    this.initializeSchema();

    // Prepare common statements
    this.prepareStatements();
  }

  /**
   * Closes database connection
   */
  close(): void {
    if (!this.db) return;

    // Clear prepared statements
    this.statements.clear();

    this.db.close();
    this.db = null;
  }

  /**
   * Initializes database schema
   */
  private initializeSchema(): void {
    if (!this.db) throw new Error('Database not connected');

    // Create project configuration table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_config (
        id TEXT PRIMARY KEY,
        project_root TEXT NOT NULL,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        index_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        last_indexed_at TEXT,
        last_refreshed_at TEXT,
        ignore_patterns TEXT,
        include_patterns TEXT,
        max_file_size INTEGER NOT NULL,
        follow_symlinks INTEGER NOT NULL,
        batch_size INTEGER NOT NULL,
        concurrency INTEGER NOT NULL
      )
    `);

    // Create code index entries table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_entries (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        absolute_path TEXT NOT NULL,
        filename TEXT NOT NULL,
        extension TEXT,
        content_hash TEXT NOT NULL,
        size INTEGER NOT NULL,
        line_count INTEGER NOT NULL,
        encoding TEXT NOT NULL,
        language TEXT,
        is_text INTEGER NOT NULL,
        is_binary INTEGER NOT NULL,
        file_modified_at TEXT NOT NULL,
        indexed_at TEXT NOT NULL,
        content TEXT,
        tokens TEXT,
        symbols TEXT
      )
    `);

    // Create indexes for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_entries_path ON code_entries(path);
      CREATE INDEX IF NOT EXISTS idx_entries_language ON code_entries(language);
      CREATE INDEX IF NOT EXISTS idx_entries_extension ON code_entries(extension);
      CREATE INDEX IF NOT EXISTS idx_entries_filename ON code_entries(filename);
      CREATE INDEX IF NOT EXISTS idx_entries_modified ON code_entries(file_modified_at);
      CREATE INDEX IF NOT EXISTS idx_entries_hash ON code_entries(content_hash);
    `);

    // Create FTS5 virtual table for full-text search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS code_search
      USING fts5(
        path,
        filename,
        content,
        content=code_entries,
        content_rowid=rowid,
        tokenize='porter ascii'
      );
    `);

    // Create triggers to keep FTS index in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS entries_insert
      AFTER INSERT ON code_entries
      WHEN new.is_text = 1
      BEGIN
        INSERT INTO code_search(rowid, path, filename, content)
        VALUES (new.rowid, new.path, new.filename, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS entries_update
      AFTER UPDATE ON code_entries
      WHEN new.is_text = 1
      BEGIN
        UPDATE code_search
        SET path = new.path, filename = new.filename, content = new.content
        WHERE rowid = new.rowid;
      END;

      CREATE TRIGGER IF NOT EXISTS entries_delete
      AFTER DELETE ON code_entries
      BEGIN
        DELETE FROM code_search WHERE rowid = old.rowid;
      END;
    `);
  }

  /**
   * Prepares common SQL statements
   */
  private prepareStatements(): void {
    if (!this.db) throw new Error('Database not connected');

    // Insert entry
    this.statements.set('insertEntry', this.db.prepare(`
      INSERT OR REPLACE INTO code_entries (
        id, path, absolute_path, filename, extension, content_hash,
        size, line_count, encoding, language, is_text, is_binary,
        file_modified_at, indexed_at, content, tokens, symbols
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `));

    // Get entry by path
    this.statements.set('getByPath', this.db.prepare(`
      SELECT * FROM code_entries WHERE path = ?
    `));

    // Get all entries
    this.statements.set('getAllEntries', this.db.prepare(`
      SELECT * FROM code_entries ORDER BY path
    `));

    // Delete entry by path
    this.statements.set('deleteByPath', this.db.prepare(`
      DELETE FROM code_entries WHERE path = ?
    `));

    // Update project config
    this.statements.set('upsertConfig', this.db.prepare(`
      INSERT OR REPLACE INTO project_config (
        id, project_root, name, version, index_version, created_at,
        last_indexed_at, last_refreshed_at, ignore_patterns, include_patterns,
        max_file_size, follow_symlinks, batch_size, concurrency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `));

    // Get project config
    this.statements.set('getConfig', this.db.prepare(`
      SELECT * FROM project_config LIMIT 1
    `));

    // Count entries
    this.statements.set('countEntries', this.db.prepare(`
      SELECT COUNT(*) as count FROM code_entries
    `));

    // Get entries modified after timestamp
    this.statements.set('getModifiedAfter', this.db.prepare(`
      SELECT * FROM code_entries WHERE file_modified_at > ? ORDER BY path
    `));
  }

  /**
   * Inserts or updates a code entry
   */
  insertEntry(entry: CodeIndexEntry): void {
    const stmt = this.statements.get('insertEntry');
    if (!stmt) throw new Error('Statement not prepared');

    stmt.run(
      entry.id,
      entry.path,
      entry.absolutePath,
      entry.filename,
      entry.extension,
      entry.contentHash,
      entry.size,
      entry.lineCount,
      entry.encoding,
      entry.language,
      entry.isText ? 1 : 0,
      entry.isBinary ? 1 : 0,
      entry.fileModifiedAt.toISOString(),
      entry.indexedAt.toISOString(),
      entry.content,
      JSON.stringify(entry.tokens),
      JSON.stringify(entry.symbols)
    );
  }

  /**
   * Batch insert entries in a transaction
   */
  insertEntries(entries: CodeIndexEntry[]): void {
    if (!this.db) throw new Error('Database not connected');

    const insertStmt = this.statements.get('insertEntry');
    if (!insertStmt) throw new Error('Statement not prepared');

    const transaction = this.db.transaction((entries: CodeIndexEntry[]) => {
      for (const entry of entries) {
        insertStmt.run(
          entry.id,
          entry.path,
          entry.absolutePath,
          entry.filename,
          entry.extension,
          entry.contentHash,
          entry.size,
          entry.lineCount,
          entry.encoding,
          entry.language,
          entry.isText ? 1 : 0,
          entry.isBinary ? 1 : 0,
          entry.fileModifiedAt.toISOString(),
          entry.indexedAt.toISOString(),
          entry.content,
          JSON.stringify(entry.tokens),
          JSON.stringify(entry.symbols)
        );
      }
    });

    transaction(entries);
  }

  /**
   * Gets an entry by path
   */
  getEntryByPath(path: string): CodeIndexEntry | null {
    const stmt = this.statements.get('getByPath');
    if (!stmt) throw new Error('Statement not prepared');

    const row = stmt.get(path) as any;
    if (!row) return null;

    return this.rowToEntry(row);
  }

  /**
   * Gets all entries
   */
  getAllEntries(): CodeIndexEntry[] {
    const stmt = this.statements.get('getAllEntries');
    if (!stmt) throw new Error('Statement not prepared');

    const rows = stmt.all() as any[];
    return rows.map(row => this.rowToEntry(row));
  }

  /**
   * Deletes an entry by path
   */
  deleteEntry(path: string): void {
    const stmt = this.statements.get('deleteByPath');
    if (!stmt) throw new Error('Statement not prepared');

    stmt.run(path);
  }

  /**
   * Gets or creates project configuration
   */
  getProjectConfig(): ProjectConfiguration | null {
    const stmt = this.statements.get('getConfig');
    if (!stmt) throw new Error('Statement not prepared');

    const row = stmt.get() as any;
    if (!row) return null;

    return {
      id: row.id,
      projectRoot: row.project_root,
      name: row.name,
      version: row.version,
      indexVersion: row.index_version,
      createdAt: new Date(row.created_at),
      lastIndexedAt: row.last_indexed_at ? new Date(row.last_indexed_at) : null,
      lastRefreshedAt: row.last_refreshed_at ? new Date(row.last_refreshed_at) : null,
      ignorePatterns: row.ignore_patterns ? JSON.parse(row.ignore_patterns) : [],
      includePatterns: row.include_patterns ? JSON.parse(row.include_patterns) : [],
      maxFileSize: row.max_file_size,
      followSymlinks: row.follow_symlinks === 1,
      batchSize: row.batch_size,
      concurrency: row.concurrency
    };
  }

  /**
   * Saves project configuration
   */
  saveProjectConfig(config: ProjectConfiguration): void {
    const stmt = this.statements.get('upsertConfig');
    if (!stmt) throw new Error('Statement not prepared');

    stmt.run(
      config.id,
      config.projectRoot,
      config.name,
      config.version,
      config.indexVersion,
      config.createdAt.toISOString(),
      config.lastIndexedAt?.toISOString() || null,
      config.lastRefreshedAt?.toISOString() || null,
      JSON.stringify(config.ignorePatterns),
      JSON.stringify(config.includePatterns),
      config.maxFileSize,
      config.followSymlinks ? 1 : 0,
      config.batchSize,
      config.concurrency
    );
  }

  /**
   * Gets entry count
   */
  getEntryCount(): number {
    const stmt = this.statements.get('countEntries');
    if (!stmt) throw new Error('Statement not prepared');

    const result = stmt.get() as any;
    return result.count;
  }

  /**
   * Gets entries modified after a specific time
   */
  getEntriesModifiedAfter(timestamp: Date): CodeIndexEntry[] {
    const stmt = this.statements.get('getModifiedAfter');
    if (!stmt) throw new Error('Statement not prepared');

    const rows = stmt.all(timestamp.toISOString()) as any[];
    return rows.map(row => this.rowToEntry(row));
  }

  /**
   * Performs full-text search
   */
  searchText(query: string, limit: number = 100): any[] {
    if (!this.db) throw new Error('Database not connected');

    const stmt = this.db.prepare(`
      SELECT
        e.*,
        snippet(code_search, 2, '<mark>', '</mark>', '...', 50) as snippet,
        rank
      FROM code_search s
      JOIN code_entries e ON e.rowid = s.rowid
      WHERE code_search MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    return stmt.all(query, limit);
  }

  /**
   * Checks database integrity
   */
  checkIntegrity(): boolean {
    if (!this.db) throw new Error('Database not connected');

    const result = this.db.pragma('integrity_check') as any;
    return Array.isArray(result) && result[0]?.integrity_check === 'ok';
  }

  /**
   * Gets database size in bytes
   */
  getDatabaseSize(): number {
    if (!existsSync(this.dbPath)) return 0;

    const stats = require('fs').statSync(this.dbPath);
    return stats.size;
  }

  /**
   * Vacuum database to reclaim space
   */
  vacuum(): void {
    if (!this.db) throw new Error('Database not connected');
    this.db.exec('VACUUM');
  }

  /**
   * Converts database row to CodeIndexEntry
   */
  private rowToEntry(row: any): CodeIndexEntry {
    return {
      id: row.id,
      path: row.path,
      absolutePath: row.absolute_path,
      filename: row.filename,
      extension: row.extension,
      contentHash: row.content_hash,
      size: row.size,
      lineCount: row.line_count,
      encoding: row.encoding,
      language: row.language,
      isText: row.is_text === 1,
      isBinary: row.is_binary === 1,
      fileModifiedAt: new Date(row.file_modified_at),
      indexedAt: new Date(row.indexed_at),
      content: row.content,
      tokens: row.tokens ? JSON.parse(row.tokens) : [],
      symbols: row.symbols ? JSON.parse(row.symbols) : []
    };
  }
}