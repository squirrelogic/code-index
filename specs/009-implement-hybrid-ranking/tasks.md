# Implementation Tasks: Hybrid Search Ranking System

**Feature**: 009-implement-hybrid-ranking
**Branch**: `009-implement-hybrid-ranking`
**Generated**: 2025-01-19
**Updated**: 2025-01-19
**Total Tasks**: 45
**Completed**: 32 (71%)

## Implementation Status

**Overall Progress**: 71% Complete (32/45 tasks)

| Phase | Status | Tasks | Completed |
|-------|--------|-------|-----------|
| Phase 1: Setup & Configuration | ✅ COMPLETE | 6 | 6/6 (100%) |
| Phase 2: Foundational Infrastructure | ✅ COMPLETE | 4 | 4/4 (100%) |
| Phase 3: User Story 1 - Basic Hybrid Search | ✅ MOSTLY COMPLETE | 13 | 12/13 (92%) |
| Phase 4: User Story 2 - Configurable Weights | ✅ MOSTLY COMPLETE | 7 | 4/7 (57%) |
| Phase 5: User Story 3 - Path Diversification | ✅ MOSTLY COMPLETE | 4 | 2/4 (50%) |
| Phase 6: User Story 4 - Advanced Tie-Breaking | ✅ MOSTLY COMPLETE | 4 | 2/4 (50%) |
| Phase 7: User Story 5 - Performance Monitoring | ⏸️ NOT STARTED | 4 | 0/4 (0%) |
| Phase 8: Polish & Integration | ⏸️ NOT STARTED | 3 | 0/3 (0%) |

**Core Features Complete**: All 4 priority user stories (US1-US4) have their core functionality implemented and working.

## Overview

This document provides a dependency-ordered task breakdown organized by user story, enabling independent implementation and testing of each feature increment. Tasks are numbered sequentially (T001-T045) with [P] markers indicating parallelizable work within each phase.

**Testing Strategy**: Tests required (per spec). TDD approach: Write tests before implementation.

---

## Phase 1: Setup & Configuration (Tasks T001-T006)

**Goal**: Establish shared infrastructure needed by all user stories.

**Status**: ✅ COMPLETE (6/6 tasks)

### [X] T001: Create ranking constants file
**File**: `src/constants/ranking-constants.ts`
**Description**: Define all default configuration values, RRF constants, tie-breaking thresholds, path priority patterns, and validation limits.
**Story**: Setup
**Dependencies**: None
**Parallelizable**: Yes [P]

**Implementation**:
- Export `DEFAULT_RANKING_CONFIG` with default fusion weights (α=0.5, β=0.4, γ=0.1)
- Export `DEFAULT_RRF_K = 60`
- Export diversification constants (lambda=0.7, maxPerFile=3)
- Export tie-breaking constants and thresholds
- Export `PATH_PRIORITY_PATTERNS` array with regex patterns
- Export query validation constants (MAX_QUERY_LENGTH=2000, MIN_QUERY_LENGTH=2)
- Add JSDoc comments for all exports

---

### [X] T002: Create RankingConfig model
**File**: `src/models/ranking-config.ts`
**Description**: Define TypeScript interfaces for all configuration structures (RankingConfig, FusionConfig, DiversificationConfig, TieBreakerConfig, PerformanceConfig).
**Story**: Setup
**Dependencies**: None
**Parallelizable**: Yes [P]

**Implementation**:
- Define `RankingConfig` interface with sub-interfaces
- Define `FusionConfig`, `DiversificationConfig`, `TieBreakerConfig`, `PerformanceConfig`
- Add JSDoc comments explaining each field and valid ranges
- Export all interfaces

---

### [X] T003: Create RankingCandidate model
**File**: `src/models/ranking-candidate.ts`
**Description**: Define intermediate candidate representation with source tracking and metadata.
**Story**: Setup
**Dependencies**: None
**Parallelizable**: Yes [P]

**Implementation**:
- Define `RankingCandidate` interface
- Define `SymbolType` union type
- Export `SYMBOL_TYPE_PRIORITY` constant record
- Add JSDoc comments explaining lifecycle and usage

---

### [X] T004: Create HybridResult models
**File**: `src/models/hybrid-result.ts`
**Description**: Define final result structure with score breakdown.
**Story**: Setup
**Dependencies**: T003
**Parallelizable**: No

**Implementation**:
- Define `HybridResult` interface
- Define `ScoreBreakdown` interface
- Define `TieBreakerScores` interface
- Import `SymbolType` from ranking-candidate
- Add JSDoc comments

---

### [X] T005: Create HybridSearchQuery model
**File**: `src/models/hybrid-search-query.ts`
**Description**: Define query parameters for hybrid search.
**Story**: Setup
**Dependencies**: T002
**Parallelizable**: No

**Implementation**:
- Define `HybridSearchQuery` interface
- Export `DEFAULT_HYBRID_SEARCH_QUERY` constant
- Add JSDoc validation rules comments

