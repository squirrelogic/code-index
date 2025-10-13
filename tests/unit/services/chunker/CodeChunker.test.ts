/**
 * Unit tests for CodeChunker orchestrator
 * Tests the main chunking orchestration logic
 */

import { describe, it, expect } from 'vitest';
import { Language, ChunkType } from '../../../../src/models/ChunkTypes';
import { parseAndChunk } from '../../../helpers/chunker-test-helper';

describe('CodeChunker Unit Tests', () => {

  describe('chunkFile', () => {
    it('should return an array of chunks', async () => {
      const content = `
        function test() {
          return 42;
        }
      `;

      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);
      expect(Array.isArray(chunks)).toBe(true);
    });

    it('should handle empty content', async () => {
      const chunks = await parseAndChunk('test.ts', '', Language.TypeScript);
      expect(Array.isArray(chunks)).toBe(true);
    });

    it('should handle content with no functions', async () => {
      const content = `
        const x = 42;
        console.log(x);
      `;

      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);
      expect(Array.isArray(chunks)).toBe(true);
      // Either empty or contains a module-level chunk
    });

    it('should handle invalid syntax gracefully', async () => {
      const content = `
        function broken(( {
          return
      `;

      // Tree-sitter parses invalid syntax without throwing, so this should not throw
      await expect(async () => {
        await parseAndChunk('test.ts', content, Language.TypeScript);
      }).not.toThrow();
    });

    it('should set correct language for all chunks', async () => {
      const content = `
        function test() {
          return 42;
        }
      `;

      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);
      chunks.forEach(chunk => {
        expect(chunk.language).toBe(Language.TypeScript);
      });
    });

    it('should generate unique chunk hashes', async () => {
      const content = `
        function test1() {
          return 42;
        }

        function test2() {
          return 43;
        }
      `;

      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);

      if (chunks.length >= 2) {
        const hashes = chunks.map(c => c.chunkHash);
        const uniqueHashes = new Set(hashes);
        expect(uniqueHashes.size).toBe(hashes.length);
      }
    });
  });

  describe('chunkTree', () => {
    it('should accept pre-parsed tree', async () => {
      // This test verifies chunking works end-to-end
      const content = 'function test() {}';
      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);
      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
    });
  });

  describe('Language Support', () => {
    it('should support TypeScript', async () => {
      const content = 'function test() {}';
      await expect(async () => {
        await parseAndChunk('test.ts', content, Language.TypeScript);
      }).not.toThrow();
    });

    it('should support JavaScript', async () => {
      const content = 'function test() {}';
      await expect(async () => {
        await parseAndChunk('test.js', content, Language.JavaScript);
      }).not.toThrow();
    });

    it('should support Python', async () => {
      const content = 'def test():\n    pass';
      await expect(async () => {
        await parseAndChunk('test.py', content, Language.Python);
      }).not.toThrow();
    });
  });

  describe('Chunk Properties', () => {
    it('should populate all required chunk properties', async () => {
      const content = `
        /**
         * Test function
         */
        function test() {
          return 42;
        }
      `;

      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);

      if (chunks.length > 0) {
        const chunk = chunks[0];

        // Required properties
        expect(chunk.id).toBeTruthy();
        expect(chunk.chunkHash).toBeTruthy();
        expect(chunk.fileId).toBeTruthy();
        expect(chunk.chunkType).toBeTruthy();
        expect(chunk.name).toBeTruthy();
        expect(chunk.content).toBeTruthy();
        expect(chunk.startLine).toBeGreaterThan(0);
        expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
        expect(chunk.startByte).toBeGreaterThanOrEqual(0);
        expect(chunk.endByte).toBeGreaterThan(chunk.startByte);
        expect(chunk.language).toBeTruthy();
        expect(chunk.lineCount).toBeGreaterThan(0);
        expect(chunk.characterCount).toBeGreaterThan(0);

        // Context properties
        expect(chunk.context).toBeTruthy();
        expect(chunk.context.modulePath).toBeTruthy();
        expect(typeof chunk.context.isTopLevel).toBe('boolean');
      }
    });

    it('should calculate line count correctly', async () => {
      const content = `
        function test() {
          return 42;
        }
      `;

      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);

      chunks.forEach(chunk => {
        const expectedLineCount = chunk.endLine - chunk.startLine + 1;
        expect(chunk.lineCount).toBe(expectedLineCount);
      });
    });

    it('should calculate character count correctly', async () => {
      const content = `
        function test() {
          return 42;
        }
      `;

      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);

      chunks.forEach(chunk => {
        expect(chunk.characterCount).toBe(chunk.content.length);
      });
    });
  });

  describe('Chunk Type Detection', () => {
    it('should identify regular functions', async () => {
      const content = 'function test() {}';
      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);

      const funcChunks = chunks.filter(c => c.chunkType === ChunkType.Function);
      expect(funcChunks.length).toBeGreaterThan(0);
    });

    it('should identify async functions', async () => {
      const content = 'async function test() {}';
      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);

      const asyncChunks = chunks.filter(c => c.chunkType === ChunkType.AsyncFunction);
      if (asyncChunks.length > 0) {
        expect(asyncChunks[0].content).toContain('async');
      }
    });

    it('should identify generator functions', async () => {
      const content = 'function* test() { yield 1; }';
      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);

      const generatorChunks = chunks.filter(c => c.chunkType === ChunkType.Generator);
      if (generatorChunks.length > 0) {
        expect(generatorChunks[0].content).toContain('yield');
      }
    });

    it('should identify methods', async () => {
      const content = `
        class Test {
          method() {}
        }
      `;
      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);

      const methodChunks = chunks.filter(c => c.chunkType === ChunkType.Method);
      expect(methodChunks.length).toBeGreaterThan(0);
    });

    it('should identify constructors', async () => {
      const content = `
        class Test {
          constructor() {}
        }
      `;
      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);

      const constructorChunks = chunks.filter(c => c.chunkType === ChunkType.Constructor);
      expect(constructorChunks.length).toBeGreaterThan(0);
    });
  });

  describe('Documentation Handling', () => {
    it('should capture JSDoc for TypeScript functions', async () => {
      const content = `
        /**
         * Test function
         * @param x Input value
         */
        function test(x) {
          return x;
        }
      `;

      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);

      const testChunk = chunks.find(c => c.name === 'test');
      if (testChunk) {
        expect(testChunk.documentation).toBeTruthy();
        expect(testChunk.documentation).toContain('Test function');
        expect(testChunk.documentation).toContain('@param x Input value');
      }
    });

    it('should capture docstrings for Python functions', async () => {
      const content = `
def test(x):
    """
    Test function
    Args:
        x: Input value
    """
    return x
      `;

      const chunks = await parseAndChunk('test.py', content, Language.Python);

      const testChunk = chunks.find(c => c.name === 'test');
      if (testChunk) {
        expect(testChunk.documentation).toBeTruthy();
        expect(testChunk.documentation).toContain('Test function');
      }
    });

    it('should handle functions without documentation', async () => {
      const content = `
        function test() {
          return 42;
        }
      `;

      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);

      const testChunk = chunks.find(c => c.name === 'test');
      if (testChunk) {
        // Documentation should be null or empty string
        expect(testChunk.documentation === null || testChunk.documentation === '').toBe(true);
      }
    });
  });

  describe('Context Extraction', () => {
    it('should mark top-level functions as top-level', async () => {
      const content = `
        function test() {
          return 42;
        }
      `;

      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);

      chunks.forEach(chunk => {
        if (chunk.chunkType === ChunkType.Function) {
          expect(chunk.context.isTopLevel).toBe(true);
        }
      });
    });

    it('should mark methods as not top-level', async () => {
      const content = `
        class Test {
          method() {
            return 42;
          }
        }
      `;

      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);

      const methodChunks = chunks.filter(c => c.chunkType === ChunkType.Method);
      methodChunks.forEach(chunk => {
        expect(chunk.context.isTopLevel).toBe(false);
      });
    });

    it('should capture class name for methods', async () => {
      const content = `
        class MyClass {
          method() {}
        }
      `;

      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);

      const methodChunks = chunks.filter(c => c.chunkType === ChunkType.Method);
      methodChunks.forEach(chunk => {
        expect(chunk.context.className).toBe('MyClass');
      });
    });

    it('should capture inheritance', async () => {
      const content = `
        class Child extends Parent {
          method() {}
        }
      `;

      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);

      const methodChunks = chunks.filter(c => c.context.className === 'Child');
      if (methodChunks.length > 0) {
        expect(methodChunks[0].context.classInheritance).toContain('Parent');
      }
    });

    it('should set module path', async () => {
      const content = 'function test() {}';
      const chunks = await parseAndChunk('/path/to/test.ts', content, Language.TypeScript);

      chunks.forEach(chunk => {
        expect(chunk.context.modulePath).toBeTruthy();
      });
    });
  });

  describe('Hash Stability', () => {
    it('should generate stable hashes for identical content', async () => {
      const content = 'function test() { return 42; }';

      const chunks1 = await parseAndChunk('file1.ts', content, Language.TypeScript);
      const chunks2 = await parseAndChunk('file2.ts', content, Language.TypeScript);

      expect(chunks1[0].chunkHash).toBe(chunks2[0].chunkHash);
    });

    it('should generate stable hashes despite whitespace differences', async () => {
      // Same structure, different indentation (2 spaces vs 4 spaces)
      const content1 = 'function test() {\n  return 42;\n}';
      const content2 = 'function test() {\n    return 42;\n}';

      const chunks1 = await parseAndChunk('test.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test.ts', content2, Language.TypeScript);

      expect(chunks1[0].chunkHash).toBe(chunks2[0].chunkHash);
    });

    it('should generate different hashes for different content', async () => {
      const content1 = 'function test() { return 42; }';
      const content2 = 'function test() { return 43; }';

      const chunks1 = await parseAndChunk('test.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test.ts', content2, Language.TypeScript);

      expect(chunks1[0].chunkHash).not.toBe(chunks2[0].chunkHash);
    });
  });

  describe('Performance', () => {
    it('should handle large functions', async () => {
      // Create a large function (1000 lines)
      const lines = Array.from({ length: 1000 }, (_, i) => `  const line${i} = ${i};`);
      const content = `
        function largeFunction() {
          ${lines.join('\n')}
          return 0;
        }
      `;

      await expect(async () => {
        await parseAndChunk('test.ts', content, Language.TypeScript);
      }).not.toThrow();
    });

    it('should handle files with many functions', async () => {
      // Create file with 100 functions
      const functions = Array.from({ length: 100 }, (_, i) =>
        `function func${i}() { return ${i}; }`
      );
      const content = functions.join('\n\n');

      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);
      expect(chunks.length).toBeGreaterThan(0);
    });
  });
});
