# Research: Hybrid Search Ranking System

**Feature**: 009-implement-hybrid-ranking
**Date**: 2025-01-19
**Purpose**: Research technical decisions for implementing hybrid BM25 + vector similarity ranking with configurable fusion weights

## Research Topics

### 1. Hybrid Search Ranking Algorithms

**Decision**: Reciprocal Rank Fusion (RRF) with weighted components

**Rationale**:
- RRF is the industry-standard approach for combining rankings from different sources without needing score normalization
- Formula: `score(doc) = α * (1/(k + rank_lexical)) + β * (1/(k + rank_vector)) + γ * tie_breaker_score`
- The `k` constant (typically 60) prevents division by zero and reduces impact of high ranks
- Configurable weights (α, β, γ) allow tuning the balance between lexical matching, semantic similarity, and tie-breakers
- Alternative considered: Min-Max normalization was rejected because it's sensitive to outliers and requires separate normalization of BM25 and cosine similarity scores

**Alternatives Considered**:
- **Convex Combination** (normalize + weighted sum): Requires careful score normalization; BM25 and cosine similarity have different ranges
- **CombSUM/CombMNZ**: Simpler but lacks flexibility for weight tuning
- **Learning-to-Rank (LTR)**: Overkill for this use case; requires training data and adds complexity

**Implementation Notes**:
- Default weights: α=0.5 (lexical), β=0.4 (vector), γ=0.1 (tie-breakers)
- RRF k constant: 60 (standard value from research literature)
- Ranking positions start at 1 (not 0) for RRF formula

**References**:
- "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods" (Cormack et al., 2009)
- Elasticsearch hybrid search documentation uses RRF as default fusion method
- Pinecone hybrid search guide recommends RRF for combining sparse and dense vectors

---

### 2. Path Diversification Strategies

**Decision**: MMR-style (Maximal Marginal Relevance) re-ranking with file path similarity penalty

**Rationale**:
- Iteratively select results that balance relevance with diversity
- For each candidate, calculate: `final_score = λ * relevance_score - (1-λ) * max_similarity_to_selected`
- Similarity metric: Normalized edit distance between file paths
- λ parameter controls relevance vs. diversity tradeoff (default: 0.7)
- Results from same file get progressively higher penalties
- Alternative considered: Hard limits (max N per file) were rejected because they can artificially exclude highly relevant results

**Alternatives Considered**:
- **Hard file limits**: Simple but too rigid; can exclude all relevant results if concentrated in one file
- **Directory-based clustering**: Doesn't handle monorepo structures well where related code spans many directories
- **Random sampling**: Doesn't preserve relevance ordering

**Implementation Notes**:
- Default λ=0.7 (70% relevance, 30% diversity)
- Path similarity uses Levenshtein distance normalized by max path length
- Skip diversification if all top-K results are from single file (per clarification Q2)
- Max 3 results per file in top-10 (SC-003) unless single-file scenario

**References**:
- "The Use of MMR, Diversity-Based Reranking for Reordering Documents and Producing Summaries" (Carbonell & Goldstein, 1998)
- Modern search engines (Google, Bing) use similar diversity algorithms to prevent result clustering

---

### 3. Tie-Breaking Heuristics

**Decision**: Multi-factor tie-breaking with weighted scoring

**Rationale**:
- When hybrid scores are within 0.01 (1% threshold), apply tie-breakers
- Factors (in priority order):
  1. **Symbol type priority** (30% weight): function/class > variable > comment
  2. **Path priority** (30% weight): src/ > lib/ > test/ > docs/
  3. **Language match** (20% weight): matches query language context if detectable
  4. **Identifier exact match** (20% weight): query term matches symbol name exactly
- Alternative considered: Single-factor tie-breaking (just symbol type) was too simplistic

**Alternatives Considered**:
- **Lexicographic ordering**: Doesn't account for code structure importance
- **Recency-based**: File modification time isn't always relevant for code search
- **Popularity metrics**: Would require additional tracking infrastructure

**Implementation Notes**:
- Tie threshold: 0.01 (1% score difference)
- Symbol type detection via existing tree-sitter integration
- Path priority uses regex patterns for directory classification
- Language context detection: extract from query if it contains language keywords or file extensions

**References**:
- Code search engines (GitHub, Sourcegraph) prioritize definition matches over references
- IDE "Go to Definition" features use similar symbol type hierarchies

---

### 4. Performance Optimization for <300ms SLA

**Decision**: Parallel candidate retrieval + early termination + prepared statements

**Rationale**:
- **Parallel retrieval**: Fetch lexical (FTS5) and vector (sqlite-vec) candidates concurrently using Promise.all()
- **Candidate limits**: 200 from each source provides good recall while keeping ranking cost manageable
- **Early termination**: Stop ranking after top-K (10) results to avoid processing full candidate set
- **Prepared statements**: Pre-compile all SQL queries at service initialization
- **No pagination in fusion**: Rank full candidate set once; pagination happens after ranking
- Alternative considered: Streaming results was rejected because fusion requires full candidate set

**Alternatives Considered**:
- **Incremental fusion**: Compute partial rankings and merge - adds complexity without clear benefit
- **Larger candidate pools**: 500+ candidates increase latency without improving top-10 quality
- **Caching**: Adds complexity; search queries are too diverse for effective caching

