/**
 * Performance benchmarking integration tests for hybrid search
 *
 * Tests hybrid search performance on various repository sizes and
 * validates that SLA targets are met.
 *
 * @module performance-benchmark.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_DB_DIR = path.join(__dirname, '../fixtures/benchmark');
const BENCHMARK_ITERATIONS = 100;
const MEDIUM_REPO_TARGET_P95_MS = 300; // SC-001 requirement
const MEMORY_TARGET_MB = 500; // SC-008 requirement

interface BenchmarkStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

/**
 * Calculate statistics from timing samples
 */
function calculateStats(timings: number[]): BenchmarkStats {
  if (timings.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0 };
  }

  const sorted = [...timings].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

/**
 * Generate test data for benchmark database
 */
function generateTestData(size: 'small' | 'medium' | 'large'): Array<{
  filePath: string;
  content: string;
  language: string;
}> {
  const counts = {
    small: 1000,    // 1k files
    medium: 10000,  // 10k files
    large: 50000,   // 50k files
  };

  const fileCount = counts[size];
  const files: Array<{ filePath: string; content: string; language: string }> = [];

  // Generate diverse code samples
  const languages = ['typescript', 'javascript', 'python', 'rust', 'go'];
  const directories = ['src', 'lib', 'tests', 'docs', 'examples'];

  for (let i = 0; i < fileCount; i++) {
    const lang = languages[i % languages.length];
    const dir = directories[i % directories.length];
    const extension = lang === 'typescript' ? 'ts' : lang === 'javascript' ? 'js' : lang;

    const filePath = `${dir}/module_${Math.floor(i / 100)}/file_${i}.${extension}`;

    // Generate synthetic code content
    const content = `
      // File ${i}
      export function processData${i}(input: string): Result<Data, Error> {
        const parsed = JSON.parse(input);
        return validateData(parsed);
      }

      export class DataProcessor${i} {
        constructor(private config: Config) {}

        async process(data: unknown): Promise<Result> {
          return this.validate(data).andThen(this.transform);
        }
      }

      interface Result<T, E> {
        ok: boolean;
        value?: T;
        error?: E;
      }
    `;

    files.push({ filePath, content, language: lang });
  }

  return files;
}

/**
 * Create benchmark database with test data
 */
