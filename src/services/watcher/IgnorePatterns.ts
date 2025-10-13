import { minimatch } from 'minimatch';
import * as path from 'path';

/**
 * Default patterns to ignore
 */
export const DEFAULT_IGNORE_PATTERNS: string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/.codeindex/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.cache/**',
  '**/.turbo/**',
  '**/.vercel/**',
  '**/.webpack/**',
  '**/tmp/**',
  '**/temp/**',
  '**/*.log',
  '**/*.swp',
  '**/*.swo',
  '**/*~',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/desktop.ini'
];

/**
 * Service for managing and matching ignore patterns
 */
export class IgnorePatterns {
  private patterns: Set<string>;
  private cache: Map<string, boolean>;
  private cacheMaxSize: number;
  private cacheHits: number;
  private cacheMisses: number;

  constructor(
    customPatterns: string[] = [],
    cacheMaxSize: number = 10000
  ) {
    // Initialize with default patterns
    this.patterns = new Set(DEFAULT_IGNORE_PATTERNS);

    // Add custom patterns
    for (const pattern of customPatterns) {
      this.patterns.add(pattern);
    }

    // Initialize cache
    this.cache = new Map();
    this.cacheMaxSize = cacheMaxSize;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Checks if a path should be ignored
   * @param filePath Path to check (relative to project root)
   * @returns True if path should be ignored
   */
  shouldIgnore(filePath: string): boolean {
    // Normalize the path
    const normalizedPath = path.normalize(filePath);

    // Check cache first
    if (this.cache.has(normalizedPath)) {
      this.cacheHits++;
      return this.cache.get(normalizedPath) || false;
    }

    this.cacheMisses++;

    // Check against all patterns
    let shouldIgnore = false;
    for (const pattern of this.patterns) {
      if (this.matchPattern(normalizedPath, pattern)) {
        shouldIgnore = true;
        break;
      }
    }

    // Add to cache
    this.addToCache(normalizedPath, shouldIgnore);

    return shouldIgnore;
  }

  /**
   * Matches a path against a pattern
   * @param filePath Normalized file path
   * @param pattern Glob pattern
   * @returns True if path matches pattern
   */
  private matchPattern(filePath: string, pattern: string): boolean {
    // Handle directory patterns (ending with /**)
    if (pattern.endsWith('/**')) {
      const dirPattern = pattern.slice(0, -3);
      const dirPath = filePath + '/';
      if (minimatch(dirPath, dirPattern + '/', { dot: true })) {
        return true;
      }
    }

    // Standard glob matching
    return minimatch(filePath, pattern, {
      dot: true,
      matchBase: true
    });
  }

  /**
   * Adds a result to the cache
   * @param filePath File path
   * @param result Whether path should be ignored
   */
  private addToCache(filePath: string, result: boolean): void {
    // Clear cache if it's too large
    if (this.cache.size >= this.cacheMaxSize) {
      // Clear first 20% of entries
      const entriesToRemove = Math.floor(this.cacheMaxSize * 0.2);
      const keys = Array.from(this.cache.keys()).slice(0, entriesToRemove);
      for (const key of keys) {
        this.cache.delete(key);
      }
    }

    this.cache.set(filePath, result);
  }

  /**
   * Adds a new ignore pattern
   * @param pattern Pattern to add
   */
  addPattern(pattern: string): void {
    this.patterns.add(pattern);
    this.clearCache(); // Clear cache as results may change
  }

  /**
   * Adds multiple ignore patterns
   * @param patterns Patterns to add
   */
  addPatterns(patterns: string[]): void {
    for (const pattern of patterns) {
      this.patterns.add(pattern);
    }
    this.clearCache();
  }

  /**
   * Removes an ignore pattern
   * @param pattern Pattern to remove
   * @returns True if pattern was removed
   */
  removePattern(pattern: string): boolean {
    const removed = this.patterns.delete(pattern);
    if (removed) {
      this.clearCache();
    }
    return removed;
  }

  /**
   * Clears all custom patterns (keeps defaults)
   */
  clearCustomPatterns(): void {
    this.patterns = new Set(DEFAULT_IGNORE_PATTERNS);
    this.clearCache();
  }

  /**
   * Gets all current patterns
   * @returns Array of all patterns
   */
  getPatterns(): string[] {
    return Array.from(this.patterns);
  }

  /**
   * Gets only custom patterns (excluding defaults)
   * @returns Array of custom patterns
   */
  getCustomPatterns(): string[] {
    return Array.from(this.patterns).filter(
      pattern => !DEFAULT_IGNORE_PATTERNS.includes(pattern)
    );
  }

  /**
   * Clears the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Gets cache statistics
   * @returns Cache statistics
   */
  getCacheStatistics(): CacheStatistics {
    const total = this.cacheHits + this.cacheMisses;
    return {
      size: this.cache.size,
      maxSize: this.cacheMaxSize,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0
    };
  }

  /**
   * Checks if a pattern exists
   * @param pattern Pattern to check
   * @returns True if pattern exists
   */
  hasPattern(pattern: string): boolean {
    return this.patterns.has(pattern);
  }

  /**
   * Gets the number of patterns
   * @returns Pattern count
   */
  getPatternCount(): number {
    return this.patterns.size;
  }

  /**
   * Exports patterns to a string array
   * @returns Array of all patterns
   */
  exportPatterns(): string[] {
    return this.getPatterns();
  }

  /**
   * Imports patterns from a string array
   * @param patterns Patterns to import
   * @param replace Whether to replace existing patterns
   */
  importPatterns(patterns: string[], replace: boolean = false): void {
    if (replace) {
      this.patterns = new Set(patterns);
    } else {
      for (const pattern of patterns) {
        this.patterns.add(pattern);
      }
    }
    this.clearCache();
  }

  /**
   * Tests multiple paths against the ignore patterns
   * @param paths Array of paths to test
   * @returns Map of path to whether it should be ignored
   */
  testPaths(paths: string[]): Map<string, boolean> {
    const results = new Map<string, boolean>();
    for (const path of paths) {
      results.set(path, this.shouldIgnore(path));
    }
    return results;
  }

  /**
   * Finds which pattern matches a given path
   * @param filePath Path to check
   * @returns The first matching pattern, or null if none match
   */
  findMatchingPattern(filePath: string): string | null {
    const normalizedPath = path.normalize(filePath);

    for (const pattern of this.patterns) {
      if (this.matchPattern(normalizedPath, pattern)) {
        return pattern;
      }
    }

    return null;
  }
}

/**
 * Cache statistics
 */
export interface CacheStatistics {
  /**
   * Current cache size
   */
  size: number;