**Implementation Notes**:
- Use Node.js Worker Threads only if single-thread CPU usage > 80%
- Memory budget: 100MB for candidates (200 lexical + 200 vector * ~256KB each)
- Performance monitoring tracks: lexical_time, vector_time, ranking_time, total_time
- Timeout handling: Return partial results after 280ms (20ms buffer for response formatting)

**Benchmark Targets**:
- Lexical search: <100ms for top-200 (FTS5 BM25 ranking)
- Vector search: <150ms for top-200 (cosine similarity with sqlite-vec)
- Fusion + ranking: <50ms for RRF + diversification
- **Total budget**: 300ms with 20ms buffer

**References**:
- SQLite FTS5 performance documentation recommends limiting result sets
- Elasticsearch defaults to 100 candidates per shard for hybrid search
- Better-sqlite3 sync API avoids async overhead for sub-ms operations

---

### 5. Configuration Management

**Decision**: JSON configuration file with hot-reload capability

**Rationale**:
- Store ranking config in `.codeindex/ranking-config.json`
- Default config embedded in code; user can override via file
- Watch file for changes using `chokidar` (already in dependencies)
- Validate config on load: weights must sum to ≤1.0, all values in [0, 1]
- Log warnings for extreme values (α=0, β=0) per clarification Q4
- Alternative considered: Database storage was rejected for simplicity and atomicity

**Alternatives Considered**:
- **Database table**: Overkill for ~10 config parameters; requires migrations
- **Environment variables**: Not user-friendly for runtime tuning
- **CLI flags**: Good for one-off queries but doesn't persist preferences

**Configuration Schema**:
```json
{
  "version": "1.0",
  "fusion": {
    "alpha": 0.5,      // Lexical weight
    "beta": 0.4,       // Vector weight
    "gamma": 0.1,      // Tie-breaker weight
    "rrf_k": 60        // RRF constant
  },
  "diversification": {
    "enabled": true,
    "lambda": 0.7,     // Relevance vs diversity
    "max_per_file": 3  // Max results from single file (unless single-file scenario)
  },
  "tie_breakers": {
    "symbol_type_weight": 0.3,
    "path_priority_weight": 0.3,
    "language_match_weight": 0.2,
    "identifier_match_weight": 0.2
  },
  "performance": {
    "candidate_limit": 200,        // Per source (lexical, vector)
    "timeout_ms": 300,
    "early_termination_top_k": 10
  }
}
```

**Implementation Notes**:
- Use `zod` or similar for schema validation (avoid runtime type errors)
- Configuration service exposes `getConfig()` method that returns current config
- Hot-reload debounced with 100ms delay to avoid thrashing
- Log config changes at INFO level for auditability

**References**:
- VS Code configuration system uses JSON with live reload
- Elasticsearch allows dynamic index settings updates without restart

---

### 6. Score Normalization and Display

**Decision**: Display raw RRF scores with explanatory metadata

**Rationale**:
- RRF scores are not bounded (can exceed 1.0) but are comparable within a result set
- Display format: Show score with 3 decimal places + breakdown by component
- Include metadata: `{total_score, lexical_contribution, vector_contribution, tie_breaker_contribution, rank_source}`
- Alternative considered: Normalize to 0-100 range was rejected because it hides the fusion mechanics

**Alternatives Considered**:
- **0-100 percentage**: Loses information about fusion weights and component contributions
- **Confidence intervals**: Overkill for deterministic ranking
- **Hidden scores**: Users want to understand why results are ranked the way they are

**Display Format**:
```
[Score: 0.487] src/services/parser.ts:145
  Lexical: 0.250 (rank #3), Vector: 0.220 (rank #5), Tie-breaker: +0.017
  Preview: function parseJSON(data: string): Result<JSONValue, ParseError> {
```

**Implementation Notes**:
- JSON output includes full score breakdown for debugging
- Human-readable output shows simplified score + primary rank source
- Add `--explain` flag to CLI for detailed score decomposition

**References**:
- Search engines show "relevance" scores to help users understand rankings
- Elasticsearch `_explain` API provides detailed scoring breakdown

---

## Summary of Key Decisions

1. **Fusion Algorithm**: Reciprocal Rank Fusion (RRF) with α/β/γ weights
2. **Diversification**: MMR-style re-ranking with path similarity penalties
3. **Tie-Breaking**: Multi-factor weighted scoring (symbol type, path, language, identifier)
4. **Performance**: Parallel retrieval, 200 candidates/source, early termination
5. **Configuration**: JSON file with hot-reload, validation, and warnings
6. **Scoring**: Raw RRF scores with component breakdown in metadata

## Open Questions for Implementation

1. ~~How to handle queries that are purely navigational?~~ → Handle naturally; lexical search will dominate ranking
2. ~~What if lexical and vector return completely disjoint sets?~~ → RRF handles gracefully; each source contributes its rankings
3. ~~How to handle very short queries (1-2 chars)?~~ → Apply minimum query length of 2 chars in CLI; warn user
4. ~~Special characters in queries?~~ → Pass through to FTS5 (handles operators); sanitize for vector embedding

All critical decisions resolved. Ready for Phase 1: Data Model & Contracts.