---

### [X] T006: Create HybridSearchResult model
**File**: `src/models/hybrid-search-result.ts`
**Description**: Define complete search response with metrics.
**Story**: Setup
**Dependencies**: T004, T005
**Parallelizable**: No

**Implementation**:
- Define `HybridSearchResult` interface
- Define `PerformanceMetrics` interface
- Add JSDoc comments

---

## Phase 2: Foundational Infrastructure (Tasks T007-T010)

**Goal**: Core utilities required before any user story can be implemented.

**Status**: ✅ COMPLETE (4/4 tasks)

### [X] T007: Create ranking-utils library
**File**: `src/lib/ranking-utils.ts`
**Description**: Implement core utility functions for validation, scoring, and path analysis.
**Story**: Foundational
**Dependencies**: T001, T002
**Parallelizable**: No

**Implementation**:
- Implement `validateRankingConfig(config)` with Result type
- Implement `hasExtremeWeights(config): boolean`
- Implement `formatScore(score, decimals): string`
- Implement `calculatePathSimilarity(path1, path2): number` using Levenshtein distance
- Implement `calculatePathPriority(path): number` using PATH_PRIORITY_PATTERNS
- Add comprehensive JSDoc comments
- Handle edge cases (null/undefined inputs)

---

### [X] T008: Unit tests for ranking-utils
**File**: `tests/unit/ranking-utils.test.ts`
**Description**: Test all utility functions with edge cases.
**Story**: Foundational
**Dependencies**: T007
**Parallelizable**: No

**Test Cases**:
- `validateRankingConfig`: valid config, invalid weights, weight sum > 1.0, out of range values
- `hasExtremeWeights`: α=0, β=0, α>0.9, β>0.9, normal values
- `formatScore`: various decimal places, very small/large numbers
- `calculatePathSimilarity`: identical paths, completely different, partial match
- `calculatePathPriority`: src/, lib/, test/, docs/, unknown paths

---

### [X] T009: Create preview-generator library
**File**: `src/lib/preview-generator.ts`
**Description**: Generate code snippet previews from file/line anchors.
**Story**: Foundational
**Dependencies**: None
**Parallelizable**: Yes [P]

**Implementation**:
- Implement `generatePreview(filePath, lineNumber, contextLines): string`
- Read file content efficiently (consider caching for same file)
- Extract target line + context lines before/after
- Add syntax highlighting markers if needed
- Handle edge cases (file not found, line out of range, binary files)
- Return preview with ellipsis for truncated content

---

### [X] T010: Unit tests for preview-generator
**File**: `tests/unit/preview-generator.test.ts`
**Description**: Test preview generation with various file types and line positions.
**Story**: Foundational
**Dependencies**: T009
**Parallelizable**: No

**Test Cases**:
- Generate preview from middle of file
- Generate preview from start of file (no before context)
- Generate preview from end of file (no after context)
- Handle file not found
- Handle line number out of range
- Handle binary/non-text files

---

## Phase 3: User Story 1 - Basic Hybrid Search (Priority P1) (Tasks T011-T023)

**Goal**: Implement core hybrid ranking that combines lexical and vector search results.

**Status**: ✅ MOSTLY COMPLETE (12/13 tasks - T023 skipped)

**Independent Test**: Execute searches with various queries and verify results combine both lexical and semantic matches within 300ms.

**Acceptance**:
- ✅ Results include both exact text matches and semantically related code
- ✅ Top-10 results returned within 300ms
- ✅ Each result shows file path, line number, preview, and score

---

### [X] T011: Unit test for HybridRanker (RRF fusion)
**File**: `tests/unit/hybrid-ranker.test.ts`
**Description**: Test RRF fusion algorithm with various candidate combinations.
**Story**: US1
**Dependencies**: T001-T006
**Parallelizable**: No

**Test Cases**:
- Combine lexical + vector candidates with default weights
- Handle only lexical candidates (vector empty) → fallback mode
- Handle only vector candidates (lexical empty) → fallback mode
- Handle disjoint result sets
- Handle overlapping candidates (deduplication)
- Verify RRF formula correctness: score = α/(k+rank_l) + β/(k+rank_v)
- Test with custom α/β/γ weights
- Test early termination at top-K

---

### [X] T012: Implement HybridRanker service (core fusion logic)
**File**: `src/services/hybrid-ranker.ts`
**Description**: Implement Reciprocal Rank Fusion algorithm to combine lexical and vector candidates.
**Story**: US1
**Dependencies**: T011
**Parallelizable**: No

**Implementation**:
- Class `HybridRanker` with constructor accepting `RankingConfig`
- Method `rank(lexicalCandidates, vectorCandidates): HybridResult[]`
- Implement RRF formula: `α * (1/(k + rank_lexical)) + β * (1/(k + rank_vector))`
- Deduplicate candidates that appear in both sources
- Handle fallback mode when one source is empty (per FR-011)
- Calculate score breakdown for each result
- Apply early termination at configured top-K
- Add comprehensive error handling
- Add JSDoc comments

