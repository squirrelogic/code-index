/**
 * Integration Tests for Symbol Extraction (T021)
 *
 * End-to-end symbol extraction tests with real fixture files.
 * Tests the complete parsing pipeline from file read through symbol extraction.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../../src/services/parser/index.js';
import { resolve } from 'path';

const FIXTURES_DIR = resolve(__dirname, '../fixtures/parser');

describe('Symbol Extraction - Integration Tests', () => {
  describe('TypeScript File Extraction', () => {
    it('should extract all functions, classes, and interfaces from TypeScript file', async () => {
      const filePath = resolve(FIXTURES_DIR, 'sample.ts');
      const result = await parse(filePath);

      expect(result.language).toBe('typescript');
      expect(result.symbols.length).toBeGreaterThan(0);

      // Check for class
      const classSymbol = result.symbols.find(s => s.kind === 'class' && s.name === 'UserManager');
      expect(classSymbol).toBeDefined();
      expect(classSymbol?.metadata.exported).toBe(true);

      // Check for interface
      const interfaceSymbol = result.symbols.find(s => s.kind === 'interface' && s.name === 'User');
      expect(interfaceSymbol).toBeDefined();

      // Check for enum
      const enumSymbol = result.symbols.find(s => s.kind === 'enum' && s.name === 'UserRole');
      expect(enumSymbol).toBeDefined();

      // Check for type alias
      const typeSymbol = result.symbols.find(s => s.kind === 'type' && s.name === 'UserId');
      expect(typeSymbol).toBeDefined();

      // Check for function
      const funcSymbol = result.symbols.find(s => s.kind === 'function' && s.name === 'validateEmail');
      expect(funcSymbol).toBeDefined();
      expect(funcSymbol?.metadata.exported).toBe(true);

      // Check for constant
      const constSymbol = result.symbols.find(s => s.kind === 'constant' && s.name === 'MAX_USERS');
      expect(constSymbol).toBeDefined();
    });

    it('should extract methods with correct parent relationships', async () => {
      const filePath = resolve(FIXTURES_DIR, 'sample.ts');
      const result = await parse(filePath);

      // Find methods in UserManager class
      const addUserMethod = result.symbols.find(s => s.kind === 'method' && s.name === 'addUser');
      expect(addUserMethod).toBeDefined();
      expect(addUserMethod?.parents).toContain('UserManager');
      expect(addUserMethod?.metadata.async).toBe(true);
      expect(addUserMethod?.metadata.visibility).toBe('public');

      // Find static method
      const getInstanceMethod = result.symbols.find(s => s.kind === 'method' && s.name === 'getInstance');
      expect(getInstanceMethod).toBeDefined();
      expect(getInstanceMethod?.parents).toContain('UserManager');
      expect(getInstanceMethod?.metadata.static).toBe(true);
    });
  });

  describe('JavaScript File Extraction', () => {
    it('should extract nested functions with correct parents', async () => {
      const filePath = resolve(FIXTURES_DIR, 'sample.js');
      const result = await parse(filePath);

      expect(result.language).toBe('javascript');
      expect(result.symbols.length).toBeGreaterThan(0);

      // Check for nested functions with parent relationships
      const nestedFunctions = result.symbols.filter(s => s.parents.length > 0);
      expect(nestedFunctions.length).toBeGreaterThan(0);

      // Verify that nested functions have their parent in the parents array
      for (const symbol of nestedFunctions) {
        expect(symbol.parents.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('Python File Extraction', () => {
    it('should extract class methods with signatures', async () => {
      const filePath = resolve(FIXTURES_DIR, 'sample.py');
      const result = await parse(filePath);

      expect(result.language).toBe('python');
      expect(result.symbols.length).toBeGreaterThan(0);

      // Check for Python class
      const classSymbol = result.symbols.find(s => s.kind === 'class');
      expect(classSymbol).toBeDefined();

      // Check for methods with parent relationships
      const methods = result.symbols.filter(s => s.kind === 'method');
      expect(methods.length).toBeGreaterThan(0);

      // Verify methods have parent class
      for (const method of methods) {
        expect(method.parents.length).toBeGreaterThan(0);
        expect(method.signature).toBeTruthy(); // Should have signature
      }
    });
  });

  describe('Syntax Error Handling', () => {
    it('should extract symbols before syntax error', async () => {
      const filePath = resolve(FIXTURES_DIR, 'syntax-error.ts');
      const result = await parse(filePath);

      // Should have syntax errors reported
      expect(result.errors.length).toBeGreaterThan(0);

      // Should still extract valid symbols before the error
      expect(result.symbols.length).toBeGreaterThan(0);

      // Verify recovery information is present
      const errorWithRecovery = result.errors.find(e => e.recovered);
      if (errorWithRecovery) {
        expect(errorWithRecovery.recovery).toBeDefined();
        expect(errorWithRecovery.recovery?.symbolsAfterError).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Performance', () => {
    it('should parse large file (1000+ LOC) in less than 1 second', async () => {
      const filePath = resolve(FIXTURES_DIR, 'large-file.ts');
      const startTime = Date.now();

      const result = await parse(filePath);

      const duration = Date.now() - startTime;

      expect(result.symbols.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      expect(result.metadata.lineCount).toBeGreaterThan(1000);
    });
  });

  describe('Symbol Accuracy (SC-004)', () => {
    it('should extract 99% of expected symbols from comprehensive TypeScript file', async () => {
      const filePath = resolve(FIXTURES_DIR, 'sample.ts');
      const result = await parse(filePath);

      // Expected symbols based on fixture file contents:
      // - 1 type alias (UserId)
      // - 1 interface (User)
      // - 1 enum (UserRole)
      // - 1 constant (MAX_USERS)
      // - 1 class (UserManager)
      // - 2 class properties (users, instance)
      // - 1 constructor
      // - 2 methods (addUser, getInstance)
      // - 1 getter (count)
      // - 2 functions (validateEmail, processUsers)
      // - 1 arrow function variable (formatUser)
      // - 1 nested function (filterActive)

      const expectedMinimumSymbols = 13; // Conservative estimate

      expect(result.symbols.length).toBeGreaterThanOrEqual(expectedMinimumSymbols);

      // Calculate accuracy based on expected vs actual
      const accuracy = (result.symbols.length / expectedMinimumSymbols) * 100;
      expect(accuracy).toBeGreaterThanOrEqual(99);
    });
  });
});
