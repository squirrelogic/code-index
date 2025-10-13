/**
 * Contract Tests: Content Hash Generation (US5)
 *
 * Validates acceptance criteria from spec.md for User Story 5.
 *
 * Test scenarios match spec.md exactly:
 * 1. Hash remains stable across parses when semantic content unchanged
 * 2. Only modified function's hash changes when function body modified
 * 3. Symbol hashes remain unchanged for whitespace/comment changes only
 * 4. Equivalent symbols in different files have same hashes
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../../src/services/parser/index.js';
import { join } from 'path';

describe('Contract: Content Hash Generation (US5)', () => {
  const fixturesDir = join(process.cwd(), 'tests', 'fixtures', 'parser');

  /**
   * AC1: Hash stability across parses
   *
   * Given: Parsed file
   * When: Symbol semantic content unchanged
   * Then: Hash remains stable across parses
   */
  it('should maintain stable hashes across multiple parses of same file', async () => {
    const filePath = join(fixturesDir, 'sample.ts');

    // Parse the file twice
    const result1 = await parse(filePath);
    const result2 = await parse(filePath);

    // All symbols should have hashes
    expect(result1.symbols.length).toBeGreaterThan(0);
    expect(result1.symbols.every(s => s.hash)).toBe(true);

    // Hashes should be identical across parses
    for (let i = 0; i < result1.symbols.length; i++) {
      const symbol1 = result1.symbols[i];
      const symbol2 = result2.symbols[i];

      expect(symbol1.hash).toBe(symbol2.hash);
      expect(symbol1.hash).toHaveLength(16);
      expect(symbol1.hash).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  /**
   * AC2: Selective hash changes
   *
   * Given: Function body modification
   * When: Reparsed
   * Then: Only that function's hash changes
   */
  it('should only change hash of modified function', async () => {
    const originalSource = `
function add(a: number, b: number): number {
  return a + b;
}

function multiply(a: number, b: number): number {
  return a * b;
}

function subtract(a: number, b: number): number {
  return a - b;
}
`;

    const modifiedSource = `
function add(a: number, b: number): number {
  return a + b;
}

function multiply(a: number, b: number): number {
  // MODIFIED: changed implementation
  return a * b * 2;
}

function subtract(a: number, b: number): number {
  return a - b;
}
`;

    // Parse both versions
    const result1 = await parse('test.ts', { content: originalSource });
    const result2 = await parse('test.ts', { content: modifiedSource });

    // Find the three functions in both results
    const add1 = result1.symbols.find(s => s.name === 'add');
    const multiply1 = result1.symbols.find(s => s.name === 'multiply');
    const subtract1 = result1.symbols.find(s => s.name === 'subtract');

    const add2 = result2.symbols.find(s => s.name === 'add');
    const multiply2 = result2.symbols.find(s => s.name === 'multiply');
    const subtract2 = result2.symbols.find(s => s.name === 'subtract');

    expect(add1).toBeDefined();
    expect(multiply1).toBeDefined();
    expect(subtract1).toBeDefined();
    expect(add2).toBeDefined();
    expect(multiply2).toBeDefined();
    expect(subtract2).toBeDefined();

    // Unmodified functions should have same hash
    expect(add1!.hash).toBe(add2!.hash);
    expect(subtract1!.hash).toBe(subtract2!.hash);

    // Modified function should have different hash
    expect(multiply1!.hash).not.toBe(multiply2!.hash);
  });

  /**
   * AC3: Whitespace and comment changes don't affect hash
   *
   * Given: Whitespace or comment changes only
   * When: Reparsed
   * Then: Symbol hashes remain unchanged
   */
  it('should maintain same hash when only whitespace or comments change', async () => {
    const version1 = `
function calculate(x: number, y: number): number {
  // Original comment
  const result = x + y;
  return result;
}
`;

    const version2 = `
function calculate(x: number, y: number): number {


  // Different comment style
  const    result    =    x    +    y;


  return    result;
}
`;

    const version3 = `
function calculate(x: number, y: number): number {
  /* Block comment instead */
  const result = x + y;
  return result;
}
`;

    // Parse all three versions
    const result1 = await parse('test.ts', { content: version1 });
    const result2 = await parse('test.ts', { content: version2 });
    const result3 = await parse('test.ts', { content: version3 });

    const func1 = result1.symbols.find(s => s.name === 'calculate');
    const func2 = result2.symbols.find(s => s.name === 'calculate');
    const func3 = result3.symbols.find(s => s.name === 'calculate');

    expect(func1).toBeDefined();
    expect(func2).toBeDefined();
    expect(func3).toBeDefined();

    // All three versions should have the same hash
    // (our normalization collapses multiple spaces to single space)
    expect(func1!.hash).toBe(func2!.hash);
    expect(func1!.hash).toBe(func3!.hash);
  });

  /**
   * AC4: Equivalent symbols have same hashes
   *
   * Given: Identical semantic content in different files
   * When: Parsed
   * Then: Equivalent symbols have same hashes
   */
  it('should generate same hash for semantically identical symbols in different files', async () => {
    const file1Content = `
export function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
`;

    const file2Content = `
// Different file with same function
export function fibonacci(n: number): number {
  // With comments
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
`;

    const result1 = await parse('file1.ts', { content: file1Content });
    const result2 = await parse('file2.ts', { content: file2Content });

    const func1 = result1.symbols.find(s => s.name === 'fibonacci');
    const func2 = result2.symbols.find(s => s.name === 'fibonacci');

    expect(func1).toBeDefined();
    expect(func2).toBeDefined();

    // Same semantic content should produce same hash
    expect(func1!.hash).toBe(func2!.hash);
  });

  /**
   * Additional validation: Hash format
   */
  it('should generate hashes in correct format', async () => {
    const source = `
function test() {
  return 42;
}

class MyClass {
  method() {
    return 'hello';
  }
}

const variable = 100;
`;

    const result = await parse('test.ts', { content: source });

    expect(result.symbols.length).toBeGreaterThan(0);

    for (const symbol of result.symbols) {
      // Every symbol must have a hash
      expect(symbol.hash).toBeTruthy();

      // Hash must be 16-character hex string
      expect(symbol.hash).toHaveLength(16);
      expect(symbol.hash).toMatch(/^[0-9a-f]{16}$/);

      // Hash should not be the placeholder value
      expect(symbol.hash).not.toBe('0000000000000000');
    }
  });
});
