/**
 * Intermediate representation of search candidates for ranking
 *
 * @module ranking-candidate
 */

/**
 * Symbol types for code elements
 * Used for tie-breaking priority
 */
export type SymbolType =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'constant'
  | 'method'
  | 'property'
  | 'comment'
  | 'string_literal'
  | 'unknown';

/**
 * Symbol type priority for tie-breaking
 * Higher values indicate more important symbols
 * Functions and classes are prioritized over variables and comments
 */
export const SYMBOL_TYPE_PRIORITY: Record<SymbolType, number> = {
  function: 100,
  class: 95,
  interface: 90,
  type: 85,
  method: 80,
  constant: 75,
  variable: 70,
  property: 65,
  string_literal: 30,
  comment: 20,
  unknown: 10,
};

/**
 * Candidate from either lexical or vector search
 *
 * Lifecycle:
 * 1. Created during candidate retrieval phase from lexical/vector sources
 * 2. Passed to HybridRanker.rank() for fusion
 * 3. Transformed into HybridResult after ranking
 */
export interface RankingCandidate {
  /**
   * Source identification
   * Indicates which search component produced this candidate
   */
  source: 'lexical' | 'vector';

  /**
   * Original rank from source component (1-based)
   * Used in RRF formula: score = α/(k + rank_lexical) + β/(k + rank_vector)
   */
  sourceRank: number;

  /**
   * Raw score from source
   * - Lexical: BM25 score (unbounded)
   * - Vector: Cosine similarity [0, 1]
   */
  sourceScore: number;

  /**
   * Result identification
   * Database file identifier
   */
  fileId: string;

  /**
   * Relative file path from project root
   */
  filePath: string;

  /**
   * Line number where match occurs (1-based)
   */
  lineNumber: number;

  /**
   * Optional column number for precise location
   */
  columnNumber?: number;

  /**
   * Content
   * Code snippet or preview of the match
   */
  snippet: string;

  /**
   * Symbol name if match is in an identifier
   * e.g., function name, class name, variable name
   */
  symbolName?: string;

  /**
   * Type of symbol (function, class, variable, etc.)
   * Used for tie-breaking priority
   */
  symbolType?: SymbolType;

  /**
   * Programming language of the file
   * e.g., 'typescript', 'python', 'javascript'
   */
  language?: string;

  /**
   * Metadata for tie-breaking
   * File size in bytes
   */
  fileSize: number;

  /**
   * File modification timestamp
   */
  lastModified: Date;
}
