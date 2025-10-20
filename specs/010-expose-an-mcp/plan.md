# Implementation Plan: Code Intelligence Protocol Server

**Branch**: `010-expose-an-mcp` | **Date**: 2025-10-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-expose-an-mcp/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

This feature exposes the existing code-index functionality via an MCP (Model Context Protocol) server using JSON-RPC 2.0 over stdio transport. The server provides 8 tool functions (search, find_def, find_refs, callers, callees, open_at, refresh, symbols) for AI assistants to navigate and understand codebases. All responses include file anchors and code previews. Authentication is optional via environment variable.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP SDK), better-sqlite3 (existing database), commander.js (existing CLI)
**Storage**: SQLite (existing `.codeindex/index.db` with FTS5 full-text search)
**Testing**: Vitest (existing test framework)
**Target Platform**: Cross-platform CLI (Windows, macOS, Linux) with stdio transport
**Project Type**: Single CLI project (extends existing code-index architecture)
**Performance Goals**: Search <500ms for <100k files, symbol navigation <200ms, handle 50+ concurrent requests asynchronously
**Constraints**: Offline-capable, single client per server instance via stdio, max 100 results per query with 10 line previews, optional auth via environment variable
**Scale/Scope**: Integrates with AI assistants via MCP protocol, 8 tool functions exposing existing index capabilities

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Offline-First & Self-Contained ✅
- **Status**: PASS
- **Rationale**: MCP server operates entirely on local SQLite database; no network calls for core functionality
- **Evidence**: stdio transport, local database queries only, authentication via environment variable (not network service)

### II. Idempotent Operations ✅
- **Status**: PASS
- **Rationale**: All server tool functions are read-only or safely re-runnable (refresh can be called multiple times)
- **Evidence**: Search, symbol lookup, and navigation operations don't modify state; refresh operation is idempotent

### III. Specification-Driven Development ✅
- **Status**: PASS
- **Rationale**: Following Speckit workflow with spec.md created, clarifications documented, now in planning phase
- **Evidence**: spec.md with 6 prioritized user stories (P1-P3), acceptance scenarios, and success criteria

### IV. User Story Prioritization & Independence ✅
- **Status**: PASS
- **Rationale**: User stories are prioritized P1-P3, each independently testable and delivers standalone value
- **Evidence**: P1 (search + symbol navigation) is MVP, P2 (file opening + refresh) adds convenience, P3 (symbol listing + auth) for advanced use

### V. Performance & Efficiency Targets ✅
- **Status**: PASS
- **Rationale**: Explicit performance targets defined in spec success criteria
- **Evidence**: SC-002 (search <500ms), SC-003 (navigation <200ms), SC-005 (50+ concurrent requests), SC-006 (refresh <10s)

### VI. Testing Discipline ✅
- **Status**: PASS
- **Rationale**: Each user story has specific acceptance scenarios that can be tested
- **Evidence**: Acceptance scenarios define testable conditions; contract testing can verify MCP protocol compliance

### VII. Project-Relative Paths & Cross-Platform ✅
- **Status**: PASS
- **Rationale**: Server uses existing `.codeindex/` database with project-relative paths; MCP stdio transport is cross-platform
- **Evidence**: Database paths already project-relative, stdio transport platform-agnostic, no OS-specific dependencies

**GATE RESULT**: ✅ **PASS** - All constitution principles satisfied; proceed to Phase 0 research

### Post-Design Re-evaluation

After completing Phase 1 (research, data model, contracts, quickstart), re-evaluating constitution compliance:

**I. Offline-First & Self-Contained** ✅ PASS
- Research confirms MCP SDK operates entirely on local database
- No network dependencies introduced
- stdio transport is local-only communication

**II. Idempotent Operations** ✅ PASS
- All 8 tools are read-only or safely re-runnable
- Data model supports idempotent operations
- Refresh tool can be called multiple times safely

**III. Specification-Driven Development** ✅ PASS
- Complete spec, research, data model, and contracts generated
- Following Speckit workflow precisely
- Next phase is tasks.md generation

**IV. User Story Prioritization & Independence** ✅ PASS
- User stories remain independently implementable
- P1: Basic search + symbol navigation (MVP)
- P2: File opening + index refresh
- P3: Symbol listing + authentication

**V. Performance & Efficiency Targets** ✅ PASS
- Research identifies WAL mode for SQLite concurrency
- Prepared statements for performance
- Result limiting (100 max) enforced at multiple levels
- All performance targets feasible per research

**VI. Testing Discipline** ✅ PASS
- Contract tests defined in contracts/mcp-tools.yaml
- Integration testing strategy in research.md
- Acceptance scenarios in spec.md map to tests

**VII. Project-Relative Paths & Cross-Platform** ✅ PASS
- Uses existing .codeindex/ structure
- stdio transport is platform-agnostic
- No OS-specific dependencies introduced

**FINAL GATE RESULT**: ✅ **PASS** - All constitution principles remain satisfied post-design

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
├── models/              # Existing: ProjectConfig, IndexEntry, SearchResult
│   └── mcp-types.ts    # NEW: MCP protocol types (ToolRequest, ToolResponse, CodeAnchor, CodePreview)
├── services/            # Existing: database, indexer, searcher
│   └── mcp-server.ts   # NEW: MCP server implementation with tool handlers
├── cli/
│   └── commands/
│       └── serve.ts    # NEW: `code-index serve` command to start MCP server
└── lib/                # Existing utilities
    └── mcp-auth.ts     # NEW: Optional authentication middleware

tests/
├── contract/           # NEW: MCP protocol compliance tests
│   └── mcp-protocol.test.ts
├── integration/        # NEW: Server integration tests
│   └── mcp-server.test.ts
└── unit/              # NEW: Unit tests for tool handlers
    └── mcp-tools.test.ts
```

**Structure Decision**: Using Option 1 (Single project - DEFAULT). This feature extends the existing code-index CLI architecture by adding MCP server capabilities. New files are added to existing directories following established patterns: models for types, services for business logic, cli/commands for the new `serve` command, and lib for utilities. Testing follows the existing three-tier structure (contract/integration/unit).

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

No constitution violations identified. All principles are satisfied.
