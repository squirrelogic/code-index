/**
 * Unit tests for PathDiversifier service
 */

import { describe, it, expect } from 'vitest';
import type { HybridResult } from '../../src/models/hybrid-result.js';
import type { DiversificationConfig } from '../../src/models/ranking-config.js';
import { PathDiversifier } from '../../src/services/path-diversifier.js';

// Helper to create test results
function createResult(
  filePath: string,
  line: number,
  score: number,
  rank: number
): HybridResult {
  return {
    fileId: `${filePath}:${line}`,
    filePath,
    lineNumber: line,
    snippet: `Code at ${filePath}:${line}`,
    finalScore: score,
    finalRank: rank,
    scoreBreakdown: {
      lexicalContribution: score * 0.5,
      vectorContribution: score * 0.5,
      tieBreakerContribution: 0,
    },
    fileSize: 1024,
    lastModified: new Date(),
  };
}

describe('PathDiversifier', () => {
  describe('Basic diversification', () => {
    it('should diversify results from multiple files', () => {
      const config: DiversificationConfig = {
        enabled: true,
        lambda: 0.7,
        maxPerFile: 3,
      };

      const diversifier = new PathDiversifier(config);

      const results: HybridResult[] = [
        createResult('src/parser.ts', 10, 1.0, 1),
        createResult('src/parser.ts', 15, 0.95, 2),
        createResult('src/lexer.ts', 5, 0.93, 3),
        createResult('src/parser.ts', 20, 0.92, 4),
        createResult('src/utils.ts', 8, 0.90, 5),
        createResult('src/parser.ts', 25, 0.88, 6),
      ];

      const diversified = diversifier.diversify(results);

      expect(diversified).toBeDefined();
      expect(diversified.length).toBeGreaterThan(0);

      // Count results per file
      const fileCounts = new Map<string, number>();
      diversified.slice(0, 10).forEach(result => {
        const count = fileCounts.get(result.filePath) || 0;
        fileCounts.set(result.filePath, count + 1);
      });

      // Should have results from multiple files in top results
      expect(fileCounts.size).toBeGreaterThan(1);
    });

    it('should respect maxPerFile limit', () => {
      const config: DiversificationConfig = {
        enabled: true,
        lambda: 0.7,
        maxPerFile: 2, // Limit to 2 per file
      };

      const diversifier = new PathDiversifier(config);

      // Create 6 results from same file with high scores
      const results: HybridResult[] = [
        createResult('src/main.ts', 1, 1.0, 1),
        createResult('src/main.ts', 2, 0.99, 2),
        createResult('src/main.ts', 3, 0.98, 3),
        createResult('src/main.ts', 4, 0.97, 4),
        createResult('src/main.ts', 5, 0.96, 5),
        createResult('src/main.ts', 6, 0.95, 6),
        createResult('src/other.ts', 1, 0.50, 7), // Lower score, different file
      ];

      const diversified = diversifier.diversify(results);

      // Count how many from main.ts in top results
      const mainTsCount = diversified
        .filter(r => r.filePath === 'src/main.ts')
        .length;

      // Should not exceed maxPerFile
      expect(mainTsCount).toBeLessThanOrEqual(config.maxPerFile);

      // other.ts should appear despite lower score due to diversification
      const hasOther = diversified.some(r => r.filePath === 'src/other.ts');
      expect(hasOther).toBe(true);
    });

    it('should apply path similarity penalties', () => {
      const config: DiversificationConfig = {
        enabled: true,
        lambda: 0.5, // 50% relevance, 50% diversity
        maxPerFile: 3,
      };

      const diversifier = new PathDiversifier(config);

      const results: HybridResult[] = [
        createResult('src/services/parser.ts', 1, 1.0, 1),
        createResult('src/services/lexer.ts', 1, 0.95, 2),  // Similar path
        createResult('tests/unit/test.ts', 1, 0.90, 3),     // Different path
      ];

      const diversified = diversifier.diversify(results);

      // Results should have diversity penalties applied
      diversified.forEach(result => {
        if (result.finalRank > 1) {
          // Later results may have diversity penalty
          expect(result.scoreBreakdown.diversityPenalty).toBeDefined();
        }
      });
    });
  });

  describe('Single file scenario', () => {
    it('should skip diversification when all results from single file', () => {
      const config: DiversificationConfig = {
        enabled: true,
        lambda: 0.7,
        maxPerFile: 3,
      };

      const diversifier = new PathDiversifier(config);

      const results: HybridResult[] = [
        createResult('src/main.ts', 1, 1.0, 1),
        createResult('src/main.ts', 2, 0.95, 2),
        createResult('src/main.ts', 3, 0.90, 3),
      ];

      const diversified = diversifier.diversify(results);

      // Should return results unchanged (no diversification needed)
      expect(diversified.length).toBe(3);

      // Order should be preserved
      expect(diversified[0].lineNumber).toBe(1);
      expect(diversified[1].lineNumber).toBe(2);
      expect(diversified[2].lineNumber).toBe(3);

      // No diversity penalties
      diversified.forEach(result => {
        expect(result.scoreBreakdown.diversityPenalty).toBeUndefined();
      });
    });
  });

  describe('Lambda parameter', () => {
    it('should prioritize relevance with lambda=1.0', () => {
      const config: DiversificationConfig = {
        enabled: true,
        lambda: 1.0, // Pure relevance, no diversity
        maxPerFile: 10,
      };

      const diversifier = new PathDiversifier(config);

      const results: HybridResult[] = [
        createResult('src/main.ts', 1, 1.0, 1),
        createResult('src/main.ts', 2, 0.99, 2),
        createResult('src/main.ts', 3, 0.98, 3),
        createResult('src/other.ts', 1, 0.50, 4),
      ];

      const diversified = diversifier.diversify(results);

      // With lambda=1.0, should preserve relevance order
      expect(diversified[0].filePath).toBe('src/main.ts');
      expect(diversified[0].lineNumber).toBe(1);
      expect(diversified[1].filePath).toBe('src/main.ts');
      expect(diversified[1].lineNumber).toBe(2);
    });

    it('should prioritize diversity with lambda=0.0', () => {
      const config: DiversificationConfig = {
        enabled: true,
        lambda: 0.0, // Pure diversity, ignore relevance
        maxPerFile: 10,
      };

      const diversifier = new PathDiversifier(config);

      const results: HybridResult[] = [
        createResult('src/main.ts', 1, 1.0, 1),
        createResult('src/main.ts', 2, 0.99, 2),
        createResult('src/other.ts', 1, 0.50, 3),
        createResult('src/main.ts', 3, 0.98, 4),
      ];

      const diversified = diversifier.diversify(results);

      // With lambda=0.0, should maximize diversity
      // other.ts should rank higher despite lower relevance
      const paths = diversified.map(r => r.filePath);
      const uniquePaths = new Set(paths.slice(0, 3));

      // Top 3 should include both files
      expect(uniquePaths.size).toBe(2);
    });
  });

  describe('Disabled diversification', () => {
    it('should skip processing when disabled', () => {
      const config: DiversificationConfig = {
        enabled: false,
        lambda: 0.7,
        maxPerFile: 3,
      };

      const diversifier = new PathDiversifier(config);

      const results: HybridResult[] = [
        createResult('src/main.ts', 1, 1.0, 1),
        createResult('src/main.ts', 2, 0.99, 2),
        createResult('src/main.ts', 3, 0.98, 3),
        createResult('src/main.ts', 4, 0.97, 4),
      ];

      const diversified = diversifier.diversify(results);

      // Should return original results unchanged
      expect(diversified).toEqual(results);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty results', () => {
      const config: DiversificationConfig = {
        enabled: true,
        lambda: 0.7,
        maxPerFile: 3,
      };

      const diversifier = new PathDiversifier(config);

      const diversified = diversifier.diversify([]);

      expect(diversified).toEqual([]);
    });

    it('should handle single result', () => {
      const config: DiversificationConfig = {
        enabled: true,
        lambda: 0.7,
        maxPerFile: 3,
      };

      const diversifier = new PathDiversifier(config);

      const results: HybridResult[] = [
        createResult('src/main.ts', 1, 1.0, 1),
      ];

      const diversified = diversifier.diversify(results);

      expect(diversified).toEqual(results);
    });
  });
});
