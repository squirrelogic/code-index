/**
 * Constants and default values for hybrid search ranking system
 *
 * @module ranking-constants
 */

import type { RankingConfig } from '../models/ranking-config.js';

/**
 * Default RRF (Reciprocal Rank Fusion) constant k
 * Prevents division by zero and reduces impact of high ranks
 * Standard value from research literature
 */
export const DEFAULT_RRF_K = 60;

/**
 * Default fusion weights for combining lexical and vector search
 */
export const DEFAULT_ALPHA = 0.5;  // Lexical weight
export const DEFAULT_BETA = 0.4;   // Vector weight
export const DEFAULT_GAMMA = 0.1;  // Tie-breaker weight

/**
 * Default diversification lambda parameter
 * Controls trade-off between relevance (1.0) and diversity (0.0)
 */
export const DEFAULT_LAMBDA = 0.7;

/**
 * Maximum results from a single file in top results
 * Can be exceeded in single-file scenarios
 */
export const DEFAULT_MAX_PER_FILE = 3;

/**
 * Default number of candidates to retrieve from each source
 */
export const DEFAULT_CANDIDATE_LIMIT = 200;

/**
 * Default timeout in milliseconds for hybrid search
 */
export const DEFAULT_TIMEOUT_MS = 300;

/**
 * Default top-K for early termination
 */
export const DEFAULT_TOP_K = 10;

/**
 * Tie-breaking threshold
 * Scores within this difference are considered tied (1%)
 */
export const TIE_THRESHOLD = 0.01;

/**
 * Path priority patterns for tie-breaking
 * Ordered by priority (higher priority first)
 */
export const PATH_PRIORITY_PATTERNS: Array<{ pattern: RegExp; priority: number }> = [
  { pattern: /^src\//,         priority: 1.0 },
  { pattern: /^lib\//,         priority: 0.9 },
  { pattern: /^packages\//,    priority: 0.85 },
  { pattern: /^test\//,        priority: 0.6 },
  { pattern: /^tests\//,       priority: 0.6 },
  { pattern: /\.test\./,       priority: 0.6 },
  { pattern: /\.spec\./,       priority: 0.6 },
  { pattern: /^examples?\//,   priority: 0.5 },
  { pattern: /^docs?\//,       priority: 0.4 },
];

/**
 * Query validation constants
 */
export const MAX_QUERY_LENGTH = 2000;  // Maximum query length (FR-019)
export const MIN_QUERY_LENGTH = 2;     // Minimum query length

/**
 * Score display precision
 */
export const SCORE_DISPLAY_DECIMALS = 3;

/**
 * Default ranking configuration
 * Used when no custom configuration file is present
 */
export const DEFAULT_RANKING_CONFIG: RankingConfig = {
  version: '1.0',
  fusion: {
    alpha: DEFAULT_ALPHA,
    beta: DEFAULT_BETA,
    gamma: DEFAULT_GAMMA,
    rrfK: DEFAULT_RRF_K,
  },
  diversification: {
    enabled: true,
    lambda: DEFAULT_LAMBDA,
    maxPerFile: DEFAULT_MAX_PER_FILE,
  },
  tieBreakers: {
    symbolTypeWeight: 0.3,
    pathPriorityWeight: 0.3,
    languageMatchWeight: 0.2,
    identifierMatchWeight: 0.2,
  },
  performance: {
    candidateLimit: DEFAULT_CANDIDATE_LIMIT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    earlyTerminationTopK: DEFAULT_TOP_K,
  },
};
