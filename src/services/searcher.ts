/**
 * Simplified Search Service
 *
 * Uses hybrid index for search and returns enriched results with full AST.
 */

import type { ParseResult } from '../models/ParseResult.js';
import { HybridIndex, type HybridSearchResult } from './hybrid-index.js';
import { ASTPersistenceService } from './ast-persistence.js';

/**
 * Search result with full AST
 */
export interface EnrichedSearchResult extends HybridSearchResult {
  /** Full ParseResult AST */
  ast: ParseResult | null;
  /** Anchor for referencing (file:line:column) */
  anchor: string;
}

/**
 * Search options
 */
export interface SearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Weight for dense similarity (0-1) */
  denseWeight?: number;
  /** Weight for sparse similarity (0-1) */
  sparseWeight?: number;
  /** Include full AST in results */
  includeAst?: boolean;
}

/**
 * Simplified search service using hybrid index
 */
export class SearchService {
  private hybridIndex: HybridIndex;
  private astPersistence: ASTPersistenceService;

  constructor(hybridIndex: HybridIndex, astPersistence: ASTPersistenceService) {
    this.hybridIndex = hybridIndex;
    this.astPersistence = astPersistence;
  }

  /**
   * Search the codebase using hybrid search
   */
  async search(query: string, options: SearchOptions = {}): Promise<EnrichedSearchResult[]> {
    const { limit = 10, denseWeight, sparseWeight, includeAst = true } = options;

    // Perform hybrid search
    const hybridResults = await this.hybridIndex.search(query, {
      limit,
      denseWeight,
      sparseWeight,
    });

    // Enrich with AST if requested
    const enrichedResults: EnrichedSearchResult[] = [];

    for (const result of hybridResults) {
      let ast: ParseResult | null = null;

      if (includeAst) {
        ast = await this.astPersistence.read(result.filePath);
      }

      enrichedResults.push({
        ...result,
        ast,
        anchor: this.createAnchor(result.filePath, ast),
      });
    }

    return enrichedResults;
  }

  /**
   * Find definition of a symbol by name
   */
  async findDefinition(symbolName: string, limit: number = 10): Promise<EnrichedSearchResult[]> {
    // Use hybrid search with the symbol name
    return this.search(symbolName, { limit, includeAst: true });
  }

  /**
   * Find all references to a symbol
   * Searches in function calls and import/export statements
   */
  async findReferences(symbolName: string, limit: number = 50): Promise<EnrichedSearchResult[]> {
    const results = await this.search(symbolName, { limit: limit * 2, includeAst: true });

    // Filter results that actually reference the symbol
    return results.filter(result => {
      if (!result.ast) return false;

      // Check function calls
      const hasCall = result.ast.calls.some(call =>
        call.callee === symbolName || call.receiver === symbolName
      );

      // Check imports
      const hasImport = result.ast.imports.some(imp =>
        imp.specifiers.some(spec => spec.imported === symbolName || spec.local === symbolName)
      );

      // Check exports
      const hasExport = result.ast.exports.some(exp =>
        exp.specifiers.some(spec => spec.local === symbolName || spec.exported === symbolName)
      );

      // Check symbols
      const hasSymbol = result.ast.symbols.some(sym => sym.name === symbolName);

      return hasCall || hasImport || hasExport || hasSymbol;
    }).slice(0, limit);
  }

  /**
   * Find all callers of a function
   */
  async findCallers(functionName: string, limit: number = 50): Promise<EnrichedSearchResult[]> {
    const results = await this.search(functionName, { limit: limit * 2, includeAst: true });

    // Filter results that call the function
    return results.filter(result => {
      if (!result.ast) return false;

      return result.ast.calls.some(call => call.callee === functionName);
    }).slice(0, limit);
  }

  /**
   * Find all callees of a function (functions it calls)
   */
  async findCallees(functionName: string): Promise<string[]> {
    const results = await this.search(functionName, { limit: 10, includeAst: true });

    const callees = new Set<string>();

    for (const result of results) {
      if (!result.ast) continue;

      // Find the function definition
      const func = result.ast.symbols.find(
        sym => sym.name === functionName && (sym.kind === 'function' || sym.kind === 'method')
      );

      if (!func) continue;

      // Find all calls within this function's span
      for (const call of result.ast.calls) {
        if (
          call.span.startLine >= func.span.startLine &&
          call.span.endLine <= func.span.endLine
        ) {
          callees.add(call.callee);
        }
      }
    }

    return Array.from(callees);
  }

  /**
   * List all symbols in a file or across the codebase
   */
  async listSymbols(filePath?: string, symbolKind?: string): Promise<{
    file: string;
    symbols: Array<{
      name: string;
      kind: string;
      line: number;
      signature?: string;
    }>;
  }[]> {
    if (filePath) {
      // List symbols in specific file
      const ast = await this.astPersistence.read(filePath);
      if (!ast) {
        return [];
      }

      const symbols = ast.symbols
        .filter(sym => !symbolKind || sym.kind === symbolKind)
        .map(sym => ({
          name: sym.name,
          kind: sym.kind,
          line: sym.span.startLine,
          signature: sym.signature || undefined,
        }));

      return [{ file: filePath, symbols }];
    } else {
      // List symbols across all files
      const allFiles = await this.astPersistence.listAll();
      const results: any[] = [];

      for (const file of allFiles) {
        const ast = await this.astPersistence.read(file);
        if (!ast) continue;

        const symbols = ast.symbols
          .filter(sym => !symbolKind || sym.kind === symbolKind)
          .map(sym => ({
            name: sym.name,
            kind: sym.kind,
            line: sym.span.startLine,
            signature: sym.signature || undefined,
          }));

        if (symbols.length > 0) {
          results.push({ file, symbols });
        }
      }

      return results;
    }
  }

  /**
   * Create an anchor reference for a result
   * Format: file:line:column
   */
  private createAnchor(filePath: string, ast: ParseResult | null): string {
    if (!ast || ast.symbols.length === 0) {
      return `${filePath}:1:1`;
    }

    // Use the first symbol's location
    const firstSymbol = ast.symbols[0];
    if (!firstSymbol) {
      return `${filePath}:1:1`;
    }

    return `${filePath}:${firstSymbol.span.startLine}:${firstSymbol.span.startColumn}`;
  }
}
