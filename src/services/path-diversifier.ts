/**
 * Path diversification service using MMR-style re-ranking
 *
 * @module path-diversifier
 */

import type { HybridResult } from '../models/hybrid-result.js';
import type { DiversificationConfig } from '../models/ranking-config.js';
import { calculatePathSimilarity } from '../lib/ranking-utils.js';

/**
 * PathDiversifier applies MMR-style diversification to search results
 *
 * Uses Maximal Marginal Relevance algorithm:
 * finalScore = λ * relevanceScore - (1-λ) * maxSimilarityToSelected
 *
 * Features:
 * - Balances relevance and diversity using lambda parameter
 * - Respects maxPerFile limit
 * - Skips diversification for single-file scenarios
 * - Tracks diversity penalties in score breakdown
 */
export class PathDiversifier {
  private config: DiversificationConfig;

  /**
   * Create a new PathDiversifier
   *
   * @param config - Diversification configuration
   */
  constructor(config: DiversificationConfig) {
    this.config = config;
  }

  /**
   * Diversify results using MMR algorithm
   *
   * @param results - Hybrid results to diversify (should be sorted by score)
   * @param lambdaOverride - Optional lambda override for this diversification run (0.0-1.0)
   * @returns Diversified results
   */
  diversify(results: HybridResult[], lambdaOverride?: number): HybridResult[] {
    // Validate lambda override if provided (T032)
    if (lambdaOverride !== undefined) {
      if (lambdaOverride < 0 || lambdaOverride > 1) {
        throw new Error(`Lambda override must be in range [0, 1], got ${lambdaOverride}`);
      }
    }

    // Skip if disabled
    if (!this.config.enabled) {
      return results;
    }

    // Skip if empty or single result
    if (results.length <= 1) {
      return results;
    }

    // Check if all results from single file
    const uniqueFiles = new Set(results.map(r => r.filePath));
    if (uniqueFiles.size === 1) {
      // All from same file - skip diversification
      return results;
    }

    // Apply MMR-style diversification
    return this.applyMMR(results, lambdaOverride);
  }

  /**
   * Apply Maximal Marginal Relevance algorithm
   *
   * Iteratively select results that balance relevance with diversity
   *
   * @param results - Input results sorted by relevance
   * @param lambdaOverride - Optional lambda override (T032)
   * @returns Diversified results
   */
  private applyMMR(results: HybridResult[], lambdaOverride?: number): HybridResult[] {
    const lambda = lambdaOverride ?? this.config.lambda;
    const { maxPerFile } = this.config;

    // Track selected results
    const selected: HybridResult[] = [];
    const remaining = [...results];

    // Track counts per file
    const fileCounts = new Map<string, number>();

    while (remaining.length > 0) {
      let bestIndex = -1;
      let bestScore = -Infinity;

      // Find candidate that maximizes MMR score
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i]!;

        // Check if file limit reached
        const fileCount = fileCounts.get(candidate.filePath) || 0;
        if (fileCount >= maxPerFile) {
          continue; // Skip candidates from over-represented files
        }

        // Calculate MMR score
        const relevanceScore = candidate.finalScore;

        // Calculate max similarity to already selected results
        let maxSimilarity = 0;
        for (const selectedResult of selected) {
          const similarity = calculatePathSimilarity(
            candidate.filePath,
            selectedResult.filePath
          );
          maxSimilarity = Math.max(maxSimilarity, similarity);
        }

        // MMR formula: λ * relevance - (1-λ) * max_similarity
        const mmrScore = lambda * relevanceScore - (1 - lambda) * maxSimilarity;

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIndex = i;
        }
      }

      // If no candidate found (all files at limit), break
      if (bestIndex === -1) {
        break;
      }

      // Select best candidate
      const selectedCandidate = remaining.splice(bestIndex, 1)[0]!;

      // Update score breakdown with diversity penalty
      const diversityPenalty = (1 - lambda) * this.calculateMaxSimilarity(
        selectedCandidate.filePath,
        selected
      );

      selectedCandidate.scoreBreakdown.diversityPenalty = diversityPenalty;

      // Update final score to reflect MMR
      selectedCandidate.finalScore = bestScore;

      // Add to selected
      selected.push(selectedCandidate);

      // Update file count
      const count = fileCounts.get(selectedCandidate.filePath) || 0;
      fileCounts.set(selectedCandidate.filePath, count + 1);
    }

    // Re-assign ranks based on new order
    selected.forEach((result, index) => {
      result.finalRank = index + 1;
    });

    return selected;
  }

  /**
   * Calculate maximum similarity to selected results
   *
   * @param candidatePath - Path of candidate
   * @param selected - Already selected results
   * @returns Maximum similarity score [0, 1]
   */
  private calculateMaxSimilarity(candidatePath: string, selected: HybridResult[]): number {
    if (selected.length === 0) {
      return 0;
    }

    let maxSimilarity = 0;
    for (const result of selected) {
      const similarity = calculatePathSimilarity(candidatePath, result.filePath);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    return maxSimilarity;
  }
}
