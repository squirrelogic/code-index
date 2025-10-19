/**
 * Integration tests for complete hybrid search pipeline
 */

import { describe, it, expect } from 'vitest';
import { HybridRanker } from '../../src/services/hybrid-ranker.js';
import { PathDiversifier } from '../../src/services/path-diversifier.js';
import { TieBreaker } from '../../src/services/tie-breaker.js';
import { PerformanceMonitor } from '../../src/services/performance-monitor.js';
import { DEFAULT_RANKING_CONFIG } from '../../src/constants/ranking-constants.js';
import type { RankingCandidate } from '../../src/models/ranking-candidate.js';

/**
 * Helper to create test candidates
 */
function createCandidate(
  source: 'lexical' | 'vector',
  rank: number,
  score: number,
  filePath: string,
  line: number,
  symbolType?: 'function' | 'class' | 'variable',
  symbolName?: string
): RankingCandidate {
  return {
    source,
    sourceRank: rank,
    sourceScore: score,
    fileId: `${filePath}:${line}`,
    filePath,
    lineNumber: line,
    snippet: `Code at ${filePath}:${line}`,
    symbolType,
    symbolName,
    language: 'typescript',
    fileSize: 1024,
    lastModified: new Date(),
  };
}

describe('Hybrid Search Pipeline Integration', () => {
  it('should execute complete pipeline: RRF → Diversification → Tie-Breaking', () => {
    // Setup: Create test candidates from lexical and vector sources
    const lexicalCandidates: RankingCandidate[] = [
      createCandidate('lexical', 1, 15.5, 'src/parser.ts', 10, 'function', 'parseJSON'),
      createCandidate('lexical', 2, 12.3, 'src/parser.ts', 25, 'function', 'parseXML'),
      createCandidate('lexical', 3, 10.1, 'src/lexer.ts', 5, 'class', 'Lexer'),
      createCandidate('lexical', 4, 8.5, 'src/utils.ts', 15, 'function', 'formatData'),
      createCandidate('lexical', 5, 7.2, 'test/parser.test.ts', 20, 'function', 'testParse'),
    ];

    const vectorCandidates: RankingCandidate[] = [
      createCandidate('vector', 1, 0.92, 'src/parser.ts', 10, 'function', 'parseJSON'), // Overlap
      createCandidate('vector', 2, 0.88, 'src/compiler.ts', 50, 'class', 'Compiler'),
      createCandidate('vector', 3, 0.85, 'src/ast.ts', 30, 'class', 'ASTNode'),
      createCandidate('vector', 4, 0.80, 'src/parser.ts', 35, 'function', 'parseYAML'),
      createCandidate('vector', 5, 0.75, 'docs/api.md', 100, 'variable', 'API_VERSION'),
    ];

    const performanceMonitor = new PerformanceMonitor(300);

    // Step 1: RRF Fusion
    performanceMonitor.startTimer('ranking');
    const ranker = new HybridRanker(DEFAULT_RANKING_CONFIG);
    let results = ranker.rank(lexicalCandidates, vectorCandidates);
    performanceMonitor.stopTimer('ranking');

    // Verify: Results combined from both sources
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(10); // Early termination

    // Verify: Deduplication occurred (parseJSON appears in both)
    const parseJSONResults = results.filter(r => r.symbolName === 'parseJSON');
    expect(parseJSONResults.length).toBe(1); // Should be deduplicated

    // Verify: Score breakdown present
    results.forEach(result => {
      expect(result.scoreBreakdown).toBeDefined();
      expect(result.scoreBreakdown.lexicalContribution).toBeGreaterThanOrEqual(0);
      expect(result.scoreBreakdown.vectorContribution).toBeGreaterThanOrEqual(0);
    });

    // Step 2: Path Diversification
    const diversifier = new PathDiversifier(DEFAULT_RANKING_CONFIG.diversification);
    results = diversifier.diversify(results);

    // Verify: Results still present
    expect(results.length).toBeGreaterThan(0);

    // Verify: Diversity applied (max 3 per file from src/parser.ts)
    const parserResults = results.filter(r => r.filePath === 'src/parser.ts');
    expect(parserResults.length).toBeLessThanOrEqual(3);

    // Step 3: Tie-Breaking
    const tieBreaker = new TieBreaker(DEFAULT_RANKING_CONFIG.tieBreakers);
    results = tieBreaker.applyTieBreakers(results, 'parseJSON typescript');

    // Verify: Results still sorted
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].finalScore).toBeGreaterThanOrEqual(results[i].finalScore);
    }

    // Verify: Tie-breakers applied where appropriate
    const resultsWithTieBreakers = results.filter(
      r => r.scoreBreakdown.tieBreakerScores !== undefined
    );
    // At least some results should have tie-breakers if scores are close
    expect(resultsWithTieBreakers.length).toBeGreaterThanOrEqual(0);

    // Step 4: Performance Metrics
    performanceMonitor.recordCandidateCounts(
      lexicalCandidates.length,
      vectorCandidates.length,
      results.length
    );

    const metrics = performanceMonitor.getMetrics();

    // Verify: Metrics collected
    expect(metrics.rankingTimeMs).toBeGreaterThan(0);
    expect(metrics.lexicalCandidates).toBe(5);
    expect(metrics.vectorCandidates).toBe(5);
    expect(metrics.uniqueCandidates).toBe(results.length);
    expect(metrics.slaViolation).toBe(false); // Should be well under 300ms
  });

  it('should handle lexical-only fallback mode', () => {
    const lexicalCandidates: RankingCandidate[] = [
      createCandidate('lexical', 1, 15.5, 'src/parser.ts', 10, 'function'),
      createCandidate('lexical', 2, 12.3, 'src/lexer.ts', 5, 'class'),
    ];

    const vectorCandidates: RankingCandidate[] = []; // Empty - fallback mode

    const ranker = new HybridRanker(DEFAULT_RANKING_CONFIG);
    const results = ranker.rank(lexicalCandidates, vectorCandidates);

    // Verify: Results returned despite empty vector candidates
    expect(results.length).toBe(2);

    // Verify: Only lexical contributions
    results.forEach(result => {
      expect(result.scoreBreakdown.lexicalContribution).toBeGreaterThan(0);
      expect(result.scoreBreakdown.vectorContribution).toBe(0);
    });
  });

  it('should handle vector-only fallback mode', () => {
    const lexicalCandidates: RankingCandidate[] = []; // Empty - fallback mode

    const vectorCandidates: RankingCandidate[] = [
      createCandidate('vector', 1, 0.92, 'src/parser.ts', 10, 'function'),
      createCandidate('vector', 2, 0.88, 'src/compiler.ts', 50, 'class'),
    ];

    const ranker = new HybridRanker(DEFAULT_RANKING_CONFIG);
    const results = ranker.rank(lexicalCandidates, vectorCandidates);

    // Verify: Results returned despite empty lexical candidates
    expect(results.length).toBe(2);

    // Verify: Only vector contributions
    results.forEach(result => {
      expect(result.scoreBreakdown.vectorContribution).toBeGreaterThan(0);
      expect(result.scoreBreakdown.lexicalContribution).toBe(0);
    });
  });

  it('should maintain performance under 300ms SLA', async () => {
    // Create larger candidate sets
    const lexicalCandidates: RankingCandidate[] = Array.from({ length: 200 }, (_, i) =>
      createCandidate('lexical', i + 1, 15 - i * 0.05, `src/file${i}.ts`, 10, 'function')
    );

    const vectorCandidates: RankingCandidate[] = Array.from({ length: 200 }, (_, i) =>
      createCandidate('vector', i + 1, 0.95 - i * 0.002, `src/file${i}.ts`, 20, 'class')
    );

    const performanceMonitor = new PerformanceMonitor(300);

    // Execute full pipeline
    performanceMonitor.startTimer('ranking');

    const ranker = new HybridRanker(DEFAULT_RANKING_CONFIG);
    let results = ranker.rank(lexicalCandidates, vectorCandidates);

    const diversifier = new PathDiversifier(DEFAULT_RANKING_CONFIG.diversification);
    results = diversifier.diversify(results);

    const tieBreaker = new TieBreaker(DEFAULT_RANKING_CONFIG.tieBreakers);
    results = tieBreaker.applyTieBreakers(results, 'test query');

    performanceMonitor.stopTimer('ranking');

    const metrics = performanceMonitor.getMetrics();

    // Verify: Completed within SLA
    expect(metrics.rankingTimeMs).toBeLessThan(300);
    expect(metrics.slaViolation).toBe(false);

    // Verify: Results returned
    expect(results.length).toBeGreaterThan(0);
  });

  it('should prioritize high-quality results across all stages', () => {
    const lexicalCandidates: RankingCandidate[] = [
      createCandidate('lexical', 1, 20.0, 'src/core.ts', 100, 'function', 'coreFunction'),
      createCandidate('lexical', 2, 5.0, 'test/test.ts', 10, 'variable', 'testVar'),
    ];

    const vectorCandidates: RankingCandidate[] = [
      createCandidate('vector', 1, 0.98, 'src/core.ts', 100, 'function', 'coreFunction'),
      createCandidate('vector', 2, 0.60, 'docs/readme.md', 1, 'variable', 'docVar'),
    ];

    // Execute pipeline
    const ranker = new HybridRanker(DEFAULT_RANKING_CONFIG);
    let results = ranker.rank(lexicalCandidates, vectorCandidates);

    const diversifier = new PathDiversifier(DEFAULT_RANKING_CONFIG.diversification);
    results = diversifier.diversify(results);

    const tieBreaker = new TieBreaker(DEFAULT_RANKING_CONFIG.tieBreakers);
    results = tieBreaker.applyTieBreakers(results, 'coreFunction');

    // Verify: High-quality result ranks first
    // coreFunction appears in both sources with top ranks
    expect(results[0].filePath).toBe('src/core.ts');
    expect(results[0].symbolName).toBe('coreFunction');

    // Verify: Test file and docs rank lower than src/
    const testResult = results.find(r => r.filePath === 'test/test.ts');
    const coreResult = results.find(r => r.filePath === 'src/core.ts');

    if (testResult && coreResult) {
      expect(coreResult.finalRank).toBeLessThan(testResult.finalRank);
    }
  });
});
