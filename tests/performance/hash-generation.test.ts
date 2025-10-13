/**
 * Performance tests for hash generation
 * Validates hash generation meets performance targets for chunking
 *
 * Performance target (SC-001):
 * - 10,000 functions/minute = ~17 functions/sec = <60ms per function
 * - Hash generation should be <5ms per function (leaves time for parsing, extraction)
 */

import { describe, it, expect } from 'vitest';
import { ChunkHasher } from '../../src/services/chunker/ChunkHasher';

describe('Hash Generation Performance', () => {
  const hasher = new ChunkHasher();

  // Sample function content for hashing
  const sampleFunctions = [
    // Small function
    `
function add(a: number, b: number): number {
  return a + b;
}
    `,
    // Medium function
    `
function calculateTotal(items: Item[]): number {
  let total = 0;
  for (const item of items) {
    total += item.price * item.quantity;
  }
  return total;
}
    `,
    // Large function
    `
async function processData(data: DataSet): Promise<Result> {
  const validated = await validateData(data);
  const transformed = transformData(validated);
  const enriched = await enrichData(transformed);
  const aggregated = aggregateResults(enriched);
  const sorted = sortResults(aggregated);
  const filtered = filterResults(sorted);
  const formatted = formatResults(filtered);
  const cached = await cacheResults(formatted);
  return cached;
}
    `,
    // Very large function (100+ lines)
    Array.from({ length: 50 }, (_, i) => `  const var${i} = ${i};`).join('\n'),
  ];

  describe('Single hash generation', () => {
    it('should hash small function in <5ms', () => {
      const content = sampleFunctions[0];
      const start = performance.now();
      hasher.generateChunkHash(content);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5); // <5ms
    });

    it('should hash medium function in <5ms', () => {
      const content = sampleFunctions[1];
      const start = performance.now();
      hasher.generateChunkHash(content);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5);
    });

    it('should hash large function in <5ms', () => {
      const content = sampleFunctions[2];
      const start = performance.now();
      hasher.generateChunkHash(content);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5);
    });

    it('should hash very large function in <10ms', () => {
      const content = sampleFunctions[3];
      const start = performance.now();
      hasher.generateChunkHash(content);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10); // Slightly more lenient for very large functions
    });
  });

  describe('Batch hash generation', () => {
    it('should hash 100 functions in <500ms (avg <5ms per function)', () => {
      const functions = Array.from({ length: 100 }, (_, i) =>
        sampleFunctions[i % sampleFunctions.length]
      );

      const start = performance.now();
      for (const func of functions) {
        hasher.generateChunkHash(func);
      }
      const duration = performance.now() - start;

      const avgTimePerFunction = duration / 100;
      console.log(`Average time per function: ${avgTimePerFunction.toFixed(3)}ms`);

      expect(duration).toBeLessThan(500); // <500ms total
      expect(avgTimePerFunction).toBeLessThan(5); // <5ms average
    });

    it('should hash 1,000 functions in <5 seconds (avg <5ms per function)', () => {
      const functions = Array.from({ length: 1000 }, (_, i) =>
        sampleFunctions[i % sampleFunctions.length]
      );

      const start = performance.now();
      for (const func of functions) {
        hasher.generateChunkHash(func);
      }
      const duration = performance.now() - start;

      const avgTimePerFunction = duration / 1000;
      console.log(`Average time per 1,000 functions: ${avgTimePerFunction.toFixed(3)}ms`);

      expect(duration).toBeLessThan(5000); // <5 seconds total
      expect(avgTimePerFunction).toBeLessThan(5); // <5ms average
    });

    it('should meet SC-001 target: 10,000 functions in <60 seconds', () => {
      // This test validates the overall performance target
      // Hash generation should contribute minimal overhead to the 60s budget
      const functions = Array.from({ length: 10000 }, (_, i) =>
        sampleFunctions[i % sampleFunctions.length]
      );

      const start = performance.now();
      for (const func of functions) {
        hasher.generateChunkHash(func);
      }
      const duration = performance.now() - start;

      const avgTimePerFunction = duration / 10000;
      const functionsPerMinute = (60000 / duration) * 10000;

      console.log('\n=== SC-001 Performance Validation ===');
      console.log(`Total time for 10,000 functions: ${(duration / 1000).toFixed(2)}s`);
      console.log(`Average time per function: ${avgTimePerFunction.toFixed(3)}ms`);
      console.log(`Functions per minute: ${functionsPerMinute.toFixed(0)}`);
      console.log(`Target: 10,000 functions/minute`);

      // Hash generation should take much less than 60 seconds
      // This leaves time for parsing, extraction, and database operations
      expect(duration).toBeLessThan(50000); // <50 seconds for just hashing
      expect(avgTimePerFunction).toBeLessThan(5); // <5ms per function
    });
  });

  describe('Normalization performance', () => {
    it('should normalize whitespace in <1ms for typical functions', () => {
      const content = `
        function test(x: number): number {
          if (x > 0) {
            return x * 2;
          }
          return 0;
        }
      `;

      const start = performance.now();
      hasher.normalizeWhitespace(content);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(1); // <1ms
    });

    it('should normalize large content in <5ms', () => {
      const content = Array.from({ length: 1000 }, (_, i) =>
        `  const variable${i} = ${i};`
      ).join('\n');

      const start = performance.now();
      hasher.normalizeWhitespace(content);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5);
    });

    it('should batch normalize 1,000 functions in <1 second', () => {
      const functions = Array.from({ length: 1000 }, (_, i) =>
        sampleFunctions[i % sampleFunctions.length]
      );

      const start = performance.now();
      for (const func of functions) {
        hasher.normalizeWhitespace(func);
      }
      const duration = performance.now() - start;

      const avgTimePerFunction = duration / 1000;
      console.log(`Normalization avg time: ${avgTimePerFunction.toFixed(3)}ms`);

      expect(duration).toBeLessThan(1000); // <1 second
      expect(avgTimePerFunction).toBeLessThan(1); // <1ms average
    });
  });

  describe('Hash validation performance', () => {
    it('should validate hash format in <0.1ms', () => {
      const validHash = hasher.generateChunkHash(sampleFunctions[0]);

      const start = performance.now();
      hasher.isValidHash(validHash);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(0.1); // <0.1ms
    });

    it('should validate 10,000 hashes in <100ms', () => {
      const hashes = Array.from({ length: 10000 }, (_, i) =>
        hasher.generateChunkHash(sampleFunctions[i % sampleFunctions.length])
      );

      const start = performance.now();
      for (const hash of hashes) {
        hasher.isValidHash(hash);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100); // <100ms for 10k validations
    });
  });

  describe('Content comparison performance', () => {
    it('should compare content in <1ms', () => {
      const content1 = sampleFunctions[0];
      const content2 = sampleFunctions[0];

      const start = performance.now();
      hasher.compareChunks(content1, content2);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(1);
    });

    it('should compare 1,000 pairs in <1 second', () => {
      const pairs = Array.from({ length: 1000 }, () => ({
        a: sampleFunctions[0],
        b: sampleFunctions[1],
      }));

      const start = performance.now();
      for (const pair of pairs) {
        hasher.compareChunks(pair.a, pair.b);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Memory efficiency', () => {
    it('should not accumulate memory when hashing many functions', () => {
      // This test ensures no memory leaks in hash generation
      const initialMemory = process.memoryUsage().heapUsed;

      // Hash 10,000 functions
      for (let i = 0; i < 10000; i++) {
        hasher.generateChunkHash(sampleFunctions[i % sampleFunctions.length]);
      }

      // Force garbage collection if available (run with --expose-gc)
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      console.log(`Memory increase after 10k hashes: ${memoryIncrease.toFixed(2)}MB`);

      // Memory increase should be minimal (< 10MB)
      expect(memoryIncrease).toBeLessThan(10);
    });
  });

  describe('Real-world scenario simulation', () => {
    it('should handle mixed function sizes efficiently', () => {
      // Simulate real-world distribution:
      // 70% small functions, 20% medium, 9% large, 1% very large
      const distribution = [
        ...Array(700).fill(sampleFunctions[0]), // small
        ...Array(200).fill(sampleFunctions[1]), // medium
        ...Array(90).fill(sampleFunctions[2]), // large
        ...Array(10).fill(sampleFunctions[3]), // very large
      ];

      const start = performance.now();
      for (const func of distribution) {
        hasher.generateChunkHash(func);
      }
      const duration = performance.now() - start;

      const avgTime = duration / 1000;
      console.log(`Real-world scenario avg: ${avgTime.toFixed(3)}ms per function`);

      expect(duration).toBeLessThan(5000); // <5 seconds for 1000 functions
      expect(avgTime).toBeLessThan(5); // <5ms average
    });
  });

  describe('Hash uniqueness performance', () => {
    it('should generate unique hashes for different content', () => {
      const hashes = new Set<string>();
      const count = 1000;

      const start = performance.now();
      for (let i = 0; i < count; i++) {
        const content = `function test${i}() { return ${i}; }`;
        const hash = hasher.generateChunkHash(content);
        hashes.add(hash);
      }
      const duration = performance.now() - start;

      // All hashes should be unique
      expect(hashes.size).toBe(count);

      // Performance should still be good
      expect(duration).toBeLessThan(5000);
    });
  });
});
