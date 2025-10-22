/**
 * Tree-sitter Parser Module
 *
 * Main entry point for the parser service. Provides structured code analysis
 * for TypeScript, JavaScript, JSX, TSX, and Python files.
 *
 * Returns ASTDoc - the unified AST representation.
 */

import { promises as fs } from 'fs';
import { detectLanguage, loadGrammar } from './LanguageLoader.js';
import { TreeSitterParser } from './TreeSitterParser.js';
import { extractSymbols } from './SymbolExtractor.js';
import { extractImportsExports } from './ImportExportExtractor.js';
import { extractComments } from './CommentExtractor.js';
import { extractCallGraph } from './CallGraphExtractor.js';
import { ASTDocBuilder } from './ASTDocBuilder.js';
import type { ASTDoc, Language } from '../../models/ASTDoc.js';

/**
 * Parse options for customizing parser behavior
 */
export interface ParseOptions {
  /** Whether to use incremental parsing (if previous tree available) */
  incremental?: boolean;

  /** Previous parse tree for incremental parsing */
  previousTree?: any; // TreeSitter.Tree

  /** File content (if not reading from disk) */
  content?: string;
}

/**
 * Main parser interface
 *
 * Analyzes source files and extracts structured information including symbols,
 * imports/exports, function calls, and comments.
 *
 * @param filePath - Absolute path to the file to parse
 * @param options - Optional parsing configuration
 * @returns Complete ASTDoc with all extracted entities
 */
export async function parse(
  filePath: string,
  options?: ParseOptions
): Promise<ASTDoc> {
  try {
    // 1. Detect language from file path
    const language = detectLanguage(filePath) as Language;

    // 2. Read file content (or use provided content)
    const source = options?.content !== undefined
      ? options.content
      : await fs.readFile(filePath, 'utf-8');

    // 3. Load grammar for detected language
    const grammar = await loadGrammar(language);

    // 4. Initialize Tree-sitter parser
    const parser = new TreeSitterParser();
    parser.setLanguage(grammar);

    // 5. Parse source code
    const tree = parser.parse(source);

    // 6. Calculate file statistics
    const lineCount = source.split('\n').length;
    const fileSize = Buffer.byteLength(source, 'utf-8');

    // 7. Initialize ASTDoc builder
    const builder = new ASTDocBuilder(filePath, language, fileSize);

    // 8. Extract symbols (functions, classes, interfaces, etc.)
    extractSymbols(tree, source, builder);

    // 9. Extract imports and exports
    extractImportsExports(tree, source, builder);

    // 10. Extract comments and documentation
    extractComments(tree, source, builder);

    // 11. Extract call graph relationships
    extractCallGraph(tree, source, builder);

    // 12. Extract syntax errors (if any)
    if (tree.rootNode.hasError) {
      const errors = parser.extractErrors(tree, source);
      for (const error of errors) {
        builder.addError(error);
      }
    }

    // 13. Build final ASTDoc
    const astDoc = builder.build(lineCount, '1.0.0');

    // 14. Clean up parser resources
    parser.cleanup();

    return astDoc;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${filePath}: ${errorMessage}`);
  }
}

/**
 * Parse source code directly without reading from file
 *
 * @param source - Source code content
 * @param filePath - Path for reference (doesn't need to exist)
 * @param language - Language to parse as
 * @returns ASTDoc
 */
export async function parseSource(
  source: string,
  filePath: string,
  _language: Language
): Promise<ASTDoc> {
  return parse(filePath, { content: source });
}

// Re-export types for convenience
export * from '../../models/ASTDoc.js';
export { ASTDocBuilder } from './ASTDocBuilder.js';
