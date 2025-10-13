/**
 * Comment and Documentation Extraction
 *
 * Extracts JSDoc comments, Python docstrings, and inline comments,
 * associating documentation with relevant symbols.
 */

import type TreeSitter from 'tree-sitter';
import type {
  Comment,
  CommentKind,
  DocumentationBlock,
  ParamDoc,
  Symbol,
  Span
} from '../../models/ParseResult.js';
import { extractSpan } from './SymbolExtractor.js';

// ============================================================================
// Comment Node Identification (T032)
// ============================================================================

/**
 * Check if a Tree-sitter node is a comment
 */
function isCommentNode(node: TreeSitter.SyntaxNode): boolean {
  const commentTypes = [
    'comment',
    'line_comment',
    'block_comment',
    'hash_bang_line', // Python shebang
    'string' // Python docstrings are string literals
  ];

  return commentTypes.includes(node.type);
}

/**
 * Determine the kind of comment from node type and content
 */
function getCommentKind(node: TreeSitter.SyntaxNode, text: string): CommentKind {
  // JSDoc pattern: starts with /**
  if (text.trim().startsWith('/**') && text.trim().endsWith('*/')) {
    return 'jsdoc';
  }

  // Python docstring: string literal at start of function/class
  if (node.type === 'string' && isPythonDocstring(node)) {
    return 'docstring';
  }

  // Block comment: /* ... */
  if (node.type === 'block_comment' || (text.includes('/*') && text.includes('*/'))) {
    return 'block';
  }

  // Line comment: // or #
  return 'line';
}

/**
 * Check if a string node is a Python docstring
 */
function isPythonDocstring(node: TreeSitter.SyntaxNode): boolean {
  // Docstrings are the first statement in a function, class, or module
  const parent = node.parent;
  if (!parent) return false;

  // Check if it's an expression_statement containing a string
  if (parent.type === 'expression_statement') {
    const grandparent = parent.parent;
    if (!grandparent) return false;

    // Must be first child of a block/body
    const isFirstChild = grandparent.children[0]?.id === parent.id ||
                         grandparent.children[1]?.id === parent.id; // Allow for optional child

    // Must be inside function, class, or module
    const validParentTypes = [
      'function_definition',
      'class_definition',
      'module',
      'block'
    ];

    return isFirstChild && validParentTypes.includes(grandparent.type);
  }

  return false;
}

// ============================================================================
// Comment Text Extraction (T033)
// ============================================================================

/**
 * Extract comment text without delimiters
 */
function extractCommentText(node: TreeSitter.SyntaxNode): string {
  const text = node.text;

  // Strip delimiters based on comment type
  if (text.startsWith('//')) {
    // Single-line comment: remove //
    return text.slice(2).trim();
  }

  if (text.startsWith('#')) {
    // Python comment: remove #
    return text.slice(1).trim();
  }

  if (text.startsWith('/*') && text.endsWith('*/')) {
    // Block comment: remove /* and */
    let content = text.slice(2, -2);

    // For JSDoc, also clean up leading * on each line
    if (text.startsWith('/**')) {
      content = content
        .split('\n')
        .map(line => line.trim().replace(/^\*\s?/, ''))
        .join('\n')
        .trim();
    }

    return content.trim();
  }

  // Python docstring: remove quotes
  if (node.type === 'string') {
    const trimmed = text.trim();
    if (trimmed.startsWith('"""') && trimmed.endsWith('"""')) {
      return trimmed.slice(3, -3).trim();
    }
    if (trimmed.startsWith("'''") && trimmed.endsWith("'''")) {
      return trimmed.slice(3, -3).trim();
    }
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1).trim();
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return trimmed.slice(1, -1).trim();
    }
  }

  return text.trim();
}

// ============================================================================
// Symbol Association (T034)
// ============================================================================

/**
 * Find the symbol associated with a comment (if any)
 */
function findAssociatedSymbol(
  comment: { span: Span; kind: CommentKind },
  symbols: Symbol[]
): string | undefined {
  // Only associate documentation comments (JSDoc and docstrings)
  if (comment.kind !== 'jsdoc' && comment.kind !== 'docstring') {
    return undefined;
  }

  // For JSDoc: find symbol immediately after comment
  if (comment.kind === 'jsdoc') {
    for (const symbol of symbols) {
      // Symbol should start on or after the comment ends
      if (symbol.span.startLine >= comment.span.endLine) {
        // Allow up to 1 line gap between comment and symbol
        if (symbol.span.startLine - comment.span.endLine <= 1) {
          return symbol.name;
        }
      }
    }
  }

  // For Python docstrings: find enclosing symbol
  if (comment.kind === 'docstring') {
    for (const symbol of symbols) {
      // Docstring should be inside the symbol (just after the definition line)
      if (
        comment.span.startLine > symbol.span.startLine &&
        comment.span.endLine < symbol.span.endLine
      ) {
        // Should be the first thing in the symbol
        const linesFromStart = comment.span.startLine - symbol.span.startLine;
        if (linesFromStart <= 2) { // Allow for def/class line + optional decorator
          return symbol.name;
        }
      }
    }
  }

  return undefined;
}

