/**
 * Unit Tests for Call Graph Extraction (T043)
 *
 * Tests call identification, callee name extraction, receiver extraction,
 * argument counting, and method chaining detection.
 */

import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
// @ts-expect-error - TypeScript grammar types not available
import TypeScript from 'tree-sitter-typescript';
// @ts-expect-error - JavaScript grammar types not available
import JavaScript from 'tree-sitter-javascript';
// @ts-expect-error - Python grammar types not available
import Python from 'tree-sitter-python';
import {
  isCallNode,
  getCallKind,
  extractCalleeName,
  extractReceiver,
  countArguments,
  extractCalls,
  isPartOfChain,
} from '../../../../src/services/parser/CallGraphExtractor.js';

describe('CallGraphExtractor', () => {
  describe('isCallNode', () => {
    it('should identify call_expression nodes', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('foo()');
      const callNode = tree.rootNode.descendantsOfType('call_expression')[0];
      expect(isCallNode(callNode)).toBe(true);
    });

    it('should identify new_expression nodes', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('new Foo()');
      const newNode = tree.rootNode.descendantsOfType('new_expression')[0];
      expect(isCallNode(newNode)).toBe(true);
    });

    it('should not identify non-call nodes', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('const x = 1');
      const varNode = tree.rootNode.descendantsOfType('variable_declarator')[0];
      expect(isCallNode(varNode)).toBe(false);
    });
  });

  describe('getCallKind', () => {
    it('should identify function calls', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('foo()');
      const callNode = tree.rootNode.descendantsOfType('call_expression')[0];
      expect(getCallKind(callNode)).toBe('function');
    });

    it('should identify method calls', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('obj.method()');
      const callNode = tree.rootNode.descendantsOfType('call_expression')[0];
      expect(getCallKind(callNode)).toBe('method');
    });

    it('should identify constructor calls', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('new Foo()');
      const newNode = tree.rootNode.descendantsOfType('new_expression')[0];
      expect(getCallKind(newNode)).toBe('constructor');
    });

    it('should identify dynamic calls', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('obj[key]()');
      const callNode = tree.rootNode.descendantsOfType('call_expression')[0];
      expect(getCallKind(callNode)).toBe('dynamic');
    });
  });

  describe('extractCalleeName', () => {
    it('should extract simple function name', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('foo()');
      const callNode = tree.rootNode.descendantsOfType('call_expression')[0];
      expect(extractCalleeName(callNode)).toBe('foo');
    });

    it('should extract method name from method call', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('obj.method()');
      const callNode = tree.rootNode.descendantsOfType('call_expression')[0];
      expect(extractCalleeName(callNode)).toBe('method');
    });

    it('should extract constructor name', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('new Foo()');
      const newNode = tree.rootNode.descendantsOfType('new_expression')[0];
      expect(extractCalleeName(newNode)).toBe('Foo');
    });

    it('should handle dynamic calls', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('obj[key]()');
      const callNode = tree.rootNode.descendantsOfType('call_expression')[0];
      expect(extractCalleeName(callNode)).toBe('<dynamic>');
    });
  });

  describe('extractReceiver', () => {
    it('should extract receiver for method calls', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('obj.method()');
      const callNode = tree.rootNode.descendantsOfType('call_expression')[0];
      expect(extractReceiver(callNode)).toBe('obj');
    });

    it('should return undefined for function calls', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('foo()');
      const callNode = tree.rootNode.descendantsOfType('call_expression')[0];
      expect(extractReceiver(callNode)).toBeUndefined();
    });

    it('should extract receiver for chained calls', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('obj.foo().bar()');
      const callNodes = tree.rootNode.descendantsOfType('call_expression');
      // The second call (bar) has receiver of 'obj.foo()'
      expect(extractReceiver(callNodes[1])).toBeTruthy();
    });
  });

  describe('countArguments', () => {
    it('should count zero arguments', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('foo()');
      const callNode = tree.rootNode.descendantsOfType('call_expression')[0];
      expect(countArguments(callNode)).toBe(0);
    });

    it('should count single argument', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('foo(1)');
      const callNode = tree.rootNode.descendantsOfType('call_expression')[0];
      expect(countArguments(callNode)).toBe(1);
    });

    it('should count multiple arguments', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('foo(1, 2, 3)');
      const callNode = tree.rootNode.descendantsOfType('call_expression')[0];
      expect(countArguments(callNode)).toBe(3);
    });

    it('should count complex arguments', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('foo({ a: 1 }, [2, 3], "string")');
      const callNode = tree.rootNode.descendantsOfType('call_expression')[0];
      expect(countArguments(callNode)).toBe(3);
    });
  });

  describe('isPartOfChain', () => {
    it('should detect chained method calls', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('obj.foo().bar()');
      const callNodes = tree.rootNode.descendantsOfType('call_expression');
      // First call (foo) is part of chain
      expect(isPartOfChain(callNodes[0])).toBe(true);
      // Second call (bar) is part of chain
      expect(isPartOfChain(callNodes[1])).toBe(true);
    });

    it('should not detect single calls as chains', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('foo()');
      const callNode = tree.rootNode.descendantsOfType('call_expression')[0];
      expect(isPartOfChain(callNode)).toBe(false);
    });

    it('should handle long chains', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const tree = parser.parse('obj.foo().bar().baz()');
      const callNodes = tree.rootNode.descendantsOfType('call_expression');
      // All calls should be part of chain
      expect(isPartOfChain(callNodes[0])).toBe(true);
      expect(isPartOfChain(callNodes[1])).toBe(true);
      expect(isPartOfChain(callNodes[2])).toBe(true);
    });
  });

  describe('extractCalls (integration)', () => {
    it('should extract all calls from TypeScript code', () => {
      const parser = new Parser();
      parser.setLanguage(TypeScript.typescript);
      const source = `
        function example() {
          foo();
          obj.method();
          new Bar();
        }
      `;
      const tree = parser.parse(source);
      const calls = extractCalls(tree, source);

      expect(calls.length).toBe(3);
      expect(calls[0].callee).toBe('foo');
      expect(calls[0].kind).toBe('function');
      expect(calls[1].callee).toBe('method');
      expect(calls[1].kind).toBe('method');
      expect(calls[2].callee).toBe('Bar');
      expect(calls[2].kind).toBe('constructor');
    });

    it('should extract method chains with chain context', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const source = 'obj.foo().bar().baz()';
      const tree = parser.parse(source);
      const calls = extractCalls(tree, source);

      expect(calls.length).toBe(3);

      // Find calls by name (order may vary)
      const fooCall = calls.find(c => c.callee === 'foo');
      const barCall = calls.find(c => c.callee === 'bar');
      const bazCall = calls.find(c => c.callee === 'baz');

      // Verify all calls exist
      expect(fooCall).toBeDefined();
      expect(barCall).toBeDefined();
      expect(bazCall).toBeDefined();

      // Verify foo is at the start of the chain
      expect(fooCall?.chain).toBeDefined();
      expect(fooCall?.chain?.position).toBe(0);
      expect(fooCall?.chain?.next).toBe('bar');
      expect(fooCall?.chain?.previous).toBeUndefined();

      // Verify bar is in the middle
      expect(barCall?.chain).toBeDefined();
      expect(barCall?.chain?.position).toBe(1);
      expect(barCall?.chain?.previous).toBe('foo');
      expect(barCall?.chain?.next).toBe('baz');

      // Verify baz is at the end
      expect(bazCall?.chain).toBeDefined();
      expect(bazCall?.chain?.position).toBe(2);
      expect(bazCall?.chain?.previous).toBe('bar');
      expect(bazCall?.chain?.next).toBeUndefined();
    });

    it('should handle Python function calls', () => {
      const parser = new Parser();
      parser.setLanguage(Python);
      const source = `
def test():
    foo()
    obj.method()
`;
      const tree = parser.parse(source);
      const calls = extractCalls(tree, source);

      expect(calls.length).toBeGreaterThanOrEqual(2);
      const fooCall = calls.find(c => c.callee === 'foo');
      const methodCall = calls.find(c => c.callee === 'method');

      expect(fooCall).toBeDefined();
      expect(fooCall?.kind).toBe('function');
      expect(methodCall).toBeDefined();
      expect(methodCall?.kind).toBe('function'); // Python attribute calls
    });

    it('should count arguments correctly', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const source = `
        foo();
        bar(1);
        baz(1, 2, 3);
      `;
      const tree = parser.parse(source);
      const calls = extractCalls(tree, source);

      expect(calls.length).toBe(3);
      expect(calls[0].argumentCount).toBe(0);
      expect(calls[1].argumentCount).toBe(1);
      expect(calls[2].argumentCount).toBe(3);
    });

    it('should extract spans for all calls', () => {
      const parser = new Parser();
      parser.setLanguage(JavaScript);
      const source = 'foo();\nbar();';
      const tree = parser.parse(source);
      const calls = extractCalls(tree, source);

      expect(calls.length).toBe(2);
      expect(calls[0].span.startLine).toBe(1);
      expect(calls[1].span.startLine).toBe(2);
    });
  });
});
