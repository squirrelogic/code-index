/**
 * Unit Tests: Hash Generation
 *
 * Tests for semantic content extraction and hash generation (T049)
 */

import { describe, it, expect } from 'vitest';
import { extractSemanticContent, generateHash } from '../../../../src/services/parser/HashGenerator.js';
import type { Symbol, HashInput } from '../../../../src/models/ParseResult.js';

describe('HashGenerator', () => {
  describe('extractSemanticContent', () => {
    it('should extract signature and body structure', () => {
      const source = 'function add(a: number, b: number): number {\n  return a + b;\n}';

      const symbol: Symbol = {
        name: 'add',
        kind: 'function',
        span: {
          startLine: 1,
          startColumn: 0,
          endLine: 3,
          endColumn: 1,
          startByte: 0,
          endByte: source.length,
        },
        parents: [],
        signature: 'function add(a: number, b: number): number',
        documentation: null,
        hash: '',
        metadata: {
          exported: false,
        },
      };

      const result = extractSemanticContent(symbol, source);

      expect(result.signature).toBe('function add(a: number, b: number): number');
      expect(result.bodyStructure).toBeTruthy();
      expect(result.bodyStructure).toContain('return');
      expect(result.bodyStructure).toContain('a + b');
    });

    it('should normalize whitespace in body structure', () => {
      const source = `function test() {
  const x = 1;


  const y = 2;
}`;

      const symbol: Symbol = {
        name: 'test',
        kind: 'function',
        span: {
          startLine: 1,
          startColumn: 0,
          endLine: 5,
          endColumn: 1,
          startByte: 0,
          endByte: source.length,
        },
        parents: [],
        signature: 'function test()',
        documentation: null,
        hash: '',
        metadata: {
          exported: false,
        },
      };

      const result = extractSemanticContent(symbol, source);

      // Multiple newlines should be collapsed to single space
      expect(result.bodyStructure).not.toContain('\n\n');
      expect(result.bodyStructure).toContain('const x = 1');
      expect(result.bodyStructure).toContain('const y = 2');
    });

    it('should remove single-line comments from body', () => {
      const source = `function test() {
  // This is a comment
  return 42;
}`;

      const symbol: Symbol = {
        name: 'test',
        kind: 'function',
        span: {
          startLine: 1,
          startColumn: 0,
          endLine: 4,
          endColumn: 1,
          startByte: 0,
          endByte: source.length,
        },
        parents: [],
        signature: 'function test()',
        documentation: null,
        hash: '',
        metadata: {
          exported: false,
        },
      };

      const result = extractSemanticContent(symbol, source);

      expect(result.bodyStructure).not.toContain('This is a comment');
      expect(result.bodyStructure).toContain('return 42');
    });

    it('should remove multi-line comments from body', () => {
      const source = `function test() {
  /* This is a
     multi-line comment */
  return 42;
}`;

      const symbol: Symbol = {
        name: 'test',
        kind: 'function',
        span: {
          startLine: 1,
          startColumn: 0,
          endLine: 6,
          endColumn: 1,
          startByte: 0,
          endByte: source.length,
        },
        parents: [],
        signature: 'function test()',
        documentation: null,
        hash: '',
        metadata: {
          exported: false,
        },
      };

      const result = extractSemanticContent(symbol, source);

      expect(result.bodyStructure).not.toContain('multi-line comment');
      expect(result.bodyStructure).toContain('return 42');
    });

    it('should handle symbols without signature', () => {
      const source = 'class MyClass {\n  foo = 1;\n}';

      const symbol: Symbol = {
        name: 'MyClass',
        kind: 'class',
        span: {
          startLine: 1,
          startColumn: 0,
          endLine: 3,
          endColumn: 1,
          startByte: 0,
          endByte: source.length,
        },
        parents: [],
        signature: null,
        documentation: null,
        hash: '',
        metadata: {
          exported: false,
        },
      };

      const result = extractSemanticContent(symbol, source);

      expect(result.signature).toBe('');
      expect(result.bodyStructure).toBeTruthy();
    });
  });

  describe('generateHash', () => {
    it('should generate 16-character hex hash', () => {
      const input: HashInput = {
        signature: 'function test()',
        bodyStructure: 'function test() { return 42; }',
      };

      const hash = generateHash(input);

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should generate same hash for same input (deterministic)', () => {
      const input: HashInput = {
        signature: 'function test()',
        bodyStructure: 'function test() { return 42; }',
      };

      const hash1 = generateHash(input);
      const hash2 = generateHash(input);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different signatures', () => {
      const input1: HashInput = {
        signature: 'function test()',
        bodyStructure: 'function test() { return 42; }',
      };

      const input2: HashInput = {
        signature: 'function test(a: number)',
        bodyStructure: 'function test() { return 42; }',
      };

      const hash1 = generateHash(input1);
      const hash2 = generateHash(input2);

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hashes for different body structures', () => {
      const input1: HashInput = {
        signature: 'function test()',
        bodyStructure: 'function test() { return 42; }',
      };

      const input2: HashInput = {
        signature: 'function test()',
        bodyStructure: 'function test() { return 99; }',
      };

      const hash1 = generateHash(input1);
      const hash2 = generateHash(input2);

      expect(hash1).not.toBe(hash2);
    });

    it('should generate same hash for semantically equivalent code with different whitespace', () => {
      const input1: HashInput = {
        signature: 'function test()',
        bodyStructure: 'function test() { return 42; }',
      };

      const input2: HashInput = {
        signature: 'function test()',
        bodyStructure: 'function test() { return 42; }', // Same after normalization
      };

      const hash1 = generateHash(input1);
      const hash2 = generateHash(input2);

      expect(hash1).toBe(hash2);
    });

    it('should handle empty input', () => {
      const input: HashInput = {
        signature: '',
        bodyStructure: '',
      };

      const hash = generateHash(input);

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('integration: extractSemanticContent + generateHash', () => {
    it('should produce same hash for same function with different comments', () => {
      const source1 = `function add(a, b) {
  // This is comment A
  return a + b;
}`;

      const symbol1: Symbol = {
        name: 'add',
        kind: 'function',
        span: {
          startLine: 1,
          startColumn: 0,
          endLine: 4,
          endColumn: 1,
          startByte: 0,
          endByte: source1.length,
        },
        parents: [],
        signature: 'function add(a, b)',
        documentation: null,
        hash: '',
        metadata: {
          exported: false,
        },
      };

      const source2 = `function add(a, b) {
  // This is comment B
  return a + b;
}`;

      const symbol2: Symbol = {
        name: 'add',
        kind: 'function',
        span: {
          startLine: 1,
          startColumn: 0,
          endLine: 4,
          endColumn: 1,
          startByte: 0,
          endByte: source2.length,
        },
        parents: [],
        signature: 'function add(a, b)',
        documentation: null,
        hash: '',
        metadata: {
          exported: false,
        },
      };

      const content1 = extractSemanticContent(symbol1, source1);
      const content2 = extractSemanticContent(symbol2, source2);

      const hash1 = generateHash(content1);
      const hash2 = generateHash(content2);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash when function body changes', () => {
      const source1 = `function add(a, b) {
  return a + b;
}`;

      const symbol1: Symbol = {
        name: 'add',
        kind: 'function',
        span: {
          startLine: 1,
          startColumn: 0,
          endLine: 3,
          endColumn: 1,
          startByte: 0,
          endByte: source1.length,
        },
        parents: [],
        signature: 'function add(a, b)',
        documentation: null,
        hash: '',
        metadata: {
          exported: false,
        },
      };

      const source2 = `function add(a, b) {
  return a * b;
}`;

      const symbol2: Symbol = {
        name: 'add',
        kind: 'function',
        span: {
          startLine: 1,
          startColumn: 0,
          endLine: 3,
          endColumn: 1,
          startByte: 0,
          endByte: source2.length,
        },
        parents: [],
        signature: 'function add(a, b)',
        documentation: null,
        hash: '',
        metadata: {
          exported: false,
        },
      };

      const content1 = extractSemanticContent(symbol1, source1);
      const content2 = extractSemanticContent(symbol2, source2);

      const hash1 = generateHash(content1);
      const hash2 = generateHash(content2);

      expect(hash1).not.toBe(hash2);
    });
  });
});
