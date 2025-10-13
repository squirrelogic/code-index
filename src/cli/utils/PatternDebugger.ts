/**
 * Pattern Debugger
 *
 * Utility for debugging ignore pattern matching.
 */

import { IgnorePattern } from '../../services/watcher/IgnorePatternStore.js';
import { PatternMatcher } from '../../services/watcher/PatternMatcher.js';
import { output } from './output.js';

const out = output;

export class PatternDebugger {
  private matcher: PatternMatcher;
  private patterns: IgnorePattern[];

  constructor(patterns: IgnorePattern[]) {
    this.patterns = patterns;
    this.matcher = new PatternMatcher(patterns);
  }

  /**
   * Debug why a file is or isn't ignored
   */
  debugPath(filePath: string): void {
    const result = this.matcher.matches(filePath);

    out.info(`\nDebug: ${filePath}`);
    out.info('─'.repeat(60));

    if (result.matches && result.matchedPattern) {
      out.info(`✗ IGNORED`);
      out.info('');
      out.info('Matched Pattern:');
      this.printPattern(result.matchedPattern);
      out.info('');
      out.info(`Reason: ${result.reason}`);

      // Show all matching patterns
      const allMatches = this.matcher.findAllMatches(filePath);
      if (allMatches.length > 1) {
        out.info('');
        out.info(`Note: ${allMatches.length} patterns matched. Showing highest priority.`);
        out.info('');
        out.info('All matching patterns:');
        for (const pattern of allMatches) {
          out.info(`  - ${pattern.pattern} (priority: ${pattern.priority})`);
        }
      }
    } else {
      out.info(`✓ NOT IGNORED`);
      out.info('');
      out.info('This file does not match any ignore patterns.');
      out.info('');

      // Show patterns that were evaluated
      const enabledPatterns = this.patterns.filter((p) => p.enabled);
      out.info(`Evaluated ${enabledPatterns.length} enabled pattern(s).`);
    }
  }

  /**
   * Debug multiple paths
   */
  debugPaths(filePaths: string[]): void {
    out.info(`\nPattern Debug Report`);
    out.info('='.repeat(60));
    out.info(`Testing ${filePaths.length} path(s)`);
    out.info('');

    const results = this.matcher.testPaths(filePaths);
    let ignoredCount = 0;
    let notIgnoredCount = 0;

    for (const [filePath, result] of results) {
      if (result.matches) {
        ignoredCount++;
        out.info(`✗ ${filePath}`);
        if (result.matchedPattern) {
          out.info(`  Pattern: ${result.matchedPattern.pattern} (priority: ${result.matchedPattern.priority})`);
        }
      } else {
        notIgnoredCount++;
        out.info(`✓ ${filePath}`);
      }
    }

    out.info('');
    out.info('Summary:');
    out.info(`  Ignored: ${ignoredCount}`);
    out.info(`  Not Ignored: ${notIgnoredCount}`);
  }

  /**
   * Show all patterns with statistics
   */
  showAllPatterns(): void {
    out.info('\nAll Ignore Patterns');
    out.info('='.repeat(60));

    const bySource = this.groupBySource();

    for (const [source, patterns] of Object.entries(bySource)) {
      out.info('');
      out.info(`${source.toUpperCase()} (${patterns.length})`);
      out.info('─'.repeat(60));

      for (const pattern of patterns) {
        this.printPattern(pattern);
        out.info('');
      }
    }
  }

  /**
   * Show pattern statistics
   */
  showStatistics(): void {
    out.info('\nPattern Statistics');
    out.info('='.repeat(60));

    const total = this.patterns.length;
    const enabled = this.patterns.filter((p) => p.enabled).length;
    const disabled = total - enabled;

    out.info(`Total Patterns: ${total}`);
    out.info(`  Enabled: ${enabled}`);
    out.info(`  Disabled: ${disabled}`);
    out.info('');

    const bySource = this.groupBySource();
    out.info('By Source:');
    for (const [source, patterns] of Object.entries(bySource)) {
      out.info(`  ${source}: ${patterns.length}`);
    }

    out.info('');
    const totalMatches = this.patterns.reduce((sum, p) => sum + p.matchCount, 0);
    out.info(`Total Matches: ${totalMatches}`);

    // Show top matched patterns
    const topMatched = this.patterns
      .filter((p) => p.matchCount > 0)
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 5);

    if (topMatched.length > 0) {
      out.info('');
      out.info('Top Matched Patterns:');
      for (const pattern of topMatched) {
        out.info(`  ${pattern.pattern}: ${pattern.matchCount} matches`);
      }
    }
  }

  /**
   * Test a pattern against multiple paths
   */
  testPattern(patternString: string, paths: string[]): void {
    out.info(`\nTesting Pattern: ${patternString}`);
    out.info('='.repeat(60));

    let matches = 0;
    let nonMatches = 0;

    for (const path of paths) {
      const matcher = new PatternMatcher([
        {
          id: 'test',
          pattern: patternString,
          type: 'glob' as any,
          source: 'runtime' as any,
          priority: 500,
          enabled: true,
          matchCount: 0,
        },
      ]);

      const result = matcher.matches(path);

      if (result.matches) {
        out.info(`✓ ${path}`);
        matches++;
      } else {
        out.info(`✗ ${path}`);
        nonMatches++;
      }
    }

    out.info('');
    out.info('Summary:');
    out.info(`  Matches: ${matches}`);
    out.info(`  Non-matches: ${nonMatches}`);
  }

  /**
   * Print a single pattern
   */
  private printPattern(pattern: IgnorePattern): void {
    const status = pattern.enabled ? '✓' : '✗';
    out.info(`${status} ${pattern.pattern}`);
    out.info(`  Type: ${pattern.type}`);
    out.info(`  Source: ${pattern.source}`);
    out.info(`  Priority: ${pattern.priority}`);
    out.info(`  Matches: ${pattern.matchCount}`);
    if (pattern.lastMatched) {
      const date = new Date(pattern.lastMatched * 1000).toLocaleString();
      out.info(`  Last Match: ${date}`);
    }
  }

  /**
   * Group patterns by source
   */
  private groupBySource(): Record<string, IgnorePattern[]> {
    const grouped: Record<string, IgnorePattern[]> = {};

    for (const pattern of this.patterns) {
      if (!grouped[pattern.source]) {
        grouped[pattern.source] = [];
      }
      grouped[pattern.source]!.push(pattern);
    }

    return grouped;
  }
}
