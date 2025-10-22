/**
 * Simplified Search Service
 *
 * Uses hybrid index for search and returns enriched results with full AST.
 */

import type { ASTDoc } from '../models/ASTDoc.js';
import { HybridIndex, type HybridSearchResult } from './hybrid-index.js';
import { ASTPersistenceService } from './ast-persistence.js';
import { SymbolIndex, type SymbolEntry } from './symbol-index.js';

/**
 * Search result with full AST
 */
export interface EnrichedSearchResult extends HybridSearchResult {
  /** Full ASTDoc representation */
  ast: ASTDoc | null;
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
  /** Specific symbol name to locate (for precise anchors) */
  symbolName?: string;
}

/**
 * Simplified search service using hybrid index
 */
export class SearchService {
  private hybridIndex: HybridIndex;
  private symbolIndex: SymbolIndex;
  private astPersistence: ASTPersistenceService;

  constructor(
    hybridIndex: HybridIndex,
    symbolIndex: SymbolIndex,
    astPersistence: ASTPersistenceService
  ) {
    this.hybridIndex = hybridIndex;
    this.symbolIndex = symbolIndex;
    this.astPersistence = astPersistence;
  }

  /**
   * Search the codebase using hybrid search
   */
  async search(query: string, options: SearchOptions = {}): Promise<EnrichedSearchResult[]> {
    const { limit = 10, denseWeight, sparseWeight, includeAst = true, symbolName } = options;

    // Perform hybrid search
    const hybridResults = await this.hybridIndex.search(query, {
      limit,
      denseWeight,
      sparseWeight,
    });

    // Enrich with AST if requested
    const enrichedResults: EnrichedSearchResult[] = [];

    for (const result of hybridResults) {
      let ast: ASTDoc | null = null;

      if (includeAst) {
        ast = await this.astPersistence.read(result.filePath);
      }

      enrichedResults.push({
        ...result,
        ast,
        anchor: this.createAnchor(result.filePath, ast, symbolName),
      });
    }

    return enrichedResults;
  }

  /**
   * Find definition of a symbol by name
   * Only returns results where the symbol is actually defined (not just referenced)
   */
  async findDefinition(symbolName: string, limit: number = 10): Promise<EnrichedSearchResult[]> {
    // First, try exact match using symbol index (fast path)
    const exactMatches = this.symbolIndex.exactMatch(symbolName);

    if (exactMatches.length > 0) {
      // Found exact matches, convert to EnrichedSearchResult format
      const enrichedResults: EnrichedSearchResult[] = [];

      for (const match of exactMatches.slice(0, limit)) {
        const ast = await this.astPersistence.read(match.filePath);
        enrichedResults.push({
          filePath: match.filePath,
          score: 1.0, // Exact match gets perfect score
          denseScore: 1.0,
          sparseScore: 1.0,
          ast,
          anchor: this.createAnchor(match.filePath, ast, symbolName)
        });
      }

      return enrichedResults;
    }

    // Fall back to hybrid search with the symbol name, searching more results to filter
    const results = await this.search(symbolName, {
      limit: limit * 3,
      includeAst: true,
      symbolName
    });

    // Filter to only include files where the symbol is actually defined
    const definitions = results.filter(result => {
      if (!result.ast) return false;

      // Check if symbol is defined in this file
      const isDefined =
        (result.ast.functions && symbolName in result.ast.functions) ||
        (result.ast.classes && symbolName in result.ast.classes) ||
        (result.ast.interfaces && symbolName in result.ast.interfaces) ||
        (result.ast.type_aliases && symbolName in result.ast.type_aliases) ||
        (result.ast.enums && symbolName in result.ast.enums) ||
        (result.ast.constants && symbolName in result.ast.constants) ||
        (result.ast.components && symbolName in result.ast.components);

      // Also check for methods (symbolName might be "ClassName.methodName")
      if (!isDefined && symbolName.includes('.')) {
        const [className, methodName] = symbolName.split('.');
        if (className && methodName && result.ast.classes?.[className]?.methods?.[methodName]) {
          return true;
        }
      }

      return isDefined;
    });

    return definitions.slice(0, limit);
  }

