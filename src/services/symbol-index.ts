/**
 * Symbol Index Service
 *
 * Provides fast symbol lookup with exact, prefix, substring, and fuzzy matching.
 * Uses k-gram indexing for efficient filtering before applying match criteria.
 */

import type { ASTDoc } from '../models/ASTDoc.js';

/**
 * Symbol entry in the index
 */
export interface SymbolEntry {
  name: string;
  kind: string;
  filePath: string;
  line: number;
  signature?: string;
}

/**
 * Symbol index with k-gram filtering
 */
export class SymbolIndex {
  /** Map of symbol name -> symbol entries */
  private symbols: Map<string, SymbolEntry[]>;

  /** Map of k-gram -> set of symbol names containing that k-gram */
  private kgrams: Map<string, Set<string>>;

  /** K-gram size (default 3) */
  private k: number = 3;

  constructor(k: number = 3) {
    this.symbols = new Map();
    this.kgrams = new Map();
    this.k = k;
  }

  /**
   * Add all symbols from an ASTDoc to the index
   */
  add(filePath: string, astDoc: ASTDoc): void {
    const entries = this.extractSymbols(filePath, astDoc);

    for (const entry of entries) {
      // Add to symbol map
      const existing = this.symbols.get(entry.name) || [];
      existing.push(entry);
      this.symbols.set(entry.name, existing);

      // Add k-grams
      const kgrams = this.generateKgrams(entry.name.toLowerCase());
      for (const kgram of kgrams) {
        const names = this.kgrams.get(kgram) || new Set();
        names.add(entry.name);
        this.kgrams.set(kgram, names);
      }
    }
  }

  /**
   * Remove all symbols from a file
   */
  remove(filePath: string): void {
    // Find all symbols from this file
    const toRemove: string[] = [];

    for (const [name, entries] of this.symbols.entries()) {
      // Filter out entries from this file
      const remaining = entries.filter(e => e.filePath !== filePath);

      if (remaining.length === 0) {
        // No more entries for this symbol name
        toRemove.push(name);
      } else {
        this.symbols.set(name, remaining);
      }
    }

    // Remove symbol names and their k-grams
    for (const name of toRemove) {
      this.symbols.delete(name);

      // Remove from k-gram index
      const kgrams = this.generateKgrams(name.toLowerCase());
      for (const kgram of kgrams) {
        const names = this.kgrams.get(kgram);
        if (names) {
          names.delete(name);
          if (names.size === 0) {
            this.kgrams.delete(kgram);
          }
        }
      }
    }
  }

  /**
   * Clear the entire index
   */
  clear(): void {
    this.symbols.clear();
    this.kgrams.clear();
  }

  /**
   * Exact match - find symbols with exact name
   */
  exactMatch(query: string): SymbolEntry[] {
    return this.symbols.get(query) || [];
  }