// ============================================================================
// JSDoc Parsing (T035)
// ============================================================================

/**
 * Parse JSDoc comment into structured documentation
 */
function parseJSDoc(text: string): DocumentationBlock {
  const lines = text.split('\n').map(line => line.trim());

  const doc: DocumentationBlock = {
    description: '',
    params: [],
    throws: [],
    examples: [],
    tags: {}
  };

  let currentSection: 'description' | 'param' | 'returns' | 'throws' | 'example' | 'tag' = 'description';
  let descriptionLines: string[] = [];
  let currentExample: string[] = [];
  let currentParam: Partial<ParamDoc> | null = null;

  for (const line of lines) {
    // Check for JSDoc tags
    if (line.startsWith('@')) {
      // Save previous param if any
      if (currentParam && currentParam.name) {
        doc.params!.push(currentParam as ParamDoc);
        currentParam = null;
      }

      // Save previous example if any
      if (currentExample.length > 0) {
        doc.examples!.push(currentExample.join('\n'));
        currentExample = [];
      }

      const tagMatch = line.match(/^@(\w+)\s*(.*)/);
      if (!tagMatch) continue;

      const [, tagName, tagContent = ''] = tagMatch;

      switch (tagName) {
        case 'param':
        case 'parameter': {
          // Parse: @param {type} name - description
          const paramMatch = tagContent.match(/^(?:\{([^}]+)\})?\s*(\w+)\s*-?\s*(.*)/);
          if (paramMatch) {
            currentParam = {
              name: paramMatch[2],
              type: paramMatch[1] || undefined,
              description: paramMatch[3] || '',
              optional: tagContent.includes('?') || tagContent.includes('optional')
            };
            currentSection = 'param';
          }
          break;
        }

        case 'returns':
        case 'return': {
          // Parse: @returns {type} description
          const returnsMatch = tagContent.match(/^(?:\{[^}]+\})?\s*(.*)/);
          doc.returns = returnsMatch ? returnsMatch[1] : tagContent;
          currentSection = 'returns';
          break;
        }

        case 'throws':
        case 'throw':
        case 'exception': {
          const throwsMatch = tagContent.match(/^(?:\{[^}]+\})?\s*(.*)/);
          doc.throws!.push(throwsMatch ? (throwsMatch[1] || tagContent) : tagContent);
          currentSection = 'throws';
          break;
        }

        case 'example': {
          currentSection = 'example';
          if (tagContent) {
            currentExample.push(tagContent);
          }
          break;
        }

        default: {
          // Other tags
          if (tagName && doc.tags) {
            doc.tags[tagName] = tagContent;
          }
          currentSection = 'tag';
        }
      }
    } else {
      // Continuation of previous section
      if (currentSection === 'description') {
        descriptionLines.push(line);
      } else if (currentSection === 'param' && currentParam) {
        currentParam.description = (currentParam.description || '') + ' ' + line;
      } else if (currentSection === 'returns' && line) {
        doc.returns = (doc.returns || '') + ' ' + line;
      } else if (currentSection === 'example') {
        currentExample.push(line);
      }
    }
  }

  // Finalize description
  doc.description = descriptionLines.join('\n').trim();

  // Save last param
  if (currentParam && currentParam.name) {
    doc.params!.push(currentParam as ParamDoc);
  }

  // Save last example
  if (currentExample.length > 0) {
    doc.examples!.push(currentExample.join('\n'));
  }

  // Clean up empty arrays
  if (doc.params!.length === 0) delete doc.params;
  if (doc.throws!.length === 0) delete doc.throws;
  if (doc.examples!.length === 0) delete doc.examples;
  if (Object.keys(doc.tags!).length === 0) delete doc.tags;

  return doc;
}

// ============================================================================
// Main Comment Extraction
// ============================================================================

/**
 * Extract comments from parsed tree
 *
 * @param tree - Tree-sitter parse tree
 * @param _source - Source code content (reserved for future use)
 * @param symbols - Previously extracted symbols for association
 * @returns Array of comments
 */
export function extractComments(
  tree: TreeSitter.Tree,
  _source: string,
  symbols: Symbol[]
): Comment[] {
  const comments: Comment[] = [];

  function visit(node: TreeSitter.SyntaxNode) {
    // Check if this node is a comment
    if (isCommentNode(node)) {
      const text = extractCommentText(node);
      const kind = getCommentKind(node, node.text);
      const span = extractSpan(node);

      const comment: Comment = {
        text,
        kind,
        span
      };

      // Parse JSDoc if applicable
      if (kind === 'jsdoc') {
        comment.documentation = parseJSDoc(text);
      }

      comments.push(comment);
    }

    // Recursively visit children
    for (const child of node.children) {
      visit(child);
    }
  }

  visit(tree.rootNode);

  // Associate comments with symbols after collection
  for (const comment of comments) {
    const associatedSymbol = findAssociatedSymbol(comment, symbols);
    if (associatedSymbol) {
      comment.associatedSymbol = associatedSymbol;
    }
  }

  return comments;
}
