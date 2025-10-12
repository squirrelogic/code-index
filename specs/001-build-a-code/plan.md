# Implementation Plan: Code-Index CLI Tool

**Branch**: `001-build-a-code` | **Date**: 2025-01-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-build-a-code/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Build a TypeScript/Node.js CLI tool that provides local code indexing capabilities with SQLite storage. The tool will bootstrap projects with necessary infrastructure (.codeindex/ for database and logs, .claude/ for settings, .mcp.json for MCP configuration) and provide commands for initialization, indexing, searching, refreshing, diagnostics, and uninstallation. All operations are idempotent, work offline, and use project-relative paths.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: better-sqlite3, commander, ignore
**Storage**: SQLite (local .codeindex/index.db file)
**Testing**: Vitest
**Target Platform**: Cross-platform CLI (Windows, macOS, Linux)
**Project Type**: single (CLI tool distributed as npm package)
**Performance Goals**: 1,000 files/second indexing, <100ms search response
**Constraints**: <500MB memory, offline-capable, no network required
**Scale/Scope**: Up to 100k files per project, 1M lines of code

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Note: Constitution file is currently a template. No specific gates to enforce at this time.

## Project Structure

### Documentation (this feature)

```
specs/001-build-a-code/
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
│   ├── project-config.ts    # Project configuration schema
│   ├── index-entry.ts       # Code index entry model
│   └── search-result.ts     # Search result model
├── services/
│   ├── database.ts          # SQLite database service
│   ├── indexer.ts           # File indexing service
│   ├── searcher.ts          # Search service
│   └── gitignore.ts         # Gitignore parsing service
├── cli/
│   ├── index.ts             # CLI entry point
│   ├── commands/
│   │   ├── init.ts          # Initialize command
│   │   ├── index.ts         # Index command
│   │   ├── search.ts        # Search command
│   │   ├── refresh.ts       # Refresh command
│   │   ├── doctor.ts        # Doctor command
│   │   └── uninstall.ts     # Uninstall command
│   └── utils/
│       ├── logger.ts        # JSON lines logger
│       └── output.ts        # Output formatting (JSON/human)
└── lib/
    ├── mcp-config.ts        # MCP configuration generator
    └── file-utils.ts        # File system utilities

tests/
├── contract/
│   └── cli-interface.test.ts
├── integration/
│   ├── init.test.ts
│   ├── indexing.test.ts
│   └── search.test.ts
└── unit/
    ├── models/
    ├── services/
    └── lib/
```

**Structure Decision**: Single project structure selected as this is a standalone CLI tool with no frontend or mobile components. The structure separates concerns into models (data structures), services (business logic), CLI (command interface), and lib (utilities).

## Complexity Tracking

*No constitution violations - proceeding with standard implementation.*
