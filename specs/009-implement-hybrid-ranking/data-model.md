# Data Model: Hybrid Search Ranking System

**Feature**: 009-implement-hybrid-ranking
**Date**: 2025-01-19
**Purpose**: Define data structures, types, and relationships for hybrid search ranking

## Core Entities

### 1. RankingConfig

Configuration for hybrid ranking fusion weights and parameters.

**TypeScript Definition**:
```typescript
export interface RankingConfig {
  version: string;                    // Config schema version (e.g., "1.0")

  fusion: FusionConfig;               // Fusion algorithm parameters
  diversification: DiversificationConfig;  // Path diversification settings
  tieBreakers: TieBreakerConfig;      // Tie-breaking weights
  performance: PerformanceConfig;     // Performance tuning parameters
}

export interface FusionConfig {
  alpha: number;                      // Lexical weight [0, 1]
  beta: number;                       // Vector weight [0, 1]
  gamma: number;                      // Tie-breaker weight [0, 1]
  rrfK: number;                       // RRF constant k (typically 60)
}

export interface DiversificationConfig {
  enabled: boolean;                   // Enable/disable diversification
  lambda: number;                     // Relevance vs diversity [0, 1]
  maxPerFile: number;                 // Max results from single file (default: 3)
}

export interface TieBreakerConfig {
  symbolTypeWeight: number;           // Weight for symbol type priority [0, 1]
  pathPriorityWeight: number;         // Weight for path priority [0, 1]
  languageMatchWeight: number;        // Weight for language matching [0, 1]
  identifierMatchWeight: number;      // Weight for identifier exact match [0, 1]
}

export interface PerformanceConfig {
  candidateLimit: number;             // Candidates per source (default: 200)
  timeoutMs: number;                  // Overall timeout (default: 300)
  earlyTerminationTopK: number;       // Stop after K results (default: 10)
}
```

**Validation Rules**:
- `alpha + beta + gamma ≤ 1.0` (weights can sum to less than 1 for normalization)
- All weight values in range `[0, 1]`
- `rrfK > 0` (typically 60)
- `lambda` in range `[0, 1]`
- `candidateLimit >= 10` and `<= 1000`
- `timeoutMs >= 100` and `<= 5000`
- `earlyTerminationTopK >= 1` and `<= 100`

**Persistence**:
- Stored in `.codeindex/ranking-config.json`
- Default config embedded in `src/constants/ranking-constants.ts`
- Hot-reload supported via file watcher

---

### 2. RankingCandidate

Intermediate representation of a search result from either lexical or vector source.

**TypeScript Definition**:
```typescript
export interface RankingCandidate {
  // Source identification
  source: 'lexical' | 'vector';       // Which search component produced this
  sourceRank: number;                 // Original rank from source (1-based)
  sourceScore: number;                // Raw score from source (BM25 or cosine)

  // Result identification
  fileId: string;                     // Database file ID
  filePath: string;                   // Relative file path
  lineNumber: number;                 // Line number (1-based)
  columnNumber?: number;              // Optional column number

  // Content
  snippet: string;                    // Code snippet/preview
  symbolName?: string;                // Symbol name if match is in identifier
  symbolType?: SymbolType;            // Type of symbol (function, class, etc.)
  language?: string;                  // Programming language

  // Metadata for tie-breaking
  fileSize: number;                   // File size in bytes
  lastModified: Date;                 // File modification timestamp
}

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

// Symbol type priority for tie-breaking (higher = more important)
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
```

**Creation**:
- Lexical candidates created from `SearchService.search()` results
- Vector candidates created from `VectorStorageService.query()` results
- Both normalized to common `RankingCandidate` format

**Lifecycle**:
- Created during candidate retrieval phase
- Passed to `HybridRanker.rank()` for fusion
- Transformed into `HybridResult` after ranking

---

### 3. HybridResult

Final ranked search result after fusion, diversification, and tie-breaking.

