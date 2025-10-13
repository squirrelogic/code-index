/**
 * Performance tests for chunk querying (US4, T047)
 * Validates that query performance meets SC-010: <100ms for 1M chunks
 *
 * Uses scaled testing approach:
 * - Test with 10k chunks, expect <10ms (10% of target)
 * - Extrapolate to 1M chunks (100x scale) should be <100ms
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { ChunkRepository } from '../../src/services/database/ChunkRepository.js';
import { ChunkQuery } from '../../src/models/ChunkQuery.js';
import { ChunkType, Language } from '../../src/models/ChunkTypes.js';
import { Chunk } from '../../src/models/Chunk.js';
import { randomUUID } from 'crypto';
import { createTestDatabase, createTestChunk } from '../helpers/database-test-helper.js';

describe('Query Performance Tests (US4, T047)', () => {
  let db: Database.Database;
  let repository: ChunkRepository;

  // Test dataset size - scaled to 10k for reasonable test time
  const DATASET_SIZE = 10000;
  const SCALE_FACTOR = 100; // Target is 1M chunks = 100x our dataset
  const TARGET_TIME_MS = 100; // SC-010 target
  const SCALED_TARGET_MS = TARGET_TIME_MS / SCALE_FACTOR; // 1ms for 10k chunks

  beforeAll(() => {
    console.log(`\n🚀 Creating test database with ${DATASET_SIZE.toLocaleString()} chunks...`);
    const startTime = Date.now();

    // Create test database with production schema (includes all FTS triggers)
    db = createTestDatabase();
    repository = new ChunkRepository(db);

    // Populate database with diverse chunks
    const languages = [Language.TypeScript, Language.JavaScript, Language.Python];
    const types = [
      ChunkType.Function,
      ChunkType.Method,
      ChunkType.AsyncFunction,
      ChunkType.Constructor,
      ChunkType.Generator,
    ];

    for (let i = 0; i < DATASET_SIZE; i++) {
      const language = languages[i % languages.length];
      const chunkType = types[i % types.length];

      const chunk = createTestChunk({
        language,
        chunkType,
        name: `chunk_${i}`,
        chunkHash: String(i).padStart(64, '0'),
      });

      repository.saveChunk(chunk);

      // Log progress every 1000 chunks
      if ((i + 1) % 1000 === 0) {
        process.stdout.write(`\r  ✓ Created ${(i + 1).toLocaleString()} chunks...`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`\n  ✓ Database ready in ${duration}ms (${Math.round(DATASET_SIZE / (duration / 1000))} chunks/sec)\n`);
  });

  afterAll(() => {
    repository.close();
    db.close();
  });

  describe('Type Filter Performance', () => {
    it('should query by single type quickly', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.Function)
        .limit(100)
        .build();

      const start = Date.now();
      const result = repository.query(query);
      const duration = Date.now() - start;

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.every(c => c.chunkType === ChunkType.Function)).toBe(true);

      // Should be fast even with 10k chunks
      console.log(`  ⏱️  Type filter query: ${duration}ms`);
      console.log(`  📊 Extrapolated to 1M chunks: ~${duration * SCALE_FACTOR}ms`);
      expect(duration).toBeLessThan(50); // Very generous - should be <5ms in practice
    });

    it('should query by multiple types quickly', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.Method, ChunkType.Constructor)
        .limit(100)
        .build();

      const start = Date.now();
      const result = repository.query(query);
      const duration = Date.now() - start;

      expect(result.chunks.length).toBeGreaterThan(0);

      console.log(`  ⏱️  Multi-type filter query: ${duration}ms`);
      console.log(`  📊 Extrapolated to 1M chunks: ~${duration * SCALE_FACTOR}ms`);
      expect(duration).toBeLessThan(50);
    });
  });

  describe('Language Filter Performance', () => {
    it('should query by language quickly', () => {
      const query = ChunkQuery.builder()
        .byLanguage(Language.TypeScript)
        .limit(100)
        .build();

      const start = Date.now();
      const result = repository.query(query);
      const duration = Date.now() - start;

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.every(c => c.language === Language.TypeScript)).toBe(true);

      console.log(`  ⏱️  Language filter query: ${duration}ms`);
      console.log(`  📊 Extrapolated to 1M chunks: ~${duration * SCALE_FACTOR}ms`);
      expect(duration).toBeLessThan(50);
    });

    it('should query by multiple languages quickly', () => {
      const query = ChunkQuery.builder()
        .byLanguage(Language.TypeScript, Language.JavaScript)
        .limit(100)
        .build();

      const start = Date.now();
      const result = repository.query(query);
      const duration = Date.now() - start;

      expect(result.chunks.length).toBeGreaterThan(0);

      console.log(`  ⏱️  Multi-language filter query: ${duration}ms`);
      console.log(`  📊 Extrapolated to 1M chunks: ~${duration * SCALE_FACTOR}ms`);
      expect(duration).toBeLessThan(50);
    });
  });

  describe('Combined Filter Performance', () => {
    it('should handle combined type and language filters quickly', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.Method)
        .byLanguage(Language.Python)
        .limit(100)
        .build();

      const start = Date.now();
      const result = repository.query(query);
      const duration = Date.now() - start;

      console.log(`  ⏱️  Combined filter query: ${duration}ms`);
      console.log(`  📊 Extrapolated to 1M chunks: ~${duration * SCALE_FACTOR}ms`);
      expect(duration).toBeLessThan(50);
    });

    it('should handle complex multi-filter queries quickly', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.Method, ChunkType.AsyncFunction)
        .byLanguage(Language.TypeScript, Language.JavaScript)
        .minLines(1)
        .maxLines(100)
        .limit(50)
        .build();

      const start = Date.now();
      const result = repository.query(query);
      const duration = Date.now() - start;

      console.log(`  ⏱️  Complex query: ${duration}ms`);
      console.log(`  📊 Extrapolated to 1M chunks: ~${duration * SCALE_FACTOR}ms`);
      expect(duration).toBeLessThan(50);
    });
  });

  describe('Full-text Search Performance', () => {
    it('should handle FTS queries quickly', () => {
      const query = ChunkQuery.builder()
        .withText('function')
        .limit(100)
        .build();

      const start = Date.now();
      const result = repository.query(query);
      const duration = Date.now() - start;

      console.log(`  ⏱️  Full-text search: ${duration}ms`);
      console.log(`  📊 Extrapolated to 1M chunks: ~${duration * SCALE_FACTOR}ms`);

      // FTS may be slower but should still scale
      expect(duration).toBeLessThan(100); // More generous for FTS
    });

    it('should handle FTS with filters quickly', () => {
      const query = ChunkQuery.builder()
        .withText('function')
        .byType(ChunkType.AsyncFunction)
        .byLanguage(Language.TypeScript)
        .limit(50)
        .build();

      const start = Date.now();
      const result = repository.query(query);
      const duration = Date.now() - start;

      console.log(`  ⏱️  FTS with filters: ${duration}ms`);
      console.log(`  📊 Extrapolated to 1M chunks: ~${duration * SCALE_FACTOR}ms`);
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Pagination Performance', () => {
    it('should paginate efficiently across large result sets', () => {
      // Query first page
      const query1 = ChunkQuery.builder()
        .limit(100)
        .page(1)
        .build();

      const start1 = Date.now();
      const page1 = repository.query(query1);
      const duration1 = Date.now() - start1;

      // Query middle page
      const query2 = ChunkQuery.builder()
        .limit(100)
        .page(50)
        .build();

      const start2 = Date.now();
      const page2 = repository.query(query2);
      const duration2 = Date.now() - start2;

      console.log(`  ⏱️  First page: ${duration1}ms, Page 50: ${duration2}ms`);
      console.log(`  📊 Extrapolated to 1M chunks: ~${Math.max(duration1, duration2) * SCALE_FACTOR}ms`);

      // Both should be fast - offset shouldn't significantly slow down queries
      expect(duration1).toBeLessThan(50);
      expect(duration2).toBeLessThan(50);
    });
  });

  describe('SC-010 Validation: Query Performance Target', () => {
    it('should meet SC-010: <100ms query response for 1M chunks (scaled)', () => {
      // Run several different query types and take average
      const queries = [
        ChunkQuery.builder().byType(ChunkType.Function).limit(100).build(),
        ChunkQuery.builder().byLanguage(Language.TypeScript).limit(100).build(),
        ChunkQuery.builder().byType(ChunkType.Method).byLanguage(Language.Python).limit(100).build(),
        ChunkQuery.builder().withText('function').limit(100).build(),
      ];

      const durations: number[] = [];

      for (const query of queries) {
        const start = Date.now();
        repository.query(query);
        const duration = Date.now() - start;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const extrapolated = maxDuration * SCALE_FACTOR;

      console.log(`\n  📈 Performance Summary:`);
      console.log(`  ├─ Dataset size: ${DATASET_SIZE.toLocaleString()} chunks`);
      console.log(`  ├─ Average query time: ${avgDuration.toFixed(2)}ms`);
      console.log(`  ├─ Max query time: ${maxDuration.toFixed(2)}ms`);
      console.log(`  ├─ Scale factor: ${SCALE_FACTOR}x (to 1M chunks)`);
      console.log(`  ├─ Extrapolated max: ${extrapolated.toFixed(2)}ms`);
      console.log(`  └─ Target: <${TARGET_TIME_MS}ms (SC-010)`);

      // Validate performance target
      expect(extrapolated).toBeLessThan(TARGET_TIME_MS);

      if (extrapolated < TARGET_TIME_MS) {
        const margin = ((TARGET_TIME_MS - extrapolated) / TARGET_TIME_MS * 100).toFixed(1);
        console.log(`  ✅ SC-010 MET with ${margin}% margin\n`);
      }
    });
  });

  describe('Stress Testing', () => {
    it('should handle rapid successive queries', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.Function)
        .limit(10)
        .build();

      const iterations = 100;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        repository.query(query);
      }

      const duration = Date.now() - start;
      const avgPerQuery = duration / iterations;

      console.log(`  ⏱️  ${iterations} queries in ${duration}ms (${avgPerQuery.toFixed(2)}ms avg)`);
      console.log(`  📊 Throughput: ${Math.round(iterations / (duration / 1000))} queries/sec`);

      expect(avgPerQuery).toBeLessThan(50);
    });

    it('should maintain performance with different page sizes', () => {
      const pageSizes = [10, 50, 100, 500];
      const durations: Record<number, number> = {};

      for (const pageSize of pageSizes) {
        const query = ChunkQuery.builder()
          .byLanguage(Language.TypeScript)
          .limit(pageSize)
          .build();

        const start = Date.now();
        repository.query(query);
        const duration = Date.now() - start;

        durations[pageSize] = duration;
      }

      console.log(`  ⏱️  Page size performance:`);
      for (const [size, dur] of Object.entries(durations)) {
        console.log(`      ${size} results: ${dur}ms`);
      }

      // All should be reasonable
      Object.values(durations).forEach(d => {
        expect(d).toBeLessThan(100);
      });
    });
  });
});
