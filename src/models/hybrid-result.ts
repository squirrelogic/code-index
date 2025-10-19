/**
 * Final ranked search result models for hybrid ranking
 *
 * @module hybrid-result
 */

import type { SymbolType } from './ranking-candidate.js';

/**
 * Final ranked search result after fusion, diversification, and tie-breaking
 *
 * This is the primary result type returned to users after all ranking
 * stages are complete.
 */
export interface HybridResult {
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
   * Code snippet with optional syntax highlighting
   */
  snippet: string;

  /**
   * Symbol name if match is in an identifier
   */
  symbolName?: string;

  /**
   * Type of symbol (function, class, variable, etc.)
   */
  symbolType?: SymbolType;

  /**
   * Programming language of the file
   */
  language?: string;

  /**
   * Ranking information
   * Final RRF score (unbounded, higher is better)
   */
  finalScore: number;

  /**
   * Final rank position in results (1-based)
   */
  finalRank: number;

  /**
   * Detailed score composition
   */
  scoreBreakdown: ScoreBreakdown;

  /**
   * Metadata
   * File size in bytes
   */
  fileSize: number;

  /**
   * File modification timestamp
   */
  lastModified: Date;
}

/**
 * Detailed breakdown of how the final score was calculated
 *
 * Useful for debugging and explaining results to users (--explain flag)
 */
export interface ScoreBreakdown {
  /**
   * Component contributions to final score
   * Lexical contribution: α * (1/(k + rank_lexical))
   */
  lexicalContribution: number;

  /**
   * Vector contribution: β * (1/(k + rank_vector))
   */
  vectorContribution: number;

  /**
   * Tie-breaker contribution: γ * tie_breaker_score
   */
  tieBreakerContribution: number;

  /**
   * Original source rankings (if present)
   * Rank from lexical search component
   */
  lexicalRank?: number;

  /**
   * Rank from vector search component
   */
  vectorRank?: number;

  /**
   * Raw BM25 score from lexical search
   */
  lexicalScore?: number;

  /**
   * Raw cosine similarity from vector search [0, 1]
   */
  vectorScore?: number;

  /**
   * Tie-breaker details
   * Breakdown of tie-breaker scoring components
   */
  tieBreakerScores?: TieBreakerScores;

  /**
   * Diversification
   * Penalty applied for path similarity to already-selected results
   */
  diversityPenalty?: number;
}

/**
 * Detailed tie-breaker score components
 *
 * Applied when candidates have similar primary scores (within threshold)
 */
export interface TieBreakerScores {
  /**
   * Symbol type priority [0, 1]
   * Based on SYMBOL_TYPE_PRIORITY mapping
   */
  symbolTypePriority: number;

  /**
   * Path priority [0, 1]
   * Based on directory classification (src/ > lib/ > test/ > docs/)
   */
  pathPriority: number;

  /**
   * Language match score
   * 1 if result language matches query language, 0 otherwise
   */
  languageMatch: number;

  /**
   * Identifier exact match score
   * 1 if query term matches symbol name exactly, 0 otherwise
   */
  identifierMatch: number;

  /**
   * Combined weighted score
   * Weighted combination of all tie-breaker factors
   */
  combinedScore: number;
}
