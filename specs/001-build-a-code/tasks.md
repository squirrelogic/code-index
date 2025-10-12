# Tasks: Code-Index CLI Tool

**Input**: Design documents from `/specs/001-build-a-code/`
**Prerequisites**: plan.md (complete), spec.md (complete), research.md (complete), data-model.md (complete), contracts/cli-interface.yaml (complete)

**Tests**: Tests are OPTIONAL and not explicitly requested in the feature specification. This task list excludes test tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- **Single project**: `src/`, `tests/` at repository root
- **Package name**: @squirrelogic/code-index
- **Command name**: code-index

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic TypeScript/Node.js structure

- [X] T001 Create project directory structure per plan.md (`src/models/`, `src/services/`, `src/cli/`, `src/lib/`)
- [X] T002 Initialize package.json with TypeScript, Node.js 20+ configuration, and @squirrelogic/code-index package name
- [X] T003 [P] Install production dependencies: better-sqlite3@^11.0.0, commander@^14.0.0, ignore@^7.0.0
- [X] T004 [P] Install development dependencies: typescript@^5.0.0, @types/node@^20.0.0, @types/better-sqlite3@^7.6.0, vitest@^1.0.0
- [X] T005 Create tsconfig.json with ES2022 target, module resolution, and strict mode
- [X] T006 [P] Configure .gitignore with node_modules, dist/, .codeindex/, and other standard patterns
- [X] T007 [P] Add npm scripts for build, dev, and package publishing
- [X] T008 Create CLI entry point with shebang in src/cli/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T009 Create ProjectConfiguration model in src/models/project-config.ts with interface and validation
- [X] T010 [P] Create CodeIndexEntry model in src/models/index-entry.ts with Symbol types
- [X] T011 [P] Create SearchResult model in src/models/search-result.ts with Match interface
- [X] T012 [P] Create HealthCheckResult model in src/models/health-check.ts with ComponentStatus
- [X] T013 Implement Database service in src/services/database.ts with SQLite connection, WAL mode, prepared statements
- [X] T014 Create database schema setup in src/services/database.ts with tables, indexes, and FTS5
- [X] T015 [P] Implement file utilities in src/lib/file-utils.ts for path handling, validation, traversal
- [X] T016 [P] Implement JSON lines logger in src/cli/utils/logger.ts for .codeindex/logs/
- [X] T017 [P] Implement output formatter in src/cli/utils/output.ts for human/JSON output modes
- [X] T018 Setup Commander.js framework in src/cli/index.ts with base command structure

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Initialize and Bootstrap Project (Priority: P1) 🎯 MVP

**Goal**: Developer can run init command to create .codeindex/, .claude/, and .mcp.json infrastructure

**Independent Test**: Run `code-index init` in empty directory and verify all directories/files are created correctly

### Implementation for User Story 1

