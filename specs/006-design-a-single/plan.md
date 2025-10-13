# Implementation Plan: Optimized Database Schema for Code Index Storage

**Branch**: `006-design-a-single` | **Date**: 2025-10-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-design-a-single/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Design and implement a single-file SQLite database schema optimized for code indexing with tables for files, symbols, cross-references, calls, chunks, embeddings, and FTS5 full-text search. The schema includes metadata tracking for schema versions and migrations, with indexes optimized for common lookup patterns. Key decisions from clarification: symbols use new-record-on-rename approach for refactoring lineage, 384-dimensional embeddings for semantic search, single-writer concurrency model, 30-day retention for deleted symbols, and structured error/slow-query logging.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: better-sqlite3 (synchronous SQLite driver), Commander.js (CLI framework)
**Storage**: SQLite 3.x with FTS5 extension, single-file database at `.codeindex/index.db`
**Testing**: Vitest for unit, integration, and contract tests
**Target Platform**: Cross-platform (macOS, Linux, Windows) - Node.js CLI tool
**Project Type**: Single project - CLI tool with library core
**Performance Goals**: Symbol queries <50ms (medium repos), full-text search <100ms, incremental updates 1000 files in <10s
**Constraints**: Single-writer semantics, <2x source code size for database, <500MB memory usage, offline-capable
**Scale/Scope**: Medium repositories (10k-100k files, 100k+ symbols), 384-dim embeddings (~1.5KB each), 30-day deleted symbol retention

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Since no project-specific constitution exists yet, applying standard gates for CLI tool projects:

### Initial Check (Before Phase 0)
✅ **Simplicity**: Single-file database design appropriate for portability
✅ **Testability**: Schema can be tested via SQL integrity checks and query benchmarks
✅ **Offline-First**: SQLite requires no network dependencies
✅ **Clear Scope**: Well-defined tables and indexes with measurable performance targets
✅ **No Violations**: Design aligns with project constraints (sync API, single-writer model)

### Re-evaluation (After Phase 1)
✅ **Simplicity Maintained**:
   - 8 tables with clear relationships, no over-engineering
   - Standard SQLite patterns (WAL mode, soft deletes, FTS5)
   - Minimal dependencies (better-sqlite3 only)

✅ **Testability Enhanced**:
   - Contract tests defined for all query operations with performance targets
   - Integrity check procedures documented
   - Query plan validation included
   - Migration rollback strategy specified

✅ **Offline-First Preserved**:
   - No external dependencies or network calls
   - Vector similarity computed in-process (no external vector DB)
   - All operations local to SQLite file

✅ **Clear Scope Verified**:
   - 15+ indexes with documented query patterns
   - Performance targets for each operation (<10ms to <200ms)
   - Database size estimation (400-500MB for medium repos)
   - Maintenance procedures defined (cleanup, ANALYZE, VACUUM)

✅ **Performance Goals Achievable**:
   - Symbol queries: <50ms (via compound indexes and partial indexes)
   - Full-text search: <100ms (FTS5 with BM25 ranking)
   - Incremental updates: 1000 files in <10s (batch transactions)
   - Concurrent reads: WAL mode allows unlimited readers during writes

**Final Gate Status**: ✅ PASSED - Design ready for task breakdown and implementation.

## Project Structure

### Documentation (this feature)

```
specs/006-design-a-single/
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
├── models/              # Data structures (DatabaseSchema, TableDefinitions, MigrationScript)
├── services/            # Business logic (SchemaManager, MigrationRunner, QueryOptimizer)
├── cli/
│   ├── commands/        # Command implementations (uses schema indirectly)
│   └── utils/           # CLI utilities (logger for structured error/slow query logs)
└── lib/                 # Utilities (schema SQL generators, integrity checkers)

tests/
├── contract/            # Schema contract tests (PRAGMA integrity_check, index existence)
├── integration/         # Schema + query performance tests (50ms symbol, 100ms search benchmarks)
└── unit/                # Unit tests for migration logic, schema validation

sql/                     # NEW: SQL schema definitions and migrations
├── schema.sql           # Current schema DDL
├── migrations/          # Versioned migration scripts
│   ├── 001_initial.sql
│   ├── 002_add_embeddings.sql
│   └── ...
└── indexes.sql          # Index definitions separate for clarity
```

**Structure Decision**: Single project structure with new `sql/` directory to house schema definitions separately from TypeScript code. This keeps SQL portable and allows independent schema review. TypeScript services in `src/services/` will load and execute these SQL files. Migration scripts are numbered and applied sequentially with version tracking in the `meta` table.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

No violations detected. Design adheres to simplicity principles with straightforward schema design and standard SQLite patterns.
