/**
 * Unit tests for ChunkRepository
 * Tests CRUD operations, querying, and filtering
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ChunkRepository } from '../../../../src/services/database/ChunkRepository.js';
import { Chunk } from '../../../../src/models/Chunk.js';
import { ChunkType, Language } from '../../../../src/models/ChunkTypes.js';
import { ChunkQuery } from '../../../../src/models/ChunkQuery.js';
import { randomUUID } from 'crypto';
import { createTestDatabase, createTestChunk } from '../../../helpers/database-test-helper.js';

describe('ChunkRepository Unit Tests', () => {
  let db: Database.Database;
  let repository: ChunkRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repository = new ChunkRepository(db);
  });

  afterEach(() => {
    repository.close();
    db.close();
  });

  describe('saveChunk', () => {
    it('should insert new chunk', () => {
      const chunk = createTestChunk();
      const saved = repository.saveChunk(chunk);

      expect(saved).toBeTruthy();
      expect(saved.id).toBeTruthy();
      expect(saved.chunkHash).toBe(chunk.chunkHash);
    });

    it('should update existing chunk with same hash', () => {
      const chunk = createTestChunk({ name: 'original' });
      repository.saveChunk(chunk);

      // Save again with updated name but same hash
      const updated = createTestChunk({ name: 'updated' });
      updated.chunkHash = chunk.chunkHash; // Keep same hash
      const saved = repository.saveChunk(updated);

      expect(saved.name).toBe('updated');
    });

    it('should detect hash collisions', () => {
      const chunk1 = createTestChunk({ content: 'function a() { return 1; }' });
      repository.saveChunk(chunk1);

      // Different content but same hash (collision)
      const chunk2 = createTestChunk({ content: 'function b() { return 2; }' });
      chunk2.chunkHash = chunk1.chunkHash; // Force collision

      expect(() => {
        repository.saveChunk(chunk2);
      }).toThrow(/Hash collision detected/);
    });
  });

  describe('findByHash', () => {
    it('should find chunk by hash', () => {
      const chunk = createTestChunk();
      repository.saveChunk(chunk);

      const found = repository.findByHash(chunk.chunkHash);
      expect(found).toBeTruthy();
      expect(found?.name).toBe(chunk.name);
    });

    it('should return null for non-existent hash', () => {
      const found = repository.findByHash('b'.repeat(64));
      expect(found).toBeNull();
    });
  });

  describe('findByFileId', () => {
    it('should find all chunks for a file', () => {
      const fileId = randomUUID();
      const chunk1 = createTestChunk({ fileId, name: 'func1', startLine: 1, endLine: 5 });
      const chunk2 = createTestChunk({ fileId, name: 'func2', startLine: 10, endLine: 15 });
      chunk1.chunkHash = 'a'.repeat(64);
      chunk2.chunkHash = 'b'.repeat(64);

      repository.saveChunk(chunk1);
      repository.saveChunk(chunk2);

      const chunks = repository.findByFileId(fileId);
      expect(chunks.length).toBe(2);
      expect(chunks[0].name).toBe('func1'); // Ordered by start_line
      expect(chunks[1].name).toBe('func2');
    });

    it('should return empty array for non-existent file', () => {
      const chunks = repository.findByFileId(randomUUID());
      expect(chunks).toEqual([]);
    });
  });

  describe('query - Language and Type Filtering (T041)', () => {
    beforeEach(() => {
      // Insert test data with different types and languages
      const chunks = [
        // TypeScript chunks
        createTestChunk({
          chunkType: ChunkType.Function,
          language: Language.TypeScript,
          name: 'tsFunction',
        }),
        createTestChunk({
          chunkType: ChunkType.AsyncFunction,
          language: Language.TypeScript,
          name: 'tsAsyncFunc',
        }),
        createTestChunk({
          chunkType: ChunkType.Method,
          language: Language.TypeScript,
          name: 'tsMethod',
        }),
        // JavaScript chunks
        createTestChunk({
          chunkType: ChunkType.Function,
          language: Language.JavaScript,
          name: 'jsFunction',
        }),
        createTestChunk({
          chunkType: ChunkType.Generator,
          language: Language.JavaScript,
          name: 'jsGenerator',
        }),
        // Python chunks
        createTestChunk({
          chunkType: ChunkType.Function,
          language: Language.Python,
          name: 'pyFunction',
        }),
        createTestChunk({
          chunkType: ChunkType.AsyncFunction,
          language: Language.Python,
          name: 'pyAsyncFunc',
        }),
        createTestChunk({
          chunkType: ChunkType.Method,
          language: Language.Python,
          name: 'pyMethod',
        }),
      ];

      // Ensure unique hashes
      chunks.forEach((chunk, i) => {
        chunk.chunkHash = String(i).padStart(64, '0');
        repository.saveChunk(chunk);
      });
    });

    it('should filter by single chunk type', () => {
      const query = new ChunkQuery();
      query.chunkTypes = [ChunkType.AsyncFunction];

      const result = repository.query(query);

      expect(result.chunks.length).toBe(2); // TS and Python async functions
      expect(result.chunks.every(c => c.chunkType === ChunkType.AsyncFunction)).toBe(true);
    });

    it('should filter by multiple chunk types', () => {
      const query = new ChunkQuery();
      query.chunkTypes = [ChunkType.Function, ChunkType.Method];

      const result = repository.query(query);

      expect(result.chunks.length).toBe(5); // 3 functions + 2 methods
      expect(result.chunks.every(c =>
        c.chunkType === ChunkType.Function || c.chunkType === ChunkType.Method
      )).toBe(true);
    });

    it('should filter by single language', () => {
      const query = new ChunkQuery();
      query.languages = [Language.TypeScript];

      const result = repository.query(query);

      expect(result.chunks.length).toBe(3);
      expect(result.chunks.every(c => c.language === Language.TypeScript)).toBe(true);
    });

    it('should filter by multiple languages', () => {
      const query = new ChunkQuery();
      query.languages = [Language.TypeScript, Language.JavaScript];

      const result = repository.query(query);

      expect(result.chunks.length).toBe(5); // 3 TS + 2 JS
      expect(result.chunks.every(c =>
        c.language === Language.TypeScript || c.language === Language.JavaScript
      )).toBe(true);
    });

    it('should combine chunk type and language filters', () => {
      const query = new ChunkQuery();
      query.chunkTypes = [ChunkType.Method];
      query.languages = [Language.Python];

      const result = repository.query(query);

      expect(result.chunks.length).toBe(1);
      expect(result.chunks[0].name).toBe('pyMethod');
      expect(result.chunks[0].chunkType).toBe(ChunkType.Method);
      expect(result.chunks[0].language).toBe(Language.Python);
    });

    it('should return empty results for no matches', () => {
      const query = new ChunkQuery();
      query.chunkTypes = [ChunkType.Constructor]; // No constructors in test data

      const result = repository.query(query);

      expect(result.chunks.length).toBe(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by generator type', () => {
      const query = new ChunkQuery();
      query.chunkTypes = [ChunkType.Generator];

      const result = repository.query(query);

      expect(result.chunks.length).toBe(1);
      expect(result.chunks[0].name).toBe('jsGenerator');
      expect(result.chunks[0].chunkType).toBe(ChunkType.Generator);
    });

    it('should respect pagination with filters', () => {
      const query = new ChunkQuery();
      query.languages = [Language.TypeScript];
      query.limit = 2;
      query.offset = 0;

      const page1 = repository.query(query);
      expect(page1.chunks.length).toBe(2);
      expect(page1.total).toBe(3);
      expect(page1.hasMore).toBe(true);
      expect(page1.page).toBe(1);

      query.offset = 2;
      const page2 = repository.query(query);
      expect(page2.chunks.length).toBe(1);
      expect(page2.hasMore).toBe(false);
      expect(page2.page).toBe(2);
    });

    it('should filter by file ID', () => {
      const fileId = randomUUID();
      const chunk = createTestChunk({ fileId, name: 'specificFile' });
      chunk.chunkHash = 'f'.repeat(64);
      repository.saveChunk(chunk);

      const query = new ChunkQuery();
      query.fileId = fileId;

      const result = repository.query(query);

      expect(result.chunks.length).toBe(1);
      expect(result.chunks[0].name).toBe('specificFile');
    });

    it('should filter by line count range', () => {
      // Create chunks with different line counts
      const shortChunk = createTestChunk({ name: 'short', startLine: 1, endLine: 2 });
      const mediumChunk = createTestChunk({ name: 'medium', startLine: 1, endLine: 10 });
      const longChunk = createTestChunk({ name: 'long', startLine: 1, endLine: 100 });

      shortChunk.chunkHash = 'd'.repeat(64); // hex: 'd' is valid
      mediumChunk.chunkHash = 'e'.repeat(64); // hex: 'e' is valid
      longChunk.chunkHash = 'f'.repeat(64); // hex: 'f' is valid

      repository.saveChunk(shortChunk);
      repository.saveChunk(mediumChunk);
      repository.saveChunk(longChunk);

      // Query for medium-sized chunks
      const query = new ChunkQuery();
      query.minLineCount = 5;
      query.maxLineCount = 50;

      const result = repository.query(query);

      expect(result.chunks.some(c => c.name === 'medium')).toBe(true);
      expect(result.chunks.every(c => c.lineCount >= 5 && c.lineCount <= 50)).toBe(true);
    });
  });

  describe('query - Full-text Search', () => {
    beforeEach(() => {
      const chunks = [
        createTestChunk({
          name: 'calculateSum',
          content: 'function calculateSum(a, b) { return a + b; }',
          documentation: 'Calculates the sum of two numbers',
        }),
        createTestChunk({
          name: 'calculateProduct',
          content: 'function calculateProduct(a, b) { return a * b; }',
          documentation: 'Calculates the product of two numbers',
        }),
        createTestChunk({
          name: 'fetchData',
          content: 'async function fetchData() { return await api.get(); }',
          documentation: 'Fetches data from the API',
        }),
      ];

      chunks.forEach((chunk, i) => {
        chunk.chunkHash = String(i + 100).padStart(64, '0');
        repository.saveChunk(chunk);
      });
    });

    it('should search by function name', () => {
      const query = new ChunkQuery();
      query.searchText = 'calculateSum';

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.some(c => c.name === 'calculateSum')).toBe(true);
    });

    it('should search in content', () => {
      const query = new ChunkQuery();
      query.searchText = 'await';

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.some(c => c.name === 'fetchData')).toBe(true);
    });

    it('should search in documentation', () => {
      const query = new ChunkQuery();
      query.searchText = 'product';

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.some(c => c.name === 'calculateProduct')).toBe(true);
    });

    it('should combine full-text search with type filter', () => {
      const query = new ChunkQuery();
      query.searchText = 'calculate';
      query.chunkTypes = [ChunkType.Function];

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.every(c => c.chunkType === ChunkType.Function)).toBe(true);
    });
  });

  describe('deleteByFileId', () => {
    it('should delete all chunks for a file', () => {
      const fileId = randomUUID();
      const chunk1 = createTestChunk({ fileId });
      const chunk2 = createTestChunk({ fileId });
      chunk1.chunkHash = 'a'.repeat(64);
      chunk2.chunkHash = 'b'.repeat(64);

      repository.saveChunk(chunk1);
      repository.saveChunk(chunk2);

      const deleted = repository.deleteByFileId(fileId);
      expect(deleted).toBe(2);

      const remaining = repository.findByFileId(fileId);
      expect(remaining.length).toBe(0);
    });
  });

  describe('deleteById', () => {
    it('should delete chunk by ID', () => {
      const chunk = createTestChunk();
      repository.saveChunk(chunk);

      const deleted = repository.deleteById(chunk.id);
      expect(deleted).toBe(true);

      const found = repository.findByHash(chunk.chunkHash);
      expect(found).toBeNull();
    });

    it('should return false for non-existent ID', () => {
      const deleted = repository.deleteById(randomUUID());
      expect(deleted).toBe(false);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics for chunks', () => {
      // Add diverse chunks
      const chunks = [
        createTestChunk({ language: Language.TypeScript, chunkType: ChunkType.Function }),
        createTestChunk({ language: Language.TypeScript, chunkType: ChunkType.Method }),
        createTestChunk({ language: Language.JavaScript, chunkType: ChunkType.Function }),
        createTestChunk({ language: Language.Python, chunkType: ChunkType.AsyncFunction }),
      ];

      chunks.forEach((chunk, i) => {
        chunk.chunkHash = String(i + 200).padStart(64, '0');
        repository.saveChunk(chunk);
      });

      const stats = repository.getStatistics();

      expect(stats.totalChunks).toBe(4);
      expect(stats.chunksByLanguage[Language.TypeScript]).toBe(2);
      expect(stats.chunksByLanguage[Language.JavaScript]).toBe(1);
      expect(stats.chunksByLanguage[Language.Python]).toBe(1);
      expect(stats.chunksByType[ChunkType.Function]).toBe(2);
      expect(stats.chunksByType[ChunkType.Method]).toBe(1);
      expect(stats.chunksByType[ChunkType.AsyncFunction]).toBe(1);
      expect(stats.avgChunkSize).toBeGreaterThan(0);
    });

    it('should count large chunks', () => {
      const largeChunk = createTestChunk({ startLine: 1, endLine: 6000 });
      largeChunk.chunkHash = 'c'.repeat(64); // hex: 'c' is valid
      repository.saveChunk(largeChunk);

      const stats = repository.getStatistics();
      expect(stats.largeChunksCount).toBe(1);
    });

    it('should return zeros for empty database', () => {
      const stats = repository.getStatistics();
      expect(stats.totalChunks).toBe(0);
      expect(stats.avgChunkSize).toBe(0);
      expect(stats.largeChunksCount).toBe(0);
    });
  });

  describe('ChunkQuery Builder', () => {
    it('should build query with type filter', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.AsyncFunction)
        .build();

      expect(query.chunkTypes).toContain(ChunkType.AsyncFunction);
    });

    it('should build query with language filter', () => {
      const query = ChunkQuery.builder()
        .byLanguage(Language.TypeScript, Language.JavaScript)
        .build();

      expect(query.languages).toContain(Language.TypeScript);
      expect(query.languages).toContain(Language.JavaScript);
    });

    it('should build query with pagination', () => {
      const query = ChunkQuery.builder()
        .limit(50)
        .page(2)
        .build();

      expect(query.limit).toBe(50);
      expect(query.offset).toBe(50); // Page 2 with limit 50
    });

    it('should build complex query', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.Method, ChunkType.AsyncMethod)
        .byLanguage(Language.Python)
        .withText('database')
        .minLines(10)
        .maxLines(100)
        .limit(20)
        .build();

      expect(query.chunkTypes.length).toBe(2);
      expect(query.languages).toContain(Language.Python);
      expect(query.searchText).toBe('database');
      expect(query.minLineCount).toBe(10);
      expect(query.maxLineCount).toBe(100);
      expect(query.limit).toBe(20);
    });
  });
});