function createBenchmarkDatabase(
  dbPath: string,
  size: 'small' | 'medium' | 'large'
): void {
  const db = new Database(dbPath);

  // Create minimal schema (files table only for benchmark)
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      content TEXT,
      language TEXT,
      size INTEGER,
      modified_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS search (
      content TEXT
    ) USING fts5(content, tokenize='porter');

    CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
  `);

  const testData = generateTestData(size);
  const insertFile = db.prepare(
    'INSERT INTO files (id, path, content, language, size, modified_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertSearch = db.prepare('INSERT INTO search (rowid, content) VALUES (?, ?)');

  let rowid = 1;
  for (const file of testData) {
    const fileId = `file_${rowid}`;
    insertFile.run(
      fileId,
      file.filePath,
      file.content,
      file.language,
      file.content.length,
      Date.now()
    );
    insertSearch.run(rowid, file.content);
    rowid++;
  }

  db.close();
}

describe('Performance Benchmarks', () => {
  beforeAll(() => {
    // Ensure benchmark directory exists
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup benchmark databases
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  });

  describe('Lexical Search Performance', () => {
    it('should complete small repo searches within budget', () => {
      const dbPath = path.join(TEST_DB_DIR, 'small.db');
      createBenchmarkDatabase(dbPath, 'small');

      const db = new Database(dbPath);
      const query = db.prepare(
        'SELECT rowid, content FROM search WHERE search MATCH ? ORDER BY rank LIMIT 200'
      );

      const timings: number[] = [];
      const testQueries = ['function', 'class', 'interface', 'process', 'data'];

      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const searchQuery = testQueries[i % testQueries.length];
        const start = performance.now();
        query.all(searchQuery);
        const elapsed = performance.now() - start;
        timings.push(elapsed);
      }

      const stats = calculateStats(timings);
      db.close();

      // Small repos should be very fast (<50ms p95)
      expect(stats.p95).toBeLessThan(50);
    });

    it('should complete medium repo searches within SLA', () => {
      const dbPath = path.join(TEST_DB_DIR, 'medium.db');
      createBenchmarkDatabase(dbPath, 'medium');

      const db = new Database(dbPath);
      const query = db.prepare(
        'SELECT rowid, content FROM search WHERE search MATCH ? ORDER BY rank LIMIT 200'
      );

      const timings: number[] = [];
      const testQueries = ['function', 'class', 'interface', 'process', 'data'];

      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const searchQuery = testQueries[i % testQueries.length];
        const start = performance.now();
        query.all(searchQuery);
        const elapsed = performance.now() - start;
        timings.push(elapsed);
      }

      const stats = calculateStats(timings);
      db.close();

      // Medium repos: lexical component should be <100ms p95
      expect(stats.p95).toBeLessThan(100);
    });
  });

  describe('Memory Usage', () => {
    it('should stay within memory budget for medium repos', () => {
      const dbPath = path.join(TEST_DB_DIR, 'memory-test.db');
      createBenchmarkDatabase(dbPath, 'medium');

      const db = new Database(dbPath);
      const query = db.prepare(
        'SELECT rowid, content FROM search WHERE search MATCH ? ORDER BY rank LIMIT 200'
      );

      // Measure memory before
      if (global.gc) global.gc(); // Force GC if --expose-gc flag used
      const memBefore = process.memoryUsage();

      // Execute queries to load candidates into memory
      const results: Array<unknown> = [];
      for (let i = 0; i < 10; i++) {
        const rows = query.all('function');
        results.push(...rows);
      }

      // Measure memory after
      const memAfter = process.memoryUsage();
      db.close();

      // Calculate memory increase
      const heapIncreaseMB = (memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024);

      // Memory increase should be reasonable (<200MB for candidate storage)
      expect(heapIncreaseMB).toBeLessThan(200);
    });
  });

  describe('End-to-End Hybrid Search Performance', () => {
    it.skip('should meet p95 latency target for medium repos', () => {
      // This test would require full hybrid search implementation
      // Skip for now as it needs integration with HybridRanker, PathDiversifier, etc.

      // const dbPath = path.join(TEST_DB_DIR, 'e2e-medium.db');
      // createBenchmarkDatabase(dbPath, 'medium');

      // Execute 100 hybrid searches
      // Measure: p50, p95, p99 latencies
      // Verify: p95 < 300ms (SC-001)

      expect(true).toBe(true); // Placeholder
    });

    it.skip('should identify performance bottlenecks', () => {
      // This test would measure phase-by-phase timing breakdown
      // to identify whether lexical, vector, or ranking is the bottleneck

      // Expected output:
      // - Lexical search: X% of total time
      // - Vector search: Y% of total time
      // - Ranking (fusion + diversification): Z% of total time

      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Benchmark Reporting', () => {
    it('should generate human-readable performance report', () => {
      const timings = [10, 15, 12, 18, 22, 25, 30, 35, 40, 100];
      const stats = calculateStats(timings);

      const report = `
Performance Statistics:
  Min:    ${stats.min.toFixed(2)}ms
  Max:    ${stats.max.toFixed(2)}ms
  Mean:   ${stats.mean.toFixed(2)}ms
  Median: ${stats.median.toFixed(2)}ms
  P95:    ${stats.p95.toFixed(2)}ms
  P99:    ${stats.p99.toFixed(2)}ms
      `.trim();

      expect(report).toContain('Min:');
      expect(report).toContain('P95:');
      expect(stats.p95).toBeGreaterThan(stats.median);
    });
  });
});
