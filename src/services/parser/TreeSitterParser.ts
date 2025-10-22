/**
 * Tree-sitter Parser Wrapper
 *
 * Core wrapper around Tree-sitter parser library providing initialization,
 * language configuration, and error recovery.
 */

import Parser from 'tree-sitter';
import type { SyntaxError, ErrorSeverity } from '../../models/ASTDoc.js';

/**
 * Represents an edit to source code for incremental parsing
 */
export interface Edit {
  /** Byte offset where the edit starts */
  startIndex: number;
  /** Byte offset where the old content ends */
  oldEndIndex: number;
  /** Byte offset where the new content ends */
  newEndIndex: number;
  /** Starting position in old tree */
  startPosition: Parser.Point;
  /** Ending position in old tree */
  oldEndPosition: Parser.Point;
  /** Ending position in new tree */
  newEndPosition: Parser.Point;
}

/**
 * Tree-sitter parser wrapper class
 */
export class TreeSitterParser {
  private parser: Parser;
  private currentTree: Parser.Tree | null = null;

  constructor() {
    // Initialize Tree-sitter parser
    this.parser = new Parser();
  }

  /**
   * Set the language grammar for parsing
   *
   * @param grammar - Tree-sitter language grammar
   */
  setLanguage(grammar: any): void {
    this.parser.setLanguage(grammar);
  }

  /**
   * Parse source code and return syntax tree
   *
   * @param source - Source code to parse
   * @returns Tree-sitter syntax tree
   * @throws Error if parsing fails
   */
  parse(source: string): Parser.Tree {
    try {
      // Note: Tree-sitter trees don't need explicit cleanup in Node.js bindings
      // The previous tree will be garbage collected
      this.currentTree = null;

      // Calculate appropriate buffer size (must be large enough for the source)
      // Use 64KB for files < 32KB, otherwise use double the source size
      const bufferSize = source.length < 32768 ? 65536 : source.length * 2;

      // Parse source code with appropriate buffer size
      const tree = this.parser.parse(source, undefined, { bufferSize });

      if (!tree) {
        throw new Error('Parser returned null tree');
      }

      // Store tree for later use
      this.currentTree = tree;

      return tree;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Parse failed: ${errorMessage}`);
    }
  }

  /**
   * Parse source code incrementally using an old tree for better performance
   *
   * This method is significantly faster than full reparse for small edits,
   * achieving 10x+ speedup in many cases.
   *
   * @param source - New source code to parse
   * @param oldTree - Previous syntax tree
   * @param edits - Array of edits applied since oldTree was created
   * @returns New syntax tree with incremental updates
   */
  parseIncremental(source: string, oldTree: Parser.Tree, edits: Edit[]): Parser.Tree {
    try {
      // Apply edits to the old tree
      for (const edit of edits) {
        oldTree.edit(edit);
      }

      // Calculate appropriate buffer size
      const bufferSize = source.length < 32768 ? 65536 : source.length * 2;

      // Parse with the edited tree as a hint
      // Tree-sitter will reuse unchanged portions of the tree
      const newTree = this.parser.parse(source, oldTree, { bufferSize });

      if (!newTree) {
        throw new Error('Incremental parse returned null tree');
      }

      // Store new tree
      this.currentTree = newTree;

      return newTree;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Incremental parse failed: ${errorMessage}`);
    }
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    // Note: Tree-sitter trees are automatically garbage collected
    // Just clear the reference
    this.currentTree = null;
  }

  /**
   * Get the current parse tree
   *
   * @returns Current syntax tree or null
   */
  getTree(): Parser.Tree | null {
    return this.currentTree;
  }

  /**
   * Extract syntax errors from parse tree
   *
   * @param tree - Tree-sitter syntax tree
   * @param source - Source code
   * @returns Array of syntax errors with recovery information
   */
  extractErrors(tree: Parser.Tree, source: string): SyntaxError[] {
    const errors: SyntaxError[] = [];

    // Recursive function to find ERROR nodes
    const findErrorNodes = (node: Parser.SyntaxNode): void => {
      // Check if this node is an ERROR node
      if (node.type === 'ERROR' || node.hasError) {
        // Only process ERROR nodes directly
        if (node.type === 'ERROR') {
          const error = this.createSyntaxError(node, source, tree);
          errors.push(error);
        } else {
          // If node has error but is not ERROR type, check children
          for (const child of node.children) {
            findErrorNodes(child);
          }
        }
      }
    };

    // Walk the tree to find all errors
    findErrorNodes(tree.rootNode);

    return errors;
  }

  /**
   * Create a SyntaxError object from an ERROR node
   *
   * @param node - ERROR node from Tree-sitter
   * @param source - Source code
   * @param tree - Complete syntax tree
   * @returns SyntaxError object
   */
  private createSyntaxError(
    node: Parser.SyntaxNode,
    source: string,
    tree: Parser.Tree
  ): SyntaxError {
    // Extract error message
    const message = this.extractErrorMessage(node, source);

    // Determine severity
    const severity: ErrorSeverity = 'error';

    // Count symbols after the error to determine if recovery was successful
    const symbolsAfterError = this.countSymbolsAfterNode(node, tree.rootNode);
    const recovered = symbolsAfterError > 0;

    // Determine recovery strategy
    let strategy: 'skip_statement' | 'skip_expression' | 'skip_to_delimiter' | 'none' = 'none';
    if (recovered) {
      // Tree-sitter's built-in recovery typically skips to the next statement
      strategy = 'skip_statement';
    }

    return {
      message,
      span: {
        startLine: node.startPosition.row + 1,
        startColumn: node.startPosition.column,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column,
        startByte: node.startIndex,
        endByte: node.endIndex,
      },
      severity,
      recovery: {
        recovered,
        strategy,
        symbolsAfterError,
      },
    };
  }

  /**
   * Extract error message from ERROR node
   *
   * @param node - ERROR node
   * @param source - Source code
   * @returns Error message
   */
  private extractErrorMessage(node: Parser.SyntaxNode, source: string): string {
    // Get the text of the error node
    const errorText = source.substring(node.startIndex, node.endIndex);

    // Create a descriptive error message
    const preview = errorText.length > 50
      ? `${errorText.substring(0, 50)}...`
      : errorText;

    return `Syntax error at line ${node.startPosition.row + 1}, column ${node.startPosition.column}: unexpected "${preview}"`;
  }

  /**
   * Count valid symbols after an error node
   *
   * @param errorNode - ERROR node
   * @param rootNode - Root node of the tree
   * @returns Number of valid symbols found after the error
   */
  private countSymbolsAfterNode(
    errorNode: Parser.SyntaxNode,
    rootNode: Parser.SyntaxNode
  ): number {
    let count = 0;
    const errorEndByte = errorNode.endIndex;

    // Symbol node types that indicate successful recovery
    const symbolTypes = new Set([
      'function_declaration',
      'class_declaration',
      'variable_declaration',
      'method_definition',
      'interface_declaration',
      'type_alias_declaration',
      'enum_declaration',
    ]);

    // Recursively count symbols after the error
    const countSymbols = (node: Parser.SyntaxNode): void => {
      // Only count nodes that come after the error
      if (node.startIndex > errorEndByte && symbolTypes.has(node.type)) {
        count++;
      }

      // Recurse into children
      for (const child of node.children) {
        countSymbols(child);
      }
    };

    countSymbols(rootNode);

    return count;
  }
}