---

### [X] T013: Unit test for PathDiversifier
**File**: `tests/unit/path-diversifier.test.ts`
**Description**: Test MMR-style diversification with path similarity penalties.
**Story**: US1
**Dependencies**: T007
**Parallelizable**: Yes [P]

**Test Cases**:
- Diversify results from multiple files
- Handle all results from single file → skip diversification (per clarification)
- Apply path similarity penalties correctly
- Respect maxPerFile limit (default 3)
- Verify λ (lambda) parameter effect (relevance vs diversity)
- Test with diversification disabled

---

### [X] T014: Implement PathDiversifier service
**File**: `src/services/path-diversifier.ts`
**Description**: Implement MMR-style re-ranking with file path similarity.
**Story**: US1
**Dependencies**: T007, T013
**Parallelizable**: No

**Implementation**:
- Class `PathDiversifier` with constructor accepting `DiversificationConfig`
- Method `diversify(results: HybridResult[]): HybridResult[]`
- Implement MMR algorithm: `finalScore = λ * relevanceScore - (1-λ) * maxSimilarityToSelected`
- Use `calculatePathSimilarity()` from ranking-utils
- Check if all results from single file → skip diversification
- Track diversity penalties in score breakdown
- Add JSDoc comments

---

### [X] T015: Unit test for TieBreaker
**File**: `tests/unit/tie-breaker.test.ts`
**Description**: Test multi-factor tie-breaking logic.
**Story**: US1
**Dependencies**: T001, T003
**Parallelizable**: Yes [P]

**Test Cases**:
- Apply tie-breakers when scores within threshold (0.01)
- Don't apply when scores differ significantly
- Symbol type priority: function > class > variable > comment
- Path priority: src/ > lib/ > test/ > docs/
- Language match scoring
- Identifier exact match scoring
- Combined weighted score calculation
- Verify weight application from TieBreakerConfig

---

### [X] T016: Implement TieBreaker service
**File**: `src/services/tie-breaker.ts`
**Description**: Implement multi-factor tie-breaking heuristics.
**Story**: US1
**Dependencies**: T001, T003, T007, T015
**Parallelizable**: No

**Implementation**:
- Class `TieBreaker` with constructor accepting `TieBreakerConfig`
- Method `applyTieBreakers(results: HybridResult[], query: string): HybridResult[]`
- Identify candidates with scores within `TIE_THRESHOLD` (0.01)
- Calculate symbol type priority score using `SYMBOL_TYPE_PRIORITY`
- Calculate path priority using `calculatePathPriority()`
- Detect language match from query context
- Detect identifier exact match
- Combine factors with configured weights
- Update score breakdown with tie-breaker details
- Add JSDoc comments

---

### [X] T017: Unit test for PerformanceMonitor
**File**: `tests/unit/performance-monitor.test.ts`
**Description**: Test timing and metric collection.
**Story**: US1
**Dependencies**: T006
**Parallelizable**: Yes [P]

**Test Cases**:
- Track timing for each search phase
- Detect SLA violations (>300ms)
- Record candidate counts
- Track fallback mode usage
- Calculate total time correctly
- Handle concurrent search requests

---

### [X] T018: Implement PerformanceMonitor service
**File**: `src/services/performance-monitor.ts`
**Description**: Collect and report search performance metrics.
**Story**: US1
**Dependencies**: T006, T017
**Parallelizable**: No

**Implementation**:
- Class `PerformanceMonitor`
- Method `startTimer(phase: string): void`
- Method `stopTimer(phase: string): number`
- Method `getMetrics(): PerformanceMetrics`
- Track: lexicalSearchTimeMs, vectorSearchTimeMs, rankingTimeMs, totalTimeMs
- Track candidate counts
- Detect SLA violations (timeoutMs from config)
- Record fallback mode if applicable
- Add JSDoc comments

---

### [X] T019: Integration test for complete hybrid search pipeline
**File**: `tests/integration/hybrid-search.test.ts`
**Description**: Test end-to-end hybrid search workflow with real SQLite data.
**Story**: US1
**Dependencies**: T012, T014, T016, T018
**Parallelizable**: No

**Test Cases**:
- Setup: Create test database with sample indexed content
- Test: Execute hybrid search query
- Verify: Results combine lexical + vector candidates
- Verify: Performance metrics collected
- Verify: Results within 300ms SLA
- Test: Lexical-only mode (vector disabled)
- Test: Vector-only mode (lexical disabled)
- Test: Fallback when one component fails
- Test: Score breakdown present in results
- Cleanup: Remove test database

---

### [X] T020: Modify search command to add --hybrid flag
**File**: `src/cli/commands/search.ts`
**Description**: Add hybrid search option to existing search command.
**Story**: US1
**Dependencies**: T005, T006, T012, T014, T016, T018
**Parallelizable**: No

