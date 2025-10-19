/**
 * Unit tests for TieBreaker service
 */

import { describe, it, expect } from 'vitest';
import type { HybridResult } from '../../src/models/hybrid-result.js';
import type { TieBreakerConfig } from '../../src/models/ranking-config.js';
import type { SymbolType } from '../../src/models/ranking-candidate.js';
import { TieBreaker } from '../../src/services/tie-breaker.js';
import { TIE_THRESHOLD } from '../../src/constants/ranking-constants.js';

// Helper to create test results
function createResult(
  filePath: string,
  line: number,
  score: number,
  symbolType?: SymbolType,
  symbolName?: string,
  language?: string
): HybridResult {
  return {
    fileId: `${filePath}:${line}`,
    filePath,
    lineNumber: line,
    snippet: `Code at ${filePath}:${line}`,
    symbolType,
    symbolName,
    language,
    finalScore: score,
    finalRank: 0,
    scoreBreakdown: {
      lexicalContribution: score * 0.5,
      vectorContribution: score * 0.5,
      tieBreakerContribution: 0,
    },
    fileSize: 1024,
    lastModified: new Date(),
  };
}

describe('TieBreaker', () => {
  const defaultConfig: TieBreakerConfig = {
    symbolTypeWeight: 0.3,
    pathPriorityWeight: 0.3,
    languageMatchWeight: 0.2,
    identifierMatchWeight: 0.2,
  };

  describe('Tie detection', () => {
    it('should apply tie-breakers when scores within threshold', () => {
      const tieBreaker = new TieBreaker(defaultConfig);

      const results: HybridResult[] = [
        createResult('src/parser.ts', 1, 0.500, 'function', 'parse', 'typescript'),
        createResult('src/lexer.ts', 1, 0.505, 'class', 'Lexer', 'typescript'), // Within 0.01
        createResult('src/utils.ts', 1, 0.502, 'variable', 'config', 'typescript'), // Within 0.01
      ];

      const processed = tieBreaker.applyTieBreakers(results, 'parse function');

      // Should have tie-breaker scores
      processed.forEach(result => {
        expect(result.scoreBreakdown.tieBreakerScores).toBeDefined();
      });

      // Tie-breaker contributions should be added
      processed.forEach(result => {
        if (result.scoreBreakdown.tieBreakerScores) {
          expect(result.scoreBreakdown.tieBreakerContribution).toBeGreaterThan(0);
        }
      });
    });

    it('should not apply when scores differ significantly', () => {
      const tieBreaker = new TieBreaker(defaultConfig);

      const results: HybridResult[] = [
        createResult('src/parser.ts', 1, 1.0, 'function'),
        createResult('src/lexer.ts', 1, 0.5, 'class'), // > 0.01 difference
      ];

      const processed = tieBreaker.applyTieBreakers(results, 'test');

      // No tie-breakers should be applied
      expect(processed[0].scoreBreakdown.tieBreakerScores).toBeUndefined();
      expect(processed[1].scoreBreakdown.tieBreakerScores).toBeUndefined();
    });
  });

  describe('Symbol type priority', () => {
    it('should prioritize functions over classes', () => {
      const tieBreaker = new TieBreaker(defaultConfig);

      const results: HybridResult[] = [
        createResult('src/a.ts', 1, 0.500, 'class'),
        createResult('src/b.ts', 1, 0.500, 'function'), // Same score
      ];

      const processed = tieBreaker.applyTieBreakers(results, 'test');

      // Function should rank higher
      const funcResult = processed.find(r => r.symbolType === 'function')!;
      const classResult = processed.find(r => r.symbolType === 'class')!;

      expect(funcResult.scoreBreakdown.tieBreakerScores!.symbolTypePriority).toBeGreaterThan(
        classResult.scoreBreakdown.tieBreakerScores!.symbolTypePriority
      );
    });

    it('should prioritize classes over variables', () => {
      const tieBreaker = new TieBreaker(defaultConfig);

      const results: HybridResult[] = [
        createResult('src/a.ts', 1, 0.500, 'variable'),
        createResult('src/b.ts', 1, 0.500, 'class'),
      ];

      const processed = tieBreaker.applyTieBreakers(results, 'test');

      const classScore = processed.find(r => r.symbolType === 'class')!
        .scoreBreakdown.tieBreakerScores!.symbolTypePriority;
      const varScore = processed.find(r => r.symbolType === 'variable')!
        .scoreBreakdown.tieBreakerScores!.symbolTypePriority;

      expect(classScore).toBeGreaterThan(varScore);
    });

    it('should prioritize variables over comments', () => {
      const tieBreaker = new TieBreaker(defaultConfig);

      const results: HybridResult[] = [
        createResult('src/a.ts', 1, 0.500, 'comment'),
        createResult('src/b.ts', 1, 0.500, 'variable'),
      ];

      const processed = tieBreaker.applyTieBreakers(results, 'test');

      const varScore = processed.find(r => r.symbolType === 'variable')!
        .scoreBreakdown.tieBreakerScores!.symbolTypePriority;
      const commentScore = processed.find(r => r.symbolType === 'comment')!
        .scoreBreakdown.tieBreakerScores!.symbolTypePriority;

      expect(varScore).toBeGreaterThan(commentScore);
    });
  });

  describe('Path priority', () => {
    it('should prioritize src/ over test/', () => {
      const tieBreaker = new TieBreaker(defaultConfig);

      const results: HybridResult[] = [
        createResult('test/unit/parser.test.ts', 1, 0.500),
        createResult('src/parser.ts', 1, 0.500),
      ];

      const processed = tieBreaker.applyTieBreakers(results, 'test');

      const srcScore = processed.find(r => r.filePath.startsWith('src/'))!
        .scoreBreakdown.tieBreakerScores!.pathPriority;
      const testScore = processed.find(r => r.filePath.startsWith('test/'))!
        .scoreBreakdown.tieBreakerScores!.pathPriority;

      expect(srcScore).toBeGreaterThan(testScore);
    });

    it('should prioritize lib/ over docs/', () => {
      const tieBreaker = new TieBreaker(defaultConfig);

      const results: HybridResult[] = [
        createResult('docs/api.md', 1, 0.500),
        createResult('lib/utils.ts', 1, 0.500),
      ];

      const processed = tieBreaker.applyTieBreakers(results, 'test');

      const libScore = processed.find(r => r.filePath.startsWith('lib/'))!
        .scoreBreakdown.tieBreakerScores!.pathPriority;
      const docsScore = processed.find(r => r.filePath.startsWith('docs/'))!
        .scoreBreakdown.tieBreakerScores!.pathPriority;

      expect(libScore).toBeGreaterThan(docsScore);
    });
  });

  describe('Language matching', () => {
    it('should boost results matching query language', () => {
      const tieBreaker = new TieBreaker(defaultConfig);

      const results: HybridResult[] = [
        createResult('src/a.py', 1, 0.500, 'function', 'foo', 'python'),
        createResult('src/b.ts', 1, 0.500, 'function', 'bar', 'typescript'),
      ];

      // Query mentions typescript
      const processed = tieBreaker.applyTieBreakers(results, 'typescript function');

      const tsResult = processed.find(r => r.language === 'typescript')!;
      const pyResult = processed.find(r => r.language === 'python')!;

      expect(tsResult.scoreBreakdown.tieBreakerScores!.languageMatch).toBe(1);
      expect(pyResult.scoreBreakdown.tieBreakerScores!.languageMatch).toBe(0);
    });

    it('should detect language from file extensions in query', () => {
      const tieBreaker = new TieBreaker(defaultConfig);

      const results: HybridResult[] = [
        createResult('src/a.py', 1, 0.500, 'function', 'foo', 'python'),
        createResult('src/b.ts', 1, 0.500, 'function', 'bar', 'typescript'),
      ];

      // Query mentions .py extension
      const processed = tieBreaker.applyTieBreakers(results, 'parse .py file');

      const pyResult = processed.find(r => r.language === 'python')!;

      expect(pyResult.scoreBreakdown.tieBreakerScores!.languageMatch).toBe(1);
    });
  });

  describe('Identifier exact match', () => {
    it('should boost results with exact identifier match', () => {
      const tieBreaker = new TieBreaker(defaultConfig);

      const results: HybridResult[] = [
        createResult('src/a.ts', 1, 0.500, 'function', 'parseJSON'),
        createResult('src/b.ts', 1, 0.500, 'function', 'formatData'),
      ];

      const processed = tieBreaker.applyTieBreakers(results, 'parseJSON function');

      const parseResult = processed.find(r => r.symbolName === 'parseJSON')!;
      const formatResult = processed.find(r => r.symbolName === 'formatData')!;

      expect(parseResult.scoreBreakdown.tieBreakerScores!.identifierMatch).toBe(1);
      expect(formatResult.scoreBreakdown.tieBreakerScores!.identifierMatch).toBe(0);
    });

    it('should be case-sensitive for identifier matching', () => {
      const tieBreaker = new TieBreaker(defaultConfig);

      const results: HybridResult[] = [
        createResult('src/a.ts', 1, 0.500, 'function', 'ParseJSON'), // Different case
        createResult('src/b.ts', 1, 0.500, 'function', 'parseJSON'),
      ];

      const processed = tieBreaker.applyTieBreakers(results, 'parseJSON');

      const exactMatch = processed.find(r => r.symbolName === 'parseJSON')!;
      const wrongCase = processed.find(r => r.symbolName === 'ParseJSON')!;

      expect(exactMatch.scoreBreakdown.tieBreakerScores!.identifierMatch).toBe(1);
      expect(wrongCase.scoreBreakdown.tieBreakerScores!.identifierMatch).toBe(0);
    });
  });

  describe('Combined weighted scoring', () => {
    it('should apply configured weights correctly', () => {
      const config: TieBreakerConfig = {
        symbolTypeWeight: 0.4,
        pathPriorityWeight: 0.3,
        languageMatchWeight: 0.2,
        identifierMatchWeight: 0.1,
      };

      const tieBreaker = new TieBreaker(config);

      const results: HybridResult[] = [
        createResult('src/parser.ts', 1, 0.500, 'function', 'parse', 'typescript'),
        createResult('src/lexer.ts', 1, 0.502, 'class', 'Lexer', 'typescript'), // Within threshold
      ];

      const processed = tieBreaker.applyTieBreakers(results, 'parse typescript');

      const tieScores = processed[0].scoreBreakdown.tieBreakerScores!;

      // Combined score should be weighted sum
      const expectedCombined =
        tieScores.symbolTypePriority * 0.4 +
        tieScores.pathPriority * 0.3 +
        tieScores.languageMatch * 0.2 +
        tieScores.identifierMatch * 0.1;

      expect(tieScores.combinedScore).toBeCloseTo(expectedCombined, 5);
    });

    it('should update final score with tie-breaker contribution', () => {
      const tieBreaker = new TieBreaker(defaultConfig);

      const results: HybridResult[] = [
        createResult('src/a.ts', 1, 0.500, 'function', 'foo', 'typescript'),
        createResult('src/b.ts', 1, 0.502, 'class', 'Bar', 'typescript'),
      ];

      const processed = tieBreaker.applyTieBreakers(results, 'test');

      // Final scores should be adjusted
      processed.forEach(result => {
        if (result.scoreBreakdown.tieBreakerScores) {
          const expectedScore =
            result.scoreBreakdown.lexicalContribution +
            result.scoreBreakdown.vectorContribution +
            result.scoreBreakdown.tieBreakerContribution;

          expect(result.finalScore).toBeCloseTo(expectedScore, 5);
        }
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle results without symbol type', () => {
      const tieBreaker = new TieBreaker(defaultConfig);

      const results: HybridResult[] = [
        createResult('src/a.ts', 1, 0.500), // No symbol type
        createResult('src/b.ts', 1, 0.500),
      ];

      const processed = tieBreaker.applyTieBreakers(results, 'test');

      // Should not crash, assign default priority
      expect(processed).toBeDefined();
      expect(processed.length).toBe(2);
    });

    it('should handle empty query', () => {
      const tieBreaker = new TieBreaker(defaultConfig);

      const results: HybridResult[] = [
        createResult('src/a.ts', 1, 0.500, 'function', 'foo', 'typescript'),
      ];

      const processed = tieBreaker.applyTieBreakers(results, '');

      // Should not crash
      expect(processed).toBeDefined();
      expect(processed.length).toBe(1);
    });

    it('should handle empty results', () => {
      const tieBreaker = new TieBreaker(defaultConfig);

      const processed = tieBreaker.applyTieBreakers([], 'test');

      expect(processed).toEqual([]);
    });
  });
});
