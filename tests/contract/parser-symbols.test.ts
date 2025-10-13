/**
 * Contract Tests for Symbol Extraction API (T022)
 *
 * Tests the acceptance scenarios defined in spec.md for User Story 1.
 * These tests verify that the parser meets the contract defined in the specification.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../../src/services/parser/index.js';
import type { ParseResult } from '../../src/models/ParseResult.js';

describe('US1 Contract: Parse and Extract Code Symbols', () => {
  describe('Acceptance Scenario 1: TypeScript symbols extraction', () => {
    it('Given a TypeScript file with classes and functions, When parsed, Then all symbols are extracted with correct names, kinds, and spans', async () => {
      // Given: TypeScript file with multiple symbol types
      const content = `
        class DataService {
          private data: string[] = [];

          public async fetchData(): Promise<string[]> {
            return this.data;
          }
        }

        function processData(items: string[]): number {
          return items.length;
        }

        const API_KEY = "secret";
      `;

      // When: File is parsed
      const result: ParseResult = await parse('/test.ts', { content });

      // Then: All symbols extracted with correct information
      expect(result.symbols.length).toBeGreaterThan(0);

      // Verify class
      const classSymbol = result.symbols.find(s => s.kind === 'class' && s.name === 'DataService');
      expect(classSymbol).toBeDefined();
      expect(classSymbol?.span.startLine).toBeGreaterThan(0);
      expect(classSymbol?.span.startColumn).toBeGreaterThanOrEqual(0);
      expect(classSymbol?.span.endLine).toBeGreaterThanOrEqual(classSymbol!.span.startLine);

      // Verify method
      const methodSymbol = result.symbols.find(s => s.kind === 'method' && s.name === 'fetchData');
      expect(methodSymbol).toBeDefined();
      expect(methodSymbol?.parents).toContain('DataService');
      expect(methodSymbol?.span.startLine).toBeGreaterThan(0);

      // Verify function
      const functionSymbol = result.symbols.find(s => s.kind === 'function' && s.name === 'processData');
      expect(functionSymbol).toBeDefined();
      expect(functionSymbol?.span.startLine).toBeGreaterThan(0);

      // Verify constant
      const constantSymbol = result.symbols.find(s => s.kind === 'constant' && s.name === 'API_KEY');
      expect(constantSymbol).toBeDefined();
      expect(constantSymbol?.span.startLine).toBeGreaterThan(0);
    });
  });

  describe('Acceptance Scenario 2: Nested function parent-child relationships', () => {
    it('Given a JavaScript file with nested functions, When parsed, Then parent-child relationships are correctly identified', async () => {
      // Given: JavaScript with nested functions
      const content = `
        function outerFunction() {
          const message = "Hello";

          function innerFunction() {
            console.log(message);

            function deeplyNested() {
              return 42;
            }

            return deeplyNested();
          }

          return innerFunction();
        }
      `;

      // When: File is parsed
      const result: ParseResult = await parse('/test.js', { content });

      // Then: Parent-child relationships correctly identified
      const outer = result.symbols.find(s => s.name === 'outerFunction');
      const inner = result.symbols.find(s => s.name === 'innerFunction');
      const deeplyNested = result.symbols.find(s => s.name === 'deeplyNested');

      // Outer function should have no parents
      expect(outer).toBeDefined();
      expect(outer?.parents).toHaveLength(0);

      // Inner function should have outer as parent
      expect(inner).toBeDefined();
      expect(inner?.parents).toContain('outerFunction');

      // Deeply nested should have both parents in hierarchy
      expect(deeplyNested).toBeDefined();
      expect(deeplyNested?.parents.length).toBeGreaterThanOrEqual(1);
      expect(deeplyNested?.parents).toContain('innerFunction');
    });
  });

  describe('Acceptance Scenario 3: Python class and method signatures', () => {
    it('Given a Python file with classes and methods, When parsed, Then method signatures and class hierarchies are extracted', async () => {
      // Given: Python file with class and methods
      const content = `
class Calculator:
    def __init__(self):
        self.result = 0

    def add(self, a: int, b: int) -> int:
        """Add two numbers"""
        return a + b

    def multiply(self, x: int, y: int) -> int:
        """Multiply two numbers"""
        return x * y

def helper_function(value: int) -> str:
    """Convert to string"""
    return str(value)
      `;

      // When: File is parsed
      const result: ParseResult = await parse('/test.py', { content });

      // Then: Class hierarchy and method signatures extracted
      const classSymbol = result.symbols.find(s => s.kind === 'class' && s.name === 'Calculator');
      expect(classSymbol).toBeDefined();

      // Verify methods are children of class
      const addMethod = result.symbols.find(s => s.name === 'add' && s.kind === 'method');
      expect(addMethod).toBeDefined();
      expect(addMethod?.parents).toContain('Calculator');
      expect(addMethod?.signature).toBeTruthy(); // Should have signature

      const multiplyMethod = result.symbols.find(s => s.name === 'multiply' && s.kind === 'method');
      expect(multiplyMethod).toBeDefined();
      expect(multiplyMethod?.parents).toContain('Calculator');
      expect(multiplyMethod?.signature).toBeTruthy();

      // Top-level function should have no parents
      const helperFunc = result.symbols.find(s => s.kind === 'function' && s.name === 'helper_function');
      expect(helperFunc).toBeDefined();
      expect(helperFunc?.parents).toHaveLength(0);
      expect(helperFunc?.signature).toBeTruthy();
    });
  });

  describe('Acceptance Scenario 4: Syntax error recovery', () => {
    it('Given a file with syntax errors, When parsed, Then valid symbols before the error are still extracted', async () => {
      // Given: File with valid symbols and a clear syntax error
      const content = `
        function validFunction() {
          return "This is valid";
        }

        const goodConstant = 42;

        // Syntax error: completely malformed code
        function brokenFunction(
          this is not valid syntax at all ###
        }

        // This might not be extracted due to error
        function afterError() {
          return "After error";
        }
      `;

      // When: File is parsed
      const result: ParseResult = await parse('/test.js', { content });

      // Then: Parser doesn't crash and extracts what it can
      // Note: Tree-sitter may or may not report errors in the errors array,
      // but it should still extract valid symbols

      // Should extract the valid function before the error
      const validFunction = result.symbols.find(s => s.name === 'validFunction');
      expect(validFunction).toBeDefined();

      // Should extract the valid constant
      const goodConstant = result.symbols.find(s => s.name === 'goodConstant');
      expect(goodConstant).toBeDefined();

      // At least some symbols should be extracted
      expect(result.symbols.length).toBeGreaterThan(0);

      // If errors are reported, verify the structure is correct
      if (result.errors.length > 0) {
        const error = result.errors[0];
        expect(error).toHaveProperty('message');
        expect(error).toHaveProperty('span');
        expect(error).toHaveProperty('severity');
      }
    });
  });

  describe('ParseResult Structure Validation', () => {
    it('should match the data model structure defined in data-model.md', async () => {
      const content = `
        export class TestClass {
          private value: number = 0;

          public getValue(): number {
            return this.value;
          }
        }
      `;

      const result: ParseResult = await parse('/test.ts', { content });

      // Validate ParseResult structure
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('language');
      expect(result).toHaveProperty('symbols');
      expect(result).toHaveProperty('imports');
      expect(result).toHaveProperty('exports');
      expect(result).toHaveProperty('calls');
      expect(result).toHaveProperty('comments');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('metadata');

      // Validate Symbol structure
      const symbol = result.symbols[0];
      expect(symbol).toHaveProperty('name');
      expect(symbol).toHaveProperty('kind');
      expect(symbol).toHaveProperty('span');
      expect(symbol).toHaveProperty('parents');
      expect(symbol).toHaveProperty('signature');
      expect(symbol).toHaveProperty('documentation');
      expect(symbol).toHaveProperty('hash');
      expect(symbol).toHaveProperty('metadata');

      // Validate Span structure
      expect(symbol.span).toHaveProperty('startLine');
      expect(symbol.span).toHaveProperty('startColumn');
      expect(symbol.span).toHaveProperty('endLine');
      expect(symbol.span).toHaveProperty('endColumn');
      expect(symbol.span).toHaveProperty('startByte');
      expect(symbol.span).toHaveProperty('endByte');

      // Validate metadata structure
      expect(result.metadata).toHaveProperty('parsedAt');
      expect(result.metadata).toHaveProperty('duration');
      expect(result.metadata).toHaveProperty('lineCount');
      expect(result.metadata).toHaveProperty('fileSize');
      expect(result.metadata).toHaveProperty('parserVersion');
    });
  });
});
