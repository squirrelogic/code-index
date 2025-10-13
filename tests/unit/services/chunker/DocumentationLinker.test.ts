/**
 * Unit tests for DocumentationLinker service
 * T030: Comprehensive documentation extraction tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Parser from 'tree-sitter';
import { DocumentationLinker } from '../../../../src/services/chunker/DocumentationLinker.js';
import { Language } from '../../../../src/models/ChunkTypes.js';
import { getLanguageParser } from '../../../helpers/chunker-test-helper.js';

describe('DocumentationLinker', () => {
  let linker: DocumentationLinker;
  let tsParser: Parser;
  let jsParser: Parser;
  let pyParser: Parser;

  beforeAll(async () => {
    linker = new DocumentationLinker();
    tsParser = await getLanguageParser('typescript');
    jsParser = await getLanguageParser('javascript');
    pyParser = await getLanguageParser('python');
  });

  describe('extractDocumentation', () => {
    describe('JSDoc comments (TypeScript/JavaScript)', () => {
      it('should extract single-line JSDoc comment', () => {
        const code = `
/** Returns the sum of two numbers */
function add(a, b) {
  return a + b;
}`;
        const tree = tsParser.parse(code);
        const funcNode = tree.rootNode.descendantsOfType('function_declaration')[0]!;
        const commentNode = tree.rootNode.descendantsOfType('comment')[0];

        const doc = linker.extractDocumentation(funcNode, commentNode, Language.TypeScript);

        expect(doc).toBe('Returns the sum of two numbers');
      });

      it('should extract multi-line JSDoc comment', () => {
        const code = `
/**
 * Calculates the factorial of a number
 * @param n - The number to calculate
 * @returns The factorial result
 */
function factorial(n) {
  return n <= 1 ? 1 : n * factorial(n - 1);
}`;
        const tree = tsParser.parse(code);
        const funcNode = tree.rootNode.descendantsOfType('function_declaration')[0]!;
        const commentNode = tree.rootNode.descendantsOfType('comment')[0];

        const doc = linker.extractDocumentation(funcNode, commentNode, Language.TypeScript);

        expect(doc).toContain('Calculates the factorial of a number');
        expect(doc).toContain('@param n - The number to calculate');
        expect(doc).toContain('@returns The factorial result');
      });

      it('should extract JSDoc with complex tags', () => {
        const code = `
/**
 * Fetches user data from API
 * @async
 * @param {string} userId - The user ID
 * @param {Object} options - Fetch options
 * @param {number} options.timeout - Request timeout
 * @returns {Promise<User>} User object
 * @throws {NetworkError} If network fails
 * @example
 * const user = await fetchUser('123', { timeout: 5000 });
 */
