/**
 * Tie-breaking service for resolving close scores
 *
 * @module tie-breaker
 */

import type { HybridResult, TieBreakerScores } from '../models/hybrid-result.js';
import type { TieBreakerConfig } from '../models/ranking-config.js';
import { SYMBOL_TYPE_PRIORITY } from '../models/ranking-candidate.js';
import { calculatePathPriority } from '../lib/ranking-utils.js';
import { TIE_THRESHOLD } from '../constants/ranking-constants.js';

/**
 * TieBreaker applies multi-factor heuristics to resolve close scores
 *
 * Factors (in priority order):
 * 1. Symbol type priority (function/class > variable > comment)
 * 2. Path priority (src/ > lib/ > test/ > docs/)
 * 3. Language match (matches query language)
 * 4. Identifier exact match (query term matches symbol name)
 *
 * Only applied when scores are within TIE_THRESHOLD (0.01)
 */
export class TieBreaker {
  private config: TieBreakerConfig;

  /**
   * Create a new TieBreaker
   *
   * @param config - Tie-breaker configuration with weights
   */
  constructor(config: TieBreakerConfig) {
    this.config = config;
  }

  /**
   * Apply tie-breakers to results with close scores
   *
   * @param results - Hybrid results to process
   * @param query - Original search query for context
   * @returns Results with tie-breakers applied
   */
  applyTieBreakers(results: HybridResult[], query: string): HybridResult[] {
    if (results.length === 0) {
      return results;
    }

    // Detect query language for matching
    const queryLanguage = this.detectQueryLanguage(query);

    // Extract identifier terms from query
    const identifierTerms = this.extractIdentifierTerms(query);

    // Group results into tie clusters
    const clusters = this.identifyTieClusters(results);

    // Apply tie-breakers to each cluster
    for (const cluster of clusters) {
      if (cluster.length > 1) {
        this.applyTieBreakersToCluster(cluster, queryLanguage, identifierTerms);
      }
    }

    // Re-sort all results by final score
    results.sort((a, b) => b.finalScore - a.finalScore);

    // Re-assign ranks
    results.forEach((result, index) => {
      result.finalRank = index + 1;
    });

    return results;
  }

  /**
   * Identify clusters of results with scores within tie threshold
   *
   * @param results - Results to cluster
   * @returns Array of clusters
   */
  private identifyTieClusters(results: HybridResult[]): HybridResult[][] {
    if (results.length === 0) {
      return [];
    }

    const clusters: HybridResult[][] = [];
    let currentCluster: HybridResult[] = [results[0]!];

    for (let i = 1; i < results.length; i++) {
      const scoreDiff = Math.abs(results[i]!.finalScore - currentCluster[0]!.finalScore);

      if (scoreDiff <= TIE_THRESHOLD) {
        // Within threshold - add to current cluster
        currentCluster.push(results[i]!);
      } else {
        // Outside threshold - start new cluster
        if (currentCluster.length > 1) {
          clusters.push(currentCluster);
        }
        currentCluster = [results[i]!];
      }
    }

    // Add final cluster if it has ties
    if (currentCluster.length > 1) {
      clusters.push(currentCluster);
    }

    return clusters;
  }

  /**
   * Apply tie-breakers to a cluster of tied results
   *
   * @param cluster - Results with similar scores
   * @param queryLanguage - Detected language from query (or null)
   * @param identifierTerms - Identifier terms from query
   */
  private applyTieBreakersToCluster(
    cluster: HybridResult[],
    queryLanguage: string | null,
    identifierTerms: Set<string>
  ): void {
    const {
      symbolTypeWeight,
      pathPriorityWeight,
      languageMatchWeight,
      identifierMatchWeight,
    } = this.config;

    for (const result of cluster) {
      // Calculate symbol type priority [0, 1]
      const symbolTypePriority = this.calculateSymbolTypePriority(result);

      // Calculate path priority [0, 1]
      const pathPriority = calculatePathPriority(result.filePath);

      // Calculate language match (0 or 1)
      const languageMatch = this.calculateLanguageMatch(result, queryLanguage);

      // Calculate identifier match (0 or 1)
      const identifierMatch = this.calculateIdentifierMatch(result, identifierTerms);

      // Calculate combined weighted score
      const combinedScore =
        symbolTypePriority * symbolTypeWeight +
        pathPriority * pathPriorityWeight +
        languageMatch * languageMatchWeight +
        identifierMatch * identifierMatchWeight;

      // Create tie-breaker scores
      const tieBreakerScores: TieBreakerScores = {
        symbolTypePriority,
        pathPriority,
        languageMatch,
        identifierMatch,
        combinedScore,
      };

      // Update score breakdown
      result.scoreBreakdown.tieBreakerScores = tieBreakerScores;

      // Apply gamma weight to tie-breaker contribution
      // Note: gamma weight is applied in the calling context
      // For now, we use a fixed small weight to avoid overwhelming primary scores
      const tieBreakerContribution = combinedScore * 0.1; // 10% of combined score

      result.scoreBreakdown.tieBreakerContribution = tieBreakerContribution;

      // Update final score
      result.finalScore =
        result.scoreBreakdown.lexicalContribution +
        result.scoreBreakdown.vectorContribution +
        tieBreakerContribution;
    }
  }

