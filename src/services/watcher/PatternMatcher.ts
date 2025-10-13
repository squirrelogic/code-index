/**
 * Pattern Matcher with Precedence
 *
 * Applies pattern matching with priority ordering and conflict resolution.
 */

import { minimatch } from 'minimatch';
import { IgnorePattern, PatternType } from './IgnorePatternStore.js';

export interface MatchResult {
  matches: boolean;
  matchedPattern?: IgnorePattern;
  reason?: string;
}

export class PatternMatcher {
  private patterns: IgnorePattern[];
  private cache: Map<string, MatchResult>;
  private cacheMaxSize: number;

  constructor(patterns: IgnorePattern[], cacheMaxSize: number = 10000) {
    // Sort patterns by priority (higher first)
    this.patterns = patterns
      .filter((p) => p.enabled)
      .sort((a, b) => b.priority - a.priority);

    this.cache = new Map();
    this.cacheMaxSize = cacheMaxSize;
  }

  /**
   * Check if a path matches any ignore pattern
   */
  matches(filePath: string): MatchResult {
    // Check cache first
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)!;
    }

    // Check against patterns in priority order
    for (const pattern of this.patterns) {
      if (this.matchesPattern(filePath, pattern)) {
        const result: MatchResult = {
          matches: true,
          matchedPattern: pattern,
          reason: `Matched pattern "${pattern.pattern}" (priority: ${pattern.priority})`,
        };

        this.addToCache(filePath, result);
        return result;
      }
    }

    // No matches
    const result: MatchResult = {
      matches: false,
      reason: 'No matching patterns',
    };

    this.addToCache(filePath, result);
    return result;
  }

  /**
   * Check if a path matches a specific pattern
   */
  private matchesPattern(filePath: string, pattern: IgnorePattern): boolean {
    switch (pattern.type) {
      case PatternType.GLOB:
        return this.matchGlob(filePath, pattern.pattern);

      case PatternType.REGEX:
        return this.matchRegex(filePath, pattern.pattern);

      case PatternType.EXACT:
        return this.matchExact(filePath, pattern.pattern);

      default:
        return false;
    }
  }

  /**
   * Match using glob pattern
   */
  private matchGlob(filePath: string, pattern: string): boolean {
    return minimatch(filePath, pattern, {
      dot: true,
      matchBase: true,
    });
  }

  /**
   * Match using regex pattern
   */
  private matchRegex(filePath: string, pattern: string): boolean {
    try {
      const regex = new RegExp(pattern);
      return regex.test(filePath);
    } catch {
      return false; // Invalid regex
    }
  }

  /**
   * Match using exact string comparison
   */
  private matchExact(filePath: string, pattern: string): boolean {
    return filePath === pattern || filePath.endsWith('/' + pattern);
  }

  /**
   * Find all matching patterns for a path (for debugging)
   */
  findAllMatches(filePath: string): IgnorePattern[] {
    const matches: IgnorePattern[] = [];

    for (const pattern of this.patterns) {
      if (this.matchesPattern(filePath, pattern)) {
        matches.push(pattern);
      }
    }

    return matches;
  }

  /**
   * Test multiple paths
   */
  testPaths(paths: string[]): Map<string, MatchResult> {
    const results = new Map<string, MatchResult>();

    for (const path of paths) {
      results.set(path, this.matches(path));
    }

    return results;
  }

  /**
   * Add result to cache
   */
  private addToCache(filePath: string, result: MatchResult): void {
    // Clear cache if it's too large
    if (this.cache.size >= this.cacheMaxSize) {
      const entriesToRemove = Math.floor(this.cacheMaxSize * 0.2);
      const keys = Array.from(this.cache.keys()).slice(0, entriesToRemove);
      for (const key of keys) {
        this.cache.delete(key);
      }
    }

    this.cache.set(filePath, result);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.cacheMaxSize,
    };
  }

  /**
   * Update patterns and clear cache
   */
  updatePatterns(patterns: IgnorePattern[]): void {
    this.patterns = patterns
      .filter((p) => p.enabled)
      .sort((a, b) => b.priority - a.priority);

    this.clearCache();
  }
}

/**
 * Pattern statistics tracker
 */
export class PatternStats {
  private stats: Map<string, { matches: number; lastMatch: number }>;

  constructor() {
    this.stats = new Map();
  }

  /**
   * Record a pattern match
   */
  recordMatch(patternId: string): void {
    const existing = this.stats.get(patternId) || { matches: 0, lastMatch: 0 };
    this.stats.set(patternId, {
      matches: existing.matches + 1,
      lastMatch: Date.now(),
    });
  }

  /**
   * Get statistics for a pattern
   */
  getStats(patternId: string): { matches: number; lastMatch: number } | null {
    return this.stats.get(patternId) || null;
  }

  /**
   * Get all statistics
   */
  getAllStats(): Map<string, { matches: number; lastMatch: number }> {
    return new Map(this.stats);
  }

  /**
   * Clear statistics
   */
  clear(): void {
    this.stats.clear();
  }

  /**
   * Get total matches across all patterns
   */
  getTotalMatches(): number {
    let total = 0;
    for (const stat of this.stats.values()) {
      total += stat.matches;
    }
    return total;
  }

  /**
   * Get most matched patterns
   */
  getTopPatterns(limit: number = 10): Array<{ patternId: string; matches: number; lastMatch: number }> {
    const entries = Array.from(this.stats.entries()).map(([patternId, stat]) => ({
      patternId,
      matches: stat.matches,
      lastMatch: stat.lastMatch,
    }));

    return entries.sort((a, b) => b.matches - a.matches).slice(0, limit);
  }
}
