/**
 * Repository for chunk CRUD operations
 * Implements database access for code chunks
 */

import type { Database, Statement } from 'better-sqlite3';
import { Chunk } from '../../models/Chunk.js';
import { ChunkType, Language } from '../../models/ChunkTypes.js';
import type { ChunkQuery, ChunkQueryResult } from '../../models/ChunkQuery.js';
import { randomUUID } from 'crypto';

/**
 * Chunk statistics interface
 */
export interface ChunkStatistics {
  totalChunks: number;
  chunksByLanguage: Record<Language, number>;
  chunksByType: Record<ChunkType, number>;
  avgChunkSize: number;
  largeChunksCount: number;
}

/**
 * ChunkRepository - Data access layer for chunks
 */
export class ChunkRepository {
  private db: Database;
  private preparedStatements: Map<string, Statement>;

  constructor(database: Database) {
    this.db = database;
    this.preparedStatements = new Map();
    this.prepareStatements();
  }

  /**
   * Prepare all SQL statements for reuse
   */
  private prepareStatements(): void {
    // Insert chunk
    this.preparedStatements.set(
      'insert',
      this.db.prepare(`
        INSERT INTO chunks (
          id, chunk_hash, file_id, chunk_type, name, content, normalized_content,
          start_line, end_line, start_byte, end_byte, language, context,
          documentation, signature, line_count, character_count
        ) VALUES (
          @id, @chunk_hash, @file_id, @chunk_type, @name, @content, @normalized_content,
          @start_line, @end_line, @start_byte, @end_byte, @language, @context,
          @documentation, @signature, @line_count, @character_count
        )
      `)
    );

    // Update chunk
    this.preparedStatements.set(
      'update',
      this.db.prepare(`
        UPDATE chunks SET
          file_id = @file_id,
          chunk_type = @chunk_type,
          name = @name,
          content = @content,
          normalized_content = @normalized_content,
          start_line = @start_line,
          end_line = @end_line,
          start_byte = @start_byte,
          end_byte = @end_byte,
          language = @language,
          context = @context,
          documentation = @documentation,
          signature = @signature,
          line_count = @line_count,
          character_count = @character_count,
          updated_at = datetime('now')
        WHERE chunk_hash = @chunk_hash
      `)
    );

    // Find by hash
    this.preparedStatements.set(
      'findByHash',
      this.db.prepare('SELECT * FROM chunks WHERE chunk_hash = ?')
    );

    // Find by file ID
    this.preparedStatements.set(
      'findByFileId',
      this.db.prepare('SELECT * FROM chunks WHERE file_id = ? ORDER BY start_line')
    );

    // Delete by file ID
    this.preparedStatements.set(
      'deleteByFileId',
      this.db.prepare('DELETE FROM chunks WHERE file_id = ?')
    );

    // Delete by ID
    this.preparedStatements.set(
      'deleteById',
      this.db.prepare('DELETE FROM chunks WHERE id = ?')
    );

    // Count chunks
    this.preparedStatements.set(
      'count',
      this.db.prepare('SELECT COUNT(*) as count FROM chunks')
    );
  }

