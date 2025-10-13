/**
 * Unit Tests: Comment Extraction (T037)
 *
 * Tests comment and documentation extraction functionality including:
 * - Line comments
 * - Block comments
 * - JSDoc comments
 * - Python docstrings
 * - Symbol association
 * - JSDoc parsing
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../../../../src/services/parser/index.js';
import type { Comment, CommentKind } from '../../../../src/models/ParseResult.js';

describe('CommentExtractor', () => {
  describe('Line Comments', () => {
    it('should extract JavaScript line comment with correct kind and text', async () => {
      const source = `
// This is a line comment
const x = 1;
      `.trim();

      const result = await parse('test.js', { content: source });

      expect(result.comments.length).toBeGreaterThan(0);
      const lineComment = result.comments.find(c => c.kind === 'line');
      expect(lineComment).toBeDefined();
      expect(lineComment?.text).toBe('This is a line comment');
      expect(lineComment?.kind).toBe('line');
    });

    it('should extract Python line comment with correct text', async () => {
      const source = `
# This is a Python comment
x = 1
      `.trim();

      const result = await parse('test.py', { content: source });

      expect(result.comments.length).toBeGreaterThan(0);
      const lineComment = result.comments.find(c => c.text === 'This is a Python comment');
      expect(lineComment).toBeDefined();
      expect(lineComment?.kind).toBe('line');
    });
  });

  describe('Block Comments', () => {
    it('should extract block comment with correct kind and text', async () => {
      const source = `
/* This is a
   block comment */
const x = 1;
      `.trim();

      const result = await parse('test.js', { content: source });

      const blockComment = result.comments.find(c => c.kind === 'block');
      expect(blockComment).toBeDefined();
      expect(blockComment?.text).toContain('This is a');
      expect(blockComment?.text).toContain('block comment');
      expect(blockComment?.kind).toBe('block');
    });

    it('should handle multi-line block comments correctly', async () => {
      const source = `
/*
 * Multi-line
 * block comment
 */
const x = 1;
      `.trim();

      const result = await parse('test.js', { content: source });

      const blockComment = result.comments.find(c => c.kind === 'block');
      expect(blockComment).toBeDefined();
      expect(blockComment?.text).toContain('Multi-line');
      expect(blockComment?.text).toContain('block comment');
    });
  });

  describe('JSDoc Comments', () => {
    it('should extract JSDoc comment with correct kind', async () => {
      const source = `
/**
 * This is a JSDoc comment
 */
function foo() {}
      `.trim();

      const result = await parse('test.js', { content: source });

      const jsdocComment = result.comments.find(c => c.kind === 'jsdoc');
      expect(jsdocComment).toBeDefined();
      expect(jsdocComment?.kind).toBe('jsdoc');
      expect(jsdocComment?.text).toContain('This is a JSDoc comment');
    });

    it('should parse JSDoc documentation structure', async () => {
      const source = `
/**
 * Adds two numbers
 * @param a The first number
 * @param b The second number
 * @returns The sum
 */
function add(a, b) { return a + b; }
      `.trim();

      const result = await parse('test.js', { content: source });

      const jsdocComment = result.comments.find(c => c.kind === 'jsdoc');
      expect(jsdocComment).toBeDefined();
      expect(jsdocComment?.documentation).toBeDefined();
      expect(jsdocComment?.documentation?.description).toContain('Adds two numbers');
      expect(jsdocComment?.documentation?.params).toBeDefined();
      expect(jsdocComment?.documentation?.params?.length).toBe(2);
      expect(jsdocComment?.documentation?.returns).toBeDefined();
      expect(jsdocComment?.documentation?.returns).toContain('sum');
    });

    it('should parse JSDoc @param tags with name, type, and description', async () => {
      const source = `
/**
 * Test function
 * @param {string} name - The name parameter
 * @param {number} age - The age parameter
 */
