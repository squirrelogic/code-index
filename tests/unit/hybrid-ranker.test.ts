/**
 * Unit tests for HybridRanker service
 */

import { describe, it, expect } from 'vitest';
import type { RankingCandidate } from '../../src/models/ranking-candidate.js';
import type { RankingConfig } from '../../src/models/ranking-config.js';
import { DEFAULT_RANKING_CONFIG } from '../../src/constants/ranking-constants.js';

// Import will fail initially - we'll implement after tests
import { HybridRanker } from '../../src/services/hybrid-ranker.js';

// Helper to create test candidates
function createCandidate(
  source: 'lexical' | 'vector',
  rank: number,
  score: number,
  filePath: string,
  line: number = 1
): RankingCandidate {
  return {
    source,
    sourceRank: rank,
    sourceScore: score,
    fileId: `file-${filePath}-${line}`,
    filePath,
    lineNumber: line,
    snippet: `Code snippet at ${filePath}:${line}`,
    symbolType: 'function',
    language: 'typescript',
    fileSize: 1024,
    lastModified: new Date(),
  };
}

describe('HybridRanker', () => {
  describe('Basic RRF fusion', () => {
    it('should combine lexical and vector candidates with default weights', () => {
      const ranker = new HybridRanker(DEFAULT_RANKING_CONFIG);

      const lexicalCandidates: RankingCandidate[] = [
        createCandidate('lexical', 1, 10.5, 'src/index.ts'),
        createCandidate('lexical', 2, 8.3, 'src/utils.ts'),
        createCandidate('lexical', 3, 6.1, 'src/lib.ts'),
      ];

      const vectorCandidates: RankingCandidate[] = [
        createCandidate('vector', 1, 0.95, 'src/parser.ts'),
        createCandidate('vector', 2, 0.88, 'src/index.ts'),
        createCandidate('vector', 3, 0.75, 'src/config.ts'),
      ];

      const results = ranker.rank(lexicalCandidates, vectorCandidates);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      // Results should be sorted by finalScore (descending)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].finalScore).toBeGreaterThanOrEqual(results[i].finalScore);
      }

      // All results should have score breakdown
      results.forEach(result => {
        expect(result.scoreBreakdown).toBeDefined();
        expect(result.scoreBreakdown.lexicalContribution).toBeGreaterThanOrEqual(0);
        expect(result.scoreBreakdown.vectorContribution).toBeGreaterThanOrEqual(0);
      });
    });

    it('should verify RRF formula correctness', () => {
      const config: RankingConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          alpha: 0.5,
          beta: 0.4,
          gamma: 0.1,
          rrfK: 60,
        },
      };

      const ranker = new HybridRanker(config);

      const lexicalCandidates: RankingCandidate[] = [
        createCandidate('lexical', 1, 10.0, 'src/test.ts'),
      ];

      const vectorCandidates: RankingCandidate[] = [
        createCandidate('vector', 1, 0.9, 'src/test.ts'),
      ];

      const results = ranker.rank(lexicalCandidates, vectorCandidates);

      expect(results.length).toBe(1);
      const result = results[0];

      // Verify RRF formula: α/(k+rank_l) + β/(k+rank_v)
      const expectedLexical = 0.5 / (60 + 1); // α=0.5, k=60, rank=1
      const expectedVector = 0.4 / (60 + 1);  // β=0.4, k=60, rank=1

      expect(result.scoreBreakdown.lexicalContribution).toBeCloseTo(expectedLexical, 5);
      expect(result.scoreBreakdown.vectorContribution).toBeCloseTo(expectedVector, 5);

      const expectedTotal = expectedLexical + expectedVector;
      expect(result.finalScore).toBeCloseTo(expectedTotal, 5);
    });

    it('should apply custom α/β/γ weights', () => {
      const config: RankingConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          alpha: 0.7,  // Higher lexical weight
          beta: 0.2,   // Lower vector weight
          gamma: 0.1,
          rrfK: 60,
        },
      };

      const ranker = new HybridRanker(config);

      const lexicalCandidates: RankingCandidate[] = [
        createCandidate('lexical', 1, 10.0, 'src/test.ts'),
      ];

      const vectorCandidates: RankingCandidate[] = [
        createCandidate('vector', 1, 0.9, 'src/test.ts'),
      ];

      const results = ranker.rank(lexicalCandidates, vectorCandidates);

      const result = results[0];

      // Lexical contribution should be higher due to α=0.7
      expect(result.scoreBreakdown.lexicalContribution).toBeGreaterThan(
        result.scoreBreakdown.vectorContribution
      );
    });
  });

  describe('Fallback modes', () => {
    it('should handle only lexical candidates (vector empty)', () => {
      const ranker = new HybridRanker(DEFAULT_RANKING_CONFIG);

      const lexicalCandidates: RankingCandidate[] = [
        createCandidate('lexical', 1, 10.5, 'src/index.ts'),
        createCandidate('lexical', 2, 8.3, 'src/utils.ts'),
      ];

      const vectorCandidates: RankingCandidate[] = [];

      const results = ranker.rank(lexicalCandidates, vectorCandidates);

      expect(results.length).toBe(2);

      // Should only have lexical contributions
      results.forEach(result => {
        expect(result.scoreBreakdown.lexicalContribution).toBeGreaterThan(0);
        expect(result.scoreBreakdown.vectorContribution).toBe(0);
        expect(result.scoreBreakdown.vectorRank).toBeUndefined();
      });
    });

    it('should handle only vector candidates (lexical empty)', () => {
      const ranker = new HybridRanker(DEFAULT_RANKING_CONFIG);

      const lexicalCandidates: RankingCandidate[] = [];

      const vectorCandidates: RankingCandidate[] = [
        createCandidate('vector', 1, 0.95, 'src/parser.ts'),
        createCandidate('vector', 2, 0.88, 'src/index.ts'),
      ];

      const results = ranker.rank(lexicalCandidates, vectorCandidates);

      expect(results.length).toBe(2);

      // Should only have vector contributions
      results.forEach(result => {
        expect(result.scoreBreakdown.vectorContribution).toBeGreaterThan(0);
        expect(result.scoreBreakdown.lexicalContribution).toBe(0);
        expect(result.scoreBreakdown.lexicalRank).toBeUndefined();
      });
    });

    it('should handle empty inputs gracefully', () => {
      const ranker = new HybridRanker(DEFAULT_RANKING_CONFIG);

      const results = ranker.rank([], []);

      expect(results).toBeDefined();
      expect(results.length).toBe(0);
    });
  });

  describe('Deduplication', () => {
    it('should deduplicate overlapping candidates', () => {
      const ranker = new HybridRanker(DEFAULT_RANKING_CONFIG);

      // Same file and line appears in both sources
      const lexicalCandidates: RankingCandidate[] = [
        createCandidate('lexical', 1, 10.5, 'src/index.ts', 42),
        createCandidate('lexical', 2, 8.3, 'src/utils.ts', 10),
      ];

      const vectorCandidates: RankingCandidate[] = [
        createCandidate('vector', 1, 0.95, 'src/index.ts', 42), // Duplicate
        createCandidate('vector', 2, 0.88, 'src/parser.ts', 5),
      ];

      const results = ranker.rank(lexicalCandidates, vectorCandidates);

      // Should have 3 unique results (index.ts:42 deduplicated)
      expect(results.length).toBe(3);

      // Find the deduplicated result
      const deduped = results.find(r => r.filePath === 'src/index.ts' && r.lineNumber === 42);
      expect(deduped).toBeDefined();

      if (deduped) {
        // Should have both lexical and vector contributions
        expect(deduped.scoreBreakdown.lexicalRank).toBe(1);
        expect(deduped.scoreBreakdown.vectorRank).toBe(1);
        expect(deduped.scoreBreakdown.lexicalContribution).toBeGreaterThan(0);
        expect(deduped.scoreBreakdown.vectorContribution).toBeGreaterThan(0);
      }
    });

    it('should handle disjoint result sets', () => {
      const ranker = new HybridRanker(DEFAULT_RANKING_CONFIG);

      const lexicalCandidates: RankingCandidate[] = [
        createCandidate('lexical', 1, 10.5, 'src/lex1.ts'),
        createCandidate('lexical', 2, 8.3, 'src/lex2.ts'),
      ];

      const vectorCandidates: RankingCandidate[] = [
        createCandidate('vector', 1, 0.95, 'src/vec1.ts'),
        createCandidate('vector', 2, 0.88, 'src/vec2.ts'),
      ];

      const results = ranker.rank(lexicalCandidates, vectorCandidates);

      // All 4 should be present (no overlap)
      expect(results.length).toBe(4);

      // Each should have contribution from only one source
      const lexOnlyResults = results.filter(r =>
        r.scoreBreakdown.lexicalContribution > 0 &&
        r.scoreBreakdown.vectorContribution === 0
      );
      const vecOnlyResults = results.filter(r =>
        r.scoreBreakdown.vectorContribution > 0 &&
        r.scoreBreakdown.lexicalContribution === 0
      );

      expect(lexOnlyResults.length).toBe(2);
      expect(vecOnlyResults.length).toBe(2);
    });
  });

  describe('Early termination', () => {
    it('should apply early termination at top-K', () => {
      const config: RankingConfig = {
        ...DEFAULT_RANKING_CONFIG,
        performance: {
          ...DEFAULT_RANKING_CONFIG.performance,
          earlyTerminationTopK: 5,
        },
      };

      const ranker = new HybridRanker(config);

      // Create 20 candidates
      const lexicalCandidates: RankingCandidate[] = Array.from({ length: 10 }, (_, i) =>
        createCandidate('lexical', i + 1, 10 - i, `src/lex${i}.ts`)
      );

      const vectorCandidates: RankingCandidate[] = Array.from({ length: 10 }, (_, i) =>
        createCandidate('vector', i + 1, 0.9 - i * 0.05, `src/vec${i}.ts`)
      );

      const results = ranker.rank(lexicalCandidates, vectorCandidates);

      // Should return exactly top-K results
      expect(results.length).toBe(5);
    });
  });

  describe('Final rank assignment', () => {
    it('should assign correct final ranks (1-based)', () => {
      const ranker = new HybridRanker(DEFAULT_RANKING_CONFIG);

      const lexicalCandidates: RankingCandidate[] = [
        createCandidate('lexical', 1, 10.0, 'src/a.ts'),
        createCandidate('lexical', 2, 8.0, 'src/b.ts'),
      ];

      const vectorCandidates: RankingCandidate[] = [
        createCandidate('vector', 1, 0.9, 'src/c.ts'),
      ];

      const results = ranker.rank(lexicalCandidates, vectorCandidates);

      // Ranks should be sequential starting from 1
      expect(results[0].finalRank).toBe(1);
      expect(results[1].finalRank).toBe(2);
      expect(results[2].finalRank).toBe(3);
    });
  });
});
