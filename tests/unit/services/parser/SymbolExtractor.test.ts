/**
 * Unit Tests for Symbol Extraction
 *
 * Tests individual symbol extraction functions with specific code patterns.
 * Phase 3 - Task T020
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../../../../src/services/parser/index.js';

describe('Symbol Extraction - Unit Tests', () => {
  describe('Function Extraction', () => {
    it('should extract function with correct kind and name', async () => {
      const content = 'function add(a, b) { return a + b; }';
      const result = await parse('/test.js', { content });

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].name).toBe('add');
      expect(result.symbols[0].kind).toBe('function');
    });

    it('should extract async function', async () => {
      const content = 'async function fetchData() { return await fetch(); }';
      const result = await parse('/test.js', { content });

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].kind).toBe('function');
      expect(result.symbols[0].metadata.async).toBe(true);
    });

    it('should extract TypeScript function with signature', async () => {
      const content = 'function multiply(a: number, b: number): number { return a * b; }';
      const result = await parse('/test.ts', { content });

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].signature).toBeTruthy();
      expect(result.symbols[0].signature).toContain('multiply');
      expect(result.symbols[0].signature).toContain('number');
    });
  });

  describe('Class Extraction', () => {
    it('should extract class with correct kind and name', async () => {
      const content = 'class Calculator { add(a, b) { return a + b; } }';
      const result = await parse('/test.js', { content });

      // Should extract class and method
      expect(result.symbols.length).toBeGreaterThanOrEqual(1);
      const classSymbol = result.symbols.find(s => s.kind === 'class');
      expect(classSymbol).toBeDefined();
      expect(classSymbol?.name).toBe('Calculator');
    });

    it('should extract method in class with correct parents', async () => {
      const content = 'class Calculator { add(a, b) { return a + b; } }';
      const result = await parse('/test.js', { content });

      const method = result.symbols.find(s => s.kind === 'method');
      expect(method).toBeDefined();
      expect(method?.name).toBe('add');
      expect(method?.parents).toContain('Calculator');
    });

    it('should extract static method', async () => {
      const content = 'class Utils { static helper() { return 42; } }';
      const result = await parse('/test.js', { content });

      const method = result.symbols.find(s => s.kind === 'method');
      expect(method).toBeDefined();
      expect(method?.metadata.static).toBe(true);
    });
  });

  describe('Variable and Constant Extraction', () => {
    it('should extract variable', async () => {
      const content = 'let count = 0;';
      const result = await parse('/test.js', { content });

      const variable = result.symbols.find(s => s.kind === 'variable');
      expect(variable).toBeDefined();
      expect(variable?.name).toBe('count');
    });

    it('should extract constant', async () => {
      const content = 'const PI = 3.14159;';
      const result = await parse('/test.js', { content });

      const constant = result.symbols.find(s => s.kind === 'constant');
      expect(constant).toBeDefined();
      expect(constant?.name).toBe('PI');
    });
  });

  describe('TypeScript-Specific Symbols', () => {
    it('should extract interface', async () => {
      const content = 'interface User { name: string; age: number; }';
      const result = await parse('/test.ts', { content });

      const iface = result.symbols.find(s => s.kind === 'interface');
      expect(iface).toBeDefined();
      expect(iface?.name).toBe('User');
    });

    it('should extract enum', async () => {
      const content = 'enum Color { Red, Green, Blue }';
      const result = await parse('/test.ts', { content });

      const enumSymbol = result.symbols.find(s => s.kind === 'enum');
      expect(enumSymbol).toBeDefined();
      expect(enumSymbol?.name).toBe('Color');
    });

    it('should extract type alias', async () => {
      const content = 'type Point = { x: number; y: number; };';
      const result = await parse('/test.ts', { content });

      const typeAlias = result.symbols.find(s => s.kind === 'type');
      expect(typeAlias).toBeDefined();
      expect(typeAlias?.name).toBe('Point');
    });
  });

  describe('Python Symbol Extraction', () => {
    it('should extract Python function', async () => {
      const content = 'def calculate(a, b):\n    return a + b\n';
      const result = await parse('/test.py', { content });

      const func = result.symbols.find(s => s.kind === 'function');
      expect(func).toBeDefined();
      expect(func?.name).toBe('calculate');
    });

    it('should extract Python class', async () => {
      const content = 'class Calculator:\n    def add(self, a, b):\n        return a + b\n';
      const result = await parse('/test.py', { content });

      const classSymbol = result.symbols.find(s => s.kind === 'class');
      expect(classSymbol).toBeDefined();
      expect(classSymbol?.name).toBe('Calculator');
    });

    it('should extract Python class method with correct parents', async () => {
      const content = 'class Calculator:\n    def add(self, a, b):\n        return a + b\n';
      const result = await parse('/test.py', { content });

      const method = result.symbols.find(s => s.kind === 'method');
      expect(method).toBeDefined();
      expect(method?.name).toBe('add');
      expect(method?.parents).toContain('Calculator');
    });
  });

  describe('Nested Functions', () => {
    it('should extract nested function with correct parents array', async () => {
      const content = `
        function outer() {
          function inner() {
            return 42;
          }
          return inner();
        }
      `;
      const result = await parse('/test.js', { content });

      const outer = result.symbols.find(s => s.name === 'outer');
      const inner = result.symbols.find(s => s.name === 'inner');

      expect(outer).toBeDefined();
      expect(outer?.parents).toHaveLength(0);

      expect(inner).toBeDefined();
      expect(inner?.parents).toContain('outer');
    });
  });

  describe('Exported Symbols', () => {
    it('should detect exported symbol', async () => {
      const content = 'export function greet() { return "Hello"; }';
      const result = await parse('/test.js', { content });

      const symbol = result.symbols.find(s => s.name === 'greet');
      expect(symbol).toBeDefined();
      expect(symbol?.metadata.exported).toBe(true);
    });

    it('should detect non-exported symbol', async () => {
      const content = 'function internal() { return "private"; }';
      const result = await parse('/test.js', { content });

      const symbol = result.symbols.find(s => s.name === 'internal');
      expect(symbol).toBeDefined();
      expect(symbol?.metadata.exported).toBe(false);
    });
  });

  describe('Span Extraction', () => {
    it('should extract correct span information', async () => {
      const content = 'function test() {\n  return 42;\n}';
      const result = await parse('/test.js', { content });

      const symbol = result.symbols[0];
      expect(symbol.span.startLine).toBe(1);
      expect(symbol.span.startColumn).toBe(0);
      expect(symbol.span.endLine).toBeGreaterThan(1);
      expect(symbol.span.startByte).toBe(0);
      expect(symbol.span.endByte).toBeGreaterThan(0);
    });
  });

  describe('Property Extraction', () => {
    it('should extract class property', async () => {
      const content = 'class Point { x = 0; y = 0; }';
      const result = await parse('/test.js', { content });

      const properties = result.symbols.filter(s => s.kind === 'property');
      expect(properties.length).toBeGreaterThanOrEqual(1);
    });
  });
});
