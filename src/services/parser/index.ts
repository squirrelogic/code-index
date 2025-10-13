/**
 * Tree-sitter Parser Module
 *
 * Main entry point for the parser service. Provides structured code analysis
 * for TypeScript, JavaScript, JSX, TSX, and Python files.
 */

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
  _filePath: string,
  _options?: ParseOptions
): Promise<ParseResult> {
  // TODO: Implementation will be added in subsequent tasks
  throw new Error('Parser not yet implemented');
}

// Re-export all types from ParseResult for convenience
export * from '../../models/ParseResult.js';