  /**
   * Find all references to a symbol
   * Searches in function calls and import/export statements
   */
  async findReferences(symbolName: string, limit: number = 50): Promise<EnrichedSearchResult[]> {
    const results = await this.search(symbolName, {
      limit: limit * 2,
      includeAst: true,
      symbolName  // Pass symbolName to help with anchor positioning
    });

    // Filter results that actually reference the symbol
    return results.filter(result => {
      if (!result.ast) return false;

      // Check function calls (in functions that call this symbol)
      let hasCall = false;
      if (result.ast.functions) {
        for (const func of Object.values(result.ast.functions)) {
          if (func.calls && func.calls.includes(symbolName)) {
            hasCall = true;
            break;
          }
        }
      }

      // Check method calls (in class methods that call this symbol)
      if (!hasCall && result.ast.classes) {
        for (const cls of Object.values(result.ast.classes)) {
          if (cls.methods) {
            for (const method of Object.values(cls.methods)) {
              if (method.calls && method.calls.includes(symbolName)) {
                hasCall = true;
                break;
              }
            }
          }
          if (hasCall) break;
        }
      }

      // Check imports
      const hasImport = result.ast.imports ? result.ast.imports.some(imp =>
        imp.specifiers.some(spec => spec.imported === symbolName || spec.local === symbolName)
      ) : false;

      // Check exports
      const hasExport = result.ast.exports ? result.ast.exports.some(exp =>
        exp.specifiers.some(spec => spec.local === symbolName || spec.exported === symbolName)
      ) : false;

      // Check if it's defined as a symbol
      const hasSymbol =
        (result.ast.functions && symbolName in result.ast.functions) ||
        (result.ast.classes && symbolName in result.ast.classes) ||
        (result.ast.interfaces && symbolName in result.ast.interfaces) ||
        (result.ast.type_aliases && symbolName in result.ast.type_aliases) ||
        (result.ast.enums && symbolName in result.ast.enums) ||
        (result.ast.constants && symbolName in result.ast.constants) ||
        (result.ast.components && symbolName in result.ast.components);

      return hasCall || hasImport || hasExport || hasSymbol;
    }).slice(0, limit);
  }

  /**
   * Find all callers of a function
   * Returns results with anchors pointing to the calling function/method
   */
  async findCallers(functionName: string, limit: number = 50): Promise<EnrichedSearchResult[]> {
    const results = await this.search(functionName, { limit: limit * 2, includeAst: true });

    // Filter results and identify the calling function
    const callers: EnrichedSearchResult[] = [];

    for (const result of results) {
      if (!result.ast) continue;

      let callerSymbolName: string | undefined;

      // Check if any function calls it
      if (result.ast.functions) {
        for (const [funcName, func] of Object.entries(result.ast.functions)) {
          if (func.calls && func.calls.includes(functionName)) {
            callerSymbolName = funcName;
            break;
          }
        }
      }

      // Check if any method calls it
      if (!callerSymbolName && result.ast.classes) {
        for (const [className, cls] of Object.entries(result.ast.classes)) {
          if (cls.methods) {
            for (const [methodName, method] of Object.entries(cls.methods)) {
              if (method.calls && method.calls.includes(functionName)) {
                callerSymbolName = `${className}.${methodName}`;
                break;
              }
            }
          }
          if (callerSymbolName) break;
        }
      }

      if (callerSymbolName) {
        // Update the anchor to point to the calling function/method
        callers.push({
          ...result,
          anchor: this.createAnchor(result.filePath, result.ast, callerSymbolName)
        });
      }

      if (callers.length >= limit) break;
    }

    return callers;
  }

