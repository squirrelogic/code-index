/**
 * Utility functions for hybrid search ranking
 *
 * @module ranking-utils
 */

import { Result, ok, err } from 'neverthrow';
import type { RankingConfig } from '../models/ranking-config.js';
import {
  PATH_PRIORITY_PATTERNS,
  SCORE_DISPLAY_DECIMALS,
} from '../constants/ranking-constants.js';

/**
 * Validate ranking configuration
 *
 * @param config - Configuration to validate
 * @returns Result with validated config or error
 */
export function validateRankingConfig(config: unknown): Result<RankingConfig, Error> {
  if (!config || typeof config !== 'object') {
    return err(new Error('Config must be an object'));
  }

  const c = config as Partial<RankingConfig>;

  // Check required fields
  if (!c.version || typeof c.version !== 'string') {
    return err(new Error('Config must have a version string'));
  }

  if (!c.fusion || typeof c.fusion !== 'object') {
    return err(new Error('Config must have fusion configuration'));
  }

  if (!c.diversification || typeof c.diversification !== 'object') {
    return err(new Error('Config must have diversification configuration'));
  }

  if (!c.tieBreakers || typeof c.tieBreakers !== 'object') {
    return err(new Error('Config must have tieBreakers configuration'));
  }

  if (!c.performance || typeof c.performance !== 'object') {
    return err(new Error('Config must have performance configuration'));
  }

  // Validate fusion weights
  const { alpha, beta, gamma, rrfK } = c.fusion;

  if (typeof alpha !== 'number' || alpha < 0 || alpha > 1) {
    return err(new Error('Fusion alpha must be a number between 0 and 1'));
  }

  if (typeof beta !== 'number' || beta < 0 || beta > 1) {
    return err(new Error('Fusion beta must be a number between 0 and 1'));
  }

  if (typeof gamma !== 'number' || gamma < 0 || gamma > 1) {
    return err(new Error('Fusion gamma must be a number between 0 and 1'));
  }

  // Check weight sum
  const weightSum = alpha + beta + gamma;
  if (weightSum > 1.0) {
    return err(new Error(`Fusion weights sum to ${weightSum.toFixed(3)}, must be <= 1.0`));
  }

  if (typeof rrfK !== 'number' || rrfK <= 0) {
    return err(new Error('Fusion rrfK must be a number > 0'));
  }

  // Validate diversification
  const { enabled, lambda, maxPerFile } = c.diversification;

  if (typeof enabled !== 'boolean') {
    return err(new Error('Diversification enabled must be a boolean'));
  }

  if (typeof lambda !== 'number' || lambda < 0 || lambda > 1) {
    return err(new Error('Diversification lambda must be a number between 0 and 1'));
  }

  if (typeof maxPerFile !== 'number' || maxPerFile < 1) {
    return err(new Error('Diversification maxPerFile must be a number >= 1'));
  }

  // Validate tie-breakers
  const {
    symbolTypeWeight,
    pathPriorityWeight,
    languageMatchWeight,
    identifierMatchWeight,
  } = c.tieBreakers;

  if (typeof symbolTypeWeight !== 'number' || symbolTypeWeight < 0 || symbolTypeWeight > 1) {
    return err(new Error('TieBreaker symbolTypeWeight must be a number between 0 and 1'));
  }

  if (typeof pathPriorityWeight !== 'number' || pathPriorityWeight < 0 || pathPriorityWeight > 1) {
    return err(new Error('TieBreaker pathPriorityWeight must be a number between 0 and 1'));
  }

  if (typeof languageMatchWeight !== 'number' || languageMatchWeight < 0 || languageMatchWeight > 1) {
    return err(new Error('TieBreaker languageMatchWeight must be a number between 0 and 1'));
  }

  if (typeof identifierMatchWeight !== 'number' || identifierMatchWeight < 0 || identifierMatchWeight > 1) {
    return err(new Error('TieBreaker identifierMatchWeight must be a number between 0 and 1'));
  }

  // Validate performance
  const { candidateLimit, timeoutMs, earlyTerminationTopK } = c.performance;

  if (typeof candidateLimit !== 'number' || candidateLimit < 10 || candidateLimit > 1000) {
    return err(new Error('Performance candidateLimit must be a number between 10 and 1000'));
  }

  if (typeof timeoutMs !== 'number' || timeoutMs < 100 || timeoutMs > 5000) {
    return err(new Error('Performance timeoutMs must be a number between 100 and 5000'));
  }

  if (typeof earlyTerminationTopK !== 'number' || earlyTerminationTopK < 1 || earlyTerminationTopK > 100) {
    return err(new Error('Performance earlyTerminationTopK must be a number between 1 and 100'));
  }

  // All validations passed
  return ok(c as RankingConfig);
}