  /**
   * Prefix match - find symbols starting with prefix
   */
  prefixMatch(prefix: string, limit: number = 50): SymbolEntry[] {
    const prefixLower = prefix.toLowerCase();

    // K-gram filtering: get candidate symbols
    const candidates = this.getCandidates(prefixLower);

    // Filter for actual prefix match
    const results: SymbolEntry[] = [];

    for (const name of candidates) {
      if (name.toLowerCase().startsWith(prefixLower)) {
        const entries = this.symbols.get(name) || [];
        results.push(...entries);

        if (results.length >= limit) {
          break;
        }
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Substring match - find symbols containing substring
   */
  substringMatch(substring: string, limit: number = 50): SymbolEntry[] {
    const substringLower = substring.toLowerCase();

    // K-gram filtering: get candidate symbols
    const candidates = this.getCandidates(substringLower);

    // Filter for actual substring match
    const results: SymbolEntry[] = [];

    for (const name of candidates) {
      if (name.toLowerCase().includes(substringLower)) {
        const entries = this.symbols.get(name) || [];
        results.push(...entries);

        if (results.length >= limit) {
          break;
        }
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Fuzzy match - find symbols within edit distance threshold
   */
  fuzzyMatch(query: string, maxDistance: number = 2, limit: number = 50): SymbolEntry[] {
    const queryLower = query.toLowerCase();

    // K-gram filtering: get candidate symbols
    const candidates = this.getCandidates(queryLower);

    // Calculate edit distance and sort by distance
    const scored: Array<{ name: string; distance: number }> = [];

    for (const name of candidates) {
      const distance = this.levenshtein(queryLower, name.toLowerCase());
      if (distance <= maxDistance) {
        scored.push({ name, distance });
      }
    }

    // Sort by distance (closest first)
    scored.sort((a, b) => a.distance - b.distance);

    // Collect results
    const results: SymbolEntry[] = [];

    for (const { name } of scored) {
      const entries = this.symbols.get(name) || [];
      results.push(...entries);

      if (results.length >= limit) {
        break;
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Get statistics about the index
   */
  getStats(): {
    numSymbols: number;
    numUniqueNames: number;
    numKgrams: number;
  } {
    let numSymbols = 0;
    for (const entries of this.symbols.values()) {
      numSymbols += entries.length;
    }

    return {
      numSymbols,
      numUniqueNames: this.symbols.size,
      numKgrams: this.kgrams.size,
    };
  }

  /**
   * Extract all symbols from ASTDoc
   */
  private extractSymbols(filePath: string, astDoc: ASTDoc): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];

    // Functions
    if (astDoc.functions) {
      for (const [name, func] of Object.entries(astDoc.functions)) {
        symbols.push({
          name,
          kind: 'function',
          filePath,
          line: func.span.startLine,
          signature: func.signature,
        });
      }
    }

    // Classes
    if (astDoc.classes) {
      for (const [name, cls] of Object.entries(astDoc.classes)) {
        symbols.push({
          name,
          kind: 'class',
          filePath,
          line: cls.span.startLine,
        });

        // Methods
        if (cls.methods) {
          for (const [methodName, method] of Object.entries(cls.methods)) {
            symbols.push({
              name: `${name}.${methodName}`,
              kind: 'method',
              filePath,
              line: method.span.startLine,
              signature: method.signature,
            });
          }
        }
      }
    }

    // Interfaces
    if (astDoc.interfaces) {
      for (const [name, iface] of Object.entries(astDoc.interfaces)) {
        symbols.push({
          name,
          kind: 'interface',
          filePath,
          line: iface.span.startLine,
        });
      }
    }

    // Type aliases
    if (astDoc.type_aliases) {
      for (const [name, typeAlias] of Object.entries(astDoc.type_aliases)) {
        symbols.push({
          name,
          kind: 'type',
          filePath,
          line: typeAlias.span.startLine,
          signature: typeAlias.type,
        });
      }
    }

    // Enums
    if (astDoc.enums) {
      for (const [name, enumType] of Object.entries(astDoc.enums)) {
        symbols.push({
          name,
          kind: 'enum',
          filePath,
          line: enumType.span.startLine,
        });
      }
    }

    // Constants
    if (astDoc.constants) {
      for (const [name, constant] of Object.entries(astDoc.constants)) {
        symbols.push({
          name,
          kind: 'constant',
          filePath,
          line: constant.span.startLine,
        });
      }
    }

    // Components
    if (astDoc.components) {
      for (const [name, component] of Object.entries(astDoc.components)) {
        symbols.push({
          name,
          kind: 'component',
          filePath,
          line: component.span.startLine,
        });
      }
    }

    return symbols;
  }

  /**
   * Generate k-grams from text
   * For query "hello" with k=3: ["$he", "hel", "ell", "llo", "lo$"]
   * Uses $ as padding to capture start/end of string
   */
  private generateKgrams(text: string): string[] {
    const kgrams: string[] = [];

    // Add padding
    const padded = `$${text}$`;

    // Generate k-grams
    for (let i = 0; i <= padded.length - this.k; i++) {
      kgrams.push(padded.substring(i, i + this.k));
    }

    return kgrams;
  }

  /**
   * Get candidate symbol names using k-gram filtering
   * Returns symbol names that share at least one k-gram with the query
   */
  private getCandidates(query: string): Set<string> {
    const queryKgrams = this.generateKgrams(query);

    if (queryKgrams.length === 0) {
      // No k-grams, return all symbols (fallback)
      return new Set(this.symbols.keys());
    }

    // Collect all symbols that contain any of the query k-grams
    const candidates = new Set<string>();

    for (const kgram of queryKgrams) {
      const names = this.kgrams.get(kgram);
      if (names) {
        for (const name of names) {
          candidates.add(name);
        }
      }
    }

    return candidates;
  }

  /**
   * Calculate Levenshtein distance (edit distance) between two strings
   * Classic dynamic programming algorithm
   */
  private levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    // Create matrix
    const matrix: number[][] = [];

    // Initialize first row and column
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0]![j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          // Characters match, no operation needed
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          // Take minimum of insert, delete, substitute
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j]! + 1, // delete
            matrix[i]![j - 1]! + 1, // insert
            matrix[i - 1]![j - 1]! + 1 // substitute
          );
        }
      }
    }

    return matrix[b.length]![a.length]!;
  }
}