**TypeScript Definition**:
```typescript
export interface HybridResult {
  // Result identification
  fileId: string;                     // Database file ID
  filePath: string;                   // Relative file path
  lineNumber: number;                 // Line number (1-based)
  columnNumber?: number;              // Optional column number

  // Content
  snippet: string;                    // Code snippet with highlighting
  symbolName?: string;                // Symbol name if applicable
  symbolType?: SymbolType;            // Type of symbol
  language?: string;                  // Programming language

  // Ranking information
  finalScore: number;                 // Final RRF score (unbounded)
  finalRank: number;                  // Final rank position (1-based)

  // Score breakdown
  scoreBreakdown: ScoreBreakdown;     // Detailed score composition

  // Metadata
  fileSize: number;                   // File size in bytes
  lastModified: Date;                 // File modification timestamp
}

export interface ScoreBreakdown {
  // Component contributions
  lexicalContribution: number;        // α * (1/(k + rank_lexical))
  vectorContribution: number;         // β * (1/(k + rank_vector))
  tieBreakerContribution: number;     // γ * tie_breaker_score

  // Original source rankings
  lexicalRank?: number;               // Rank from lexical search (if present)
  vectorRank?: number;                // Rank from vector search (if present)
  lexicalScore?: number;              // Raw BM25 score (if present)
  vectorScore?: number;               // Raw cosine similarity (if present)

  // Tie-breaker details
  tieBreakerScores?: TieBreakerScores; // Breakdown of tie-breaker components

  // Diversification
  diversityPenalty?: number;          // Penalty applied for path similarity
}

export interface TieBreakerScores {
  symbolTypePriority: number;         // [0, 1] based on SYMBOL_TYPE_PRIORITY
  pathPriority: number;               // [0, 1] based on path classification
  languageMatch: number;              // 0 or 1 (matches query language)
  identifierMatch: number;            // 0 or 1 (exact match in identifier)
  combinedScore: number;              // Weighted combination
}
```

**Usage**:
- Returned from `HybridRanker.rank()` as final results
- Serialized to JSON for CLI output
- Formatted for human-readable terminal display

**Display Formats**:

*Human-readable*:
```
[Score: 0.487] src/services/parser.ts:145
  Lexical: 0.250 (#3), Vector: 0.220 (#5), Tie: +0.017
  function parseJSON(data: string): Result<JSONValue, ParseError> {
```

*JSON output*:
```json
{
  "fileId": "abc123",
  "filePath": "src/services/parser.ts",
  "lineNumber": 145,
  "snippet": "function parseJSON(data: string): Result<JSONValue, ParseError> {",
  "symbolName": "parseJSON",
  "symbolType": "function",
  "language": "typescript",
  "finalScore": 0.487,
  "finalRank": 1,
  "scoreBreakdown": {
    "lexicalContribution": 0.250,
    "vectorContribution": 0.220,
    "tieBreakerContribution": 0.017,
    "lexicalRank": 3,
    "vectorRank": 5,
    "lexicalScore": 12.45,
    "vectorScore": 0.856
  }
}
```

---

### 4. HybridSearchQuery

Query parameters specific to hybrid search.

**TypeScript Definition**:
```typescript
export interface HybridSearchQuery {
  // Base query
  query: string;                      // Search query (max 2000 chars)

  // Search modes
  enableLexical: boolean;             // Enable lexical search (default: true)
  enableVector: boolean;              // Enable vector search (default: true)

  // Result limits
  limit: number;                      // Maximum results to return (default: 10)
  offset: number;                     // Pagination offset (default: 0)

  // Filters
  filePatterns?: string[];            // Glob patterns to include
  excludePatterns?: string[];         // Glob patterns to exclude
  languages?: string[];               // Language filters (e.g., ['typescript', 'python'])

  // Performance
  timeoutMs?: number;                 // Override default timeout

  // Config overrides (optional)
  configOverrides?: Partial<RankingConfig>; // Temporary config changes for this query
}

export const DEFAULT_HYBRID_SEARCH_QUERY: Omit<HybridSearchQuery, 'query'> = {
  enableLexical: true,
  enableVector: true,
  limit: 10,
  offset: 0,
};
```

