/**
 * FunctionExtractor - Extracts function/method nodes from AST using Tree-sitter queries
 */

import Parser from 'tree-sitter';
import { ChunkType, Language } from '../../models/ChunkTypes.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Extracted function node information
 */
export interface ExtractedFunction {
  /** The syntax node representing the function/method */
  node: Parser.SyntaxNode;

  /** Function/method name */
  name: string;

  /** Determined chunk type */
  chunkType: ChunkType;

  /** Whether this is a top-level function (not nested) */
  isTopLevel: boolean;

  /** Documentation node if found */
  documentation: Parser.SyntaxNode | null;
}

/**
 * FunctionExtractor service
 */
export class FunctionExtractor {
  private queries: Map<Language, Parser.Query>;

  constructor(
    private typescriptLanguage: any,
    private javascriptLanguage: any,
    private pythonLanguage: any
  ) {
    this.queries = new Map();
    this.loadQueries();
  }

  /**
   * Load Tree-sitter query files for each language
   */
  private loadQueries(): void {
    // Load TypeScript queries
    const tsQueryPath = join(__dirname, '../../lib/queries/typescript.scm');
    const tsQuerySource = readFileSync(tsQueryPath, 'utf8');
    this.queries.set(Language.TypeScript, new Parser.Query(this.typescriptLanguage, tsQuerySource));

    // Load JavaScript queries
    const jsQueryPath = join(__dirname, '../../lib/queries/javascript.scm');
    const jsQuerySource = readFileSync(jsQueryPath, 'utf8');
    this.queries.set(Language.JavaScript, new Parser.Query(this.javascriptLanguage, jsQuerySource));

    // Load Python queries
    const pyQueryPath = join(__dirname, '../../lib/queries/python.scm');
    const pyQuerySource = readFileSync(pyQueryPath, 'utf8');
    this.queries.set(Language.Python, new Parser.Query(this.pythonLanguage, pyQuerySource));
  }

  /**
   * Extract function/method nodes from a syntax tree
   * @param tree Parsed syntax tree
   * @param language Source language
   * @returns Array of extracted function information
   */
  public extractFunctionNodes(tree: Parser.Tree, language: Language): ExtractedFunction[] {
    const query = this.queries.get(language);
    if (!query) {
      throw new Error(`No query defined for language: ${language}`);
    }

    const matches = query.matches(tree.rootNode);
    const functions: ExtractedFunction[] = [];
    const documentationMap = this.buildDocumentationMap(matches);

    // Process each match
    for (const match of matches) {
      const extracted = this.processMatch(match, language, documentationMap);
      if (extracted) {
        functions.push(extracted);
      }
    }

    // Filter out duplicates (same node captured multiple times)
    const seen = new Set<number>();
    return functions.filter((func) => {
      if (seen.has(func.node.id)) {
        return false;
      }
      seen.add(func.node.id);
      return true;
    });
  }

  /**
   * Build map of documentation nodes to function nodes
   */
  private buildDocumentationMap(matches: Parser.QueryMatch[]): Map<number, Parser.SyntaxNode> {
    const docMap = new Map<number, Parser.SyntaxNode>();

    for (const match of matches) {
      // Look for documentation captures
      for (const capture of match.captures) {
        if (capture.name.includes('.doc')) {
          // Find the associated function capture in the same match
          const funcCapture = match.captures.find(
            (c) => c.name.includes('.def') || c.name.includes('.with_doc')
          );
          if (funcCapture) {
            docMap.set(funcCapture.node.id, capture.node);
          }
        }
      }
    }

    return docMap;
  }