  /**
   * Maximum cache size
   */
  maxSize: number;

  /**
   * Number of cache hits
   */
  hits: number;

  /**
   * Number of cache misses
   */
  misses: number;

  /**
   * Cache hit rate (0-1)
   */
  hitRate: number;
}

/**
 * Creates a new IgnorePatterns instance
 * @param customPatterns Optional custom patterns
 * @param cacheMaxSize Optional cache size limit
 * @returns New IgnorePatterns instance
 */
export function createIgnorePatterns(
  customPatterns: string[] = [],
  cacheMaxSize: number = 10000
): IgnorePatterns {
  return new IgnorePatterns(customPatterns, cacheMaxSize);
}

/**
 * Loads ignore patterns from a .gitignore-style file content
 * @param content File content
 * @returns Array of patterns
 */
export function parseGitignoreContent(content: string): string[] {
  const patterns: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Trim whitespace
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Convert gitignore patterns to glob patterns
    let pattern = trimmed;

    // Handle negation (we skip these for simplicity)
    if (pattern.startsWith('!')) {
      continue;
    }

    // Convert to glob pattern
    if (!pattern.startsWith('**/') && !pattern.startsWith('/')) {
      // Make pattern match anywhere in tree
      pattern = '**/' + pattern;
    }

    // Ensure directory patterns end with /**
    if (pattern.endsWith('/')) {
      pattern = pattern + '**';
    }

    patterns.push(pattern);
  }

  return patterns;
}