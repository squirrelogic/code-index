/**
 * Unit tests for ranking utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  validateRankingConfig,
  hasExtremeWeights,
  formatScore,
  calculatePathSimilarity,
  calculatePathPriority,
} from '../../src/lib/ranking-utils.js';
import { DEFAULT_RANKING_CONFIG } from '../../src/constants/ranking-constants.js';
import type { RankingConfig } from '../../src/models/ranking-config.js';

describe('validateRankingConfig', () => {
  it('should accept valid config', () => {
    const result = validateRankingConfig(DEFAULT_RANKING_CONFIG);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(DEFAULT_RANKING_CONFIG);
    }
  });

  it('should reject null config', () => {
    const result = validateRankingConfig(null);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('must be an object');
    }
  });

  it('should reject config with invalid alpha', () => {
    const invalid = {
      ...DEFAULT_RANKING_CONFIG,
      fusion: { ...DEFAULT_RANKING_CONFIG.fusion, alpha: 1.5 },
    };
    const result = validateRankingConfig(invalid);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('alpha');
    }
  });

  it('should reject config with negative beta', () => {
    const invalid = {
      ...DEFAULT_RANKING_CONFIG,
      fusion: { ...DEFAULT_RANKING_CONFIG.fusion, beta: -0.1 },
    };
    const result = validateRankingConfig(invalid);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('beta');
    }
  });

  it('should reject config with weight sum > 1.0', () => {
    const invalid = {
      ...DEFAULT_RANKING_CONFIG,
      fusion: {
        alpha: 0.5,
        beta: 0.4,
        gamma: 0.2, // sum = 1.1
        rrfK: 60,
      },
    };
    const result = validateRankingConfig(invalid);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('sum');
    }
  });

  it('should accept config with weight sum < 1.0', () => {
    const valid = {
      ...DEFAULT_RANKING_CONFIG,
      fusion: {
        alpha: 0.3,
        beta: 0.3,
        gamma: 0.1, // sum = 0.7
        rrfK: 60,
      },
    };
    const result = validateRankingConfig(valid);
    expect(result.isOk()).toBe(true);
  });

  it('should reject config with invalid rrfK', () => {
    const invalid = {
      ...DEFAULT_RANKING_CONFIG,
      fusion: { ...DEFAULT_RANKING_CONFIG.fusion, rrfK: 0 },
    };
    const result = validateRankingConfig(invalid);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('rrfK');
    }
  });

  it('should reject config with invalid lambda', () => {
    const invalid = {
      ...DEFAULT_RANKING_CONFIG,
      diversification: {
        ...DEFAULT_RANKING_CONFIG.diversification,
        lambda: 1.5,
      },
    };
    const result = validateRankingConfig(invalid);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('lambda');
    }
  });

  it('should reject config with candidateLimit out of range', () => {
    const invalid = {
      ...DEFAULT_RANKING_CONFIG,
      performance: {
        ...DEFAULT_RANKING_CONFIG.performance,
        candidateLimit: 5, // < 10
      },
    };
    const result = validateRankingConfig(invalid);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('candidateLimit');
    }
  });

  it('should reject config with timeoutMs out of range', () => {
    const invalid = {
      ...DEFAULT_RANKING_CONFIG,
      performance: {
        ...DEFAULT_RANKING_CONFIG.performance,
        timeoutMs: 50, // < 100
      },
    };
    const result = validateRankingConfig(invalid);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('timeoutMs');
    }
  });
});

describe('hasExtremeWeights', () => {
  it('should detect alpha = 0', () => {
    const config: RankingConfig = {
      ...DEFAULT_RANKING_CONFIG,
      fusion: { ...DEFAULT_RANKING_CONFIG.fusion, alpha: 0 },
    };
    expect(hasExtremeWeights(config)).toBe(true);
  });

  it('should detect beta = 0', () => {
    const config: RankingConfig = {
      ...DEFAULT_RANKING_CONFIG,
      fusion: { ...DEFAULT_RANKING_CONFIG.fusion, beta: 0 },
    };
    expect(hasExtremeWeights(config)).toBe(true);
  });

  it('should detect alpha > 0.9', () => {
    const config: RankingConfig = {
      ...DEFAULT_RANKING_CONFIG,
      fusion: { ...DEFAULT_RANKING_CONFIG.fusion, alpha: 0.95 },
    };
    expect(hasExtremeWeights(config)).toBe(true);
  });

  it('should detect beta > 0.9', () => {
    const config: RankingConfig = {
      ...DEFAULT_RANKING_CONFIG,
      fusion: { ...DEFAULT_RANKING_CONFIG.fusion, beta: 0.91 },
    };
    expect(hasExtremeWeights(config)).toBe(true);
  });

  it('should not flag normal weights', () => {
    expect(hasExtremeWeights(DEFAULT_RANKING_CONFIG)).toBe(false);
  });

  it('should not flag weights at boundary', () => {
    const config: RankingConfig = {
      ...DEFAULT_RANKING_CONFIG,
      fusion: { ...DEFAULT_RANKING_CONFIG.fusion, alpha: 0.9, beta: 0.1 },
    };
    expect(hasExtremeWeights(config)).toBe(false);
  });
});

describe('formatScore', () => {
  it('should format score with default decimals', () => {
    expect(formatScore(0.123456)).toBe('0.123');
  });

  it('should format score with custom decimals', () => {
    expect(formatScore(0.123456, 2)).toBe('0.12');
    expect(formatScore(0.123456, 4)).toBe('0.1235');
  });

  it('should format very small numbers', () => {
    expect(formatScore(0.0001234, 5)).toBe('0.00012');
  });

  it('should format very large numbers', () => {
    expect(formatScore(12345.6789, 2)).toBe('12345.68');
  });

  it('should format zero', () => {
    expect(formatScore(0)).toBe('0.000');
  });

  it('should format negative numbers', () => {
    expect(formatScore(-1.234)).toBe('-1.234');
  });
});

describe('calculatePathSimilarity', () => {
  it('should return 1.0 for identical paths', () => {
    expect(calculatePathSimilarity('src/index.ts', 'src/index.ts')).toBe(1.0);
  });

  it('should return 0.0 for null paths', () => {
    expect(calculatePathSimilarity('', '')).toBe(0); // Empty strings return 0 due to maxLength check
    expect(calculatePathSimilarity('src/test.ts', '')).toBe(0);
  });

  it('should return high similarity for similar paths', () => {
    const similarity = calculatePathSimilarity(
      'src/services/parser.ts',
      'src/services/lexer.ts'
    );
    expect(similarity).toBeGreaterThan(0.7);
    expect(similarity).toBeLessThan(1.0);
  });

  it('should return low similarity for different paths', () => {
    const similarity = calculatePathSimilarity(
      'src/index.ts',
      'tests/integration/config.test.ts'
    );
    expect(similarity).toBeLessThan(0.5);
  });

  it('should handle completely different paths', () => {
    const similarity = calculatePathSimilarity(
      'a',
      'zzzzzzzzzzzzzzzzzzzzz'
    );
    expect(similarity).toBeGreaterThanOrEqual(0);
    expect(similarity).toBeLessThan(0.1);
  });

  it('should be symmetric', () => {
    const path1 = 'src/lib/utils.ts';
    const path2 = 'src/services/db.ts';
    expect(calculatePathSimilarity(path1, path2)).toBe(
      calculatePathSimilarity(path2, path1)
    );
  });
});

describe('calculatePathPriority', () => {
  it('should assign highest priority to src/', () => {
    expect(calculatePathPriority('src/index.ts')).toBe(1.0);
    expect(calculatePathPriority('src/services/parser.ts')).toBe(1.0);
  });

  it('should assign high priority to lib/', () => {
    expect(calculatePathPriority('lib/utils.ts')).toBe(0.9);
  });

  it('should assign lower priority to test/', () => {
    expect(calculatePathPriority('test/unit/parser.test.ts')).toBe(0.6);
    expect(calculatePathPriority('tests/integration/config.test.ts')).toBe(0.6);
  });

  it('should assign lower priority to .test. files', () => {
    // Note: src/ pattern matches first, so this gets 1.0, not 0.6
    expect(calculatePathPriority('src/parser.test.ts')).toBe(1.0);
    // Test files not in src/ get lower priority
    expect(calculatePathPriority('parser.test.ts')).toBe(0.6);
  });

  it('should assign lower priority to .spec. files', () => {
    // Note: src/ pattern matches first, so this gets 1.0, not 0.6
    expect(calculatePathPriority('src/parser.spec.ts')).toBe(1.0);
    // Spec files not in src/ get lower priority
    expect(calculatePathPriority('parser.spec.ts')).toBe(0.6);
  });

  it('should assign lowest priority to docs/', () => {
    expect(calculatePathPriority('docs/api.md')).toBe(0.4);
    expect(calculatePathPriority('doc/README.md')).toBe(0.4);
  });

  it('should assign medium priority to examples/', () => {
    expect(calculatePathPriority('examples/basic.ts')).toBe(0.5);
    expect(calculatePathPriority('example/demo.ts')).toBe(0.5);
  });

  it('should assign default priority to unknown paths', () => {
    expect(calculatePathPriority('foo/bar/baz.ts')).toBe(0.5);
  });

  it('should handle empty path', () => {
    expect(calculatePathPriority('')).toBe(0.5);
  });

  it('should use first matching pattern', () => {
    // src/ pattern appears first in list, so it takes precedence
    expect(calculatePathPriority('src/parser.test.ts')).toBe(1.0);
  });
});