  /**
   * Save a chunk (insert or update if hash exists)
   * @param chunk Chunk to save
   * @returns Saved chunk with generated ID if new
   */
  public saveChunk(chunk: Chunk): Chunk {
    // Check if chunk with this hash already exists
    const existing = this.findByHash(chunk.chunkHash);

    if (existing) {
      // Update existing chunk
      const stmt = this.preparedStatements.get('update')!;
      stmt.run({
        chunk_hash: chunk.chunkHash,
        file_id: chunk.fileId,
        chunk_type: chunk.chunkType,
        name: chunk.name,
        content: chunk.content,
        normalized_content: chunk.normalizedContent,
        start_line: chunk.startLine,
        end_line: chunk.endLine,
        start_byte: chunk.startByte,
        end_byte: chunk.endByte,
        language: chunk.language,
        context: JSON.stringify(chunk.context),
        documentation: chunk.documentation,
        signature: chunk.signature,
        line_count: chunk.lineCount,
        character_count: chunk.characterCount,
      });

      return this.findByHash(chunk.chunkHash)!;
    } else {
      // Insert new chunk
      const id = chunk.id || randomUUID();
      const stmt = this.preparedStatements.get('insert')!;

      stmt.run({
        id,
        chunk_hash: chunk.chunkHash,
        file_id: chunk.fileId,
        chunk_type: chunk.chunkType,
        name: chunk.name,
        content: chunk.content,
        normalized_content: chunk.normalizedContent,
        start_line: chunk.startLine,
        end_line: chunk.endLine,
        start_byte: chunk.startByte,
        end_byte: chunk.endByte,
        language: chunk.language,
        context: JSON.stringify(chunk.context),
        documentation: chunk.documentation,
        signature: chunk.signature,
        line_count: chunk.lineCount,
        character_count: chunk.characterCount,
      });

      return this.findByHash(chunk.chunkHash)!;
    }
  }

  /**
   * Find chunk by hash
   * @param hash Chunk hash to search for
   * @returns Chunk if found, null otherwise
   */
  public findByHash(hash: string): Chunk | null {
    const stmt = this.preparedStatements.get('findByHash')!;
    const row = stmt.get(hash) as Record<string, unknown> | undefined;

    if (!row) {
      return null;
    }

    return Chunk.fromRow(row);
  }

  /**
   * Find all chunks for a file
   * @param fileId File ID
   * @returns Array of chunks ordered by start line
   */
  public findByFileId(fileId: string): Chunk[] {
    const stmt = this.preparedStatements.get('findByFileId')!;
    const rows = stmt.all(fileId) as Record<string, unknown>[];

    return rows.map((row) => Chunk.fromRow(row));
  }

  /**
   * Query chunks with filters
   * @param query ChunkQuery with filters
   * @returns ChunkQueryResult with chunks and metadata
   */
  public query(query: ChunkQuery): ChunkQueryResult {
    // Build WHERE clauses
    const whereClauses: string[] = [];
    const params: Record<string, unknown> = {};

    // Filter by chunk types
    if (query.chunkTypes.length > 0) {
      const placeholders = query.chunkTypes.map((_, i) => `@type${i}`).join(', ');
      whereClauses.push(`chunk_type IN (${placeholders})`);
      query.chunkTypes.forEach((type, i) => {
        params[`type${i}`] = type;
      });
    }

    // Filter by languages
    if (query.languages.length > 0) {
      const placeholders = query.languages.map((_, i) => `@lang${i}`).join(', ');
      whereClauses.push(`language IN (${placeholders})`);
      query.languages.forEach((lang, i) => {
        params[`lang${i}`] = lang;
      });
    }

    // Filter by file ID
    if (query.fileId) {
      whereClauses.push('file_id = @fileId');
      params.fileId = query.fileId;
    }

    // Filter by line count range
    if (query.minLineCount !== null) {
      whereClauses.push('line_count >= @minLines');
      params.minLines = query.minLineCount;
    }
    if (query.maxLineCount !== null) {
      whereClauses.push('line_count <= @maxLines');
      params.maxLines = query.maxLineCount;
    }

    // Build base SQL
    let sql = 'SELECT * FROM chunks';
    let countSql = 'SELECT COUNT(*) as count FROM chunks';

    // Full-text search
    if (query.searchText) {
      sql = `
        SELECT c.* FROM chunks c
        INNER JOIN chunks_fts fts ON c.id = fts.chunk_id
        WHERE fts MATCH @searchText
      `;
      countSql = `
        SELECT COUNT(*) as count FROM chunks c
        INNER JOIN chunks_fts fts ON c.id = fts.chunk_id
        WHERE fts MATCH @searchText
      `;
      params.searchText = query.searchText;
    }

    // Add WHERE clauses
    if (whereClauses.length > 0) {
      const whereClause = whereClauses.join(' AND ');
      if (query.searchText) {
        sql += ` AND ${whereClause}`;
        countSql += ` AND ${whereClause}`;
      } else {
        sql += ` WHERE ${whereClause}`;
        countSql += ` WHERE ${whereClause}`;
      }
    }

    // Get total count
    const countStmt = this.db.prepare(countSql);
    const countRow = countStmt.get(params) as { count: number };
    const total = countRow.count;

    // Add ordering and pagination
    sql += ' ORDER BY start_line ASC';
    sql += ' LIMIT @limit OFFSET @offset';
    params.limit = query.limit;
    params.offset = query.offset;

    // Execute query
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(params) as Record<string, unknown>[];

    const chunks = rows.map((row) => Chunk.fromRow(row));
    const hasMore = query.offset + chunks.length < total;
    const page = Math.floor(query.offset / query.limit) + 1;

    return {
      chunks,
      total,
      hasMore,
      page,
    };
  }

