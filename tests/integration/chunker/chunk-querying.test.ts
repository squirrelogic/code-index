/**
 * Integration tests for chunk querying (US4)
 * Tests end-to-end chunk queries with realistic data
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { ChunkRepository } from '../../../src/services/database/ChunkRepository.js';
import { CodeChunker } from '../../../src/services/chunker/CodeChunker.js';
import { ChunkQuery } from '../../../src/models/ChunkQuery.js';
import { ChunkType, Language } from '../../../src/models/ChunkTypes.js';
import { TreeSitterParser } from '../../../src/services/parser/TreeSitterParser.js';
import { Chunk } from '../../../src/models/Chunk.js';
import { randomUUID } from 'crypto';
import { createTestDatabase } from '../../helpers/database-test-helper.js';

// Test fixtures with diverse chunk types
const typeScriptFixture = `
/**
 * Regular function
 */
function regularFunction() {
  return 42;
}

/**
 * Async function
 */
async function asyncFunction() {
  return await Promise.resolve(42);
}

/**
 * Generator function
 */
function* generatorFunction() {
  yield 1;
  yield 2;
}

class TestClass {
  /**
   * Constructor
   */
  constructor() {
    this.value = 0;
  }

  /**
   * Regular method
   */
  method() {
    return this.value;
  }

  /**
   * Async method
   */
  async asyncMethod() {
    return await Promise.resolve(this.value);
  }

  /**
   * Property
   */
  property = 42;
}
`;

const javascriptFixture = `
// Async arrow function
const asyncArrow = async () => {
  return await fetch('/api');
};

// Generator function
function* jsGenerator() {
  yield 'a';
  yield 'b';
}

class JSClass {
  constructor(value) {
    this.value = value;
  }

  method() {
    return this.value * 2;
  }
}
`;

const pythonFixture = `
def regular_function():
    """Regular Python function"""
    return 42

async def async_function():
    """Async Python function"""
    return await some_async_call()

class PythonClass:
    def __init__(self):
        """Constructor"""
        self.value = 0

    def method(self):
        """Regular method"""
        return self.value

    async def async_method(self):
        """Async method"""
        return await some_async_call()

    @property
    def property_method(self):
        """Property"""
        return self.value * 2
