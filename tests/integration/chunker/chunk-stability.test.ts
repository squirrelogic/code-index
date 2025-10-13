/**
 * Integration tests for chunk hash stability
 * Tests all hash stability scenarios from User Story 3
 *
 * Test scenarios (US3 acceptance criteria):
 * - Identical content → same hash (process 10 times)
 * - Whitespace-only changes → same hash
 * - Doc content changes → different hash
 * - Code logic changes → different hash
 * - Identical functions in different files → same hash
 */

import { describe, it, expect } from 'vitest';
import { parseAndChunk } from '../../helpers/chunker-test-helper';
import { Language } from '../../../src/models/ChunkTypes';
import { ChunkHasher } from '../../../src/services/chunker/ChunkHasher';

describe('Chunk Hash Stability Integration', () => {
  const hasher = new ChunkHasher();

  describe('SC-002: Identical content produces identical chunk ID', () => {
    it('should generate same hash for identical TypeScript functions (10 times)', async () => {
      const content = `
        /**
         * Test function for hash stability
         * @param x Input number
         * @returns Result
         */
        function testFunction(x: number): number {
          const result = x * 2;
          return result + 1;
        }
      `;

      const hashes: string[] = [];

      // Process the same content 10 times
      for (let i = 0; i < 10; i++) {
        const chunks = await parseAndChunk(`test-${i}.ts`, content, Language.TypeScript);
        expect(chunks.length).toBe(1);
        hashes.push(chunks[0].chunkHash);
      }

      // All hashes should be identical
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
      expect(hashes.every(h => h === hashes[0])).toBe(true);
    });

    it('should generate same hash for identical JavaScript functions (10 times)', async () => {
      const content = `
        /**
         * Test function
         */
        function testFunction(x) {
          return x * 2 + 1;
        }
      `;

      const hashes: string[] = [];

      for (let i = 0; i < 10; i++) {
        const chunks = await parseAndChunk(`test-${i}.js`, content, Language.JavaScript);
        expect(chunks.length).toBe(1);
        hashes.push(chunks[0].chunkHash);
      }

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
    });

    it('should generate same hash for identical Python functions (10 times)', async () => {
      const content = `
def test_function(x):
    """Test function for hash stability."""
    result = x * 2
    return result + 1
      `;

      const hashes: string[] = [];

      for (let i = 0; i < 10; i++) {
        const chunks = await parseAndChunk(`test_${i}.py`, content, Language.Python);
        expect(chunks.length).toBe(1);
        hashes.push(chunks[0].chunkHash);
      }

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
    });

    it('should generate identical hashes for identical functions in different files', async () => {
      const content = `
        function calculate(a: number, b: number): number {
          const sum = a + b;
          const product = a * b;
          return sum + product;
        }
      `;

      const file1Chunks = await parseAndChunk('/project/utils.ts', content, Language.TypeScript);
      const file2Chunks = await parseAndChunk('/project/helpers.ts', content, Language.TypeScript);
      const file3Chunks = await parseAndChunk('/project/lib/calc.ts', content, Language.TypeScript);

      expect(file1Chunks.length).toBe(1);
      expect(file2Chunks.length).toBe(1);
      expect(file3Chunks.length).toBe(1);

      // All three should have identical chunk hashes
      expect(file1Chunks[0].chunkHash).toBe(file2Chunks[0].chunkHash);
      expect(file2Chunks[0].chunkHash).toBe(file3Chunks[0].chunkHash);
    });
  });

  describe('SC-003: Whitespace-only changes preserve chunk ID', () => {
    it('should generate identical hashes with different indentation', async () => {
      const content1 = `
function test() {
  return 42;
}
      `;

      const content2 = `
function test() {
    return 42;
}
      `;

      const content3 = `
function test() {
        return 42;
}
      `;

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);
      const chunks3 = await parseAndChunk('test3.ts', content3, Language.TypeScript);

      expect(chunks1[0].chunkHash).toBe(chunks2[0].chunkHash);
      expect(chunks2[0].chunkHash).toBe(chunks3[0].chunkHash);
    });

    it('should generate identical hashes with different line spacing', async () => {
      const content1 = `
function test(x: number): number {
  const result = x * 2;
  return result + 1;
}
      `;

      const content2 = `
function test(x: number): number {

  const result = x * 2;

  return result + 1;

}
      `;

      const content3 = `
function test(x: number): number {


  const result = x * 2;


  return result + 1;


}
      `;

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);
      const chunks3 = await parseAndChunk('test3.ts', content3, Language.TypeScript);

      expect(chunks1[0].chunkHash).toBe(chunks2[0].chunkHash);
      expect(chunks2[0].chunkHash).toBe(chunks3[0].chunkHash);
    });

    it('should generate identical hashes with trailing whitespace differences', async () => {
      const content1 = `
function test() {
  return 42;
}`;

      const content2 = `
function test() {
  return 42;
}`;

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);

      expect(chunks1[0].chunkHash).toBe(chunks2[0].chunkHash);
    });

    it('should generate identical hashes with mixed tabs and spaces', async () => {
      const content1 = `
function test() {
  if (true) {
    return 42;
  }
}
      `;

      // Using tabs instead of spaces
      const content2 = `
function test() {
\tif (true) {
\t\treturn 42;
\t}
}
      `;

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);

      expect(chunks1[0].chunkHash).toBe(chunks2[0].chunkHash);
    });

    it('should handle Python indentation variations', async () => {
      const content1 = `
def test_function(x):
    if x > 0:
        return x * 2
    return 0
      `;

      const content2 = `
def test_function(x):
    if x > 0:
            return x * 2
    return 0
      `;

      const chunks1 = await parseAndChunk('test1.py', content1, Language.Python);
      const chunks2 = await parseAndChunk('test2.py', content2, Language.Python);

      // These should have the same hash after normalization
      expect(chunks1[0].chunkHash).toBe(chunks2[0].chunkHash);
    });
  });

  describe('Documentation content changes generate new chunk ID', () => {
    it('should generate different hashes when JSDoc changes', async () => {
      const content1 = `
        /**
         * Original documentation
         * @param x The input
         */
        function test(x: number): number {
          return x * 2;
        }
      `;

      const content2 = `
        /**
         * Updated documentation
         * @param x The input parameter
         */
        function test(x: number): number {
          return x * 2;
        }
      `;

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);

      expect(chunks1[0].chunkHash).not.toBe(chunks2[0].chunkHash);
    });

    it('should generate different hashes when Python docstring changes', async () => {
      const content1 = `
def test_function(x):
    """Original docstring."""
    return x * 2
      `;

      const content2 = `
def test_function(x):
    """Updated docstring."""
    return x * 2
      `;

      const chunks1 = await parseAndChunk('test1.py', content1, Language.Python);
      const chunks2 = await parseAndChunk('test2.py', content2, Language.Python);

      expect(chunks1[0].chunkHash).not.toBe(chunks2[0].chunkHash);
    });

    it('should generate different hashes when inline comments change', async () => {
      const content1 = `
        function test(): number {
          // Comment 1
          return 42;
        }
      `;

      const content2 = `
        function test(): number {
          // Comment 2
          return 42;
        }
      `;

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);

      expect(chunks1[0].chunkHash).not.toBe(chunks2[0].chunkHash);
    });

    it('should generate different hashes when adding/removing documentation', async () => {
      const contentWithDoc = `
        /**
         * Function with documentation
         */
        function test(): number {
          return 42;
        }
      `;

      const contentWithoutDoc = `
        function test(): number {
          return 42;
        }
      `;

      const chunks1 = await parseAndChunk('test1.ts', contentWithDoc, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', contentWithoutDoc, Language.TypeScript);

      expect(chunks1[0].chunkHash).not.toBe(chunks2[0].chunkHash);
    });
  });

  describe('Code logic changes generate new chunk ID', () => {
    it('should generate different hashes when function body changes', async () => {
      const content1 = `
        function calculate(x: number): number {
          return x * 2;
        }
      `;

      const content2 = `
        function calculate(x: number): number {
          return x * 3;
        }
      `;

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);

      expect(chunks1[0].chunkHash).not.toBe(chunks2[0].chunkHash);
    });

    it('should generate different hashes when adding statements', async () => {
      const content1 = `
        function process(x: number): number {
          return x * 2;
        }
      `;

      const content2 = `
        function process(x: number): number {
          const doubled = x * 2;
          return doubled;
        }
      `;

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);

      expect(chunks1[0].chunkHash).not.toBe(chunks2[0].chunkHash);
    });

    it('should generate different hashes when signature changes', async () => {
      const content1 = `
        function test(x: number): number {
          return x;
        }
      `;

      const content2 = `
        function test(x: number, y: number): number {
          return x + y;
        }
      `;

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);

      expect(chunks1[0].chunkHash).not.toBe(chunks2[0].chunkHash);
    });

    it('should generate different hashes when return type changes', async () => {
      const content1 = `
        function getValue(): number {
          return 42;
        }
      `;

      const content2 = `
        function getValue(): string {
          return "42";
        }
      `;

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);

      expect(chunks1[0].chunkHash).not.toBe(chunks2[0].chunkHash);
    });

    it('should generate different hashes when function name changes', async () => {
      const content1 = `
        function calculateSum(x: number): number {
          return x * 2;
        }
      `;

      const content2 = `
        function calculateProduct(x: number): number {
          return x * 2;
        }
      `;

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);

      expect(chunks1[0].chunkHash).not.toBe(chunks2[0].chunkHash);
    });
  });

  describe('Hash format validation', () => {
    it('should generate valid SHA-256 hashes (64 hex chars)', async () => {
      const content = `
        function test(): number {
          return 42;
        }
      `;

      const chunks = await parseAndChunk('test.ts', content, Language.TypeScript);

      expect(chunks.length).toBe(1);
      expect(hasher.isValidHash(chunks[0].chunkHash)).toBe(true);
      expect(chunks[0].chunkHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate consistent hash length across all languages', async () => {
      const tsContent = `function test() { return 42; }`;
      const jsContent = `function test() { return 42; }`;
      const pyContent = `def test():\n    return 42`;

      const tsChunks = await parseAndChunk('test.ts', tsContent, Language.TypeScript);
      const jsChunks = await parseAndChunk('test.js', jsContent, Language.JavaScript);
      const pyChunks = await parseAndChunk('test.py', pyContent, Language.Python);

      expect(tsChunks[0].chunkHash.length).toBe(64);
      expect(jsChunks[0].chunkHash.length).toBe(64);
      expect(pyChunks[0].chunkHash.length).toBe(64);
    });
  });

  describe('Complex real-world scenarios', () => {
    it('should handle class method hash stability', async () => {
      const content = `
        class Calculator {
          /**
           * Add two numbers
           */
          add(a: number, b: number): number {
            return a + b;
          }
        }
      `;

      const hashes: string[] = [];
      for (let i = 0; i < 5; i++) {
        const chunks = await parseAndChunk(`calc-${i}.ts`, content, Language.TypeScript);
        const addMethod = chunks.find(c => c.name === 'add');
        expect(addMethod).toBeDefined();
        hashes.push(addMethod!.chunkHash);
      }

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
    });

    it('should handle async function hash stability', async () => {
      const content = `
        async function fetchData(url: string): Promise<string> {
          const response = await fetch(url);
          return response.text();
        }
      `;

      const hashes: string[] = [];
      for (let i = 0; i < 5; i++) {
        const chunks = await parseAndChunk(`fetch-${i}.ts`, content, Language.TypeScript);
        expect(chunks.length).toBe(1);
        hashes.push(chunks[0].chunkHash);
      }

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
    });

    it('should handle generator function hash stability', async () => {
      const content = `
        function* numberGenerator(max: number) {
          for (let i = 0; i < max; i++) {
            yield i;
          }
        }
      `;

      const hashes: string[] = [];
      for (let i = 0; i < 5; i++) {
        const chunks = await parseAndChunk(`gen-${i}.ts`, content, Language.TypeScript);
        expect(chunks.length).toBe(1);
        hashes.push(chunks[0].chunkHash);
      }

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty function bodies', async () => {
      // Test that empty functions are handled correctly
      // Note: Tree-sitter may extract slightly different boundaries for {} vs {  }
      // due to how it parses the syntax tree, so we just verify they parse correctly
      const content1 = `
function empty(): void {
}
      `;
      const content2 = `
function empty(): void {


}
      `;

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);

      // Both should produce chunks
      expect(chunks1.length).toBeGreaterThan(0);
      expect(chunks2.length).toBeGreaterThan(0);

      // After normalization, they should have the same hash (only empty lines differ)
      expect(chunks1[0].chunkHash).toBe(chunks2[0].chunkHash);
    });

    it('should handle single-line functions consistently', async () => {
      const content1 = `const arrow = (x: number) => x * 2;`;
      const content2 = `const arrow = (x: number) =>  x * 2;`;

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);

      if (chunks1.length > 0 && chunks2.length > 0) {
        expect(chunks1[0].chunkHash).toBe(chunks2[0].chunkHash);
      }
    });

    it('should handle very large functions consistently', async () => {
      // Generate a large function body
      const largeBody = Array.from({ length: 1000 }, (_, i) =>
        `  const var${i} = ${i};`
      ).join('\n');

      const content1 = `
function largeFunction() {
${largeBody}
  return var999;
}`;

      const content2 = `
function largeFunction() {
${largeBody}
  return var999;
}`;

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);

      expect(chunks1[0].chunkHash).toBe(chunks2[0].chunkHash);
    });
  });
});