function test(name, age) {}
      `.trim();

      const result = await parse('test.js', { content: source });

      const jsdocComment = result.comments.find(c => c.kind === 'jsdoc');
      const params = jsdocComment?.documentation?.params;

      expect(params).toBeDefined();
      expect(params?.length).toBe(2);

      const nameParam = params?.find(p => p.name === 'name');
      expect(nameParam).toBeDefined();
      expect(nameParam?.type).toBe('string');
      expect(nameParam?.description).toContain('name parameter');

      const ageParam = params?.find(p => p.name === 'age');
      expect(ageParam).toBeDefined();
      expect(ageParam?.type).toBe('number');
      expect(ageParam?.description).toContain('age parameter');
    });

    it('should parse JSDoc @returns tag', async () => {
      const source = `
/**
 * Get value
 * @returns {boolean} True if valid
 */
function getValue() { return true; }
      `.trim();

      const result = await parse('test.js', { content: source });

      const jsdocComment = result.comments.find(c => c.kind === 'jsdoc');
      expect(jsdocComment?.documentation?.returns).toBeDefined();
      expect(jsdocComment?.documentation?.returns).toContain('True if valid');
    });

    it('should parse JSDoc @throws tag', async () => {
      const source = `
/**
 * Risky function
 * @throws {Error} When something fails
 */
function risky() {}
      `.trim();

      const result = await parse('test.js', { content: source });

      const jsdocComment = result.comments.find(c => c.kind === 'jsdoc');
      expect(jsdocComment?.documentation?.throws).toBeDefined();
      expect(jsdocComment?.documentation?.throws?.length).toBeGreaterThan(0);
      expect(jsdocComment?.documentation?.throws?.[0]).toContain('something fails');
    });

    it('should parse JSDoc @example tag', async () => {
      const source = `
/**
 * Format name
 * @example
 * formatName('John')
 */
function formatName(name) { return name; }
      `.trim();

      const result = await parse('test.js', { content: source });

      const jsdocComment = result.comments.find(c => c.kind === 'jsdoc');
      expect(jsdocComment?.documentation?.examples).toBeDefined();
      expect(jsdocComment?.documentation?.examples?.length).toBeGreaterThan(0);
      expect(jsdocComment?.documentation?.examples?.[0]).toContain('formatName');
    });
  });

  describe('Python Docstrings', () => {
    it('should extract Python docstring from function', async () => {
      const source = `
def greet(name):
    """This is a docstring"""
    return f"Hello {name}"
      `.trim();

      const result = await parse('test.py', { content: source });

      const docstring = result.comments.find(c => c.kind === 'docstring');
      expect(docstring).toBeDefined();
      expect(docstring?.text).toBe('This is a docstring');
      expect(docstring?.kind).toBe('docstring');
    });

    it('should extract Python docstring from class', async () => {
      const source = `
class MyClass:
    """Class docstring"""
    pass
      `.trim();

      const result = await parse('test.py', { content: source });

      const docstring = result.comments.find(c => c.kind === 'docstring');
      expect(docstring).toBeDefined();
      expect(docstring?.text).toBe('Class docstring');
    });

    it('should handle multi-line Python docstrings', async () => {
      const source = `
def calculate(x, y):
    """
    Calculate something.

    This is a longer description.
    """
    return x + y
      `.trim();

      const result = await parse('test.py', { content: source });

      const docstring = result.comments.find(c => c.kind === 'docstring');
      expect(docstring).toBeDefined();
      expect(docstring?.text).toContain('Calculate something');
      expect(docstring?.text).toContain('longer description');
    });
  });

  describe('Symbol Association', () => {
    it('should associate JSDoc comment with function', async () => {
      const source = `
/**
 * Test function
 */
