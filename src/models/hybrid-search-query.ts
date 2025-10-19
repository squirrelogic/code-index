/**
 * Query parameters for hybrid search
 *
 * @module hybrid-search-query
 */

import type { RankingConfig } from './ranking-config.js';

/**
 * Query parameters specific to hybrid search
 *
 * Validation rules:
 * - query.length must be > 0 and <= 2000 characters (FR-019)
 * - At least one of enableLexical or enableVector must be true
 * - limit must be >= 1 and <= 100
 * - offset must be >= 0
 */
export interface HybridSearchQuery {
  /**
   * Base query
   * Search query string (max 2000 chars)
   */
  query: string;

  /**
   * Search modes
   * Enable lexical search component (BM25/FTS5)
   * Default: true
   */
  enableLexical: boolean;

  /**
   * Enable vector search component (semantic similarity)
   * Default: true
   */
  enableVector: boolean;

  /**
   * Result limits
   * Maximum number of results to return
   * Default: 10
   */
  limit: number;

  /**
   * Pagination offset (0-based)
   * Default: 0
   */
  offset: number;

  /**
   * Filters
   * Glob patterns to include (e.g., ['*.ts', '*.tsx'])
   */
  filePatterns?: string[];

  /**
   * Glob patterns to exclude (e.g., ['*.test.ts', '*.spec.ts'])
   */
  excludePatterns?: string[];

  /**
   * Language filters (e.g., ['typescript', 'python'])
   */
  languages?: string[];

  /**
   * Performance
   * Override default timeout in milliseconds
   */
  timeoutMs?: number;

  /**
   * Config overrides (optional)
   * Temporary configuration changes for this query only
   * Does not affect global configuration
   */
  configOverrides?: Partial<RankingConfig>;
}

/**
 * Default hybrid search query parameters
 * Used when user doesn't specify certain options
 */
export const DEFAULT_HYBRID_SEARCH_QUERY: Omit<HybridSearchQuery, 'query'> = {
  enableLexical: true,
  enableVector: true,
  limit: 10,
  offset: 0,
};
