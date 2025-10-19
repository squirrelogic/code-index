# Tasks: Code Intelligence Protocol Server

**Feature**: 010-expose-an-mcp
**Input**: Design documents from `/specs/010-expose-an-mcp/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-tools.yaml

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Install MCP SDK dependencies: `npm install @modelcontextprotocol/sdk zod`
- [ ] T002 [P] Create `src/models/mcp-types.ts` with TypeScript interfaces and Zod schemas (CodeAnchor, CodePreview, SymbolKind, etc.)
- [ ] T003 [P] Create `src/lib/mcp-auth.ts` with authentication middleware stub (will implement in Phase 8)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Create `src/services/preview-formatter.ts` with preview extraction logic (extractPreview function, 3 before + 6 after lines, max 10 total)
- [ ] T005 Implement line truncation in `src/services/preview-formatter.ts` (150 char max, smart centering on match)
- [ ] T006 Implement code anchor generation in `src/services/preview-formatter.ts` (file:line:col format for VSCode compatibility)
- [ ] T007 Add binary file detection and special character sanitization in `src/services/preview-formatter.ts`
- [ ] T008 Create `src/services/mcp-server.ts` with MCP Server initialization (Server class, capabilities declaration, StdioServerTransport)
- [ ] T009 Implement graceful shutdown handler in `src/services/mcp-server.ts` (SIGTERM, SIGINT, stdin end/close)
- [ ] T010 Configure SQLite for concurrency in `src/services/mcp-server.ts` (WAL mode, NORMAL synchronous, 64MB cache, readonly flag)
- [ ] T011 Implement prepared statement caching in `src/services/mcp-server.ts` (QueryCache class)
- [ ] T012 Setup logging to stderr and `.codeindex/logs/mcp-server.log` in `src/services/mcp-server.ts` (NEVER write to stdout)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Basic Code Search Integration (Priority: P1) 🎯 MVP

**Goal**: Enable AI assistants to search codebases through natural language queries and receive relevant code snippets with file locations

**Independent Test**: Connect an AI client, execute search queries, verify relevant code snippets with file anchors are returned

### Implementation for User Story 1

- [ ] T013 [US1] Implement search tool input schema in `src/services/mcp-server.ts` using Zod (query, directory?, language?, limit with 1-100 validation)
- [ ] T014 [US1] Implement search tool handler in `src/services/mcp-server.ts` (uses FTS5 query with LIMIT, filters by directory/language if provided)
- [ ] T015 [US1] Integrate preview-formatter.ts with search results in search tool handler (extract preview for each match, respect 10-line limit)
- [ ] T016 [US1] Implement search result limiting and scoring in search tool handler (enforce max 100 results, include relevance score if available)
- [ ] T017 [US1] Add error handling for search tool (empty query → -32602, index unavailable → -32002, other errors → -32603)
- [ ] T018 [US1] Register search tool with MCP server using `server.tool()` method

**Checkpoint**: User Story 1 complete - search functionality fully operational and testable independently

---

## Phase 4: User Story 2 - Symbol Navigation and Definition Finding (Priority: P1) 🎯 MVP

**Goal**: Enable developers to navigate code by finding symbol definitions, references, and understanding code relationships through call graphs

**Independent Test**: Query for various symbols and verify correct definitions, references, and call relationships are returned

### Implementation for User Story 2

- [ ] T019 [P] [US2] Implement find_def tool in `src/services/mcp-server.ts` (query symbols table by name, return SymbolDefinition with preview)
- [ ] T020 [P] [US2] Implement find_refs tool in `src/services/mcp-server.ts` (query symbols table for all references, distinguish read vs write)
- [ ] T021 [P] [US2] Implement callers tool in `src/services/mcp-server.ts` (query call_graph table for caller_id, join with symbols and files)
- [ ] T022 [P] [US2] Implement callees tool in `src/services/mcp-server.ts` (query call_graph table for callee_id, join with symbols and files)
- [ ] T023 [US2] Add error handling for symbol tools (symbol not found → found:false, index unavailable → -32002)
- [ ] T024 [US2] Integrate preview-formatter.ts with all symbol navigation results (extract preview at each symbol location)

**Checkpoint**: User Stories 1 AND 2 complete - MVP has full search + symbol navigation capabilities

---

## Phase 5: User Story 3 - File Navigation and Opening (Priority: P2)

**Goal**: Enable developers to navigate directly to specific code locations and view file contents at particular lines

**Independent Test**: Request specific file locations and verify correct content is returned with appropriate context

### Implementation for User Story 3

- [ ] T025 [US3] Implement open_at tool input schema in `src/services/mcp-server.ts` (path, line, contextLines with 0-50 validation, default 10)
- [ ] T026 [US3] Implement open_at tool handler (read file, check exists, extract preview at specified line)
- [ ] T027 [US3] Add path resolution in open_at handler (support both absolute and project-relative paths)
- [ ] T028 [US3] Add error handling for open_at tool (file not found → exists:false, invalid line → error, read errors → -32603)

**Checkpoint**: User Stories 1, 2, AND 3 complete - full search, navigation, and file opening available

---

## Phase 6: User Story 4 - Index Refresh and Management (Priority: P2)

**Goal**: Enable developers to refresh the search index to reflect recent changes without restarting the server

**Independent Test**: Modify files, trigger refresh, verify updated content appears in subsequent searches

### Implementation for User Story 4

- [ ] T029 [US4] Implement refresh tool input schema in `src/services/mcp-server.ts` (optional paths array)
- [ ] T030 [US4] Implement refresh tool handler (call existing indexer service, measure duration, collect errors)
- [ ] T031 [US4] Add incremental vs full refresh logic in refresh tool handler (if paths specified → incremental, else → full)
- [ ] T032 [US4] Ensure refresh operates without blocking other tool requests (async operation, server remains responsive)
- [ ] T033 [US4] Add error collection and reporting in refresh tool output (track failed paths with error messages)

**Checkpoint**: User Stories 1-4 complete - core functionality complete with index management

---

## Phase 7: User Story 5 - Symbol Listing and Exploration (Priority: P3)

**Goal**: Enable developers to explore available symbols in files or across the codebase to understand code structure

**Independent Test**: Request symbol lists for various scopes and verify comprehensive symbol information is returned

### Implementation for User Story 5

- [ ] T034 [US5] Implement symbols tool input schema in `src/services/mcp-server.ts` (optional path parameter)
- [ ] T035 [US5] Implement symbols tool handler for file-scoped listing (query symbols table filtered by file_id)
- [ ] T036 [US5] Implement symbols tool handler for codebase-wide listing (query all symbols, optionally with limits)
- [ ] T037 [US5] Integrate preview-formatter.ts with symbol listings (include preview for each symbol definition)
- [ ] T038 [US5] Add error handling for symbols tool (file not found → empty list, index unavailable → -32002)

**Checkpoint**: User Stories 1-5 complete - all core features plus symbol exploration available

---

## Phase 8: User Story 6 - Optional Authentication (Priority: P3)

**Goal**: Enable administrators to restrict access to the code intelligence server in shared environments

**Independent Test**: Enable authentication and verify only authorized clients can access server functions

### Implementation for User Story 6

- [ ] T039 [US6] Implement authentication check logic in `src/lib/mcp-auth.ts` (check CODE_INDEX_AUTH_TOKEN env var, validate client token from request metadata)
- [ ] T040 [US6] Integrate authentication middleware in `src/services/mcp-server.ts` (wrap all tool handlers with auth check if enabled)
- [ ] T041 [US6] Add authentication error responses (missing/invalid token → -32001 with clear message)
- [ ] T042 [US6] Test authentication disabled by default (no CODE_INDEX_AUTH_TOKEN → all requests pass)
- [ ] T043 [US6] Test authentication enabled flow (CODE_INDEX_AUTH_TOKEN set → only matching tokens accepted)

**Checkpoint**: All user stories complete - full feature set with optional authentication

---

## Phase 9: CLI Integration

**Purpose**: Expose MCP server via `code-index serve` command

- [ ] T044 Create `src/cli/commands/serve.ts` with Commander.js command definition
- [ ] T045 Implement serve command handler (initialize MCP server, connect StdioServerTransport, handle errors)
- [ ] T046 Add serve command to main CLI in `src/cli/index.ts` or equivalent
- [ ] T047 Add help text and examples for serve command

**Checkpoint**: CLI integration complete - server can be started via `code-index serve`

---

## Phase 10: Testing & Validation

**Purpose**: Contract and integration testing for MCP protocol compliance

- [ ] T048 [P] Create `tests/contract/mcp-protocol.test.ts` to verify tools/list response format
- [ ] T049 [P] Create `tests/contract/mcp-protocol.test.ts` to verify JSON-RPC 2.0 response format for all tools
- [ ] T050 [P] Create `tests/integration/mcp-server.test.ts` to test server lifecycle (start, handle requests via stdin, shutdown)
- [ ] T051 [P] Create `tests/integration/mcp-server.test.ts` to test search tool end-to-end
- [ ] T052 [P] Create `tests/integration/mcp-server.test.ts` to test symbol navigation tools end-to-end
- [ ] T053 [P] Create `tests/unit/preview-formatter.test.ts` to test code preview extraction logic
- [ ] T054 [P] Create `tests/unit/mcp-tools.test.ts` to test individual tool handlers with mocked database
- [ ] T055 Run all tests and verify 100% pass rate: `npm test`

**Checkpoint**: All tests passing - server meets MCP protocol compliance and functional requirements

---

## Phase 11: Documentation & Polish

**Purpose**: Documentation updates and final refinements

- [ ] T056 [P] Update README.md with MCP server usage instructions
- [ ] T057 [P] Create `.mcp.json` example configuration file at project root
- [ ] T058 [P] Add JSDoc comments to all public APIs in mcp-types.ts, mcp-server.ts, preview-formatter.ts
- [ ] T059 Validate quickstart.md examples (ensure all code samples work)
- [ ] T060 Run build and verify no TypeScript errors: `npm run build`
- [ ] T061 Test actual integration with Claude Code tool picker (manual validation)

**Checkpoint**: Feature complete, documented, and ready for release

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies - can start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 completion - BLOCKS all user stories
- **Phase 3 (US1 - Search)**: Depends on Phase 2 completion
- **Phase 4 (US2 - Symbol Nav)**: Depends on Phase 2 completion - Can run in parallel with Phase 3
- **Phase 5 (US3 - File Nav)**: Depends on Phase 2 completion - Can run in parallel with Phase 3, 4
- **Phase 6 (US4 - Refresh)**: Depends on Phase 2 completion - Can run in parallel with Phase 3, 4, 5
- **Phase 7 (US5 - Symbols)**: Depends on Phase 2 completion - Can run in parallel with other stories
- **Phase 8 (US6 - Auth)**: Depends on Phase 2 completion - Can run in parallel with other stories
- **Phase 9 (CLI)**: Depends on at least Phase 3 + 4 (MVP user stories)
- **Phase 10 (Testing)**: Depends on all implementation phases
- **Phase 11 (Docs)**: Depends on Phase 10 completion

### User Story Dependencies

- **User Story 1 (P1 - Search)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1 - Symbol Nav)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P2 - File Nav)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 4 (P2 - Refresh)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 5 (P3 - Symbols)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 6 (P3 - Auth)**: Can start after Foundational (Phase 2) - No dependencies on other stories

### Within Each Phase

- Setup tasks T001-T003 can run in parallel
- Foundational tasks must be sequential (each builds on previous infrastructure)
- User Story 1 tasks must be sequential within the story
- User Story 2 tasks T019-T022 can run in parallel (different tools), T023-T024 must follow
- User Story 3 tasks must be sequential
- User Story 4 tasks must be sequential
- User Story 5 tasks must be sequential
- User Story 6 tasks must be sequential
- CLI tasks must be sequential
- Testing tasks T048-T054 can run in parallel
- Documentation tasks T056-T058 can run in parallel

### Parallel Opportunities

Once Foundational (Phase 2) is complete:
- All 6 user stories (Phases 3-8) can be developed in parallel by different team members
- Testing (Phase 10) can begin as soon as individual user stories complete
- Documentation (Phase 11) can begin in parallel with testing

---

## Parallel Example: Foundational Phase

```bash
# After T004-T007 complete (preview-formatter.ts):
# Launch in parallel:
Task T008: Create mcp-server.ts with MCP Server initialization
Task T009: Implement graceful shutdown handler
Task T010: Configure SQLite for concurrency
Task T011: Implement prepared statement caching
Task T012: Setup logging infrastructure
```

---

## Parallel Example: After Foundational Complete

```bash
# After Phase 2 complete, launch all user stories in parallel:
Task T013-T018: User Story 1 (Search) - Developer A
Task T019-T024: User Story 2 (Symbol Nav) - Developer B
Task T025-T028: User Story 3 (File Nav) - Developer C
Task T029-T033: User Story 4 (Refresh) - Developer D
Task T034-T038: User Story 5 (Symbols) - Developer E
Task T039-T043: User Story 6 (Auth) - Developer F
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only - P1 Priority)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T012) - CRITICAL
3. Complete Phase 3: User Story 1 - Search (T013-T018)
4. Complete Phase 4: User Story 2 - Symbol Navigation (T019-T024)
5. Complete Phase 9: CLI Integration (T044-T047)
6. **STOP and VALIDATE**: Test search + symbol navigation independently
7. Deploy/demo if ready - this is a functional MVP