- [X] T019 [US1] Create MCP configuration generator in src/lib/mcp-config.ts for .mcp.json file
- [X] T020 [US1] Implement init command in src/cli/commands/init.ts with directory creation logic
- [X] T021 [US1] Add .codeindex/ directory creation with index.db and logs/ subdirectory
- [X] T022 [US1] Add .claude/ directory structure creation (settings/, hooks/, tools/)
- [X] T023 [US1] Generate default .mcp.json configuration file at project root
- [X] T024 [US1] Implement idempotent behavior - preserve existing configs on re-init
- [X] T025 [US1] Add .gitignore modification to exclude .codeindex/logs/* if not present
- [X] T026 [US1] Implement --force flag for reinitializing existing installations
- [X] T027 [US1] Add success/error output formatting for init command

**Checkpoint**: User Story 1 complete - initialization works independently

---

## Phase 4: User Story 2 - Index Project Codebase (Priority: P1) 🎯 MVP

**Goal**: Developer can run index command to scan all files and build SQLite database

**Independent Test**: Create sample project files, run `code-index index`, verify database contains expected entries

### Implementation for User Story 2

- [ ] T028 [US2] Create Gitignore service in src/services/gitignore.ts using ignore library
- [ ] T029 [US2] Implement file traversal with gitignore support in src/services/indexer.ts
- [ ] T030 [US2] Add file content reading and hash calculation in src/services/indexer.ts
- [ ] T031 [US2] Implement language detection and text/binary classification
- [ ] T032 [US2] Add batch processing logic (100 files per transaction) in src/services/indexer.ts
- [ ] T033 [US2] Implement index command in src/cli/commands/index.ts
- [ ] T034 [US2] Add database insertion with prepared statements and transactions
- [ ] T035 [US2] Implement progress reporting for verbose mode
- [ ] T036 [US2] Add performance metrics (files/second, total time) to output

**Checkpoint**: User Story 2 complete - indexing works independently

---

## Phase 5: User Story 3 - Search Indexed Codebase (Priority: P1) 🎯 MVP

**Goal**: Developer can search for code patterns and receive relevant results quickly

**Independent Test**: Index known files with specific content, search for patterns, verify correct results returned

### Implementation for User Story 3

- [ ] T037 [US3] Implement text search with FTS5 in src/services/searcher.ts
- [ ] T038 [US3] Add regex pattern search support in src/services/searcher.ts
- [ ] T039 [US3] Implement relevance scoring and result ranking
- [ ] T040 [US3] Create search command in src/cli/commands/search.ts
- [ ] T041 [US3] Add query parameter handling (--regex, --case-sensitive, --limit)
- [ ] T042 [US3] Implement result formatting with context snippets
- [ ] T043 [US3] Add helpful error when no index exists
- [ ] T044 [US3] Implement JSON output format for search results

**Checkpoint**: User Story 3 complete - core MVP functionality ready

---

## Phase 6: User Story 4 - Refresh Index for Changes (Priority: P2)

**Goal**: Developer can efficiently update index for modified files only

**Independent Test**: Index project, modify files, run refresh, verify only changed files updated

### Implementation for User Story 4

- [ ] T045 [US4] Implement file modification time tracking in src/services/database.ts
- [ ] T046 [US4] Add change detection logic in src/services/indexer.ts
- [ ] T047 [US4] Implement refresh command in src/cli/commands/refresh.ts
- [ ] T048 [US4] Handle deleted files removal from index
- [ ] T049 [US4] Add incremental update with minimal database writes
- [ ] T050 [US4] Report statistics (files updated/added/removed)

**Checkpoint**: User Story 4 complete - incremental updates work

---

## Phase 7: User Story 5 - Diagnose System Health (Priority: P2)

**Goal**: Developer can verify installation health and get fix suggestions

**Independent Test**: Create various error conditions, run doctor, verify issues detected

### Implementation for User Story 5

- [ ] T051 [US5] Implement database integrity check in src/services/database.ts
- [ ] T052 [US5] Add file permission verification logic
- [ ] T053 [US5] Implement configuration validation checks
- [ ] T054 [US5] Create doctor command in src/cli/commands/doctor.ts
- [ ] T055 [US5] Add issue detection and severity classification
- [ ] T056 [US5] Implement suggestion generation for common issues
- [ ] T057 [US5] Add --fix flag for automatic repair attempts
- [ ] T058 [US5] Format health report for human and JSON output

**Checkpoint**: User Story 5 complete - diagnostics work

---

## Phase 8: User Story 6 - Clean Uninstallation (Priority: P3)

**Goal**: Developer can completely remove code-index from their project

**Independent Test**: Initialize project, add configurations, run uninstall, verify complete removal

### Implementation for User Story 6

- [ ] T059 [US6] Implement artifact detection in src/cli/commands/uninstall.ts
- [ ] T060 [US6] Add confirmation prompt with --yes flag to skip
- [ ] T061 [US6] Implement safe directory removal (.codeindex/, .claude/)
- [ ] T062 [US6] Handle .mcp.json file deletion
- [ ] T063 [US6] Report removed paths in output

**Checkpoint**: User Story 6 complete - clean uninstallation works

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements affecting multiple stories

- [ ] T064 [P] Add --help documentation for all commands
- [ ] T065 [P] Implement --version flag with package version
- [ ] T066 Add signal handling (SIGINT, SIGTERM) for graceful shutdown
- [ ] T067 [P] Optimize database queries with additional indexes if needed
- [ ] T068 Add memory usage monitoring for large codebases
- [ ] T069 [P] Validate all exit codes (0 for success, non-zero for errors)
- [ ] T070 Update package.json with proper bin field for global installation
- [ ] T071 Add README.md with installation and usage instructions
- [ ] T072 Verify cross-platform compatibility (Windows, macOS, Linux)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories 1-3 (Phase 3-5)**: Core MVP - depend on Foundational, can then run sequentially
- **User Stories 4-6 (Phase 6-8)**: Enhancements - depend on core MVP stories
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Initialize - No dependencies on other stories
- **User Story 2 (P1)**: Index - Depends on US1 (needs initialized project)
- **User Story 3 (P1)**: Search - Depends on US2 (needs indexed database)
- **User Story 4 (P2)**: Refresh - Depends on US2 (extends indexing)
- **User Story 5 (P2)**: Doctor - Depends on US1 (checks initialization)
- **User Story 6 (P3)**: Uninstall - Depends on US1 (removes what init created)

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational model tasks (T010-T012) can run in parallel
- All utility implementations (T015-T017) can run in parallel
- Polish tasks marked [P] can run in parallel
- Within stories, most tasks are sequential due to file dependencies

---

## Parallel Execution Examples

### Phase 1 Setup - Parallel Dependencies
```bash
# Install all dependencies in parallel:
Task T003: "Install production dependencies"
Task T004: "Install development dependencies"
```

### Phase 2 Foundational - Parallel Models
```bash
# Create all models in parallel:
Task T010: "Create CodeIndexEntry model"
Task T011: "Create SearchResult model"
Task T012: "Create HealthCheckResult model"

# Create all utilities in parallel:
Task T015: "Implement file utilities"
Task T016: "Implement JSON lines logger"
Task T017: "Implement output formatter"
```

### Phase 9 Polish - Parallel Documentation
```bash
# Add all documentation in parallel:
Task T064: "Add --help documentation"
Task T065: "Implement --version flag"
Task T067: "Optimize database queries"
Task T069: "Validate all exit codes"
```

---

## Implementation Strategy

### MVP First (User Stories 1-3 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Initialize)
4. Complete Phase 4: User Story 2 (Index)
5. Complete Phase 5: User Story 3 (Search)
6. **STOP and VALIDATE**: Test core functionality end-to-end
7. Publish MVP to npm if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Can initialize projects
3. Add User Story 2 → Can index codebases
4. Add User Story 3 → Can search code (MVP complete!)
5. Add User Story 4 → Faster incremental updates
6. Add User Story 5 → Self-diagnostic capability
7. Add User Story 6 → Clean removal option

### Performance Targets to Validate

- Initialization: < 2 seconds (SC-001)
- Indexing: 1,000 files/second (SC-002)
- Search: < 100ms response for <100k files (SC-003)
- Refresh: < 10% of full index time (SC-004)
- Memory: < 500MB for 1M LOC (SC-007)

---

## Notes

- No test tasks included (not requested in specification)
- [P] tasks = different files, no dependencies
- [Story] labels track which user story owns each task
- Commits recommended after each task or logical group
- Stop at any checkpoint to validate functionality
- Each story adds value incrementally