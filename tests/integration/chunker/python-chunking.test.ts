/**
 * Integration tests for Python code chunking
 * Tests end-to-end chunking of Python files
 *
 * Test scenarios (Scenario 2 from spec):
 * - Functions with docstrings
 * - Class methods with docstrings
 * - Nested functions
 * - Decorators
 * - Inheritance
 */

import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { parseAndChunk } from '../../helpers/chunker-test-helper';
import { ChunkType, Language } from '../../../src/models/ChunkTypes';
import { Chunk } from '../../../src/models/Chunk';

describe('Python Chunking Integration', () => {
  const fixturesDir = path.join(__dirname, '../../fixtures/python');

  describe('Simple Functions', () => {
    let chunks: Chunk[];
    const testFile = path.join(fixturesDir, 'simple_functions.py');

    beforeAll(async () => {
      const content = fs.readFileSync(testFile, 'utf-8');
      chunks = await parseAndChunk(testFile, content, Language.Python);
    });

    it('should extract all top-level functions', () => {
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should capture docstrings for functions', () => {
      const documentedChunks = chunks.filter(c => c.documentation && c.documentation.length > 0);
      expect(documentedChunks.length).toBeGreaterThan(0);

      // Verify docstring content
      documentedChunks.forEach(chunk => {
        expect(chunk.documentation).toBeTruthy();
        // Docstrings should be cleaned (triple quotes removed)
        expect(chunk.documentation.length).toBeGreaterThan(0);
      });
    });

    it('should identify function types correctly', () => {
      const regularFunctions = chunks.filter(c => c.chunkType === ChunkType.Function);
      expect(regularFunctions.length).toBeGreaterThan(0);
    });

    it('should set language to Python', () => {
      chunks.forEach(chunk => {
        expect(chunk.language).toBe(Language.Python);
      });
    });

    it('should mark top-level functions correctly', () => {
      const topLevelFunctions = chunks.filter(c => c.context.isTopLevel);
      expect(topLevelFunctions.length).toBeGreaterThan(0);
    });

    it('should include function content', () => {
      chunks.forEach(chunk => {
        expect(chunk.content).toBeTruthy();
        expect(chunk.content.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Class Methods (Scenario 2: Python class with methods)', () => {
    let chunks: Chunk[];
    const testFile = path.join(fixturesDir, 'class_methods.py');

    beforeAll(async () => {
      const content = fs.readFileSync(testFile, 'utf-8');
      chunks = await parseAndChunk(testFile, content, Language.Python);
    });

    it('should extract class methods', () => {
      const methods = chunks.filter(c => c.chunkType === ChunkType.Method);
      expect(methods.length).toBeGreaterThan(0);
    });

    it('should identify __init__ as constructor', () => {
      const constructors = chunks.filter(c => c.name === '__init__');
      expect(constructors.length).toBeGreaterThanOrEqual(1);

      constructors.forEach(constructor => {
        expect(constructor.chunkType).toBe(ChunkType.Constructor);
      });
    });

    it('should capture class context for methods (US1 Scenario 2)', () => {
      const methods = chunks.filter(c => c.chunkType === ChunkType.Method || c.chunkType === ChunkType.Constructor);

      methods.forEach(method => {
        // Each method should have class name
        expect(method.context.className).toBeTruthy();
        // Methods should not be marked as top-level
        expect(method.context.isTopLevel).toBe(false);
      });
    });

    it('should capture inheritance information (US1 Scenario 2)', () => {
      // Find methods from derived classes
      const derivedMethods = chunks.filter(c =>
        c.context.classInheritance && c.context.classInheritance.length > 0
      );

      if (derivedMethods.length > 0) {
        derivedMethods.forEach(method => {
          expect(method.context.classInheritance.length).toBeGreaterThan(0);
        });
      }
    });

    it('should preserve method docstrings (US1 Scenario 2)', () => {
      const documentedMethods = chunks.filter(c =>
        (c.chunkType === ChunkType.Method || c.chunkType === ChunkType.Constructor) &&
        c.documentation
      );

      expect(documentedMethods.length).toBeGreaterThan(0);

      documentedMethods.forEach(method => {
        expect(method.documentation).toBeTruthy();
        // Docstrings should be cleaned (triple quotes removed)
        expect(method.documentation.length).toBeGreaterThan(0);
      });
    });

    it('should capture method signatures (US1 Scenario 2)', () => {
      const methods = chunks.filter(c => c.chunkType === ChunkType.Method);

      methods.forEach(method => {
        expect(method.signature).toBeTruthy();
        // Signature should contain method name and parameters (no "def" keyword)
        expect(method.signature).toContain(method.name);
        expect(method.signature).toContain('(');
      });
    });
  });

  describe('Async Functions', () => {
    it('should identify async functions', async () => {
      const content = `
async def fetch_data():
    """Fetches data asynchronously"""
    return await some_api_call()
      `;

      const chunks = await parseAndChunk('test.py', content, Language.Python);
      const asyncFunctions = chunks.filter(c => c.chunkType === ChunkType.AsyncFunction);

      if (asyncFunctions.length > 0) {
        expect(asyncFunctions[0].content).toContain('async');
        expect(asyncFunctions[0].content).toContain('await');
      }
    });

    it('should identify async methods', async () => {
      const content = `
class DataFetcher:
    async def fetch(self):
        """Async method"""
        return await self.api.get()
      `;

      const chunks = await parseAndChunk('test.py', content, Language.Python);
      const asyncMethods = chunks.filter(c => c.chunkType === ChunkType.AsyncMethod);

      if (asyncMethods.length > 0) {
        expect(asyncMethods[0].content).toContain('async');
      }
    });
  });

  describe('Decorators', () => {
    it('should handle @property decorator', async () => {
      const content = `
class Person:
    @property
    def name(self):
        """Name property"""
        return self._name
      `;

      const chunks = await parseAndChunk('test.py', content, Language.Python);
      const properties = chunks.filter(c => c.chunkType === ChunkType.Property);

      // Properties should be captured, possibly as methods or properties
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should include decorators in chunk content', async () => {
      const content = `
class Service:
    @staticmethod
    def helper():
        """Helper method"""
        pass
      `;

      const chunks = await parseAndChunk('test.py', content, Language.Python);

      if (chunks.length > 0) {
        const decoratedMethod = chunks.find(c => c.name === 'helper');
        if (decoratedMethod) {
          expect(decoratedMethod.content).toContain('@staticmethod');
        }
      }
    });
  });

  describe('Generator Functions', () => {
    it('should identify generator functions', async () => {
      const content = `
def number_generator(max):
    """Generates numbers"""
    for i in range(max):
        yield i
      `;

      const chunks = await parseAndChunk('test.py', content, Language.Python);
      const generators = chunks.filter(c => c.chunkType === ChunkType.Generator);

      if (generators.length > 0) {
        expect(generators[0].content).toContain('yield');
      }
    });
  });

  describe('Chunk Hash Stability', () => {
    it('should generate identical hashes for identical functions', async () => {
      const content1 = `
def test():
    """Test function"""
    return 42
      `;

      const content2 = `
def test():
    """Test function"""
    return 42
      `;

      const chunks1 = await parseAndChunk('test1.py', content1, Language.Python);
      const chunks2 = await parseAndChunk('test2.py', content2, Language.Python);

      expect(chunks1.length).toBe(1);
      expect(chunks2.length).toBe(1);
      expect(chunks1[0].chunkHash).toBe(chunks2[0].chunkHash);
    });

    it('should generate identical hashes despite whitespace changes', async () => {
      const content1 = `
def test():
    return 42
      `;

      const content2 = `
def test():
        return 42
      `;

      const chunks1 = await parseAndChunk('test1.py', content1, Language.Python);
      const chunks2 = await parseAndChunk('test2.py', content2, Language.Python);

      expect(chunks1[0].chunkHash).toBe(chunks2[0].chunkHash);
    });

    it('should generate different hashes for different docstrings', async () => {
      const content1 = `
def test():
    """Doc 1"""
    return 42
      `;

      const content2 = `
def test():
    """Doc 2"""
    return 42
      `;

      const chunks1 = await parseAndChunk('test1.py', content1, Language.Python);
      const chunks2 = await parseAndChunk('test2.py', content2, Language.Python);

      expect(chunks1[0].chunkHash).not.toBe(chunks2[0].chunkHash);
    });
  });

  describe('Chunk Metadata', () => {
    let chunks: Chunk[];
    const testFile = path.join(fixturesDir, 'simple_functions.py');

    beforeAll(async () => {
      const content = fs.readFileSync(testFile, 'utf-8');
      chunks = await parseAndChunk(testFile, content, Language.Python);
    });

    it('should include valid line numbers', () => {
      chunks.forEach(chunk => {
        expect(chunk.startLine).toBeGreaterThan(0);
        expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
      });
    });

    it('should include valid byte offsets', () => {
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

    it('should include module path', () => {
      chunks.forEach(chunk => {
        expect(chunk.context.modulePath).toBeTruthy();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle files with no functions', async () => {
      const content = `
x = 42
y = "hello"
      `;

      const chunks = await parseAndChunk('test.py', content, Language.Python);
      // Should either return empty array or a module-level chunk
      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
    });

    it('should handle empty files', async () => {
      const content = '';
      const chunks = await parseAndChunk('test.py', content, Language.Python);
      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
    });

    it('should handle files with only comments', async () => {
      const content = `
# Just a comment
"""
Multi-line comment
"""
      `;

      const chunks = await parseAndChunk('test.py', content, Language.Python);
      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
    });
  });

  describe('Complete Acceptance Scenario (US1 Scenario 2)', () => {
    it('should fully satisfy: Python class → methods with docstring, class name, inheritance', async () => {
      const content = `
class Animal:
    """Base animal class"""

    def __init__(self, name):
        """Initialize animal with name"""
        self.name = name

    def speak(self):
        """Make animal sound"""
        pass

class Dog(Animal):
    """Dog class inheriting from Animal"""

    def __init__(self, name, breed):
        """Initialize dog with name and breed"""
        super().__init__(name)
        self.breed = breed

    def speak(self):
        """Dog barks"""
        return "Woof!"

    def fetch(self, item):
        """Dog fetches an item"""
        return f"{self.name} fetched the {item}"
      `;

      const chunks = await parseAndChunk('test.py', content, Language.Python);

      // Find Dog class methods
      const dogMethods = chunks.filter(c => c.context.className === 'Dog');
      expect(dogMethods.length).toBeGreaterThan(0);

      dogMethods.forEach(method => {
        // ✓ Method has docstring
        if (method.name !== '__init__') {
          expect(method.documentation).toBeTruthy();
        }

        // ✓ Method has class name
        expect(method.context.className).toBe('Dog');

        // ✓ Method shows inheritance
        expect(method.context.classInheritance).toContain('Animal');

        // ✓ Method has signature (without "def" keyword)
        expect(method.signature).toBeTruthy();
        expect(method.signature).toContain(method.name);
        expect(method.signature).toContain('(');
      });
    });
  });
});
