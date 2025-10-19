# Implementation Plan: Hybrid Search Ranking System

**Branch**: `009-implement-hybrid-ranking` | **Date**: 2025-01-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-implement-hybrid-ranking/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement a hybrid search ranking system that combines BM25 lexical search (via SQLite FTS5) with vector similarity search (via sqlite-vec) to provide superior code search results. The system retrieves top 200 candidates from each component, applies configurable fusion weights (α, β, γ), and uses path diversification to ensure result quality. Results include file:line anchors with code previews and relevance scores, delivered within 300ms for medium-sized repositories.

## Technical Context

**Language/Version**: TypeScript 5.9 / Node.js 20+
**Primary Dependencies**: better-sqlite3 (sync SQLite), sqlite-vec (vector search), @xenova/transformers (embeddings), onnxruntime-node (ONNX models), commander (CLI), chalk (output formatting)
**Storage**: SQLite database (`.codeindex/index.db`) with FTS5 for lexical search and vec0 virtual table for vector search
**Testing**: Vitest for unit, integration, and contract tests
**Target Platform**: Cross-platform CLI (macOS, Linux, Windows) running on Node.js 20+
**Project Type**: Single project (CLI tool with services, models, lib structure)
**Performance Goals**: <300ms for top-10 results on medium repos (10k-50k files), 1000 files/sec indexing rate
**Constraints**: Offline-first (no network dependencies), memory <500MB for typical queries, idempotent operations
**Scale/Scope**: Support repositories up to 100k files, handle 100 concurrent searches, maintain sub-500ms response even with component failures

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|---------|-------|
| **I. Offline-First & Self-Contained** | ✅ PASS | All search ranking operations use local SQLite with FTS5 and sqlite-vec. No network dependencies. |
| **II. Idempotent Operations** | ✅ PASS | Search operations are read-only and naturally idempotent. Configuration updates are atomic. |
| **III. Specification-Driven Development** | ✅ PASS | Following Speckit workflow: spec.md complete, clarifications resolved, now in planning phase. |
| **IV. User Story Prioritization** | ✅ PASS | Stories prioritized P1-P3. P1 (Basic Hybrid Search) is independently implementable MVP. Each story delivers standalone value. |
| **V. Performance & Efficiency Targets** | ✅ PASS | Explicit targets: <300ms for top-10 results (SC-001), <500MB memory (SC-008), 100 concurrent requests (SC-009). |
| **VI. Testing Discipline** | ✅ PASS | Testing requirements explicit in each user story with acceptance scenarios. Unit/integration tests required. |
| **VII. Project-Relative Paths** | ✅ PASS | All paths relative to project root. SQLite database at `.codeindex/index.db`. Cross-platform via Node.js path utilities. |

**Gate Result**: ✅ **PASS** - All constitutional principles satisfied. Proceed to Phase 0 research.

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
src/
├── models/
│   ├── search-result.ts           # Existing search result model
│   ├── embedding-vector.ts        # Existing vector storage models
│   ├── ranking-config.ts          # NEW: Configurable ranking weights (α, β, γ)
│   ├── hybrid-result.ts           # NEW: Unified result from hybrid ranking
│   └── ranking-candidate.ts       # NEW: Candidate from lexical/vector sources
│
├── services/
│   ├── search-service.ts          # Existing: BM25/FTS5 lexical search
│   ├── vector-storage.ts          # Existing: sqlite-vec vector search
│   ├── hybrid-ranker.ts           # NEW: Core fusion & ranking logic
│   ├── path-diversifier.ts       # NEW: Result diversification service
│   ├── tie-breaker.ts             # NEW: Advanced tie-breaking logic
│   └── performance-monitor.ts    # NEW: SLA monitoring & metrics
│
├── cli/
│   └── commands/
│       └── search.ts              # MODIFY: Add hybrid ranking option
│
└── lib/
    ├── ranking-utils.ts           # NEW: Score normalization, formula helpers
    └── preview-generator.ts       # NEW: Code preview/snippet generation

tests/
├── unit/
│   ├── hybrid-ranker.test.ts     # NEW: Test fusion algorithms
│   ├── path-diversifier.test.ts  # NEW: Test diversity logic
│   └── tie-breaker.test.ts       # NEW: Test tie-breaking rules
│
├── integration/
│   └── hybrid-search.test.ts     # NEW: End-to-end hybrid search tests
│
└── contract/
    └── search-cli.test.ts         # MODIFY: Add hybrid search contract tests
```

**Structure Decision**: Single project structure (Option 1). This feature extends existing search functionality by adding hybrid ranking services that coordinate between the existing lexical search (search-service.ts) and vector search (vector-storage.ts) components. New ranking logic is isolated in dedicated services (hybrid-ranker.ts, path-diversifier.ts, tie-breaker.ts) following the existing service pattern.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

**No violations** - All constitutional principles satisfied.

---

## Post-Design Constitution Re-Check

*Re-evaluated after Phase 1 design completion*

| Principle | Status | Post-Design Notes |
|-----------|---------|-------------------|
| **I. Offline-First & Self-Contained** | ✅ PASS | Design confirmed: No network dependencies. All ranking algorithms run locally using SQLite FTS5 and sqlite-vec. Configuration stored in local JSON file. |
| **II. Idempotent Operations** | ✅ PASS | Search operations remain read-only. Configuration hot-reload is atomic (file watch). No state mutations. |
| **III. Specification-Driven Development** | ✅ PASS | Completed: spec.md → clarifications → plan.md → research.md → data-model.md → contracts → quickstart.md. Ready for /speckit.tasks. |
| **IV. User Story Prioritization** | ✅ PASS | Design maintains story independence. P1 (Basic Hybrid Search) can ship alone. Core services (hybrid-ranker, path-diversifier, tie-breaker) support all stories. |
| **V. Performance & Efficiency Targets** | ✅ PASS | Design addresses SC-001 (<300ms): Parallel retrieval (Promise.all), 200 candidates/source, early termination, prepared statements. Performance monitoring built-in (PerformanceMetrics model). |
| **VI. Testing Discipline** | ✅ PASS | Test strategy defined: Unit tests for ranker/diversifier/tie-breaker, integration tests for full pipeline, contract tests for CLI. TDD approach maintained. |
| **VII. Project-Relative Paths** | ✅ PASS | Design uses project-relative paths: `.codeindex/ranking-config.json`. All file paths in results are project-relative. Cross-platform via Node.js path utilities. |

**Gate Result**: ✅ **PASS** - Design maintains constitutional compliance. No complexity violations introduced. Proceed to Phase 2 (/speckit.tasks).

---

## Implementation Ready

**Phase 0 Complete**: ✅ research.md
**Phase 1 Complete**: ✅ data-model.md, contracts/, quickstart.md
**Agent Context**: ✅ Updated

**Next Command**: `/speckit.tasks` to generate dependency-ordered task breakdown by user story.
