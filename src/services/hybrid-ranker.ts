/**
 * Hybrid ranking service using Reciprocal Rank Fusion (RRF)
 *
 * @module hybrid-ranker
 */

import type { RankingCandidate } from '../models/ranking-candidate.js';
import type { HybridResult, ScoreBreakdown } from '../models/hybrid-result.js';
import type { RankingConfig } from '../models/ranking-config.js';

/**
 * HybridRanker combines lexical and vector search results using RRF
 *
 * Implements Reciprocal Rank Fusion algorithm:
 * score(doc) = α * (1/(k + rank_lexical)) + β * (1/(k + rank_vector))
 *
 * Features:
 * - Deduplication of overlapping candidates
 * - Fallback mode when one source is empty
 * - Early termination at top-K
 * - Detailed score breakdown for debugging
 */
export class HybridRanker {
  private config: RankingConfig;

  /**
   * Create a new HybridRanker
   *
   * @param config - Ranking configuration with fusion weights
   */
  constructor(config: RankingConfig) {
    this.config = config;
  }

  /**
   * Rank candidates from lexical and vector sources using RRF
   *
   * @param lexicalCandidates - Candidates from lexical search (BM25/FTS5)
   * @param vectorCandidates - Candidates from vector search (semantic)
   * @returns Ranked hybrid results sorted by final score (descending)
   */
  rank(
    lexicalCandidates: RankingCandidate[],
    vectorCandidates: RankingCandidate[]
  ): HybridResult[] {
    // Handle empty inputs
    if (lexicalCandidates.length === 0 && vectorCandidates.length === 0) {
      return [];
    }

    // Get config values
    const { alpha, beta, rrfK } = this.config.fusion;
    const { earlyTerminationTopK } = this.config.performance;

    // Create candidate map for deduplication
    // Key: fileId:lineNumber
    const candidateMap = new Map<string, {
      candidate: RankingCandidate;
      lexicalRank?: number;
      lexicalScore?: number;
      vectorRank?: number;
      vectorScore?: number;
    }>();

    // Process lexical candidates
    for (const candidate of lexicalCandidates) {
      const key = `${candidate.fileId}:${candidate.lineNumber}`;
      candidateMap.set(key, {
        candidate,
        lexicalRank: candidate.sourceRank,
        lexicalScore: candidate.sourceScore,
      });
    }

    // Process vector candidates (merge with existing or add new)
    for (const candidate of vectorCandidates) {
      const key = `${candidate.fileId}:${candidate.lineNumber}`;
      const existing = candidateMap.get(key);

      if (existing) {
        // Candidate appears in both sources - merge
        existing.vectorRank = candidate.sourceRank;
        existing.vectorScore = candidate.sourceScore;
        // Prefer vector candidate for metadata (may have better snippet)
        existing.candidate = candidate;
      } else {
        // New candidate from vector source
        candidateMap.set(key, {
          candidate,
          vectorRank: candidate.sourceRank,
          vectorScore: candidate.sourceScore,
        });
      }
    }

    // Calculate RRF scores for all candidates
    const results: HybridResult[] = [];

    for (const [, entry] of candidateMap) {
      const { candidate, lexicalRank, lexicalScore, vectorRank, vectorScore } = entry;

      // Calculate RRF contributions
      const lexicalContribution = lexicalRank !== undefined
        ? alpha / (rrfK + lexicalRank)
        : 0;

      const vectorContribution = vectorRank !== undefined
        ? beta / (rrfK + vectorRank)
        : 0;

      // Final score (tie-breaker will be added later by TieBreaker service)
      const finalScore = lexicalContribution + vectorContribution;

      // Build score breakdown
      const scoreBreakdown: ScoreBreakdown = {
        lexicalContribution,
        vectorContribution,
        tieBreakerContribution: 0, // Will be filled by TieBreaker service
        lexicalRank,
        vectorRank,
        lexicalScore,
        vectorScore,
      };

      // Create hybrid result
      const result: HybridResult = {
        fileId: candidate.fileId,
        filePath: candidate.filePath,
        lineNumber: candidate.lineNumber,
        columnNumber: candidate.columnNumber,
        snippet: candidate.snippet,
        symbolName: candidate.symbolName,
        symbolType: candidate.symbolType,
        language: candidate.language,
        finalScore,
        finalRank: 0, // Will be assigned after sorting
        scoreBreakdown,
        fileSize: candidate.fileSize,
        lastModified: candidate.lastModified,
      };

      results.push(result);
    }

    // Sort by final score (descending)
    results.sort((a, b) => b.finalScore - a.finalScore);

    // Apply early termination
    const topResults = results.slice(0, earlyTerminationTopK);

    // Assign final ranks (1-based)
    topResults.forEach((result, index) => {
      result.finalRank = index + 1;
    });

    return topResults;
  }
}
