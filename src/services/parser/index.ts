/**
 * Tree-sitter Parser Module
 *
 * Main entry point for the parser service. Provides structured code analysis
 * for TypeScript, JavaScript, JSX, TSX, and Python files.
 */

import { promises as fs } from 'fs';
import { detectLanguage, loadGrammar } from './LanguageLoader.js';
import { TreeSitterParser } from './TreeSitterParser.js';
import { extractSymbols } from './SymbolExtractor.js';
import { extractImports, extractExports } from './ImportExportExtractor.js';
import { extractComments } from './CommentExtractor.js';
import { extractCalls } from './CallGraphExtractor.js';
import { extractSemanticContent, generateHash } from './HashGenerator.js';
import type { ParseResult } from '../../models/ParseResult.js';

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
 * imports/exports, function calls, comments, and content hashes.
 *
 * @param filePath - Absolute path to the file to parse
 * @param options - Optional parsing configuration
 * @returns Complete parse result with all extracted entities
 */
export async function parse(
  filePath: string,
  options?: ParseOptions
): Promise<ParseResult> {
  const startTime = Date.now();

  try {
    // 1. Detect language from file path (before reading file)
    const language = detectLanguage(filePath);

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

    // 6. Extract syntax errors (with recovery info)
    const errors = parser.extractErrors(tree, source);

    // 7. Extract symbols (T019)
    const symbols = extractSymbols(tree, source);

    // 8. Extract imports and exports (T028)
    const imports = extractImports(tree, source);
    const exports = extractExports(tree, source);

    // 9. Extract comments and documentation (T036)
    const comments = extractComments(tree, source, symbols);

    // 10. Associate documentation with symbols
    // Update symbol.documentation field for symbols with associated comments
    for (const comment of comments) {
      if (comment.associatedSymbol) {
        const symbol = symbols.find(s => s.name === comment.associatedSymbol);
        if (symbol) {
          symbol.documentation = comment.text;
        }
      }
    }

    // 11. Extract function calls (T042)
    const calls = extractCalls(tree, source);

    // 12. Generate content hashes for all symbols (T048)
    const hashStartTime = Date.now();
    for (const symbol of symbols) {
      const semanticContent = extractSemanticContent(symbol, source);
      symbol.hash = generateHash(semanticContent);
    }
    const hashDuration = Date.now() - hashStartTime;

    // 13. Count lines and file size
    const lines = source.split('\n');
    const lineCount = lines.length;
    const fileSize = Buffer.byteLength(source, 'utf-8');

    // 14. Calculate parse duration
    const duration = Date.now() - startTime;

    // Validate hash generation overhead (<5% requirement from SC-007)
    const hashOverhead = (hashDuration / duration) * 100;
    if (hashOverhead > 5) {
      console.warn(`Hash generation overhead ${hashOverhead.toFixed(2)}% exceeds 5% target`);
    }

    // 15. Create ParseResult with metadata
    const result: ParseResult = {
      path: filePath,
      language,
      symbols,
      imports,
      exports,
      calls,
      comments,
      errors,
      metadata: {
        parsedAt: new Date().toISOString(),
        duration,
        lineCount,
        fileSize,
        incremental: options?.incremental ?? false,
        parserVersion: '1.0.0',
      },
    };

    // Clean up parser resources
    parser.cleanup();

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${filePath}: ${errorMessage}`);
  }
}

// Re-export all types from ParseResult for convenience
export * from '../../models/ParseResult.js';
