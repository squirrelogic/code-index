/**
 * Call Graph Extraction
 *
 * Extracts function calls and method invocations to build usage graphs
 * and track function references.
 */

import type { FunctionCall } from '../../models/ParseResult.js';

/**
 * Extract function calls from parsed tree
 *
 * @param tree - Tree-sitter parse tree
 * @param source - Source code content
 * @returns Array of function calls
 */
export function extractCalls(_tree: any, _source: string): FunctionCall[] {
  // TODO: Implement call graph extraction (T040)
  return [];
}
