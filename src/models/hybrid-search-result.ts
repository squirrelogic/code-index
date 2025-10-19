/**
 * Complete search response with metrics for hybrid ranking
 *
 * @module hybrid-search-result
 */

import type { HybridResult } from './hybrid-result.js';
import type { HybridSearchQuery } from './hybrid-search-query.js';
import type { RankingConfig } from './ranking-config.js';

/**
 * Complete search result including results and performance metrics
 *
 * This is the top-level response returned from hybrid search operations
 */
export interface HybridSearchResult {
  /**
   * Results
   * Ranked results after fusion, diversification, and tie-breaking
   */
  results: HybridResult[];

  /**
   * Total number of matches found (before pagination)
   */
  totalFound: number;

  /**
   * Query information
   * Original query parameters
   */
  query: HybridSearchQuery;

  /**
   * Configuration used for this search
   * May include temporary overrides from query
   */
  appliedConfig: RankingConfig;

  /**
   * Performance metrics
   * Timing and diagnostic information
   */
  metrics: PerformanceMetrics;

  /**
   * Warnings
   * Any warnings generated during search
   * e.g., SLA violation, extreme config, fallback mode
   */
  warnings: string[];
}

/**
 * Performance metrics for hybrid search operations
 *
 * Used for monitoring and SLA compliance (FR-016)
 */
export interface PerformanceMetrics {
  /**
   * Timing breakdown (milliseconds)
   * Time spent in lexical search component
   */
  lexicalSearchTimeMs: number;

  /**
   * Time spent in vector search component
   */
  vectorSearchTimeMs: number;

  /**
   * Time spent in fusion and ranking
   * Includes RRF, diversification, and tie-breaking
   */
  rankingTimeMs: number;

  /**
   * Total query time (wall clock)
   */
  totalTimeMs: number;

  /**
   * Candidate counts
   * Number of candidates from lexical search
   */
  lexicalCandidates: number;

  /**
   * Number of candidates from vector search
   */
  vectorCandidates: number;

  /**
   * Number of unique candidates after deduplication
   */
  uniqueCandidates: number;

  /**
   * Diagnostics
   * True if exceeded timeout (SLA violation)
   */
  slaViolation: boolean;

  /**
   * Fallback mode indicator
   * Set if only one component returned results
   */
  fallbackMode?: 'lexical' | 'vector';
}