  /**
   * Process a query match to extract function information
   */
  private processMatch(
    match: Parser.QueryMatch,
    language: Language,
    docMap: Map<number, Parser.SyntaxNode>
  ): ExtractedFunction | null {
    // Find the main function definition capture
    const defCapture = match.captures.find((c) => c.name.endsWith('.def'));
    if (!defCapture) {
      return null;
    }

    // Find the name capture - must match the prefix of the definition capture
    // e.g., if we have @decorated_method.def, look for @decorated_method.name
    const defPrefix = defCapture.name.replace(/\.def$/, '');
    const nameCapture = match.captures.find((c) => c.name === `${defPrefix}.name`);
    if (!nameCapture) {
      return null;
    }

    const node = defCapture.node;
    const name = nameCapture.node.text;

    // Determine chunk type from capture name
    const chunkType = this.determineChunkType(defCapture.name, node);

    // Check if top-level
    const isTopLevel = this.isTopLevel(node, language);

    // Get documentation
    const documentation = docMap.get(node.id) || null;

    return {
      node,
      name,
      chunkType,
      isTopLevel,
      documentation,
    };
  }

  /**
   * Determine chunk type from capture name and node
   */
  public determineChunkType(captureName: string, node: Parser.SyntaxNode): ChunkType {
    // Check capture name for hints
    if (captureName.includes('async_function')) {
      return ChunkType.AsyncFunction;
    }
    if (captureName.includes('async_method')) {
      return ChunkType.AsyncMethod;
    }
    if (captureName.includes('generator')) {
      return ChunkType.Generator;
    }
    if (captureName.includes('constructor')) {
      return ChunkType.Constructor;
    }
    if (captureName.includes('property')) {
      return ChunkType.Property;
    }
    if (captureName.includes('method')) {
      return ChunkType.Method;
    }
    if (captureName.includes('class')) {
      return ChunkType.Class;
    }

    // Check node type
    if (node.type === 'generator_function_declaration') {
      return ChunkType.Generator;
    }
    if (node.type === 'class_declaration' || node.type === 'class_definition') {
      return ChunkType.Class;
    }

    // Check for async keyword in children
    const hasAsync = node.children.some((child) => child.type === 'async');
    if (hasAsync) {
      // Is it a method?
      const parent = node.parent;
      if (parent && (parent.type === 'class_body' || parent.type === 'block')) {
        return ChunkType.AsyncMethod;
      }
      return ChunkType.AsyncFunction;
    }

    // Check if it's a method (has class parent)
    if (this.hasClassParent(node)) {
      return ChunkType.Method;
    }

    // Default to function
    return ChunkType.Function;
  }

  /**
   * Check if function/method is at top level (not nested)
   * Note: Methods inside classes are considered NOT top-level
   */
  public isTopLevel(node: Parser.SyntaxNode, language: Language): boolean {
    let current = node.parent;

    while (current) {
      // If we encounter another function/method definition, we're nested
      if (this.isFunctionNode(current, language)) {
        return false;
      }

      // If we're in a class body, we're a method (not top-level)
      if (current.type === 'class_body' || current.type === 'block') {
        // Check if the block's parent is a class
        const blockParent = current.parent;
        if (blockParent && (
          blockParent.type === 'class_declaration' ||
          blockParent.type === 'class_definition'
        )) {
          return false;
        }
      }

      // If we reach module/program, we're top-level
      if (current.type === 'program' || current.type === 'module') {
        return true;
      }

      current = current.parent;
    }

    return true;
  }

  /**
   * Check if node is a function/method definition
   */
  private isFunctionNode(node: Parser.SyntaxNode, _language: Language): boolean {
    const functionTypes = [
      'function_declaration',
      'function_definition',
      'function_expression',
      'arrow_function',
      'generator_function_declaration',
      'method_definition',
    ];

    return functionTypes.includes(node.type);
  }

  /**
   * Check if node has a class as ancestor
   */
  private hasClassParent(node: Parser.SyntaxNode): boolean {
    let current = node.parent;

    while (current) {
      if (
        current.type === 'class_declaration' ||
        current.type === 'class_definition' ||
        current.type === 'class_body'
      ) {
        return true;
      }
      current = current.parent;
    }

    return false;
  }
}
