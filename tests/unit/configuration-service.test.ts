/**
 * Unit tests for ConfigurationService (T024)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ConfigurationService } from '../../src/services/configuration-service.js';
import { DEFAULT_RANKING_CONFIG } from '../../src/constants/ranking-constants.js';
import type { RankingConfig } from '../../src/models/ranking-config.js';

const TEST_CONFIG_DIR = join(process.cwd(), '.codeindex-test-config');
const TEST_CONFIG_PATH = join(TEST_CONFIG_DIR, 'ranking-config.json');

describe('ConfigurationService', () => {
  beforeEach(() => {
    // Create test directory
    if (!existsSync(TEST_CONFIG_DIR)) {
      mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    }
    // Clean up any existing config
    if (existsSync(TEST_CONFIG_PATH)) {
      unlinkSync(TEST_CONFIG_PATH);
    }
  });

  afterEach(() => {
    // Clean up test files
    if (existsSync(TEST_CONFIG_PATH)) {
      unlinkSync(TEST_CONFIG_PATH);
    }
  });

  describe('Loading configuration', () => {
    it('should load default config when file does not exist', () => {
      const service = new ConfigurationService();
      const config = service.getConfig();

      expect(config).toEqual(DEFAULT_RANKING_CONFIG);
    });

    it('should load config from JSON file', () => {
      const customConfig: RankingConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          ...DEFAULT_RANKING_CONFIG.fusion,
          alpha: 0.7,
          beta: 0.3,
          gamma: 0, // Set gamma=0 so sum = 1.0
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(customConfig, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      const config = service.getConfig();

      expect(config.fusion.alpha).toBe(0.7);
      expect(config.fusion.beta).toBe(0.3);
    });

    it('should handle malformed JSON gracefully', () => {
      writeFileSync(TEST_CONFIG_PATH, 'invalid json {{{');

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      const config = service.getConfig();

      // Should fallback to default config
      expect(config).toEqual(DEFAULT_RANKING_CONFIG);
    });
  });

  describe('Configuration validation', () => {
    it('should reject config with invalid alpha', () => {
      const invalidConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          ...DEFAULT_RANKING_CONFIG.fusion,
          alpha: 1.5, // Invalid: > 1.0
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(invalidConfig, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      const config = service.getConfig();

      // Should fallback to default
      expect(config).toEqual(DEFAULT_RANKING_CONFIG);
    });

    it('should reject config with negative beta', () => {
      const invalidConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          ...DEFAULT_RANKING_CONFIG.fusion,
          beta: -0.1, // Invalid: < 0
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(invalidConfig, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      const config = service.getConfig();

      // Should fallback to default
      expect(config).toEqual(DEFAULT_RANKING_CONFIG);
    });

    it('should reject config with weight sum > 1.0', () => {
      const invalidConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          ...DEFAULT_RANKING_CONFIG.fusion,
          alpha: 0.6,
          beta: 0.5,
          gamma: 0.2, // Sum = 1.3 > 1.0
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(invalidConfig, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      const config = service.getConfig();

      // Should fallback to default
      expect(config).toEqual(DEFAULT_RANKING_CONFIG);
    });

    it('should accept config with weight sum < 1.0', () => {
      const validConfig: RankingConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          ...DEFAULT_RANKING_CONFIG.fusion,
          alpha: 0.4,
          beta: 0.3,
          gamma: 0.1, // Sum = 0.8 < 1.0 (valid)
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(validConfig, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      const config = service.getConfig();

      expect(config.fusion.alpha).toBe(0.4);
      expect(config.fusion.beta).toBe(0.3);
      expect(config.fusion.gamma).toBe(0.1);
    });

    it('should reject config with invalid rrfK', () => {
      const invalidConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          ...DEFAULT_RANKING_CONFIG.fusion,
          rrfK: 0, // Invalid: must be > 0
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(invalidConfig, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      const config = service.getConfig();

      // Should fallback to default
      expect(config).toEqual(DEFAULT_RANKING_CONFIG);
    });

    it('should reject config with invalid lambda', () => {
      const invalidConfig = {
        ...DEFAULT_RANKING_CONFIG,
        diversification: {
          ...DEFAULT_RANKING_CONFIG.diversification,
          lambda: 1.5, // Invalid: > 1.0
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(invalidConfig, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      const config = service.getConfig();

      // Should fallback to default
      expect(config).toEqual(DEFAULT_RANKING_CONFIG);
    });

    it('should reject config with candidateLimit out of range', () => {
      const invalidConfig = {
        ...DEFAULT_RANKING_CONFIG,
        performance: {
          ...DEFAULT_RANKING_CONFIG.performance,
          candidateLimit: 5, // Invalid: < 10
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(invalidConfig, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      const config = service.getConfig();

      // Should fallback to default
      expect(config).toEqual(DEFAULT_RANKING_CONFIG);
    });

    it('should reject config with timeoutMs out of range', () => {
      const invalidConfig = {
        ...DEFAULT_RANKING_CONFIG,
        performance: {
          ...DEFAULT_RANKING_CONFIG.performance,
          timeoutMs: 50, // Invalid: < 100
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(invalidConfig, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      const config = service.getConfig();

      // Should fallback to default
      expect(config).toEqual(DEFAULT_RANKING_CONFIG);
    });
  });

  describe('Extreme weight detection', () => {
    it('should detect alpha = 0', () => {
      const extremeConfig: RankingConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          ...DEFAULT_RANKING_CONFIG.fusion,
          alpha: 0,
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(extremeConfig, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      const warnings = service.getWarnings();

      expect(warnings).toContain('Extreme weight detected: alpha = 0 (lexical search disabled)');
    });

    it('should detect beta = 0', () => {
      const extremeConfig: RankingConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          ...DEFAULT_RANKING_CONFIG.fusion,
          beta: 0,
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(extremeConfig, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      const warnings = service.getWarnings();

      expect(warnings).toContain('Extreme weight detected: beta = 0 (vector search disabled)');
    });

    it('should detect alpha > 0.9', () => {
      const extremeConfig: RankingConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          ...DEFAULT_RANKING_CONFIG.fusion,
          alpha: 0.95,
          beta: 0.05,
          gamma: 0, // Set gamma=0 so sum = 1.0
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(extremeConfig, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      const warnings = service.getWarnings();

      expect(warnings).toContain('Extreme weight detected: alpha > 0.9 (lexical heavily favored)');
    });

    it('should detect beta > 0.9', () => {
      const extremeConfig: RankingConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          ...DEFAULT_RANKING_CONFIG.fusion,
          alpha: 0.05,
          beta: 0.95,
          gamma: 0, // Set gamma=0 so sum = 1.0
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(extremeConfig, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      const warnings = service.getWarnings();

      expect(warnings).toContain('Extreme weight detected: beta > 0.9 (vector heavily favored)');
    });

    it('should not flag normal weights', () => {
      const service = new ConfigurationService();
      const warnings = service.getWarnings();

      expect(warnings).toHaveLength(0);
    });

    it('should not flag weights at boundary', () => {
      const boundaryConfig: RankingConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          ...DEFAULT_RANKING_CONFIG.fusion,
          alpha: 0.9,
          beta: 0.1,
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(boundaryConfig, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      const warnings = service.getWarnings();

      // 0.9 is not > 0.9, so no warning
      expect(warnings).toHaveLength(0);
    });
  });

  describe('Hot-reload functionality', () => {
    it('should reload config when file changes', async () => {
      const initialConfig: RankingConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          ...DEFAULT_RANKING_CONFIG.fusion,
          alpha: 0.5,
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(initialConfig, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      service.startWatching();

      expect(service.getConfig().fusion.alpha).toBe(0.5);

      // Wait a bit, then update config
      await new Promise(resolve => setTimeout(resolve, 100));

      const updatedConfig: RankingConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          ...DEFAULT_RANKING_CONFIG.fusion,
          alpha: 0.8,
          beta: 0.2,
          gamma: 0, // Set gamma=0 so sum = 1.0
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(updatedConfig, null, 2));

      // Wait for file watcher to detect change (debounced)
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(service.getConfig().fusion.alpha).toBe(0.8);

      service.stopWatching();
    });

    it('should fallback to previous config on validation error during reload', async () => {
      const validConfig: RankingConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          ...DEFAULT_RANKING_CONFIG.fusion,
          alpha: 0.5,
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(validConfig, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      service.startWatching();

      expect(service.getConfig().fusion.alpha).toBe(0.5);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Write invalid config
      const invalidConfig = {
        ...DEFAULT_RANKING_CONFIG,
        fusion: {
          ...DEFAULT_RANKING_CONFIG.fusion,
          alpha: 2.0, // Invalid
        }
      };

      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(invalidConfig, null, 2));

      await new Promise(resolve => setTimeout(resolve, 200));

      // Should keep previous valid config
      expect(service.getConfig().fusion.alpha).toBe(0.5);

      service.stopWatching();
    });

    it('should debounce rapid file changes', async () => {
      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(DEFAULT_RANKING_CONFIG, null, 2));

      const service = new ConfigurationService(TEST_CONFIG_PATH);
      service.startWatching();

      let reloadCount = 0;
      service.onConfigChange(() => {
        reloadCount++;
      });

      // Rapid successive writes
      for (let i = 0; i < 5; i++) {
        const config: RankingConfig = {
          ...DEFAULT_RANKING_CONFIG,
          fusion: {
            ...DEFAULT_RANKING_CONFIG.fusion,
            alpha: 0.5 + i * 0.01,
          }
        };
        writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have debounced to 1-2 reloads instead of 5
      expect(reloadCount).toBeLessThan(5);

      service.stopWatching();
    });
  });
});