**Validation Rules**:
- `query.length > 0` and `<= 2000` characters (per FR-019)
- At least one of `enableLexical` or `enableVector` must be true
- `limit >= 1` and `<= 100`
- `offset >= 0`
- If only one search mode enabled, fallback behavior applies (per FR-011)

---

### 5. HybridSearchResult

Complete search result including results and performance metrics.

**TypeScript Definition**:
```typescript
export interface HybridSearchResult {
  // Results
  results: HybridResult[];            // Ranked results
  totalFound: number;                 // Total matches (before pagination)

  // Query info
  query: HybridSearchQuery;           // Original query
  appliedConfig: RankingConfig;       // Config used for this search

  // Performance metrics
  metrics: PerformanceMetrics;        // Timing and diagnostic info

  // Warnings
  warnings: string[];                 // Any warnings (e.g., SLA violation, extreme config)
}

export interface PerformanceMetrics {
  // Timing breakdown
  lexicalSearchTimeMs: number;        // Time for lexical search
  vectorSearchTimeMs: number;         // Time for vector search
  rankingTimeMs: number;              // Time for fusion + ranking
  totalTimeMs: number;                // Total query time

  // Candidate counts
  lexicalCandidates: number;          // Number of lexical candidates
  vectorCandidates: number;           // Number of vector candidates
  uniqueCandidates: number;           // Unique candidates after merge

  // Diagnostics
  slaViolation: boolean;              // True if exceeded timeout
  fallbackMode?: 'lexical' | 'vector'; // If only one component returned results
}
```

**Usage**:
- Returned from `code-index search --hybrid <query>` command
- Includes all information needed for display and debugging
- Performance metrics logged for monitoring (per FR-016)

---

## Data Flow

### Search Pipeline

```
1. User Query (HybridSearchQuery)
   ↓
2. Parallel Candidate Retrieval
   ├─→ SearchService.search() → Lexical candidates
   └─→ VectorStorageService.query() → Vector candidates
   ↓
3. Candidate Normalization
   → Convert to RankingCandidate[] (common format)
   ↓
4. Fusion & Ranking (HybridRanker)
   → Apply RRF formula with α/β/γ weights
   ↓
5. Path Diversification (PathDiversifier)
   → MMR-style re-ranking
   ↓
6. Tie-Breaking (TieBreaker)
   → Multi-factor tie resolution
   ↓
7. Final Results (HybridResult[])
   ↓
8. Response Assembly (HybridSearchResult)
   → Add metrics, warnings, metadata
   ↓
9. Output Formatting
   ├─→ JSON format (--json flag)
   └─→ Human-readable format (default)
```

---

## Database Schema Changes

**No schema changes required** - This feature operates on existing data:
- Lexical search uses existing `search` FTS5 table
- Vector search uses existing `vec_embeddings` virtual table
- Configuration stored in JSON file (not database)
- No new tables or columns needed

**Existing Tables Used**:
- `search` (FTS5): Provides lexical candidates with BM25 scores
- `vec_embeddings` (vec0): Provides vector candidates with cosine similarity
- `files`: Metadata (file size, modification time, language)
- `symbols`: Symbol information (name, type) via tree-sitter integration

---

## Configuration File Schema

**Location**: `.codeindex/ranking-config.json`

**Default Configuration**:
```json
{
  "version": "1.0",
  "fusion": {
    "alpha": 0.5,
    "beta": 0.4,
    "gamma": 0.1,
    "rrfK": 60
  },
  "diversification": {
    "enabled": true,
    "lambda": 0.7,
    "maxPerFile": 3
  },
  "tieBreakers": {
    "symbolTypeWeight": 0.3,
    "pathPriorityWeight": 0.3,
    "languageMatchWeight": 0.2,
    "identifierMatchWeight": 0.2
  },
  "performance": {
    "candidateLimit": 200,
    "timeoutMs": 300,
    "earlyTerminationTopK": 10
  }
}
```