function testFunc() {}
      `.trim();

      const result = await parse('test.js', { content: source });

      const jsdocComment = result.comments.find(c => c.kind === 'jsdoc');
      expect(jsdocComment?.associatedSymbol).toBeDefined();
      expect(jsdocComment?.associatedSymbol).toBe('testFunc');

      // Verify symbol has documentation
      const symbol = result.symbols.find(s => s.name === 'testFunc');
      expect(symbol?.documentation).toBeDefined();
      expect(symbol?.documentation).toContain('Test function');
    });

    it('should associate Python docstring with function', async () => {
      const source = `
def my_function():
    """Function documentation"""
    pass
      `.trim();

      const result = await parse('test.py', { content: source });

      const docstring = result.comments.find(c => c.kind === 'docstring');
      expect(docstring?.associatedSymbol).toBeDefined();
      expect(docstring?.associatedSymbol).toBe('my_function');

      // Verify symbol has documentation
      const symbol = result.symbols.find(s => s.name === 'my_function');
      expect(symbol?.documentation).toBeDefined();
      expect(symbol?.documentation).toContain('Function documentation');
    });

    it('should NOT associate inline comments with symbols', async () => {
      const source = `
// This is just an inline comment
const x = 1; // Another inline comment
      `.trim();

      const result = await parse('test.js', { content: source });

      const inlineComments = result.comments.filter(c => c.kind === 'line');
      expect(inlineComments.length).toBeGreaterThan(0);

      // Inline comments should not have associated symbols
      for (const comment of inlineComments) {
        expect(comment.associatedSymbol).toBeUndefined();
      }
    });

    it('should NOT associate block comments with symbols', async () => {
      const source = `
/* Random block comment */
const x = 1;
      `.trim();

      const result = await parse('test.js', { content: source });

      const blockComment = result.comments.find(c => c.kind === 'block');
      expect(blockComment).toBeDefined();
      expect(blockComment?.associatedSymbol).toBeUndefined();
    });
  });

  describe('Comment Span Information', () => {
    it('should extract correct span information for comments', async () => {
      const source = `
// Line 2 comment
const x = 1;
      `.trim();

      const result = await parse('test.js', { content: source });

      const comment = result.comments[0];
      expect(comment.span).toBeDefined();
      expect(comment.span.startLine).toBeGreaterThan(0);
      expect(comment.span.endLine).toBeGreaterThan(0);
      expect(comment.span.startByte).toBeGreaterThanOrEqual(0);
      expect(comment.span.endByte).toBeGreaterThan(comment.span.startByte);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty JSDoc comments', async () => {
      const source = `
/**
 */
function empty() {}
      `.trim();

      const result = await parse('test.js', { content: source });

      const jsdocComment = result.comments.find(c => c.kind === 'jsdoc');
      expect(jsdocComment).toBeDefined();
      expect(jsdocComment?.documentation).toBeDefined();
    });

    it('should handle JSDoc without description', async () => {
      const source = `
/**
 * @param x The parameter
 */
function test(x) {}
      `.trim();

      const result = await parse('test.js', { content: source });

      const jsdocComment = result.comments.find(c => c.kind === 'jsdoc');
      expect(jsdocComment?.documentation?.params).toBeDefined();
      expect(jsdocComment?.documentation?.params?.length).toBe(1);
    });

    it('should handle multiple comments in one file', async () => {
      const source = `
// Comment 1
const a = 1;

/* Comment 2 */
const b = 2;

/**
 * JSDoc comment
 */
function foo() {}
      `.trim();

      const result = await parse('test.js', { content: source });

      expect(result.comments.length).toBeGreaterThanOrEqual(3);

      const lineComments = result.comments.filter(c => c.kind === 'line');
      const blockComments = result.comments.filter(c => c.kind === 'block');
      const jsdocComments = result.comments.filter(c => c.kind === 'jsdoc');

      expect(lineComments.length).toBeGreaterThan(0);
      expect(blockComments.length).toBeGreaterThan(0);
      expect(jsdocComments.length).toBeGreaterThan(0);
    });
  });
});
