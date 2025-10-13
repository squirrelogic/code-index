# Implementation Plan: Advanced Language Parsing with Tree-sitter

**Branch**: `004-integrate-tree-sitter` | **Date**: 2025-10-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-integrate-tree-sitter/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Integrate Tree-sitter parser library to provide structured code analysis for TypeScript, JavaScript, JSX, TSX, and Python files. The parser module will extract symbols (functions, classes, variables, etc.), import/export relationships, function calls, documentation, and generate content hashes for change detection. Uses syntax-level error recovery to handle malformed code gracefully, returning plain JavaScript objects matching TypeScript interfaces for consistent integration with the SQLite indexer.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**:
- tree-sitter (core parser library)
- tree-sitter-typescript, tree-sitter-tsx (TypeScript/TSX grammars)
- tree-sitter-javascript (JavaScript/JSX grammars)
- tree-sitter-python (Python grammar)
- NEEDS CLARIFICATION: Node.js bindings package (tree-sitter-node vs web-tree-sitter)
- NEEDS CLARIFICATION: Hash algorithm selection (crypto.createHash vs fast-hash library)

**Storage**: SQLite via better-sqlite3 (existing project database)
**Testing**: Vitest (existing project test framework)
**Target Platform**: Node.js CLI on macOS, Linux, Windows
**Project Type**: Single project (CLI tool with library architecture)
**Performance Goals**:
- 1,000 lines of code per second parsing throughput (SC-001)
- Incremental parsing 10x faster than full reparse (SC-006)
- Hash generation adds <5% overhead (SC-007)

**Constraints**:
- Offline-capable (no network dependencies)
- <100MB memory for files up to 1MB (SC-003)
- Syntax-level error recovery for 95% of syntax errors (SC-002)
- 99% symbol extraction accuracy for well-formed code (SC-004)

**Scale/Scope**:
- Support 5 language variants (JS, TS, JSX, TSX, Python)
- 14 symbol kinds to recognize and extract
- Files up to 10MB in size (FR-013)
- Handle codebases with 100k+ files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: DEFERRED - Project constitution not yet defined. This feature will help establish baseline patterns for future constitution development.

## Project Structure

### Documentation (this feature)

```
specs/004-integrate-tree-sitter/
├── spec.md              # Feature specification
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── parser-api.yaml  # Parser module contract
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
src/
├── models/
│   └── ParseResult.ts       # NEW: TypeScript interfaces for parser output
├── services/
│   ├── parser/              # NEW: Tree-sitter parser service
│   │   ├── index.ts         # Main parser interface
│   │   ├── TreeSitterParser.ts
│   │   ├── LanguageLoader.ts
│   │   ├── SymbolExtractor.ts
│   │   ├── ImportExportExtractor.ts
│   │   ├── CallGraphExtractor.ts
│   │   ├── CommentExtractor.ts
│   │   └── HashGenerator.ts
│   ├── database.ts          # EXISTING: Database service
│   └── indexer.ts           # MODIFIED: Will integrate parser service
├── cli/
│   └── commands/
│       └── index.ts         # MODIFIED: Will use parser for indexing
└── lib/
    └── utils.ts             # EXISTING: Utility functions

tests/
├── contract/
│   └── parser.test.ts       # NEW: Parser API contract tests
├── integration/
│   ├── parser-integration.test.ts  # NEW: Parser with file system
│   └── indexer-parser.test.ts      # NEW: Indexer + parser integration
└── unit/
    └── services/
        └── parser/          # NEW: Unit tests for parser components
            ├── SymbolExtractor.test.ts
            ├── ImportExportExtractor.test.ts
            ├── CallGraphExtractor.test.ts
            ├── CommentExtractor.test.ts
            └── HashGenerator.test.ts
```

**Structure Decision**: Single project structure with new `services/parser/` module containing Tree-sitter integration. Parser service will be consumed by the existing indexer service, following the established pattern of services/ for business logic and models/ for data structures.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

N/A - No constitution violations to track at this time.
