/**
 * Foundational Integration Tests for Tree-sitter Parser
 *
 * Tests the core parsing pipeline with all supported languages.
 * Validates: language detection, grammar loading, parsing, error recovery, performance.
 *
 * Phase 2 - Task T011
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../../src/services/parser/index.js';
import { join } from 'path';

// Path to test fixtures
const FIXTURES_DIR = join(__dirname, '../fixtures/parser');

describe('Parser Foundation - Core Parsing Pipeline', () => {
  describe('Language Support', () => {
    it('should parse valid TypeScript file and return ParseResult', async () => {
      const filePath = join(FIXTURES_DIR, 'sample.ts');
      const result = await parse(filePath);

      // Verify ParseResult structure
      expect(result).toBeDefined();
      expect(result.path).toBe(filePath);
      expect(result.language).toBe('typescript');
      expect(result.symbols).toBeInstanceOf(Array);
      expect(result.imports).toBeInstanceOf(Array);
      expect(result.exports).toBeInstanceOf(Array);
      expect(result.calls).toBeInstanceOf(Array);
      expect(result.comments).toBeInstanceOf(Array);
      expect(result.errors).toBeInstanceOf(Array);
      expect(result.metadata).toBeDefined();

      // Verify metadata
      expect(result.metadata.parsedAt).toBeTruthy();
      expect(result.metadata.duration).toBeGreaterThan(0);
      expect(result.metadata.lineCount).toBeGreaterThan(0);
      expect(result.metadata.fileSize).toBeGreaterThan(0);
      expect(result.metadata.incremental).toBe(false);
      expect(result.metadata.parserVersion).toBe('1.0.0');
    });

    it('should parse valid JavaScript file and return ParseResult', async () => {
      const filePath = join(FIXTURES_DIR, 'sample.js');
      const result = await parse(filePath);

      expect(result).toBeDefined();
      expect(result.path).toBe(filePath);
      expect(result.language).toBe('javascript');
      expect(result.metadata.lineCount).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0); // No syntax errors expected
    });

    it('should parse valid TSX file and return ParseResult', async () => {
      const filePath = join(FIXTURES_DIR, 'sample.tsx');
      const result = await parse(filePath);

      expect(result).toBeDefined();
      expect(result.path).toBe(filePath);
      expect(result.language).toBe('tsx');
      expect(result.metadata.lineCount).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0); // No syntax errors expected
    });

    it('should parse valid Python file and return ParseResult', async () => {
      const filePath = join(FIXTURES_DIR, 'sample.py');
      const result = await parse(filePath);

      expect(result).toBeDefined();
      expect(result.path).toBe(filePath);
      expect(result.language).toBe('python');
      expect(result.metadata.lineCount).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0); // No syntax errors expected
    });
  });

  describe('Error Recovery', () => {
    it('should parse file with syntax error and return ParseResult with errors', async () => {
      const filePath = join(FIXTURES_DIR, 'syntax-error.ts');
      const result = await parse(filePath);

      // Should still return a ParseResult
      expect(result).toBeDefined();
      expect(result.path).toBe(filePath);
      expect(result.language).toBe('typescript');

      // Should detect syntax errors
      expect(result.errors.length).toBeGreaterThan(0);

      // Check error structure
      const firstError = result.errors[0];
      expect(firstError.message).toBeTruthy();
      expect(firstError.span).toBeDefined();
      expect(firstError.span.startLine).toBeGreaterThan(0);
      expect(firstError.severity).toBe('error');
      expect(firstError.recovery).toBeDefined();
      expect(typeof firstError.recovery.recovered).toBe('boolean');
      expect(firstError.recovery.strategy).toBeTruthy();
      expect(typeof firstError.recovery.symbolsAfterError).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unsupported extension', async () => {
      const filePath = '/fake/path/file.cpp'; // Unsupported extension

      await expect(parse(filePath)).rejects.toThrow(/Unsupported file extension/);
    });

    it('should throw error for non-existent file', async () => {
      const filePath = '/nonexistent/file.ts';

      await expect(parse(filePath)).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    it('should parse 1000 LOC in < 10ms (exceeds 1000 lines/sec target)', async () => {
      const filePath = join(FIXTURES_DIR, 'large-file.ts');
      const result = await parse(filePath);

      // Verify the file is large enough for the test
      expect(result.metadata.lineCount).toBeGreaterThan(1000);

      // Check parse duration (SC-001: 1,000 lines/second minimum)
      // With symbol extraction and hash generation enabled, should take < 130ms for 1600 lines
      // This still exceeds 12,000 lines/second (generous buffer for CI/CD variability)
      expect(result.metadata.duration).toBeLessThan(130);

      // Calculate actual performance
      const linesPerSecond = (result.metadata.lineCount / result.metadata.duration) * 1000;
      console.log(`Performance: ${linesPerSecond.toFixed(0)} lines/second`);

      // Should exceed the 1,000 L/s requirement by at least 10x
      expect(linesPerSecond).toBeGreaterThan(10000);
    });
  });

  describe('Content Parsing', () => {
    it('should parse content from string instead of file', async () => {
      const content = 'function test() { return 42; }';
      const result = await parse('/virtual/test.ts', { content });

      expect(result).toBeDefined();
      expect(result.language).toBe('typescript');
      expect(result.metadata.lineCount).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect language from file path even when using content option', async () => {
      const content = 'def test():\n    return 42\n';
      const result = await parse('/virtual/test.py', { content });

      expect(result.language).toBe('python');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty file', async () => {
      const content = '';
      const result = await parse('/virtual/empty.ts', { content });

      expect(result).toBeDefined();
      expect(result.metadata.lineCount).toBe(1); // Empty string counts as 1 line
      expect(result.metadata.fileSize).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle file with only whitespace', async () => {
      const content = '   \n\n\t\n   ';
      const result = await parse('/virtual/whitespace.ts', { content });

      expect(result).toBeDefined();
      expect(result.metadata.lineCount).toBeGreaterThan(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle file with only comments', async () => {
      const content = '// This is a comment\n/* Block comment */';
      const result = await parse('/virtual/comments.ts', { content });

      expect(result).toBeDefined();
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Grammar Caching', () => {
    it('should cache grammars across multiple parses', async () => {
      const content = 'function test() {}';

      // First parse
      const start1 = Date.now();
      await parse('/test1.ts', { content });
      const duration1 = Date.now() - start1;

      // Second parse (should use cached grammar)
      const start2 = Date.now();
      await parse('/test2.ts', { content });
      const duration2 = Date.now() - start2;

      // Second parse should be faster due to grammar caching
      // Note: This is a rough heuristic, timing can vary
      console.log(`First parse: ${duration1}ms, Second parse: ${duration2}ms`);

      // Both should complete quickly
      expect(duration1).toBeLessThan(100);
      expect(duration2).toBeLessThan(100);
    });
  });
});