`;

describe('Chunk Querying Integration Tests (US4)', () => {
  let db: Database.Database;
  let repository: ChunkRepository;
  let parser: TreeSitterParser;
  let chunker: CodeChunker;

  beforeAll(async () => {
    // Create test database with production schema
    db = createTestDatabase();
    repository = new ChunkRepository(db);
    parser = new TreeSitterParser();
    chunker = new CodeChunker(parser);

    // Chunk all fixtures and save to database
    const fixtures = [
      { content: typeScriptFixture, path: '/test/file.ts', language: Language.TypeScript },
      { content: javascriptFixture, path: '/test/file.js', language: Language.JavaScript },
      { content: pythonFixture, path: '/test/file.py', language: Language.Python },
    ];

    for (const fixture of fixtures) {
      const fileId = randomUUID();
      const chunks = await chunker.chunkFile(fixture.path, fixture.content, fixture.language, fileId);

      // Save all chunks
      for (const chunk of chunks) {
        repository.saveChunk(chunk);
      }
    }
  });

  afterAll(() => {
    repository.close();
    db.close();
  });

  describe('Query by Chunk Type', () => {
    it('should query async functions and return only async_function type', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.AsyncFunction)
        .build();

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.every(c => c.chunkType === ChunkType.AsyncFunction)).toBe(true);

      // Should find async functions from TS and Python
      const languages = new Set(result.chunks.map(c => c.language));
      expect(languages.has(Language.TypeScript) || languages.has(Language.Python)).toBe(true);
    });

    it('should query method type and return methods with class context', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.Method)
        .build();

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.every(c => c.chunkType === ChunkType.Method)).toBe(true);

      // All methods should have class context
      expect(result.chunks.every(c => c.context.className !== null)).toBe(true);
    });

    it('should query constructors and return only constructor chunks', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.Constructor)
        .build();

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.every(c => c.chunkType === ChunkType.Constructor)).toBe(true);

      // Constructors should have class context
      expect(result.chunks.every(c => c.context.className !== null)).toBe(true);
    });

    it('should filter by generator type and return only generators', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.Generator)
        .build();

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.every(c => c.chunkType === ChunkType.Generator)).toBe(true);

      // Should contain yield keyword
      expect(result.chunks.every(c => c.content.includes('yield'))).toBe(true);
    });

    it('should query properties and return property chunks with class context', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.Property)
        .build();

      const result = repository.query(query);

      if (result.chunks.length > 0) {
        expect(result.chunks.every(c => c.chunkType === ChunkType.Property)).toBe(true);
        expect(result.chunks.every(c => c.context.className !== null)).toBe(true);
      }
    });

    it('should query multiple types simultaneously', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.Function, ChunkType.AsyncFunction)
        .build();

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.every(c =>
        c.chunkType === ChunkType.Function || c.chunkType === ChunkType.AsyncFunction
      )).toBe(true);
    });
  });

  describe('Query by Language', () => {
    it('should filter TypeScript chunks', () => {
      const query = ChunkQuery.builder()
        .byLanguage(Language.TypeScript)
        .build();

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.every(c => c.language === Language.TypeScript)).toBe(true);
    });

    it('should filter JavaScript chunks', () => {
      const query = ChunkQuery.builder()
        .byLanguage(Language.JavaScript)
        .build();

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.every(c => c.language === Language.JavaScript)).toBe(true);
    });

    it('should filter Python chunks', () => {
      const query = ChunkQuery.builder()
        .byLanguage(Language.Python)
        .build();

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.every(c => c.language === Language.Python)).toBe(true);
    });

    it('should filter by multiple languages', () => {
      const query = ChunkQuery.builder()
        .byLanguage(Language.TypeScript, Language.JavaScript)
        .build();

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.every(c =>
        c.language === Language.TypeScript || c.language === Language.JavaScript
      )).toBe(true);
    });
  });

  describe('Combined Filters', () => {
    it('should combine chunk type and language filters', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.Method)
        .byLanguage(Language.Python)
        .build();

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.every(c =>
        c.chunkType === ChunkType.Method && c.language === Language.Python
      )).toBe(true);
    });

    it('should combine type filter with text search', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.AsyncFunction)
        .withText('async')
        .build();

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.every(c => c.chunkType === ChunkType.AsyncFunction)).toBe(true);
    });

    it('should apply all filters together', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.Method)
        .byLanguage(Language.TypeScript)
        .withText('method')
        .build();

      const result = repository.query(query);

      if (result.chunks.length > 0) {
        expect(result.chunks.every(c =>
          c.chunkType === ChunkType.Method &&
          c.language === Language.TypeScript
        )).toBe(true);
      }
    });
  });

  describe('Full-text Search', () => {
    it('should search by function name', () => {
      const query = ChunkQuery.builder()
        .withText('generator')
        .build();

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.some(c =>
        c.name.toLowerCase().includes('generator') ||
        c.content.toLowerCase().includes('generator')
      )).toBe(true);
    });

    it('should search in content', () => {
      const query = ChunkQuery.builder()
        .withText('yield')
        .build();

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.every(c => c.content.includes('yield'))).toBe(true);
    });

    it('should search in documentation', () => {
      const query = ChunkQuery.builder()
        .withText('Regular')
        .build();

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
    });
  });

  describe('Pagination', () => {
    it('should paginate results', () => {
      const query1 = ChunkQuery.builder()
        .limit(5)
        .page(1)
        .build();

      const page1 = repository.query(query1);

      expect(page1.chunks.length).toBeLessThanOrEqual(5);
      expect(page1.page).toBe(1);

      if (page1.hasMore) {
        const query2 = ChunkQuery.builder()
          .limit(5)
          .page(2)
          .build();

        const page2 = repository.query(query2);
        expect(page2.page).toBe(2);

        // Pages should have different chunks
        const page1Ids = new Set(page1.chunks.map(c => c.id));
        const page2HasDifferent = page2.chunks.some(c => !page1Ids.has(c.id));
        expect(page2HasDifferent).toBe(true);
      }
    });

    it('should report total count correctly', () => {
      const query = ChunkQuery.builder()
        .byLanguage(Language.TypeScript)
        .limit(100) // High limit to get all
        .build();

      const result = repository.query(query);

      expect(result.total).toBe(result.chunks.length);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle queries with no results', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.AsyncFunction)
        .byLanguage(Language.JavaScript)
        .withText('nonexistent_function_name_xyz123')
        .build();

      const result = repository.query(query);

      expect(result.chunks.length).toBe(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle empty query (return all)', () => {
      const query = new ChunkQuery();
      query.limit = 100;

      const result = repository.query(query);

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
    });

    it('should handle query with only pagination', () => {
      const query = ChunkQuery.builder()
        .limit(3)
        .offset(1)
        .build();

      const result = repository.query(query);

      expect(result.chunks.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Result Quality', () => {
    it('should return chunks with all required properties', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.Function)
        .limit(1)
        .build();

      const result = repository.query(query);

      if (result.chunks.length > 0) {
        const chunk = result.chunks[0];

        // Verify all required properties are present
        expect(chunk.id).toBeTruthy();
        expect(chunk.chunkHash).toBeTruthy();
        expect(chunk.fileId).toBeTruthy();
        expect(chunk.chunkType).toBeTruthy();
        expect(chunk.name).toBeTruthy();
        expect(chunk.content).toBeTruthy();
        expect(chunk.language).toBeTruthy();
        expect(chunk.context).toBeTruthy();
        expect(chunk.lineCount).toBeGreaterThan(0);
        expect(chunk.characterCount).toBeGreaterThan(0);
      }
    });

    it('should return methods with class context', () => {
      const query = ChunkQuery.builder()
        .byType(ChunkType.Method)
        .build();

      const result = repository.query(query);

      result.chunks.forEach(chunk => {
        expect(chunk.context.className).toBeTruthy();
        expect(chunk.isMethod()).toBe(true);
      });
    });

    it('should return functions with proper documentation when available', () => {
      const query = ChunkQuery.builder()
        .byLanguage(Language.TypeScript)
        .build();

      const result = repository.query(query);

      const documented = result.chunks.filter(c => c.documentation !== null && c.documentation !== '');
      expect(documented.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Characteristics', () => {
    it('should execute simple queries quickly', () => {
      const start = Date.now();

      const query = ChunkQuery.builder()
        .byType(ChunkType.Function)
        .build();

      repository.query(query);

      const duration = Date.now() - start;

      // Query should complete in under 100ms even with small dataset
      expect(duration).toBeLessThan(100);
    });

    it('should execute complex queries efficiently', () => {
      const start = Date.now();

      const query = ChunkQuery.builder()
        .byType(ChunkType.Method, ChunkType.AsyncMethod)
        .byLanguage(Language.TypeScript, Language.Python)
        .withText('method')
        .limit(10)
        .build();

      repository.query(query);

      const duration = Date.now() - start;

      // Complex query should still be fast
      expect(duration).toBeLessThan(100);
    });
  });
});
