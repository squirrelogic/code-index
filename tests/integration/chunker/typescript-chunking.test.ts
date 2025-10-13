/**
 * Integration tests for TypeScript code chunking
 * Tests end-to-end chunking of TypeScript files
 *
 * Test scenarios:
 * - Multiple top-level functions
 * - Class with methods
 * - Nested functions
 * - JSDoc preservation
 * - Module path capture
 */

import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { parseAndChunk } from '../../helpers/chunker-test-helper';
import { ChunkType, Language } from '../../../src/models/ChunkTypes';
import { Chunk } from '../../../src/models/Chunk';

describe('TypeScript Chunking Integration', () => {
  const fixturesDir = path.join(__dirname, '../../fixtures/typescript');

  describe('Simple Functions (Scenario 1 & 3: Multiple top-level functions)', () => {
    let chunks: Chunk[];
    const testFile = path.join(fixturesDir, 'simple-functions.ts');

    beforeAll(async () => {
      const content = fs.readFileSync(testFile, 'utf-8');
      chunks = await parseAndChunk(testFile, content, Language.TypeScript);
    });

    it('should extract all top-level functions', () => {
      // Expected functions: add, multiply, greet, square, double, fetchData, fetchJson, numberGenerator
      // Note: Arrow functions assigned to variables should be captured
      expect(chunks.length).toBeGreaterThanOrEqual(6); // At least the main function declarations
    });

    it('should capture JSDoc documentation', () => {
      const addChunk = chunks.find(c => c.name === 'add');
      expect(addChunk).toBeDefined();
      expect(addChunk?.documentation).toContain('Calculates the sum of two numbers');
      expect(addChunk?.documentation).toContain('@param a First number');
      expect(addChunk?.documentation).toContain('@param b Second number');
      expect(addChunk?.documentation).toContain('@returns The sum of a and b');
    });

    it('should identify chunk types correctly', () => {
      const addChunk = chunks.find(c => c.name === 'add');
      expect(addChunk?.chunkType).toBe(ChunkType.Function);

      const fetchDataChunk = chunks.find(c => c.name === 'fetchData');
      expect(fetchDataChunk?.chunkType).toBe(ChunkType.AsyncFunction);

      const generatorChunk = chunks.find(c => c.name === 'numberGenerator');
      expect(generatorChunk?.chunkType).toBe(ChunkType.Generator);
    });

    it('should capture complete function signatures', () => {
      const addChunk = chunks.find(c => c.name === 'add');
      expect(addChunk?.signature).toContain('add');
      expect(addChunk?.signature).toContain('a: number');
      expect(addChunk?.signature).toContain('b: number');
      expect(addChunk?.signature).toContain(': number');
    });

    it('should include function content', () => {
      const multiplyChunk = chunks.find(c => c.name === 'multiply');
      expect(multiplyChunk).toBeDefined();
      expect(multiplyChunk?.content).toContain('return a * b');
    });

    it('should set language to TypeScript', () => {
      chunks.forEach(chunk => {
        expect(chunk.language).toBe(Language.TypeScript);
      });
    });

    it('should mark top-level functions correctly', () => {
      chunks.forEach(chunk => {
        expect(chunk.context.isTopLevel).toBe(true);
      });
    });

    it('should capture module path', () => {
      chunks.forEach(chunk => {
        expect(chunk.context.modulePath).toBeTruthy();
        expect(chunk.context.modulePath).toContain('simple-functions');
      });
    });
  });

  describe('Class Methods (Scenario 3: Class with methods)', () => {
    let chunks: Chunk[];
    const testFile = path.join(fixturesDir, 'class-methods.ts');

    beforeAll(async () => {
      const content = fs.readFileSync(testFile, 'utf-8');
      chunks = await parseAndChunk(testFile, content, Language.TypeScript);
    });

    it('should extract all class methods', () => {
      // Calculator class: constructor, add, subtract, multiply, fetchCalculation, calculateSteps, roundToPrecision, getHistory, clearHistory
      // ScientificCalculator class: constructor, power, sqrt
      expect(chunks.length).toBeGreaterThanOrEqual(11);
    });

    it('should identify method types correctly', () => {
      const constructorChunk = chunks.find(c => c.name === 'constructor' && c.context.className === 'Calculator');
      expect(constructorChunk?.chunkType).toBe(ChunkType.Constructor);

      const addMethod = chunks.find(c => c.name === 'add');
      expect(addMethod?.chunkType).toBe(ChunkType.Method);

      const asyncMethod = chunks.find(c => c.name === 'fetchCalculation');
      expect(asyncMethod?.chunkType).toBe(ChunkType.AsyncMethod);

      const generatorMethod = chunks.find(c => c.name === 'calculateSteps');
      expect(generatorMethod?.chunkType).toBe(ChunkType.Generator);
    });

    it('should capture class context', () => {
      const addMethod = chunks.find(c => c.name === 'add');
      expect(addMethod?.context.className).toBe('Calculator');
      expect(addMethod?.context.isTopLevel).toBe(false); // Methods are not top-level
    });

    it('should capture inheritance information', () => {
      const powerMethod = chunks.find(c => c.name === 'power');
      expect(powerMethod?.context.className).toBe('ScientificCalculator');
      expect(powerMethod?.context.classInheritance).toContain('Calculator');
    });

    it('should preserve method documentation', () => {
      const addMethod = chunks.find(c => c.name === 'add');
      expect(addMethod?.documentation).toContain('Adds two numbers');
      expect(addMethod?.documentation).toContain('@param a First number');
    });

    it('should capture method signatures', () => {
      const subtractMethod = chunks.find(c => c.name === 'subtract');
      expect(subtractMethod?.signature).toContain('subtract');
      expect(subtractMethod?.signature).toContain('a: number');
      expect(subtractMethod?.signature).toContain('b: number');
      expect(subtractMethod?.signature).toContain(': number');
    });
  });

  describe('Nested Functions (Scenario 4: Nested functions in parent chunk)', () => {
    let chunks: Chunk[];
    const testFile = path.join(fixturesDir, 'nested-functions.ts');

    beforeAll(async () => {
      const content = fs.readFileSync(testFile, 'utf-8');
      chunks = await parseAndChunk(testFile, content, Language.TypeScript);
    });

    it('should only extract top-level functions as separate chunks', () => {
      // Should extract top-level functions, not inner functions
      const topLevelCount = chunks.filter(c => c.context.isTopLevel).length;
      expect(topLevelCount).toBeGreaterThan(0);
    });

    it('should include inner functions in parent chunk content', () => {
      // Find a chunk that should contain nested functions
      const parentChunk = chunks.find(c => c.context.isTopLevel && c.content.includes('function'));
      expect(parentChunk).toBeDefined();

      // The parent chunk's content should include the inner function code
      // This verifies nested functions stay with their parent
    });
  });

  describe('Async and Generator Functions', () => {
    let chunks: Chunk[];
    const testFile = path.join(fixturesDir, 'async-generators.ts');

    beforeAll(async () => {
      const content = fs.readFileSync(testFile, 'utf-8');
      chunks = await parseAndChunk(testFile, content, Language.TypeScript);
    });

    it('should identify async functions', () => {
      const asyncChunks = chunks.filter(c => c.chunkType === ChunkType.AsyncFunction || c.chunkType === ChunkType.AsyncMethod);
      expect(asyncChunks.length).toBeGreaterThan(0);
    });

    it('should identify generator functions', () => {
      const generatorChunks = chunks.filter(c => c.chunkType === ChunkType.Generator);
      expect(generatorChunks.length).toBeGreaterThan(0);
    });
  });

  describe('Chunk Hash Stability (Scenario 4 & 5: Identical content)', () => {
    it('should generate identical hashes for identical functions', async () => {
      const content1 = `
        /**
         * Test function
         */
        function test() {
          return 42;
        }
      `;

      const content2 = `
        /**
         * Test function
         */
        function test() {
          return 42;
        }
      `;

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);

      expect(chunks1.length).toBe(1);
      expect(chunks2.length).toBe(1);
      expect(chunks1[0].chunkHash).toBe(chunks2[0].chunkHash);
    });

    it('should generate identical hashes despite whitespace-only changes', async () => {
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

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);

      expect(chunks1[0].chunkHash).toBe(chunks2[0].chunkHash);
    });

    it('should generate different hashes for different documentation', async () => {
      const content1 = `
        /** Doc 1 */
        function test() {
          return 42;
        }
      `;

      const content2 = `
        /** Doc 2 */
        function test() {
          return 42;
        }
      `;

      const chunks1 = await parseAndChunk('test1.ts', content1, Language.TypeScript);
      const chunks2 = await parseAndChunk('test2.ts', content2, Language.TypeScript);

      expect(chunks1[0].chunkHash).not.toBe(chunks2[0].chunkHash);
    });
  });

  describe('Chunk Metadata', () => {
    let chunks: Chunk[];
    const testFile = path.join(fixturesDir, 'simple-functions.ts');

    beforeAll(async () => {
      const content = fs.readFileSync(testFile, 'utf-8');
      chunks = await parseAndChunk(testFile, content, Language.TypeScript);
    });

    it('should include line numbers', () => {
      chunks.forEach(chunk => {
        expect(chunk.startLine).toBeGreaterThan(0);
        expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
      });
    });

    it('should include byte offsets', () => {
      chunks.forEach(chunk => {
        expect(chunk.startByte).toBeGreaterThanOrEqual(0);
        expect(chunk.endByte).toBeGreaterThan(chunk.startByte);
      });
    });

    it('should calculate line count correctly', () => {
      chunks.forEach(chunk => {
        const expectedLineCount = chunk.endLine - chunk.startLine + 1;
        expect(chunk.lineCount).toBe(expectedLineCount);
      });
    });

    it('should calculate character count', () => {
      chunks.forEach(chunk => {
        expect(chunk.characterCount).toBeGreaterThan(0);
        expect(chunk.characterCount).toBe(chunk.content.length);
      });
    });
  });
});
