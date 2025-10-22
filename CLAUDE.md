# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **code-index** CLI tool project - a TypeScript/Node.js command-line application that provides local code indexing and search capabilities using SQLite. The tool is designed to work completely offline and uses project-relative paths.

NPM Package: `@squirrelsoft/code-index`

## Technology Stack

- **Language**: TypeScript 5.x / Node.js 20+
- **Database**: SQLite (via better-sqlite3) - stored in `.codeindex/index.db`
- **CLI Framework**: Commander.js
- **Gitignore Parsing**: ignore library
- **Testing**: Vitest
- **Package Manager**: npm

## Project Architecture

### Planned Structure (from specs/001-build-a-code/plan.md)
```
src/
├── models/          # Data structures (ProjectConfig, IndexEntry, SearchResult)
├── services/        # Business logic (database, indexer, searcher, gitignore)
├── cli/
│   ├── commands/    # Command implementations (init, index, search, refresh, doctor, uninstall)
│   └── utils/       # CLI utilities (logger, output formatting)
└── lib/            # Utilities (MCP config, file utils)

tests/
├── contract/       # CLI interface tests
├── integration/    # Component integration tests
└── unit/          # Unit tests for models/services/lib
```

### Key Design Decisions

1. **Synchronous SQLite API**: Using better-sqlite3's sync API for simplicity in CLI context
2. **Idempotent Operations**: All commands must be safely re-runnable (FR-010)
3. **Offline-First**: No network dependencies for core functionality (FR-012)
4. **Performance Targets**:
   - Index 1,000 files/second (SC-002)
   - Search responses < 100ms for codebases under 100k files (SC-003)
   - Memory usage < 500MB (SC-007)

## Development Workflow

### Specification-Driven Development

This project uses the **Speckit** workflow for feature development:

1. **Specify**: `/speckit.specify` - Create feature specification from requirements
2. **Clarify**: `/speckit.clarify` - Resolve ambiguities in spec
3. **Plan**: `/speckit.plan` - Generate implementation plan and research
4. **Tasks**: `/speckit.tasks` - Create task breakdown
5. **Implement**: `/speckit.implement` - Execute implementation tasks

Current feature specs are in `specs/001-build-a-code/`:
- `spec.md` - Feature specification with requirements
- `plan.md` - Implementation plan with technical decisions
- `research.md` - Technology research and decisions
- `data-model.md` - Entity definitions and SQLite schema
- `contracts/cli-interface.yaml` - OpenAPI-style CLI contract
- `quickstart.md` - User documentation

### Key Scripts

```bash
# Create new feature branch and spec
.specify/scripts/bash/create-new-feature.sh "feature description"

# Check prerequisites for current feature
.specify/scripts/bash/check-prerequisites.sh --json

# Setup planning phase
.specify/scripts/bash/setup-plan.sh --json

# Update agent context
.specify/scripts/bash/update-agent-context.sh claude
```

## CLI Commands (Planned)

The CLI will provide these commands:
- `code-index init` - Initialize project with .codeindex/, .claude/, and .mcp.json
- `code-index index` - Index all project files into SQLite
- `code-index search <query>` - Search indexed codebase
- `code-index refresh` - Update index for changed files only
- `code-index doctor` - Diagnose system health
- `code-index uninstall` - Remove all code-index artifacts

## Data Storage

- **Database**: `.codeindex/index.db` - SQLite with FTS5 for full-text search
- **Logs**: `.codeindex/logs/*.jsonl` - JSON lines format
- **Config**: `.claude/` directory for settings, hooks, tools
- **MCP**: `.mcp.json` at project root for Model Context Protocol

## Testing Strategy

Using Vitest for all testing:
- **Unit tests**: Test individual functions and services
- **Integration tests**: Test command workflows
- **E2E tests**: Test actual CLI commands in subprocess
- **Contract tests**: Verify CLI interface matches specification

## Performance Considerations

1. **Batch Processing**: Process files in batches of 100 (configurable)
2. **WAL Mode**: Enable SQLite Write-Ahead Logging for concurrency
3. **Prepared Statements**: Use for all database operations
4. **Lazy Loading**: Dynamic imports for CLI commands
5. **Incremental Updates**: Refresh command only processes changed files

## Current Status

The project is in the planning phase with specifications complete. The next step is to run `/speckit.tasks` to generate the task breakdown for implementation.