**Validation**:
- Performed on file load and hot-reload
- Invalid config rejected with detailed error message
- Falls back to default config on validation failure
- Warnings logged for extreme values (per FR-017)

---

## Constants and Enums

**File**: `src/constants/ranking-constants.ts`

```typescript
// Default configuration
export const DEFAULT_RANKING_CONFIG: RankingConfig = { /* ... */ };

// RRF formula constant
export const DEFAULT_RRF_K = 60;

// Default fusion weights
export const DEFAULT_ALPHA = 0.5;  // Lexical
export const DEFAULT_BETA = 0.4;   // Vector
export const DEFAULT_GAMMA = 0.1;  // Tie-breaker

// Diversification
export const DEFAULT_LAMBDA = 0.7;
export const DEFAULT_MAX_PER_FILE = 3;

// Performance
export const DEFAULT_CANDIDATE_LIMIT = 200;
export const DEFAULT_TIMEOUT_MS = 300;
export const DEFAULT_TOP_K = 10;

// Tie-breaking
export const TIE_THRESHOLD = 0.01;  // 1% score difference

// Path priority patterns
export const PATH_PRIORITY_PATTERNS: Array<{ pattern: RegExp; priority: number }> = [
  { pattern: /^src\//,         priority: 1.0 },
  { pattern: /^lib\//,         priority: 0.9 },
  { pattern: /^packages\//,    priority: 0.85 },
  { pattern: /^test\//,        priority: 0.6 },
  { pattern: /^tests\//,       priority: 0.6 },
  { pattern: /^docs?\//,       priority: 0.4 },
  { pattern: /^examples?\//,   priority: 0.5 },
  { pattern: /\.test\./,       priority: 0.6 },
  { pattern: /\.spec\./,       priority: 0.6 },
];

// Query validation
export const MAX_QUERY_LENGTH = 2000;  // per FR-019
export const MIN_QUERY_LENGTH = 2;

// Score display precision
export const SCORE_DISPLAY_DECIMALS = 3;
```

---

## Type Guards and Utilities

**File**: `src/lib/ranking-utils.ts`

```typescript
/**
 * Validate RankingConfig
 */
export function validateRankingConfig(config: unknown): Result<RankingConfig, Error> {
  // Zod schema validation
  // Check weight sum ≤ 1.0
  // Check all ranges
  // Return validated config or error
}

/**
 * Check if weights are extreme (log warning)
 */
export function hasExtremeWeights(config: RankingConfig): boolean {
  return config.fusion.alpha === 0 ||
         config.fusion.beta === 0 ||
         config.fusion.alpha > 0.9 ||
         config.fusion.beta > 0.9;
}

/**
 * Normalize score for display
 */
export function formatScore(score: number, decimals: number = SCORE_DISPLAY_DECIMALS): string {
  return score.toFixed(decimals);
}

/**
 * Calculate path similarity (normalized Levenshtein distance)
 */
export function calculatePathSimilarity(path1: string, path2: string): number {
  // Levenshtein distance normalized by max length
  // Returns value in [0, 1] where 1 = identical paths
}

/**
 * Classify path priority
 */
export function calculatePathPriority(path: string): number {
  for (const { pattern, priority } of PATH_PRIORITY_PATTERNS) {
    if (pattern.test(path)) {
      return priority;
    }
  }
  return 0.5; // Default priority
}
```

---

## Summary

**New Models**: 5
- `RankingConfig` (+ sub-interfaces)
- `RankingCandidate`
- `HybridResult`
- `HybridSearchQuery`
- `HybridSearchResult`

**New Constants**: 1 file
- `ranking-constants.ts`

**New Utilities**: 1 file
- `ranking-utils.ts`

**Database Changes**: None (uses existing tables)

**Configuration Files**: 1
- `.codeindex/ranking-config.json` (optional, defaults embedded)

All data structures designed for:
- Type safety (TypeScript strict mode)
- Validation (runtime checks with Result types)
- Performance (minimal allocations, prepared statements)
- Observability (detailed metrics and score breakdowns)
- Testability (clear interfaces, dependency injection)