### Incremental Delivery

1. **Foundation**: Setup + Foundational → Infrastructure ready
2. **MVP Release**: Add US1 + US2 → Test independently → Deploy (Basic search + symbol nav)
3. **Enhancement 1**: Add US3 + US4 → Test independently → Deploy (+ File nav + Refresh)
4. **Enhancement 2**: Add US5 + US6 → Test independently → Deploy (+ Symbol listing + Auth)
5. Each release adds value without breaking previous functionality

### Parallel Team Strategy (6 developers)

With 6 developers:

1. **Week 1**: Team completes Setup + Foundational together (critical path)
2. **Week 2**: Once Foundational complete, split into 6 parallel streams:
   - Dev A: User Story 1 (Search)
   - Dev B: User Story 2 (Symbol Nav)
   - Dev C: User Story 3 (File Nav)
   - Dev D: User Story 4 (Refresh)
   - Dev E: User Story 5 (Symbols)
   - Dev F: User Story 6 (Auth)
3. **Week 3**: Stories integrate and test independently
4. **Week 4**: CLI integration, testing, documentation

---

## Task Summary

- **Total Tasks**: 61
- **Setup Tasks**: 3 (T001-T003)
- **Foundational Tasks**: 9 (T004-T012)
- **User Story 1**: 6 tasks (T013-T018)
- **User Story 2**: 6 tasks (T019-T024)
- **User Story 3**: 4 tasks (T025-T028)
- **User Story 4**: 5 tasks (T029-T033)
- **User Story 5**: 5 tasks (T034-T038)
- **User Story 6**: 5 tasks (T039-T043)
- **CLI Integration**: 4 tasks (T044-T047)
- **Testing**: 8 tasks (T048-T055)
- **Documentation**: 6 tasks (T056-T061)

**Parallel Opportunities**:
- Phase 1: 2 tasks can run in parallel
- After Phase 2: All 6 user stories can develop in parallel
- Phase 10: 7 test tasks can run in parallel
- Phase 11: 3 doc tasks can run in parallel

**Suggested MVP Scope**: Phases 1, 2, 3, 4, 9 (39 tasks for basic search + symbol navigation)

---

## Notes

- **[P]** tasks = different files, no dependencies within phase
- **[Story]** label (US1-US6) maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group of related tasks
- Stop at any checkpoint to validate story independently
- Performance targets: Search <500ms, Symbol nav <200ms, 50+ concurrent requests
- All responses MUST include file anchors and code previews (FR-009)
- Result limits: Max 100 results per query, max 10 lines per preview (FR-018)
- Authentication disabled by default (FR-013)
- Server operates completely offline (Constitution Principle I)
