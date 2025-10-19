/**
 * Configuration models for hybrid search ranking system
 *
 * @module ranking-config
 */

/**
 * Complete ranking configuration
 */
export interface RankingConfig {
  /**
   * Config schema version (e.g., "1.0")
   * Used for backwards compatibility
   */
  version: string;

  /**
   * Fusion algorithm parameters
   */
  fusion: FusionConfig;

  /**
   * Path diversification settings
   */
  diversification: DiversificationConfig;

  /**
   * Tie-breaking weights
   */
  tieBreakers: TieBreakerConfig;

  /**
   * Performance tuning parameters
   */
  performance: PerformanceConfig;
}

/**
 * Fusion configuration for combining lexical and vector search
 */
export interface FusionConfig {
  /**
   * Lexical search weight [0, 1]
   * Higher values prioritize exact text matches
   */
  alpha: number;

  /**
   * Vector search weight [0, 1]
   * Higher values prioritize semantic similarity
   */
  beta: number;

  /**
   * Tie-breaker weight [0, 1]
   * Used to resolve close scores
   */
  gamma: number;

  /**
   * RRF constant k (typically 60)
   * Prevents division by zero and reduces impact of high ranks
   * Must be > 0
   */
  rrfK: number;
}

/**
 * Diversification configuration for result distribution
 */
export interface DiversificationConfig {
  /**
   * Enable/disable path diversification
   */
  enabled: boolean;

  /**
   * Relevance vs diversity trade-off [0, 1]
   * 0.0 = maximum diversity, 1.0 = pure relevance
   */
  lambda: number;

  /**
   * Maximum results from a single file (default: 3)
   * Can be exceeded in single-file scenarios
   */
  maxPerFile: number;
}

/**
 * Tie-breaker configuration for resolving close scores
 */
export interface TieBreakerConfig {
  /**
   * Weight for symbol type priority [0, 1]
   * Functions/classes rank higher than comments
   */
  symbolTypeWeight: number;

  /**
   * Weight for path priority [0, 1]
   * src/ files rank higher than test/ files
   */
  pathPriorityWeight: number;

  /**
   * Weight for language matching [0, 1]
   * Results matching query language rank higher
   */
  languageMatchWeight: number;

  /**
   * Weight for identifier exact match [0, 1]
   * Exact symbol name matches rank higher
   */
  identifierMatchWeight: number;
}

/**
 * Performance tuning configuration
 */
export interface PerformanceConfig {
  /**
   * Number of candidates to retrieve from each source (lexical, vector)
   * Must be >= 10 and <= 1000
   * Default: 200
   */
  candidateLimit: number;

  /**
   * Overall timeout in milliseconds
   * Must be >= 100 and <= 5000
   * Default: 300
   */
  timeoutMs: number;

  /**
   * Stop ranking after K results for early termination
   * Must be >= 1 and <= 100
   * Default: 10
   */
  earlyTerminationTopK: number;
}
