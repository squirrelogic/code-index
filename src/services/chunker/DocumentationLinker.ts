/**
 * DocumentationLinker - Links documentation (JSDoc, docstrings, comments) to code chunks
 */

import Parser from 'tree-sitter';
import { Language } from '../../models/ChunkTypes.js';

/**
 * DocumentationLinker service
 */
export class DocumentationLinker {
  /**
   * Extract documentation for a function/method node
   * @param node Function/method node
   * @param docNode Documentation node found by query (if any)
   * @param language Source language
   * @returns Documentation text or null
   */
  public extractDocumentation(
    node: Parser.SyntaxNode,
    docNode: Parser.SyntaxNode | null,
    language: Language
  ): string | null {
    // If we have a documentation node from query, use it
    if (docNode) {
      return this.cleanDocumentation(docNode.text, language);
    }

    // For Python, check for docstring as first statement in body
    if (language === Language.Python) {
      const docstring = this.extractPythonDocstring(node);
      if (docstring) {
        return this.cleanDocumentation(docstring, language);
      }
    }

    // Try to find leading comments
    const leadingComments = this.findLeadingComments(node);
    if (leadingComments.length > 0) {
      const combinedDocs = leadingComments.map((c) => c.text).join('\n');
      return this.cleanDocumentation(combinedDocs, language);
    }

    return null;
  }

  /**
   * Find comments immediately preceding a node
   */
  public findLeadingComments(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
    const comments: Parser.SyntaxNode[] = [];

    if (!node.parent) {
      return comments;
    }

    const siblings = node.parent.children;
    const nodeIndex = siblings.indexOf(node);

    // Walk backwards from the node to find comments
    for (let i = nodeIndex - 1; i >= 0; i--) {
      const sibling = siblings[i];
      if (!sibling) continue;

      if (sibling.type === 'comment') {
        comments.unshift(sibling);
      } else if (!this.isWhitespace(sibling)) {
        // Stop at first non-comment, non-whitespace node
        break;
      }
    }

    return comments;
  }

  /**
   * Extract Python docstring from function body
   */
  public extractPythonDocstring(node: Parser.SyntaxNode): string | null {
    // Find the body node
    const bodyNode = node.childForFieldName('body');
    if (!bodyNode) {
      return null;
    }

    // Look for first expression statement with string
    for (const child of bodyNode.children) {
      if (child.type === 'expression_statement') {
        // Check if it contains a string
        for (const grandchild of child.children) {
          if (grandchild.type === 'string') {
            return grandchild.text;
          }
        }
      }

      // Stop after first non-docstring statement
      if (child.type !== 'expression_statement' && child.type !== 'comment') {
        break;
      }
    }

    return null;
  }

  /**
   * Check if node is whitespace-only
   */
  private isWhitespace(node: Parser.SyntaxNode): boolean {
    return node.text.trim().length === 0;
  }

  /**
   * Clean and normalize documentation text
   */
  private cleanDocumentation(docText: string, language: Language): string | null {
    let cleaned = docText;

    if (language === Language.Python) {
      // Remove Python string quotes
      cleaned = cleaned.replace(/^['"]{1,3}/, '').replace(/['"]{1,3}$/, '');
    } else {
      // Remove JavaScript/TypeScript comment markers
      cleaned = cleaned
        .split('\n')
        .map((line) => {
          // Remove // comments
          line = line.replace(/^\s*\/\/\s?/, '');
          // Remove /* */ comments
          line = line.replace(/^\s*\/\*+\s?/, '');
          line = line.replace(/\s*\*+\/\s*$/, '');
          // Remove leading * from JSDoc lines
          line = line.replace(/^\s*\*\s?/, '');
          return line;
        })
        .join('\n');
    }

    // Trim excess whitespace
    cleaned = cleaned.trim();

    return cleaned.length > 0 ? cleaned : null;
  }
}
