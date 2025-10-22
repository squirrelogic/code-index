/**
 * Comment Extraction
 *
 * Extracts comments from Tree-sitter parse tree and adds them to ASTDocBuilder.
 * Handles line comments, block comments, JSDoc, and Python docstrings.
 */

import type Parser from 'tree-sitter';
import type { ASTDocBuilder } from './ASTDocBuilder.js';
import type { Comment } from '../../models/ASTDoc.js';
import { extractSpan } from './SymbolExtractor.js';

/**
 * Comment node types across languages
 */
const COMMENT_NODE_TYPES: Record<string, 'line' | 'block' | 'jsdoc' | 'docstring'> = {
  // JavaScript/TypeScript and Python
  'comment': 'line',  // Single-line // or #
  'block_comment': 'block',  // Multi-line /* */
  'jsdoc_comment': 'jsdoc',  // JSDoc /** */

  // Python docstrings
  'string': 'docstring',  // Triple-quoted strings (need context check)
};

/**
 * Check if a node is a comment
 */
function isCommentNode(node: Parser.SyntaxNode): boolean {
  return (
    node.type === 'comment' ||
    node.type === 'block_comment' ||
    node.type === 'jsdoc_comment' ||
    (node.type === 'string' && isDocstring(node))
  );
}

/**
 * Check if a string node is actually a docstring
 * (first statement in function/class/module)
 */
function isDocstring(node: Parser.SyntaxNode): boolean {
  if (node.type !== 'string') return false;

  // Check if it's a triple-quoted string
  const text = node.text;
  if (!text.startsWith('"""') && !text.startsWith("'''")) {
    return false;
  }

  // Check if it's the first statement in a function or class
  const parent = node.parent;
  if (!parent) return false;

  // In Python, docstrings are expression statements
  if (parent.type === 'expression_statement') {
    const grandparent = parent.parent;
    if (!grandparent) return false;

    // Check if parent is a function/class body
    if (grandparent.type === 'block' || grandparent.type === 'class_body') {
      // Check if it's the first child
      const siblings = grandparent.children;
      if (siblings.length > 0 && siblings[0] === parent) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Determine comment kind
 */
function getCommentKind(node: Parser.SyntaxNode, source: string): 'line' | 'block' | 'jsdoc' | 'docstring' {
  if (node.type === 'string' && isDocstring(node)) {
    return 'docstring';
  }

  // Check text content for JSDoc
  if (node.type === 'comment' || node.type === 'block_comment') {
    const text = source.substring(node.startIndex, node.endIndex);
    if (text.startsWith('/**')) {
      return 'jsdoc';
    }
    if (text.startsWith('/*')) {
      return 'block';
    }
    return 'line';
  }

  return COMMENT_NODE_TYPES[node.type] || 'line';
}

/**
 * Extract comment text (without delimiters)
 */
function extractCommentText(node: Parser.SyntaxNode, source: string): string {
  const text = source.substring(node.startIndex, node.endIndex);

  // Remove delimiters based on type
  if (text.startsWith('/**')) {
    // JSDoc: remove /** and */
    return text.slice(3, -2).trim();
  } else if (text.startsWith('/*')) {
    // Block comment: remove /* and */
    return text.slice(2, -2).trim();
  } else if (text.startsWith('//')) {
    // Line comment: remove //
    return text.slice(2).trim();
  } else if (text.startsWith('#')) {
    // Python comment: remove #
    return text.slice(1).trim();
  } else if (text.startsWith('"""') || text.startsWith("'''")) {
    // Python docstring: remove triple quotes
    return text.slice(3, -3).trim();
  }

  return text.trim();
}

/**
 * Parse JSDoc/docstring into DocumentationBlock
 * Simplified version - can be enhanced later
 */
function parseDocumentation(text: string, _kind: 'jsdoc' | 'docstring') {
  // For now, just return the raw text as description
  // TODO: Parse @param, @returns, @throws, etc.
  return {
    description: text
  };
}

/**
 * Extract comments from parsed tree into ASTDocBuilder
 *
 * Walks the tree to find all comments and adds them to the builder.
 * Comment-symbol association is done later by the builder.
 */
export function extractComments(
  tree: Parser.Tree,
  source: string,
  builder: ASTDocBuilder
): void {
  /**
   * Recursive walker to find all comments
   */
  function walkNode(node: Parser.SyntaxNode): void {
    // Check if this node is a comment
    if (isCommentNode(node)) {
      const kind = getCommentKind(node, source);
      const span = extractSpan(node);
      const text = extractCommentText(node, source);

      const comment: Comment = {
        text,
        kind,
        span
      };

      // Parse documentation if it's JSDoc or docstring
      if (kind === 'jsdoc' || kind === 'docstring') {
        comment.documentation = parseDocumentation(text, kind);
      }

      builder.addComment(comment);
    }

    // Recursively walk children
    for (const child of node.children) {
      walkNode(child);
    }
  }

  // Start walking from root node
  walkNode(tree.rootNode);
}