async function fetchUser(userId, options) {
  return fetch(\`/api/users/\${userId}\`, options);
}`;
        const tree = tsParser.parse(code);
        const funcNode = tree.rootNode.descendantsOfType('function_declaration')[0]!;
        const commentNode = tree.rootNode.descendantsOfType('comment')[0];

        const doc = linker.extractDocumentation(funcNode, commentNode, Language.TypeScript);

        expect(doc).toContain('Fetches user data from API');
        expect(doc).toContain('@async');
        expect(doc).toContain('@param {string} userId');
        expect(doc).toContain('@returns {Promise<User>}');
        expect(doc).toContain('@throws {NetworkError}');
        expect(doc).toContain('@example');
      });

      it('should extract JSDoc for method in class', () => {
        const code = `
class Calculator {
  /**
   * Adds two numbers
   * @param a - First number
   * @param b - Second number
   */
  add(a, b) {
    return a + b;
  }
}`;
        const tree = tsParser.parse(code);
        const methodNode = tree.rootNode.descendantsOfType('method_definition')[0]!;
        const commentNode = tree.rootNode.descendantsOfType('comment')[0];

        const doc = linker.extractDocumentation(methodNode, commentNode, Language.TypeScript);

        expect(doc).toContain('Adds two numbers');
        expect(doc).toContain('@param a - First number');
      });
    });

    describe('Multi-line comments (TypeScript/JavaScript)', () => {
      it('should extract multi-line block comment', () => {
        const code = `
/*
 * This is a multi-line block comment
 * that describes the function behavior
 */
function process() {
  // implementation
}`;
        const tree = tsParser.parse(code);
        const funcNode = tree.rootNode.descendantsOfType('function_declaration')[0]!;
        const commentNode = tree.rootNode.descendantsOfType('comment')[0];

        const doc = linker.extractDocumentation(funcNode, commentNode, Language.TypeScript);

        expect(doc).toContain('This is a multi-line block comment');
        expect(doc).toContain('that describes the function behavior');
      });

      it('should extract single-line comment', () => {
        const code = `
// Processes the input data
function process(data) {
  return data;
}`;
        const tree = tsParser.parse(code);
        const funcNode = tree.rootNode.descendantsOfType('function_declaration')[0]!;

        // Single-line comments should be found via findLeadingComments
        const doc = linker.extractDocumentation(funcNode, null, Language.TypeScript);

        expect(doc).toBe('Processes the input data');
      });

      it('should combine multiple single-line comments', () => {
        const code = `
// This function does multiple things:
// 1. Validates input
// 2. Processes data
// 3. Returns result
function process(data) {
  return data;
}`;
        const tree = tsParser.parse(code);
        const funcNode = tree.rootNode.descendantsOfType('function_declaration')[0]!;

        const doc = linker.extractDocumentation(funcNode, null, Language.TypeScript);

        expect(doc).toContain('This function does multiple things');
        expect(doc).toContain('1. Validates input');
        expect(doc).toContain('2. Processes data');
      });
    });

    describe('Python docstrings', () => {
      it('should extract single-line docstring', () => {
        const code = `
def greet(name):
    """Returns a greeting message"""
    return f"Hello, {name}"`;
        const tree = pyParser.parse(code);
        const funcNode = tree.rootNode.descendantsOfType('function_definition')[0]!;

        const doc = linker.extractDocumentation(funcNode, null, Language.Python);

        expect(doc).toBe('Returns a greeting message');
      });

      it('should extract multi-line docstring (Google style)', () => {
        const code = `
def calculate_stats(numbers):
    """
    Calculate statistics for a list of numbers.

    Args:
        numbers: List of numbers to analyze

    Returns:
        Dictionary containing mean, median, and mode

    Raises:
        ValueError: If numbers list is empty
    """
    pass`;
        const tree = pyParser.parse(code);
        const funcNode = tree.rootNode.descendantsOfType('function_definition')[0]!;

        const doc = linker.extractDocumentation(funcNode, null, Language.Python);

        expect(doc).toContain('Calculate statistics for a list of numbers');
        expect(doc).toContain('Args:');
        expect(doc).toContain('Returns:');
        expect(doc).toContain('Raises:');
      });

      it('should extract multi-line docstring (NumPy style)', () => {
        const code = `
def linear_regression(x, y):
    """
    Perform linear regression on data points.

    Parameters
    ----------
    x : array_like
        Independent variable data
    y : array_like
        Dependent variable data

    Returns
    -------
    tuple
        Slope and intercept of the regression line

    Examples
    --------
    >>> slope, intercept = linear_regression([1, 2, 3], [2, 4, 6])
    """
    pass`;
        const tree = pyParser.parse(code);
        const funcNode = tree.rootNode.descendantsOfType('function_definition')[0]!;

        const doc = linker.extractDocumentation(funcNode, null, Language.Python);

        expect(doc).toContain('Perform linear regression on data points');
        expect(doc).toContain('Parameters');
        expect(doc).toContain('Returns');
        expect(doc).toContain('Examples');
      });

      it('should extract docstring for class method', () => {
        const code = `
class DataProcessor:
    def transform(self, data):
        """Transform the input data"""
        return data.upper()`;
        const tree = pyParser.parse(code);
        const methods = tree.rootNode.descendantsOfType('function_definition');
        const methodNode = methods[0]!;

        const doc = linker.extractDocumentation(methodNode, null, Language.Python);

        expect(doc).toBe('Transform the input data');
      });

      it('should extract docstring with triple double quotes', () => {
        const code = `
def process():
    """This is a docstring with "quotes" inside"""
    pass`;
        const tree = pyParser.parse(code);
        const funcNode = tree.rootNode.descendantsOfType('function_definition')[0]!;

        const doc = linker.extractDocumentation(funcNode, null, Language.Python);

        expect(doc).toBe('This is a docstring with "quotes" inside');
      });

      it('should extract docstring with triple single quotes', () => {
        const code = `
def process():
    '''This is a docstring with 'quotes' inside'''
    pass`;
        const tree = pyParser.parse(code);
        const funcNode = tree.rootNode.descendantsOfType('function_definition')[0]!;

        const doc = linker.extractDocumentation(funcNode, null, Language.Python);

        expect(doc).toBe("This is a docstring with 'quotes' inside");
      });
    });

    describe('Edge cases', () => {
      it('should return null for function without documentation', () => {
        const code = `
function noDoc() {
  return 42;
}`;
        const tree = tsParser.parse(code);
        const funcNode = tree.rootNode.descendantsOfType('function_declaration')[0]!;

        const doc = linker.extractDocumentation(funcNode, null, Language.TypeScript);

        expect(doc).toBeNull();
      });

      it('should ignore inline comments (not leading)', () => {
        const code = `
function process() {
  // This is an inline comment
  return data; // Another inline comment
}`;
        const tree = tsParser.parse(code);
        const funcNode = tree.rootNode.descendantsOfType('function_declaration')[0]!;

        const doc = linker.extractDocumentation(funcNode, null, Language.TypeScript);

        expect(doc).toBeNull();
      });

      it('should handle malformed JSDoc gracefully', () => {
        const code = `
/** Incomplete JSDoc with missing closing
function broken() {
  return;
}`;
        const tree = tsParser.parse(code);
        const funcNode = tree.rootNode.descendantsOfType('function_declaration')[0]!;
        const commentNode = tree.rootNode.descendantsOfType('comment')[0];

        const doc = linker.extractDocumentation(funcNode, commentNode, Language.TypeScript);

        // Should still extract what's available, or return null if parsing fails
        if (doc) {
          expect(doc).toContain('Incomplete JSDoc');
        } else {
          // It's acceptable to return null for malformed comments
          expect(doc).toBeNull();
        }
      });

      it('should handle empty docstring', () => {
        const code = `
def empty_doc():
    """"""
    pass`;
        const tree = pyParser.parse(code);
        const funcNode = tree.rootNode.descendantsOfType('function_definition')[0]!;

        const doc = linker.extractDocumentation(funcNode, null, Language.Python);

        expect(doc).toBeNull();
      });

      it('should stop at first non-comment sibling', () => {
        const code = `
// This is for the previous function
function prev() {}

// This is for the next function
function next() {}`;
        const tree = tsParser.parse(code);
        const functions = tree.rootNode.descendantsOfType('function_declaration');
        const nextFunc = functions[1]!;

        const doc = linker.extractDocumentation(nextFunc, null, Language.TypeScript);

        expect(doc).toBe('This is for the next function');
        expect(doc).not.toContain('previous function');
      });
    });
  });

  describe('findLeadingComments', () => {
    it('should find single leading comment', () => {
      const code = `
// Leading comment
function test() {}`;
      const tree = tsParser.parse(code);
      const funcNode = tree.rootNode.descendantsOfType('function_declaration')[0]!;

      const comments = linker.findLeadingComments(funcNode);

      expect(comments).toHaveLength(1);
      expect(comments[0]!.text).toContain('Leading comment');
    });

    it('should find multiple leading comments', () => {
      const code = `
// Comment 1
// Comment 2
// Comment 3
function test() {}`;
      const tree = tsParser.parse(code);
      const funcNode = tree.rootNode.descendantsOfType('function_declaration')[0]!;

      const comments = linker.findLeadingComments(funcNode);

      expect(comments).toHaveLength(3);
      expect(comments[0]!.text).toContain('Comment 1');
      expect(comments[2]!.text).toContain('Comment 3');
    });

    it('should not find comments after node', () => {
      const code = `
function test() {}
// Comment after function`;
      const tree = tsParser.parse(code);
      const funcNode = tree.rootNode.descendantsOfType('function_declaration')[0]!;

      const comments = linker.findLeadingComments(funcNode);

      expect(comments).toHaveLength(0);
    });

    it('should handle node without parent', () => {
      const code = `function test() {}`;
      const tree = tsParser.parse(code);
      const rootNode = tree.rootNode;

      const comments = linker.findLeadingComments(rootNode);

      expect(comments).toHaveLength(0);
    });
  });

  describe('extractPythonDocstring', () => {
    it('should extract first string in function body', () => {
      const code = `
def test():
    """This is the docstring"""
    x = "This is not a docstring"
    return x`;
      const tree = pyParser.parse(code);
      const funcNode = tree.rootNode.descendantsOfType('function_definition')[0]!;

      const docstring = linker.extractPythonDocstring(funcNode);

      expect(docstring).toContain('This is the docstring');
      expect(docstring).not.toContain('This is not a docstring');
    });

    it('should return null for function without docstring', () => {
      const code = `
def test():
    x = 42
    return x`;
      const tree = pyParser.parse(code);
      const funcNode = tree.rootNode.descendantsOfType('function_definition')[0]!;

      const docstring = linker.extractPythonDocstring(funcNode);

      expect(docstring).toBeNull();
    });

    it('should return null for function without body', () => {
      // Simulate a node without body (edge case)
      const code = `def test(): pass`;
      const tree = pyParser.parse(code);
      const funcNode = tree.rootNode.descendantsOfType('function_definition')[0]!;

      // This should still work, but may not find a docstring
      const docstring = linker.extractPythonDocstring(funcNode);

      expect(docstring).toBeNull();
    });
  });

  describe('Documentation accuracy (SC-004: 99% doc association)', () => {
    it('should associate documentation with correct function in multi-function file', () => {
      const code = `
/** Function 1 docs */
function func1() {}

/** Function 2 docs */
function func2() {}

/** Function 3 docs */
function func3() {}`;
      const tree = tsParser.parse(code);
      const functions = tree.rootNode.descendantsOfType('function_declaration');
      const comments = tree.rootNode.descendantsOfType('comment');

      // Test that each function gets its correct documentation
      expect(functions).toHaveLength(3);
      expect(comments).toHaveLength(3);

      const doc1 = linker.extractDocumentation(functions[0]!, comments[0], Language.TypeScript);
      const doc2 = linker.extractDocumentation(functions[1]!, comments[1], Language.TypeScript);
      const doc3 = linker.extractDocumentation(functions[2]!, comments[2], Language.TypeScript);

      expect(doc1).toBe('Function 1 docs');
      expect(doc2).toBe('Function 2 docs');
      expect(doc3).toBe('Function 3 docs');
    });

    it('should handle mix of documented and undocumented functions', () => {
      const code = `
/** Documented */
function documented() {}

function undocumented() {}

/** Also documented */
function alsoDocumented() {}`;
      const tree = tsParser.parse(code);
      const functions = tree.rootNode.descendantsOfType('function_declaration');

      const doc1 = linker.extractDocumentation(functions[0]!, null, Language.TypeScript);
      const doc2 = linker.extractDocumentation(functions[1]!, null, Language.TypeScript);
      const doc3 = linker.extractDocumentation(functions[2]!, null, Language.TypeScript);

      expect(doc1).toBe('Documented');
      expect(doc2).toBeNull();
      expect(doc3).toBe('Also documented');
    });
  });
});