  /**
   * Calculate symbol type priority normalized to [0, 1]
   *
   * @param result - Result to evaluate
   * @returns Priority score [0, 1]
   */
  private calculateSymbolTypePriority(result: HybridResult): number {
    const symbolType = result.symbolType || 'unknown';
    const rawPriority = SYMBOL_TYPE_PRIORITY[symbolType];

    // Normalize to [0, 1] range (max priority is 100)
    return rawPriority / 100;
  }

  /**
   * Calculate language match score
   *
   * @param result - Result to evaluate
   * @param queryLanguage - Detected language from query
   * @returns 1 if matches, 0 otherwise
   */
  private calculateLanguageMatch(result: HybridResult, queryLanguage: string | null): number {
    if (!queryLanguage || !result.language) {
      return 0;
    }

    return result.language.toLowerCase() === queryLanguage.toLowerCase() ? 1 : 0;
  }

  /**
   * Calculate identifier match score
   *
   * @param result - Result to evaluate
   * @param identifierTerms - Set of identifier terms from query
   * @returns 1 if exact match, 0 otherwise
   */
  private calculateIdentifierMatch(result: HybridResult, identifierTerms: Set<string>): number {
    if (!result.symbolName || identifierTerms.size === 0) {
      return 0;
    }

    // Case-sensitive exact match
    return identifierTerms.has(result.symbolName) ? 1 : 0;
  }

  /**
   * Detect programming language from query
   *
   * Checks for:
   * - Language keywords (typescript, python, rust, etc.)
   * - File extensions (.ts, .py, .rs, etc.)
   *
   * @param query - Search query
   * @returns Detected language or null
   */
  detectQueryLanguage(query: string): string | null {
    const lowerQuery = query.toLowerCase();

    // Language keywords
    const languageKeywords: Record<string, string> = {
      typescript: 'typescript',
      javascript: 'javascript',
      python: 'python',
      rust: 'rust',
      go: 'go',
      java: 'java',
      csharp: 'csharp',
      'c#': 'csharp',
      cpp: 'cpp',
      'c++': 'cpp',
    };

    for (const [keyword, language] of Object.entries(languageKeywords)) {
      if (lowerQuery.includes(keyword)) {
        return language;
      }
    }

    // File extensions
    const extensionMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.rs': 'rust',
      '.go': 'go',
      '.java': 'java',
      '.cs': 'csharp',
      '.cpp': 'cpp',
      '.cc': 'cpp',
    };

    for (const [ext, language] of Object.entries(extensionMap)) {
      if (lowerQuery.includes(ext)) {
        return language;
      }
    }

    return null;
  }

  /**
   * Extract potential identifier terms from query
   *
   * Extracts camelCase, PascalCase, and snake_case identifiers
   *
   * @param query - Search query
   * @returns Set of identifier terms
   */
  private extractIdentifierTerms(query: string): Set<string> {
    const terms = new Set<string>();

    // Match identifier patterns
    // camelCase, PascalCase, snake_case, CONSTANT_CASE
    const identifierPattern = /[a-zA-Z_][a-zA-Z0-9_]*/g;
    const matches = query.match(identifierPattern);

    if (matches) {
      matches.forEach(match => {
        // Filter out common words (the, and, or, etc.)
        if (match.length > 2) {
          terms.add(match);
        }
      });
    }

    return terms;
  }
}
