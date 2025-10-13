/**
 * Query model for retrieving chunks with filtering and pagination
 */

import { ChunkType, Language } from './ChunkTypes.js';
import type { Chunk } from './Chunk.js';

/**
 * Query model for chunk retrieval with filters
 */
export class ChunkQuery {
  /** Filter by chunk types */
  public chunkTypes: ChunkType[] = [];

  /** Filter by languages */
  public languages: Language[] = [];

  /** Filter by file */
  public fileId: string | null = null;

  /** Full-text search query */
  public searchText: string | null = null;

  /** Minimum line count */
  public minLineCount: number | null = null;

  /** Maximum line count */
  public maxLineCount: number | null = null;

  /** Maximum results */
  public limit: number = 100;

  /** Pagination offset */
  public offset: number = 0;

  /**
   * Create new query builder
   */
  public static builder(): ChunkQueryBuilder {
    return new ChunkQueryBuilder();
  }
}

/**
 * Query result with metadata
 */
export interface ChunkQueryResult {
  /** Matching chunks */
  chunks: Chunk[];

  /** Total count (before pagination) */
  total: number;

  /** Has more results */
  hasMore: boolean;

  /** Current page (calculated from offset/limit) */
  page: number;
}

/**
 * Fluent builder for ChunkQuery
 */
export class ChunkQueryBuilder {
  private query: ChunkQuery;

  constructor() {
    this.query = new ChunkQuery();
  }

  /**
   * Filter by one or more chunk types
   */
  public byType(...types: ChunkType[]): this {
    this.query.chunkTypes.push(...types);
    return this;
  }

  /**
   * Filter by one or more languages
   */
  public byLanguage(...languages: Language[]): this {
    this.query.languages.push(...languages);
    return this;
  }

  /**
   * Filter by file ID
   */
  public byFile(fileId: string): this {
    this.query.fileId = fileId;
    return this;
  }

  /**
   * Full-text search in chunk content
   */
  public withText(searchText: string): this {
    this.query.searchText = searchText;
    return this;
  }

  /**
   * Filter by minimum line count
   */
  public minLines(count: number): this {
    this.query.minLineCount = count;
    return this;
  }

  /**
   * Filter by maximum line count
   */
  public maxLines(count: number): this {
    this.query.maxLineCount = count;
    return this;
  }

  /**
   * Filter by line count range
   */
  public lineCountBetween(min: number, max: number): this {
    this.query.minLineCount = min;
    this.query.maxLineCount = max;
    return this;
  }

  /**
   * Set pagination limit
   */
  public limit(count: number): this {
    this.query.limit = count;
    return this;
  }

  /**
   * Set pagination offset
   */
  public offset(count: number): this {
    this.query.offset = count;
    return this;
  }

  /**
   * Set page number (converts to offset)
   */
  public page(pageNum: number): this {
    this.query.offset = (pageNum - 1) * this.query.limit;
    return this;
  }

  /**
   * Build the final query
   */
  public build(): ChunkQuery {
    return this.query;
  }
}
