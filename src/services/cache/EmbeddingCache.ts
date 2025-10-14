/**
 * Embedding Cache Service
 *
 * SQLite-based cache for embedding vectors with efficient lookups and invalidation.
 */

import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import { dirname } from 'path';
import {
  encodeEmbedding,
  decodeEmbedding
} from '../../models/EmbeddingCacheEntry.js';

export class EmbeddingCache {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(cacheDir: string) {
    this.dbPath = `${cacheDir}/embeddings.db`;
  }

  /**
   * Initializes the cache database and creates schema if needed
   */
  async initialize(): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(dirname(this.dbPath), { recursive: true });

      // Open database
      this.db = new Database(this.dbPath);

      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');

      // Create schema
      this.createSchema();
    } catch (error: any) {
      throw new Error(`Failed to initialize embedding cache: ${error.message}`);
    }
  }

  /**
   * Creates the SQLite schema with indexes
   */
  private createSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Create embeddings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contentHash TEXT NOT NULL,
        modelId TEXT NOT NULL,
        modelVersion TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        createdAt INTEGER NOT NULL,
        lastAccessedAt INTEGER NOT NULL,
        UNIQUE(contentHash, modelId, modelVersion, dimensions)
      );
    `);

    // Create indexes for efficient lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lookup
        ON embeddings (contentHash, modelId, modelVersion, dimensions);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_accessed
        ON embeddings (lastAccessedAt);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_model
        ON embeddings (modelId, dimensions);
    `);
  }

  /**
   * Retrieves an embedding from cache
   * @param contentHash - SHA-256 hash of content
   * @param modelId - Model identifier
   * @param modelVersion - Model version
   * @param dimensions - Expected dimensions
   * @returns The cached embedding or null if not found
   */
  get(
    contentHash: string,
    modelId: string,
    modelVersion: string,
    dimensions: number
  ): Float32Array | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT embedding FROM embeddings
      WHERE contentHash = ?
        AND modelId = ?
        AND modelVersion = ?
        AND dimensions = ?
      LIMIT 1
    `);

    const row = stmt.get(contentHash, modelId, modelVersion, dimensions) as
      | { embedding: Buffer }
      | undefined;

    if (!row) return null;

    // Update last accessed timestamp
    const updateStmt = this.db.prepare(`
      UPDATE embeddings
      SET lastAccessedAt = ?
      WHERE contentHash = ?
        AND modelId = ?
        AND modelVersion = ?
        AND dimensions = ?
    `);

    updateStmt.run(Date.now(), contentHash, modelId, modelVersion, dimensions);

    // Decode and return embedding
    return decodeEmbedding(row.embedding);
  }

  /**
   * Stores an embedding in cache
   * @param contentHash - SHA-256 hash of content
   * @param modelId - Model identifier
   * @param modelVersion - Model version
   * @param dimensions - Embedding dimensions
   * @param embedding - The embedding vector
   */
  set(
    contentHash: string,
    modelId: string,
    modelVersion: string,
    dimensions: number,
    embedding: Float32Array
  ): void {
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    const buffer = encodeEmbedding(embedding);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO embeddings
        (contentHash, modelId, modelVersion, dimensions, embedding, createdAt, lastAccessedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(contentHash, modelId, modelVersion, dimensions, buffer, now, now);
  }

  /**
   * Invalidates all embeddings for a specific dimension
   * Used when switching models with different dimensions
   * @param dimensions - Dimensions to invalidate
   * @returns Number of entries deleted
   */
  invalidateByDimensions(dimensions: number): number {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      DELETE FROM embeddings WHERE dimensions = ?
    `);

    const result = stmt.run(dimensions);
    return result.changes;
  }

  /**
   * Invalidates all embeddings for a specific model
   * @param modelId - Model ID to invalidate
   * @param dimensions - Optional dimension filter
   * @returns Number of entries deleted
   */
  invalidateByModel(modelId: string, dimensions?: number): number {
    if (!this.db) throw new Error('Database not initialized');

    let query = 'DELETE FROM embeddings WHERE modelId = ?';
    const params: any[] = [modelId];

    if (dimensions !== undefined) {
      query += ' AND dimensions = ?';
      params.push(dimensions);
    }

    const stmt = this.db.prepare(query);
    const result = stmt.run(...params);
    return result.changes;
  }

  /**
   * Clears all entries from cache
   * @returns Number of entries deleted
   */
  clear(): number {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM embeddings');
    const result = stmt.run();
    return result.changes;
  }

  /**
   * Gets cache statistics
   */
  getStats(): {
    totalEntries: number;
    totalSize: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  } {
    if (!this.db) throw new Error('Database not initialized');

    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM embeddings');
    const countResult = countStmt.get() as { count: number };

    const sizeStmt = this.db.prepare(
      'SELECT SUM(LENGTH(embedding)) as size FROM embeddings'
    );
    const sizeResult = sizeStmt.get() as { size: number | null };

    const rangeStmt = this.db.prepare(`
      SELECT MIN(createdAt) as oldest, MAX(createdAt) as newest
      FROM embeddings
    `);
    const rangeResult = rangeStmt.get() as {
      oldest: number | null;
      newest: number | null;
    };

    return {
      totalEntries: countResult.count,
      totalSize: sizeResult.size || 0,
      oldestEntry: rangeResult.oldest ? new Date(rangeResult.oldest) : null,
      newestEntry: rangeResult.newest ? new Date(rangeResult.newest) : null
    };
  }

  /**
   * Calculates cache hit rate based on access patterns
   * @param windowMs - Time window in milliseconds (default: last hour)
   */
  getHitRate(windowMs: number = 3600000): number {
    if (!this.db) throw new Error('Database not initialized');

    const cutoff = Date.now() - windowMs;

    const stmt = this.db.prepare(`
      SELECT COUNT(*) as accessed
      FROM embeddings
      WHERE lastAccessedAt > ?
    `);

    const result = stmt.get(cutoff) as { accessed: number };
    const totalStmt = this.db.prepare('SELECT COUNT(*) as total FROM embeddings');
    const totalResult = totalStmt.get() as { total: number };

    if (totalResult.total === 0) return 0;

    return result.accessed / totalResult.total;
  }

  /**
   * Closes the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