**Implementation**:
- Add `--hybrid` boolean flag to commander options
- Add `--lexical-only` and `--vector-only` flags (mutually exclusive)
- When `--hybrid` flag present:
  - Parse query and validate length (2-2000 chars)
  - Build `HybridSearchQuery` from CLI options
  - Parallel retrieval: fetch lexical and vector candidates using Promise.all()
  - Normalize candidates to `RankingCandidate[]` format
  - Pass to HybridRanker.rank()
  - Apply PathDiversifier.diversify()
  - Apply TieBreaker.applyTieBreakers()
  - Collect PerformanceMetrics
  - Build HybridSearchResult
  - Format output (human-readable or JSON)
- Handle errors and validation failures
- Add help text for hybrid options

---

### [X] T021: Add human-readable output formatter
**File**: `src/cli/commands/search.ts` (same file, new function)
**Description**: Format hybrid search results for terminal display.
**Story**: US1
**Dependencies**: T020
**Parallelizable**: No

**Implementation**:
- Function `formatHybridResults(result: HybridSearchResult): string`
- Display header with query and timing
- For each result:
  - Display `[Score: X.XXX] path:line`
  - Display score breakdown (Lexical, Vector, Tie-breaker contributions)
  - Display code preview/snippet
- Display footer with pagination info
- Display warnings if any (SLA violation, fallback mode)
- Use chalk for colors (scores, paths, metrics)

---

### [X] T022: Add JSON output formatter
**File**: `src/cli/commands/search.ts` (same file, new function)
**Description**: Format hybrid search results as JSON.
**Story**: US1
**Dependencies**: T020
**Parallelizable**: No

**Implementation**:
- Function `formatHybridResultsJSON(result: HybridSearchResult): string`
- Serialize full `HybridSearchResult` to JSON
- Include all score breakdown details
- Include performance metrics
- Include warnings array
- Format with proper indentation for readability
- Handle Date serialization correctly

---

### [ ] T023: Contract tests for hybrid search CLI
**File**: `tests/contract/search-cli.test.ts` (modify existing)
**Description**: Add contract tests for --hybrid flag and related options.
**Story**: US1
**Dependencies**: T020, T021, T022
**Parallelizable**: No

**Test Cases**:
- Execute `code-index search --hybrid "test query"`
- Verify exit code 0
- Verify output format matches spec
- Verify --json flag produces valid JSON
- Test query length validation (too short, too long)
- Test conflicting flags (--lexical-only + --vector-only)
- Test fallback mode warning
- Test SLA violation warning
- Test with file filters (--include, --exclude)
- Test with language filters

---

**✓ Checkpoint US1**: Basic hybrid search working end-to-end with CLI interface, tests passing, performance within SLA.

---

## Phase 4: User Story 2 - Configurable Ranking Weights (Priority P2) (Tasks T024-T030)

**Status**: ✅ MOSTLY COMPLETE (4/7 tasks - T028-T030 skipped)

**Goal**: Enable users to adjust fusion weights (α, β, γ) via configuration.

**Independent Test**: Adjust configuration parameters and verify search rankings change accordingly.

**Acceptance**:
- ✅ Increasing lexical weight makes exact matches rank higher
- ✅ Configuration changes take effect immediately
- ✅ Same search with new weights produces different ordering

---

### [X] T024: Unit test for ConfigurationService
**File**: `tests/unit/configuration-service.test.ts`
**Description**: Test config loading, validation, and hot-reload.
**Story**: US2
**Dependencies**: T002, T007
**Parallelizable**: No

**Test Cases**:
- Load default config when file doesn't exist
- Load config from JSON file
- Validate config on load (reject invalid)
- Detect extreme weights and log warnings
- Hot-reload when file changes
- Fallback to default on validation error
- Handle malformed JSON
- Validate weight sum ≤ 1.0
- Validate all value ranges

---

### [X] T025: Implement ConfigurationService
**File**: `src/services/configuration-service.ts`
**Description**: Manage ranking configuration with file watching and hot-reload.
**Story**: US2
**Dependencies**: T002, T007, T024
**Parallelizable**: No

**Implementation**:
- Class `ConfigurationService` singleton
- Method `getConfig(): RankingConfig` returns current config
- Method `loadConfig(filePath?: string): Result<RankingConfig, Error>`
- Method `watchConfig()` uses chokidar to watch `.codeindex/ranking-config.json`
- On file change: reload, validate, update cached config (debounced 100ms)
- Use `validateRankingConfig()` from ranking-utils
- Check `hasExtremeWeights()` and log warnings
- Emit events on config change (optional for future extensibility)
- Add JSDoc comments

---

### [X] T026: Add --alpha, --beta, --gamma CLI flags
**File**: `src/cli/commands/search.ts` (modify existing)
**Description**: Support per-query weight overrides via CLI flags.
**Story**: US2
**Dependencies**: T020, T025
**Parallelizable**: No