  /**
   * Delete all chunks for a file
   * @param fileId File ID
   * @returns Number of chunks deleted
   */
  public deleteByFileId(fileId: string): number {
    const stmt = this.preparedStatements.get('deleteByFileId')!;
    const result = stmt.run(fileId);
    return result.changes;
  }

  /**
   * Delete chunk by ID
   * @param id Chunk ID
   * @returns True if deleted, false if not found
   */
  public deleteById(id: string): boolean {
    const stmt = this.preparedStatements.get('deleteById')!;
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Get chunk statistics
   * @returns ChunkStatistics object
   */
  public getStatistics(): ChunkStatistics {
    // Total chunks
    const countStmt = this.preparedStatements.get('count')!;
    const countRow = countStmt.get() as { count: number };
    const totalChunks = countRow.count;

    // Chunks by language
    const langStmt = this.db.prepare(`
      SELECT language, COUNT(*) as count
      FROM chunks
      GROUP BY language
    `);
    const langRows = langStmt.all() as Array<{ language: Language; count: number }>;
    const chunksByLanguage = Object.values(Language).reduce((acc, lang) => {
      acc[lang] = 0;
      return acc;
    }, {} as Record<Language, number>);
    langRows.forEach((row) => {
      chunksByLanguage[row.language] = row.count;
    });

    // Chunks by type
    const typeStmt = this.db.prepare(`
      SELECT chunk_type, COUNT(*) as count
      FROM chunks
      GROUP BY chunk_type
    `);
    const typeRows = typeStmt.all() as Array<{ chunk_type: ChunkType; count: number }>;
    const chunksByType = Object.values(ChunkType).reduce((acc, type) => {
      acc[type] = 0;
      return acc;
    }, {} as Record<ChunkType, number>);
    typeRows.forEach((row) => {
      chunksByType[row.chunk_type] = row.count;
    });

    // Average chunk size
    const avgStmt = this.db.prepare(`
      SELECT AVG(line_count) as avg_size
      FROM chunks
    `);
    const avgRow = avgStmt.get() as { avg_size: number | null };
    const avgChunkSize = Math.round(avgRow.avg_size || 0);

    // Large chunks count (>5,000 lines)
    const largeStmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM chunks
      WHERE line_count > 5000
    `);
    const largeRow = largeStmt.get() as { count: number };
    const largeChunksCount = largeRow.count;

    return {
      totalChunks,
      chunksByLanguage,
      chunksByType,
      avgChunkSize,
      largeChunksCount,
    };
  }

  /**
   * Clean up prepared statements
   */
  public close(): void {
    // Note: better-sqlite3 Statement doesn't have finalize() in TypeScript types
    // Statements are automatically cleaned up when database is closed
    this.preparedStatements.clear();
  }
}