  /**
   * Find all callees of a function (functions it calls)
   * Returns full symbol information for each callee
   */
  async findCallees(functionName: string): Promise<EnrichedSearchResult[]> {
    // First, find the definition of the function to get its callees list
    const functionDefs = await this.search(functionName, {
      limit: 10,
      includeAst: true,
      symbolName: functionName
    });

    const calleeNames = new Set<string>();

    // Extract all function names that this function calls
    for (const result of functionDefs) {
      if (!result.ast) continue;

      // Check if it's a top-level function
      if (result.ast.functions && functionName in result.ast.functions) {
        const func = result.ast.functions[functionName];
        if (func && func.calls) {
          func.calls.forEach(callee => calleeNames.add(callee));
        }
      }

      // Check if it's a method in any class (handle "ClassName.methodName")
      if (functionName.includes('.')) {
        const [className, methodName] = functionName.split('.');
        if (className && methodName && result.ast.classes?.[className]?.methods?.[methodName]) {
          const method = result.ast.classes[className].methods[methodName];
          if (method && method.calls) {
            method.calls.forEach(callee => calleeNames.add(callee));
          }
        }
      }

      // Also check all classes for matching method name
      if (result.ast.classes) {
        for (const cls of Object.values(result.ast.classes)) {
          if (cls.methods && functionName in cls.methods) {
            const method = cls.methods[functionName];
            if (method && method.calls) {
              method.calls.forEach(callee => calleeNames.add(callee));
            }
          }
        }
      }
    }

    // Now find the definitions of each callee
    const calleeResults: EnrichedSearchResult[] = [];

    for (const calleeName of calleeNames) {
      const defs = await this.findDefinition(calleeName, 1);
      if (defs.length > 0 && defs[0]) {
        calleeResults.push(defs[0]);
      }
    }

    return calleeResults;
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

      const symbols = this.extractSymbolsFromAst(ast, symbolKind);
      return [{ file: filePath, symbols }];
    } else {
      // List symbols across all files
      const allFiles = await this.astPersistence.listAll();
      const results: any[] = [];

      for (const file of allFiles) {
        const ast = await this.astPersistence.read(file);
        if (!ast) continue;

        const symbols = this.extractSymbolsFromAst(ast, symbolKind);

        if (symbols.length > 0) {
          results.push({ file, symbols });
        }
      }

      return results;
    }
  }

  /**
   * Extract symbols from ASTDoc into a flat list
   */
  private extractSymbolsFromAst(ast: ASTDoc, symbolKind?: string): Array<{
    name: string;
    kind: string;
    line: number;
    signature?: string;
  }> {
    const symbols: Array<{ name: string; kind: string; line: number; signature?: string }> = [];

    // Functions
    if (ast.functions && (!symbolKind || symbolKind === 'function')) {
      for (const [name, func] of Object.entries(ast.functions)) {
        symbols.push({
          name,
          kind: 'function',
          line: func.span.startLine,
          signature: func.signature,
        });
      }
    }

    // Classes
    if (ast.classes && (!symbolKind || symbolKind === 'class')) {
      for (const [name, cls] of Object.entries(ast.classes)) {
        symbols.push({
          name,
          kind: 'class',
          line: cls.span.startLine,
          signature: undefined,
        });

        // Include methods if not filtering by kind, or filtering for 'method'
        if (cls.methods && (!symbolKind || symbolKind === 'method')) {
          for (const [methodName, method] of Object.entries(cls.methods)) {
            symbols.push({
              name: `${name}.${methodName}`,
              kind: 'method',
              line: method.span.startLine,
              signature: method.signature,
            });
          }
        }
      }
    }

    // Interfaces
    if (ast.interfaces && (!symbolKind || symbolKind === 'interface')) {
      for (const [name, iface] of Object.entries(ast.interfaces)) {
        symbols.push({
          name,
          kind: 'interface',
          line: iface.span.startLine,
          signature: undefined,
        });
      }
    }

    // Type aliases
    if (ast.type_aliases && (!symbolKind || symbolKind === 'type')) {
      for (const [name, typeAlias] of Object.entries(ast.type_aliases)) {
        symbols.push({
          name,
          kind: 'type',
          line: typeAlias.span.startLine,
          signature: typeAlias.type,
        });
      }
    }

    // Enums
    if (ast.enums && (!symbolKind || symbolKind === 'enum')) {
      for (const [name, enumType] of Object.entries(ast.enums)) {
        symbols.push({
          name,
          kind: 'enum',
          line: enumType.span.startLine,
          signature: undefined,
        });
      }
    }

    // Constants
    if (ast.constants && (!symbolKind || symbolKind === 'constant')) {
      for (const [name, constant] of Object.entries(ast.constants)) {
        symbols.push({
          name,
          kind: 'constant',
          line: constant.span.startLine,
          signature: undefined,
        });
      }
    }

    // Components
    if (ast.components && (!symbolKind || symbolKind === 'component')) {
      for (const [name, component] of Object.entries(ast.components)) {
        symbols.push({
          name,
          kind: 'component',
          line: component.span.startLine,
          signature: undefined,
        });
      }
    }

    return symbols;
  }

  /**
   * Find symbol by exact name match
   */
  findSymbolExact(name: string): SymbolEntry[] {
    return this.symbolIndex.exactMatch(name);
  }

  /**
   * Find symbols by prefix
   */
  findSymbolsByPrefix(prefix: string, limit: number = 50): SymbolEntry[] {
    return this.symbolIndex.prefixMatch(prefix, limit);
  }

  /**
   * Find symbols by substring
   */
  findSymbolsBySubstring(substring: string, limit: number = 50): SymbolEntry[] {
    return this.symbolIndex.substringMatch(substring, limit);
  }

  /**
   * Find symbols by fuzzy match
   */
  findSymbolsFuzzy(query: string, maxDistance: number = 2, limit: number = 50): SymbolEntry[] {
    return this.symbolIndex.fuzzyMatch(query, maxDistance, limit);
  }

  /**
   * Get symbol index statistics
   */
  getSymbolStats(): {
    numSymbols: number;
    numUniqueNames: number;
    numKgrams: number;
  } {
    return this.symbolIndex.getStats();
  }

  /**
   * Create an anchor reference for a result
   * Format: file:line:column
   *
   * @param filePath - Path to the file
   * @param ast - AST document
   * @param symbolName - Optional specific symbol to locate
   * @returns Anchor string in format "file:line:column"
   */
  private createAnchor(filePath: string, ast: ASTDoc | null, symbolName?: string): string {
    if (!ast) {
      return `${filePath}:1:1`;
    }

    let targetSymbol: { span: { startLine: number; startColumn: number } } | null = null;

    // If symbolName is provided, find that specific symbol
    if (symbolName) {
      // Check functions
      if (!targetSymbol && ast.functions && symbolName in ast.functions) {
        targetSymbol = ast.functions[symbolName] || null;
      }

      // Check classes
      if (!targetSymbol && ast.classes && symbolName in ast.classes) {
        targetSymbol = ast.classes[symbolName] || null;
      }

      // Check methods within classes (symbolName might be "ClassName.methodName")
      if (!targetSymbol && ast.classes && symbolName.includes('.')) {
        const [className, methodName] = symbolName.split('.');
        if (className && methodName && ast.classes[className]?.methods?.[methodName]) {
          targetSymbol = ast.classes[className].methods![methodName] || null;
        }
      }

      // Check interfaces
      if (!targetSymbol && ast.interfaces && symbolName in ast.interfaces) {
        targetSymbol = ast.interfaces[symbolName] || null;
      }

      // Check type aliases
      if (!targetSymbol && ast.type_aliases && symbolName in ast.type_aliases) {
        targetSymbol = ast.type_aliases[symbolName] || null;
      }

      // Check enums
      if (!targetSymbol && ast.enums && symbolName in ast.enums) {
        targetSymbol = ast.enums[symbolName] || null;
      }

      // Check constants
      if (!targetSymbol && ast.constants && symbolName in ast.constants) {
        targetSymbol = ast.constants[symbolName] || null;
      }

      // Check components
      if (!targetSymbol && ast.components && symbolName in ast.components) {
        targetSymbol = ast.components[symbolName] || null;
      }
    }

    // If no specific symbol found, fall back to first symbol in file
    if (!targetSymbol) {
      // Check functions
      if (!targetSymbol && ast.functions) {
        const firstFunc = Object.values(ast.functions)[0];
        targetSymbol = firstFunc || null;
      }

      // Check classes
      if (!targetSymbol && ast.classes) {
        const firstClass = Object.values(ast.classes)[0];
        targetSymbol = firstClass || null;
      }

      // Check interfaces
      if (!targetSymbol && ast.interfaces) {
        const firstInterface = Object.values(ast.interfaces)[0];
        targetSymbol = firstInterface || null;
      }

      // Check type aliases
      if (!targetSymbol && ast.type_aliases) {
        const firstType = Object.values(ast.type_aliases)[0];
        targetSymbol = firstType || null;
      }

      // Check enums
      if (!targetSymbol && ast.enums) {
        const firstEnum = Object.values(ast.enums)[0];
        targetSymbol = firstEnum || null;
      }

      // Check constants
      if (!targetSymbol && ast.constants) {
        const firstConstant = Object.values(ast.constants)[0];
        targetSymbol = firstConstant || null;
      }

      // Check components
      if (!targetSymbol && ast.components) {
        const firstComponent = Object.values(ast.components)[0];
        targetSymbol = firstComponent || null;
      }
    }

    if (!targetSymbol) {
      return `${filePath}:1:1`;
    }

    return `${filePath}:${targetSymbol.span.startLine}:${targetSymbol.span.startColumn}`;
  }
}