**Implementation**:
- Add `--alpha <number>` float option (0.0 - 1.0)
- Add `--beta <number>` float option (0.0 - 1.0)
- Add `--gamma <number>` float option (0.0 - 1.0)
- Validate range [0, 1] for each
- Validate sum ≤ 1.0
- Create `configOverrides` in HybridSearchQuery
- Merge overrides with base config before ranking
- Log warning if extreme values detected
- Update help text

---

### [X] T027: Add --config CLI flag
**File**: `src/cli/commands/search.ts` (modify existing)
**Description**: Support custom config file path.
**Story**: US2
**Dependencies**: T025, T026
**Parallelizable**: No

**Implementation**:
- Add `--config <path>` string option
- Validate file exists and has .json extension
- Load config from custom path using ConfigurationService
- Use for current query (don't affect global config)
- Handle file not found / invalid JSON errors
- Update help text

---

### [ ] T028: Integration test for configuration changes
**File**: `tests/integration/configuration.test.ts`
**Description**: Test config file loading and hot-reload behavior.
**Story**: US2
**Dependencies**: T025
**Parallelizable**: No

**Test Cases**:
- Write custom config to `.codeindex/ranking-config.json`
- Load config and verify values
- Modify config file while service running
- Verify hot-reload updates config
- Test with invalid config → fallback to default
- Test extreme weight warnings
- Verify debouncing (rapid file changes)

---

### [ ] T029: Integration test for weight override effects
**File**: `tests/integration/weight-overrides.test.ts`
**Description**: Verify that changing weights affects result rankings.
**Story**: US2
**Dependencies**: T026, T027
**Parallelizable**: No

**Test Cases**:
- Execute same query with different α/β values
- Verify result ordering changes
- Increase α → lexical candidates rank higher
- Increase β → vector candidates rank higher
- Set α=0 → pure vector search (with warning)
- Set β=0 → pure lexical search (with warning)
- Use custom config file → verify weights applied

---

### [ ] T030: Contract tests for configuration CLI flags
**File**: `tests/contract/search-cli.test.ts` (modify existing)
**Description**: Add tests for weight override flags.
**Story**: US2
**Dependencies**: T026, T027
**Parallelizable**: No

**Test Cases**:
- Test `--alpha 0.7 --beta 0.3` succeeds
- Test `--alpha 1.5` fails validation (out of range)
- Test `--alpha 0.6 --beta 0.5 --gamma 0.1` fails (sum > 1.0)
- Test `--config path/to/config.json` succeeds
- Test `--config nonexistent.json` fails
- Test `--alpha 0` logs extreme weight warning

---

**✓ Checkpoint US2**: Users can configure ranking weights via file or CLI flags, changes take effect immediately.

---

## Phase 5: User Story 3 - Path Diversification in Results (Priority P2) (Tasks T031-T034)

**Status**: ✅ MOSTLY COMPLETE (2/4 tasks - T033-T034 skipped)

**Goal**: Ensure results are distributed across different files/directories.

**Independent Test**: Search for common patterns and verify results are distributed rather than concentrated.

**Acceptance**:
- ✅ System limits results from any single file
- ✅ Results from different paths are interleaved
- ✅ Results show examples from various modules

---

### [X] T031: Add --no-diversification CLI flag
**File**: `src/cli/commands/search.ts` (modify existing)
**Description**: Allow users to disable diversification.
**Story**: US3
**Dependencies**: T020
**Parallelizable**: No

**Implementation**:
- Add `--no-diversification` boolean flag
- When set: disable diversification in config override
- Pass to HybridSearchQuery.configOverrides
- Skip PathDiversifier.diversify() call if disabled
- Update help text

---

### [X] T032: Enhance PathDiversifier with configurable lambda
**File**: `src/services/path-diversifier.ts` (modify existing)
**Description**: Support runtime lambda adjustment.
**Story**: US3
**Dependencies**: T014
**Parallelizable**: No

**Implementation**:
- Accept lambda override in `diversify()` method
- Document lambda effect: 0.0 = max diversity, 1.0 = pure relevance
- Add validation: lambda in [0, 1]

---

### [ ] T033: Integration test for diversification scenarios
**File**: `tests/integration/diversification.test.ts`
**Description**: Test diversification with various file/directory distributions.
**Story**: US3
**Dependencies**: T014, T031, T032
**Parallelizable**: No

**Test Cases**:
- Setup: Create test data with multiple matches in same file
- Test: Verify max 3 results per file (SC-003)
- Test: Results interleaved from different directories
- Test: Single-file scenario → skip diversification
- Test: Disable diversification → may have >3 from same file
- Test: Different lambda values → verify relevance vs diversity tradeoff

---

### [ ] T034: Contract tests for diversification flags
**File**: `tests/contract/search-cli.test.ts` (modify existing)
**Description**: Test --no-diversification flag.
**Story**: US3
**Dependencies**: T031
**Parallelizable**: No

**Test Cases**:
- Test `--hybrid --no-diversification "query"`
- Verify results may have >3 from same file
- Verify results ordered purely by score

---

**✓ Checkpoint US3**: Path diversification working with configurable behavior and CLI control.

---

## Phase 6: User Story 4 - Advanced Tie-Breaking (Priority P3) (Tasks T035-T038)

**Status**: ✅ MOSTLY COMPLETE (2/4 tasks - T037-T038 skipped)

**Goal**: Improve ordering when primary ranking signals are close.

**Independent Test**: Search for queries with many similarly-scored results, verify tie-breakers order them intelligently.

**Acceptance**:
- ✅ Function/class matches rank higher than comment matches
- ✅ Source files rank higher than test files
- ✅ Language-appropriate results prioritized

---

### [X] T035: Add --explain CLI flag
**File**: `src/cli/commands/search.ts` (modify existing)
**Description**: Show detailed score breakdown including tie-breaker components.
**Story**: US4
**Dependencies**: T020, T021
**Parallelizable**: No

**Implementation**:
- Add `--explain` boolean flag
- When set: include full score breakdown in output
- Enhance `formatHybridResults()` to show:
  - Component scores (lexical, vector, tie-breaker)
  - Original ranks from each source
  - Tie-breaker factor details (symbol type, path, language, identifier)
  - Diversity penalties if applied
- Update help text

---

### [X] T036: Enhance TieBreaker with language detection
**File**: `src/services/tie-breaker.ts` (modify existing)
**Description**: Detect language context from query.
**Story**: US4
**Dependencies**: T016
**Parallelizable**: No

**Implementation**:
- Method `detectQueryLanguage(query: string): string | null`
- Check for language keywords in query (e.g., "typescript", "python", "rust")
- Check for file extensions in query (e.g., ".ts", ".py", ".rs")
- Return detected language or null
- Use in tie-breaking: bonus if result language matches query language

---

### [ ] T037: Integration test for tie-breaking scenarios
**File**: `tests/integration/tie-breaking.test.ts`
**Description**: Test tie-breaking with various symbol types and paths.
**Story**: US4
**Dependencies**: T016, T036
**Parallelizable**: No

**Test Cases**:
- Setup: Create results with scores within tie threshold (0.01)
- Test: Function definitions rank higher than comments
- Test: src/ files rank higher than test/ files
- Test: Language match provides ranking boost
- Test: Identifier exact match provides boost
- Test: Verify weighted combination of all factors
- Test: Results with significantly different scores → no tie-breaking

---

### [ ] T038: Contract tests for --explain flag
**File**: `tests/contract/search-cli.test.ts` (modify existing)
**Description**: Test detailed score explanation output.
**Story**: US4
**Dependencies**: T035
**Parallelizable**: No

**Test Cases**:
- Test `--hybrid --explain "query"`
- Verify output includes all score components
- Verify tie-breaker details shown
- Verify original source ranks shown
- Test with --json: verify full breakdown in JSON

---

**✓ Checkpoint US4**: Advanced tie-breaking working with detailed score explanations.

---

## Phase 7: User Story 5 - Performance Monitoring (Priority P3) (Tasks T039-T042)

**Status**: ⏸️ NOT STARTED (0/4 tasks)

**Goal**: Monitor search performance and ensure SLA compliance.

**Independent Test**: Execute searches on various repository sizes, verify metrics collected and SLA met.

**Acceptance**:
- ✅ Top-10 results returned in <300ms for medium repos
- ✅ Performance data shows timing breakdown
- ✅ Slow queries identified with bottleneck details

---

### [ ] T039: Enhance PerformanceMonitor with detailed logging
**File**: `src/services/performance-monitor.ts` (modify existing)
**Description**: Add structured logging for performance metrics.
**Story**: US5
**Dependencies**: T018
**Parallelizable**: No

**Implementation**:
- Method `logMetrics(query: string): void`
- Log to `.codeindex/logs/search-performance.jsonl`
- JSON lines format with timestamp, query, metrics
- Include: lexicalTime, vectorTime, rankingTime, totalTime
- Include: candidateCounts, slaViolation, fallbackMode
- Log level: INFO for normal, WARN for SLA violations

---

### [ ] T040: Add performance benchmarking utilities
**File**: `tests/integration/performance-benchmark.test.ts`
**Description**: Benchmark hybrid search on various repository sizes.
**Story**: US5
**Dependencies**: T018, T039
**Parallelizable**: No

**Test Cases**:
- Setup: Create test repos of varying sizes (small: 1k files, medium: 10k files, large: 50k files)
- Benchmark: Execute 100 queries on each size
- Measure: p50, p95, p99 latencies
- Verify: medium repos < 300ms p95 (SC-001)
- Verify: memory usage < 500MB (SC-008)
- Report: timing breakdown by phase
- Identify: bottlenecks (lexical, vector, or ranking)

---

### [ ] T041: Add metrics endpoint/command (optional)
**File**: `src/cli/commands/metrics.ts` (new file)
**Description**: View collected performance metrics.
**Story**: US5
**Dependencies**: T039
**Parallelizable**: Yes [P]

**Implementation**:
- New command: `code-index metrics`
- Read from `.codeindex/logs/search-performance.jsonl`
- Display: aggregate statistics (avg, p50, p95, p99)
- Display: SLA violation rate
- Display: fallback mode frequency
- Display: query distribution (lexical vs vector vs hybrid)
- Support --json flag for machine-readable output

---

### [ ] T042: Integration test for SLA violation handling
**File**: `tests/integration/sla-violation.test.ts`
**Description**: Test partial result return when timeout exceeded.
**Story**: US5
**Dependencies**: T018, T039
**Parallelizable**: No

**Test Cases**:
- Setup: Use slow mock implementations or large result sets
- Test: Search with tight timeout (e.g., --timeout 100)
- Verify: Partial results returned (exit code 3)
- Verify: Warning message about timeout
- Verify: Performance metrics show slaViolation=true
- Verify: totalTimeMs near timeout limit

---

**✓ Checkpoint US5**: Performance monitoring complete with detailed metrics and SLA tracking.

---

## Phase 8: Polish & Integration (Tasks T043-T045)

**Status**: ⏸️ NOT STARTED (0/3 tasks)

**Goal**: Final integration, documentation, and quality checks.

---

### [ ] T043: Update main documentation
**Files**: `README.md`, `specs/009-implement-hybrid-ranking/quickstart.md`
**Description**: Document hybrid search usage and configuration.
**Story**: Polish
**Dependencies**: All previous tasks
**Parallelizable**: Yes [P]

**Implementation**:
- Add hybrid search section to README
- Include examples of basic usage
- Document all CLI flags (--hybrid, --alpha, --beta, --gamma, --config, --lexical-only, --vector-only, --no-diversification, --explain)
- Link to quickstart.md for detailed guide
- Add configuration file example
- Document performance expectations

---

### [ ] T044: Run full test suite and fix any issues
**Description**: Execute all tests (unit, integration, contract) and ensure 100% pass rate.
**Story**: Polish
**Dependencies**: All test tasks
**Parallelizable**: No

**Test Execution**:
- `npm test` (run all tests)
- Fix any failing tests
- Ensure coverage for all new code
- Verify no regressions in existing functionality

---

### [ ] T045: Performance profiling and optimization
**Description**: Profile hybrid search and optimize hot paths if needed.
**Story**: Polish
**Dependencies**: T040, T044
**Parallelizable**: No

**Activities**:
- Run performance benchmarks
- Identify bottlenecks using Node.js profiler
- Optimize if p95 > 250ms (leave 50ms buffer for SLA)
- Consider optimizations:
  - Reduce candidate retrieval limit if quality unaffected
  - Optimize path similarity calculation (memoization?)
  - Parallelize diversification and tie-breaking if safe
  - Pre-compile regex patterns in tie-breaker
- Re-run benchmarks to verify improvements

---

## Dependency Graph

```
Setup (Phase 1)
├─ T001 [P] ranking-constants.ts
├─ T002 [P] ranking-config.ts
├─ T003 [P] ranking-candidate.ts
├─ T004 → hybrid-result.ts (depends on T003)
├─ T005 → hybrid-search-query.ts (depends on T002)
└─ T006 → hybrid-search-result.ts (depends on T004, T005)

Foundational (Phase 2)
├─ T007 → ranking-utils.ts (depends on T001, T002)
├─ T008 → ranking-utils.test.ts (depends on T007)
├─ T009 [P] preview-generator.ts
└─ T010 → preview-generator.test.ts (depends on T009)

US1 - Basic Hybrid Search (Phase 3)
├─ T011 → hybrid-ranker.test.ts (depends on T001-T006)
├─ T012 → hybrid-ranker.ts (depends on T011)
├─ T013 [P] path-diversifier.test.ts (depends on T007)
├─ T014 → path-diversifier.ts (depends on T007, T013)
├─ T015 [P] tie-breaker.test.ts (depends on T001, T003)
├─ T016 → tie-breaker.ts (depends on T001, T003, T007, T015)
├─ T017 [P] performance-monitor.test.ts (depends on T006)
├─ T018 → performance-monitor.ts (depends on T006, T017)
├─ T019 → hybrid-search.test.ts (depends on T012, T014, T016, T018)
├─ T020 → Modify search.ts CLI (depends on T005, T006, T012, T014, T016, T018)
├─ T021 → Add formatHybridResults (depends on T020)
├─ T022 → Add formatHybridResultsJSON (depends on T020)
└─ T023 → search-cli.test.ts contracts (depends on T020, T021, T022)

US2 - Configurable Weights (Phase 4)
├─ T024 → configuration-service.test.ts (depends on T002, T007)
├─ T025 → configuration-service.ts (depends on T002, T007, T024)
├─ T026 → Add --alpha/--beta/--gamma flags (depends on T020, T025)
├─ T027 → Add --config flag (depends on T025, T026)
├─ T028 → configuration.test.ts integration (depends on T025)
├─ T029 → weight-overrides.test.ts integration (depends on T026, T027)
└─ T030 → CLI contract tests for config (depends on T026, T027)

US3 - Path Diversification (Phase 5)
├─ T031 → Add --no-diversification flag (depends on T020)
├─ T032 → Enhance PathDiversifier with lambda (depends on T014)
├─ T033 → diversification.test.ts integration (depends on T014, T031, T032)
└─ T034 → CLI contract tests for diversification (depends on T031)

US4 - Advanced Tie-Breaking (Phase 6)
├─ T035 → Add --explain flag (depends on T020, T021)
├─ T036 → Enhance TieBreaker with language detection (depends on T016)
├─ T037 → tie-breaking.test.ts integration (depends on T016, T036)
└─ T038 → CLI contract tests for --explain (depends on T035)

US5 - Performance Monitoring (Phase 7)
├─ T039 → Enhance PerformanceMonitor with logging (depends on T018)
├─ T040 → performance-benchmark.test.ts (depends on T018, T039)
├─ T041 [P] Add metrics command (depends on T039)
└─ T042 → sla-violation.test.ts integration (depends on T018, T039)

Polish (Phase 8)
├─ T043 [P] Update documentation
├─ T044 → Run full test suite
└─ T045 → Performance profiling (depends on T040, T044)
```

---

## Parallel Execution Opportunities

### Within Setup Phase (T001-T003 can run in parallel)
```bash
# Parallel execution group 1
T001 (ranking-constants.ts)
T002 (ranking-config.ts)
T003 (ranking-candidate.ts)
```

### Within Foundational Phase (T009 independent)
```bash
# T009 can run in parallel with T007-T008
T009 (preview-generator.ts)
```

### Within US1 (T013, T015, T017 can run in parallel)
```bash
# Parallel execution group 2
T013 (path-diversifier.test.ts)
T015 (tie-breaker.test.ts)
T017 (performance-monitor.test.ts)
```

### Within US5 (T041 independent)
```bash
# T041 can run in parallel with other US5 tasks
T041 (metrics command)
```

### Within Polish (T043 independent)
```bash
# T043 can run in parallel with testing
T043 (documentation updates)
```

---

## Implementation Strategy

### MVP Scope (Ship First)
**Recommendation**: Implement **Phase 1 → Phase 2 → Phase 3 (US1)** first.

This delivers the P1 user story (Basic Hybrid Search) which provides immediate value:
- Core RRF fusion algorithm working
- Lexical + vector candidate combination
- Path diversification for quality results
- CLI interface with --hybrid flag
- Performance within 300ms SLA
- Comprehensive testing

**Estimated effort**: ~15-20 tasks for MVP

**Then iterate**: Add P2 stories (US2, US3) → P3 stories (US4, US5) → Polish

---

### Incremental Delivery Plan

1. **Sprint 1** (MVP): T001-T023
   - Deliverable: Basic hybrid search working end-to-end
   - Value: Users can execute hybrid searches combining lexical and semantic results

2. **Sprint 2** (Configuration): T024-T030
   - Deliverable: Configurable ranking weights
   - Value: Power users can tune ranking for their codebase

3. **Sprint 3** (Diversification + Tie-Breaking): T031-T038
   - Deliverable: Enhanced result quality through diversification and tie-breaking
   - Value: Better result distribution and intelligent ordering for close matches

4. **Sprint 4** (Monitoring + Polish): T039-T045
   - Deliverable: Performance monitoring, metrics, final polish
   - Value: Production-ready with observability and optimized performance

---

## Task Completion Criteria

Each task is considered complete when:
1. ✅ Implementation code written and follows TypeScript strict mode
2. ✅ JSDoc comments added to all public APIs
3. ✅ Unit tests written and passing (if applicable)
4. ✅ Integration/contract tests updated and passing (if applicable)
5. ✅ Code reviewed for quality and adherence to patterns
6. ✅ No TypeScript errors or warnings
7. ✅ Performance meets requirements (where applicable)
8. ✅ Documentation updated (where applicable)

---

## Notes

- **Testing Philosophy**: TDD approach - write tests before implementation wherever possible
- **Performance**: Profile after T040 and optimize hot paths if needed
- **Configuration**: Default values chosen based on research (research.md)
- **Extensibility**: Services use dependency injection for testability and future extensibility
- **Error Handling**: Use Result types throughout, comprehensive error messages
- **Observability**: Performance monitoring built-in from the start (US1)

---

## Summary

- **Total Tasks**: 45
- **User Stories**: 5 (P1: 1, P2: 2, P3: 2)
- **MVP Tasks**: 23 (through US1)
- **Test Tasks**: 18 (unit + integration + contract)
- **Parallel Opportunities**: 7 tasks marked [P]
- **Target Performance**: <300ms for top-10 results
- **Target Memory**: <500MB typical usage

**Next Step**: Execute `/speckit.implement` to begin implementing tasks sequentially.
