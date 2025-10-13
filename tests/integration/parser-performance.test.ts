/**
 * Performance Benchmarks for Parser (T023)
 *
 * Validates performance requirements from success criteria (SC-001).
 * These tests ensure the parser meets minimum throughput and memory requirements.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../../src/services/parser/index.js';
import { resolve } from 'path';

const FIXTURES_DIR = resolve(__dirname, '../fixtures/parser');

describe('Parser Performance Benchmarks (SC-001)', () => {
  describe('Throughput Requirements', () => {
    it('should parse 1000 lines in less than 1000ms (1000 lines/sec minimum)', async () => {
      const filePath = resolve(FIXTURES_DIR, 'large-file.ts');

      const startTime = Date.now();
      const result = await parse(filePath);
      const duration = Date.now() - startTime;

      // Verify file has at least 1000 lines
      expect(result.metadata.lineCount).toBeGreaterThanOrEqual(1000);

      // Should complete in under 1 second
      expect(duration).toBeLessThan(1000);

      // Calculate actual throughput
      const linesPerSecond = (result.metadata.lineCount / duration) * 1000;
      console.log(`  ✓ Throughput: ${linesPerSecond.toFixed(0)} lines/second`);

      // Should meet minimum requirement
      expect(linesPerSecond).toBeGreaterThanOrEqual(1000);
    });

    it('should parse 10,000 lines in less than 10 seconds', async () => {
      // For this test, we'll parse the large file multiple times to simulate 10k lines
      const filePath = resolve(FIXTURES_DIR, 'large-file.ts');
      let totalLines = 0;
      let totalDuration = 0;

      const startTime = Date.now();

      // Parse multiple times until we reach 10k lines
      while (totalLines < 10000) {
        const result = await parse(filePath);
        totalLines += result.metadata.lineCount;
      }

      totalDuration = Date.now() - startTime;

      // Should complete in under 10 seconds
      expect(totalDuration).toBeLessThan(10000);

      const linesPerSecond = (totalLines / totalDuration) * 1000;
      console.log(`  ✓ Large-scale throughput: ${linesPerSecond.toFixed(0)} lines/second over ${totalLines} lines`);
    });
  });

  describe('Memory Usage (SC-003)', () => {
    it('should use less than 100MB memory for 1MB file', async () => {
      const filePath = resolve(FIXTURES_DIR, 'large-file.ts');

      // Get baseline memory
      if (global.gc) {
        global.gc();
      }
      const memBefore = process.memoryUsage().heapUsed;

      // Parse file
      const result = await parse(filePath);

      // Get memory after parse
      const memAfter = process.memoryUsage().heapUsed;
      const memUsedMB = (memAfter - memBefore) / 1024 / 1024;

      console.log(`  ✓ Memory used: ${memUsedMB.toFixed(2)} MB for ${(result.metadata.fileSize / 1024).toFixed(2)} KB file`);

      // For files under 1MB, memory usage should be reasonable
      // Note: This is a soft check as memory usage depends on many factors
      expect(memUsedMB).toBeLessThan(100);
    });
  });

  describe('Consistency (SC-010)', () => {
    it('should maintain consistent performance across 100 parses', async () => {
      const filePath = resolve(FIXTURES_DIR, 'sample.ts');
      const durations: number[] = [];

      // Parse 100 times
      for (let i = 0; i < 100; i++) {
        const startTime = Date.now();
        await parse(filePath);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      // Calculate statistics
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);
      const variance = durations.reduce((acc, val) => acc + Math.pow(val - avgDuration, 2), 0) / durations.length;
      const stdDev = Math.sqrt(variance);

      console.log(`  ✓ Avg: ${avgDuration.toFixed(2)}ms, Min: ${minDuration}ms, Max: ${maxDuration}ms, StdDev: ${stdDev.toFixed(2)}ms`);

      // Performance should be consistent (standard deviation should be reasonable)
      // For very fast operations (< 1ms), we just verify max is reasonable
      if (minDuration > 0) {
        // Max duration shouldn't be more than 5x the minimum (accounting for outliers)
        expect(maxDuration).toBeLessThanOrEqual(minDuration * 5);
      } else {
        // For sub-millisecond operations, just verify max is reasonable
        expect(maxDuration).toBeLessThan(50);
      }

      // Average should be fast for small files
      expect(avgDuration).toBeLessThan(100); // Small file should parse in <100ms on average
    });
  });

  describe('Success Criteria Validation', () => {
    it('should log all performance metrics for tracking', async () => {
      const filePath = resolve(FIXTURES_DIR, 'large-file.ts');
      const result = await parse(filePath);

      // SC-001: Parsing throughput
      const linesPerSecond = (result.metadata.lineCount / result.metadata.duration) * 1000;
      console.log('\n  Performance Metrics:');
      console.log(`  - Throughput: ${linesPerSecond.toFixed(0)} lines/second`);
      console.log(`  - Duration: ${result.metadata.duration}ms`);
      console.log(`  - Lines: ${result.metadata.lineCount}`);
      console.log(`  - File Size: ${(result.metadata.fileSize / 1024).toFixed(2)} KB`);
      console.log(`  - Symbols Extracted: ${result.symbols.length}`);

      // All metrics should exceed minimums
      expect(linesPerSecond).toBeGreaterThanOrEqual(1000); // SC-001
      expect(result.metadata.duration).toBeLessThan(result.metadata.lineCount); // Should be faster than 1ms per line
      expect(result.symbols.length).toBeGreaterThan(0); // Should extract symbols
    });
  });

  describe('Real-World Performance', () => {
    it('should handle all supported file types efficiently', async () => {
      const files = [
        'sample.ts',
        'sample.tsx',
        'sample.js',
        'sample.jsx',
        'sample.py',
      ];

      const results = [];

      for (const file of files) {
        const filePath = resolve(FIXTURES_DIR, file);
        const startTime = Date.now();
        const result = await parse(filePath);
        const duration = Date.now() - startTime;

        results.push({
          file,
          duration,
          lines: result.metadata.lineCount,
          symbols: result.symbols.length,
        });
      }

      console.log('\n  Cross-Language Performance:');
      for (const { file, duration, lines, symbols } of results) {
        const lps = (lines / duration) * 1000;
        console.log(`  - ${file}: ${duration}ms (${lps.toFixed(0)} L/s, ${symbols} symbols)`);
      }

      // All files should parse quickly
      results.forEach(({ duration }) => {
        expect(duration).toBeLessThan(100); // Small files should be very fast
      });

      // SC-010: Consistent cross-language performance
      // No language should be significantly slower than others
      const durations = results.map(r => r.duration);
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      // For very fast operations, just verify all are reasonable
      if (minDuration > 0) {
        expect(maxDuration).toBeLessThan(minDuration * 10); // Max shouldn't be more than 10x slower
      } else {
        // For sub-millisecond operations, just verify all are fast
        expect(maxDuration).toBeLessThan(50);
      }
    });
  });
});