/**
 * Check if configuration has extreme weights
 *
 * Extreme weights occur when:
 * - alpha = 0 (disables lexical search)
 * - beta = 0 (disables vector search)
 * - alpha > 0.9 (heavily favors lexical)
 * - beta > 0.9 (heavily favors vector)
 *
 * @param config - Ranking configuration
 * @returns True if extreme weights detected
 */
export function hasExtremeWeights(config: RankingConfig): boolean {
  const { alpha, beta } = config.fusion;
  return alpha === 0 || beta === 0 || alpha > 0.9 || beta > 0.9;
}

/**
 * Format score for display
 *
 * @param score - Score value to format
 * @param decimals - Number of decimal places (default: SCORE_DISPLAY_DECIMALS)
 * @returns Formatted score string
 */
export function formatScore(score: number, decimals: number = SCORE_DISPLAY_DECIMALS): string {
  return score.toFixed(decimals);
}

/**
 * Calculate Levenshtein distance between two strings
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Edit distance
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Create distance matrix
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= m; i++) {
    dp[i]![0] = i;
  }
  for (let j = 0; j <= n; j++) {
    dp[0]![j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        dp[i]![j] = Math.min(
          dp[i - 1]![j]! + 1,    // deletion
          dp[i]![j - 1]! + 1,    // insertion
          dp[i - 1]![j - 1]! + 1 // substitution
        );
      }
    }
  }

  return dp[m]![n]!;
}

/**
 * Calculate path similarity using normalized Levenshtein distance
 *
 * Returns value in [0, 1] where:
 * - 1.0 = identical paths
 * - 0.0 = completely different paths
 *
 * @param path1 - First file path
 * @param path2 - Second file path
 * @returns Similarity score [0, 1]
 */
export function calculatePathSimilarity(path1: string, path2: string): number {
  // Handle empty strings
  if (path1 === '' && path2 === '') {
    return 0; // Empty paths are not similar
  }

  if (!path1 || !path2) {
    return 0;
  }

  if (path1 === path2) {
    return 1.0;
  }

  const maxLength = Math.max(path1.length, path2.length);
  if (maxLength === 0) {
    return 0;
  }

  const distance = levenshteinDistance(path1, path2);
  const similarity = 1 - (distance / maxLength);

  return Math.max(0, Math.min(1, similarity));
}

/**
 * Calculate path priority based on directory classification
 *
 * Uses PATH_PRIORITY_PATTERNS to classify paths:
 * - src/ → 1.0 (highest priority)
 * - lib/ → 0.9
 * - test/ → 0.6
 * - docs/ → 0.4
 * - etc.
 *
 * @param path - File path to classify
 * @returns Priority score [0, 1]
 */
export function calculatePathPriority(path: string): number {
  if (!path) {
    return 0.5;
  }

  for (const { pattern, priority } of PATH_PRIORITY_PATTERNS) {
    if (pattern.test(path)) {
      return priority;
    }
  }

  // Default priority for unclassified paths
  return 0.5;
}
