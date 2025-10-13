# Implementation Plan: File Watcher and Git Hooks for Incremental Indexing

**Branch**: `003-implement-a-watcher` | **Date**: 2025-10-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-implement-a-watcher/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement a file system watcher with debounced change detection for automatic incremental reindexing, along with optional Git hooks (post-merge, post-checkout, post-rewrite) and a --changed mode for commit-based updates. The system will monitor file system changes in real-time, batch rapid changes together, and efficiently update only the affected portions of the code index while respecting ignore patterns and handling edge cases gracefully.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: chokidar (file watching), better-sqlite3 (database), commander.js (CLI), simple-git (Git operations)
**Storage**: SQLite with FTS5 (.codeindex/index.db)
**Testing**: Vitest
**Target Platform**: Linux/macOS/Windows command-line
**Project Type**: single (CLI tool)
**Performance Goals**: <100ms change detection, <2s incremental reindex for 10-20 files
**Constraints**: <100MB memory while watching 100k+ files, offline-capable, no network dependencies
**Scale/Scope**: Support projects with 100k+ files, handle bursts of 1000+ simultaneous changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Core Principles Assessment

1. **Offline-First (FR-012)**: ✅ PASS - All watcher functionality works completely offline
2. **Idempotent Operations (FR-010)**: ✅ PASS - Reindexing operations are safe to re-run
3. **Performance Targets**: ✅ PASS - Design meets all specified performance goals (SC-001 through SC-010)
4. **Synchronous SQLite API**: ✅ PASS - Continues using better-sqlite3's sync API
5. **Incremental Updates**: ✅ PASS - Core feature focuses on incremental changes only

### No Constitution Violations Detected

The file watcher feature aligns with all established project principles and technical constraints.

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
│   ├── FileChangeEvent.ts      # File system change event representation
│   └── DebounceBuffer.ts       # Batched change accumulator
├── services/
│   ├── watcher/
│   │   ├── FileWatcher.ts      # Main watcher service using chokidar
│   │   ├── DebounceManager.ts  # Debouncing logic for batching changes
│   │   └── IgnorePatterns.ts   # Pattern matching for exclusions
│   ├── git/
│   │   ├── GitDiffReader.ts    # Parse commit diffs for --changed mode
│   │   └── GitHooks.ts         # Hook installation and management
│   └── indexer/
│       └── IncrementalIndexer.ts # Incremental update logic
├── cli/
│   └── commands/
│       ├── watch.ts            # code-index watch command
│       └── hooks.ts            # code-index hooks install/uninstall
└── lib/
    └── RetryManager.ts         # Exponential backoff retry logic

tests/
├── contract/
│   └── watcher.test.ts         # CLI interface contract tests
├── integration/
│   ├── watcher-indexing.test.ts # Watcher with database updates
│   └── git-hooks.test.ts       # Git hook execution tests
└── unit/
    ├── DebounceManager.test.ts
    ├── GitDiffReader.test.ts
    └── IgnorePatterns.test.ts
```

**Structure Decision**: Single project structure (Option 1) is appropriate for this CLI tool feature. The watcher functionality integrates with existing services and follows the established architecture pattern.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

No violations detected. The file watcher implementation:
- Maintains offline-first operation
- Uses synchronous SQLite operations
- Follows established project patterns
- Meets all performance targets
- Introduces minimal complexity with clear benefits

## Post-Design Constitution Re-check

After completing Phase 1 design (research, data model, contracts, quickstart):

1. **Offline-First**: ✅ PASS - No network dependencies introduced
2. **Idempotent Operations**: ✅ PASS - All operations remain safely re-runnable
3. **Performance Targets**: ✅ PASS - Design maintains all performance goals
4. **Synchronous SQLite API**: ✅ PASS - Continues using better-sqlite3 sync API
5. **Incremental Updates**: ✅ PASS - Core feature enhances incremental capabilities

### New Technology Additions

Added dependencies are minimal and justified:
- **chokidar**: Industry-standard file watching (used by webpack, vite)
- **simple-git**: Lightweight Git operations wrapper

Both libraries are:
- Well-maintained and widely adopted
- Have minimal dependencies themselves
- Align with project's CLI-focused architecture

**Conclusion**: The file watcher feature design passes all constitution checks and maintains project principles while adding valuable functionality.
