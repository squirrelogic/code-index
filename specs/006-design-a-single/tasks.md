---
description: "Task list for database schema implementation"
---

# Tasks: Optimized Database Schema for Code Index Storage

**Input**: Design documents from `/specs/006-design-a-single/`
**Prerequisites**: plan.md (complete), spec.md (complete), research.md (complete), data-model.md (complete), contracts/schema-interface.yaml (complete)

**Tests**: No explicit testing requirements in the specification - tests are optional for this feature.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- **Single project**: `src/`, `tests/` at repository root
- Paths shown below assume single project structure per plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create `sql/` directory structure at repository root
- [X] T002 [P] Create `sql/migrations/` directory for versioned migration scripts
- [X] T003 [P] Create `sql/indexes.sql` file for index definitions (optional separate file)
- [X] T004 [P] Create `src/models/database-schema.ts` for TypeScript schema type definitions
- [X] T005 [P] Create `src/services/schema-manager.ts` skeleton for schema management
- [X] T006 [P] Create `src/services/migration-runner.ts` skeleton for migration execution
- [X] T007 [P] Create `src/lib/schema-validator.ts` for integrity checks

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T008 Define SQLite PRAGMA configuration interface in `src/models/database-schema.ts`
- [X] T009 Implement database connection initialization with PRAGMA settings in `src/services/schema-manager.ts`
- [X] T010 Implement migration runner framework in `src/services/migration-runner.ts` (load migrations, track versions, apply sequentially)
- [X] T011 [P] Create `sql/migrations/001_initial_schema.sql` with files table DDL and indexes
- [X] T012 Implement schema version tracking using meta table
- [X] T013 Add integrity check function (`PRAGMA integrity_check`) in `src/lib/schema-validator.ts`
- [X] T014 Add foreign key validation function (`PRAGMA foreign_key_check`) in `src/lib/schema-validator.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Store and Track Code Files (Priority: P1) 🎯 MVP

**Goal**: Enable storage and tracking of all indexed code files with metadata

**Independent Test**: Store file information and verify accurate retrieval, update detection via hash comparison, and deduplication

### Implementation for User Story 1

- [X] T015 [P] [US1] Complete files table schema in `sql/migrations/001_initial_schema.sql` (if not done in T011)
- [X] T016 [P] [US1] Add files table indexes in `sql/migrations/001_initial_schema.sql`:
  - `idx_files_path` (UNIQUE, partial WHERE deleted_at IS NULL)
  - `idx_files_hash` (for content hash lookups)
  - `idx_files_language` (for language-based queries)
- [X] T017 [US1] Define `File` entity TypeScript interface in `src/models/database-schema.ts` with fields: id, file_path, content_hash, language, size, modified_at, indexed_at, deleted_at
- [X] T018 [US1] Implement `FileRepository` class in `src/services/file-repository.ts` with methods:
  - `insert(file: File): string` - Insert new file record
  - `update(fileId: string, file: Partial<File>): void` - Update file metadata
  - `findByPath(path: string): File | null` - Find file by path
  - `findByHash(hash: string): File[]` - Find files by content hash (deduplication)
  - `softDelete(fileId: string): void` - Mark file as deleted
- [X] T019 [US1] Add logging for file operations in `src/services/file-repository.ts` (structured JSON lines format)
- [X] T020 [US1] Add query performance measurement wrapper for file queries (<10ms target)
- [X] T021 [US1] Implement batch file insert method using transactions for bulk operations

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Index Code Symbols and Relationships (Priority: P1)

**Goal**: Enable storage and querying of code symbols with cross-references and call relationships

**Independent Test**: Store symbols with references and verify accurate symbol lookup, reference traversal, and soft delete with retention

### Implementation for User Story 2

- [X] T022 [P] [US2] Add symbols table to `sql/migrations/001_initial_schema.sql` with fields: id, file_id, symbol_name, symbol_type, signature, documentation, line_start, line_end, created_at, deleted_at
- [X] T023 [P] [US2] Add symbols table indexes in `sql/migrations/001_initial_schema.sql`:
  - `idx_symbols_name` (partial WHERE deleted_at IS NULL)
  - `idx_symbols_file_type` (compound on file_id, symbol_type with partial filter)
  - `idx_symbols_deleted` (WHERE deleted_at IS NOT NULL for cleanup queries)
- [X] T024 [P] [US2] Add xrefs (cross-references) table to `sql/migrations/001_initial_schema.sql` with fields: id, source_symbol_id, target_symbol_id, reference_type, context, line_number, created_at
- [X] T025 [P] [US2] Add xrefs table indexes:
  - `idx_xrefs_source` (on source_symbol_id)
  - `idx_xrefs_target` (on target_symbol_id for "find all references")
  - `idx_xrefs_type` (on reference_type, target_symbol_id compound)
- [X] T026 [US2] Define `Symbol` entity interface in `src/models/database-schema.ts`
- [X] T027 [US2] Define `CrossReference` entity interface in `src/models/database-schema.ts`
- [X] T028 [US2] Implement `SymbolRepository` class in `src/services/symbol-repository.ts` with methods:
  - `insert(symbol: Symbol): string` - Insert new symbol
  - `findByName(name: string): Symbol[]` - Find symbols by name (<50ms target)
  - `findByFile(fileId: string): Symbol[]` - Find all symbols in file (<50ms target)
  - `findByFileAndType(fileId: string, type: string): Symbol[]` - Find symbols by file and type
  - `softDelete(symbolId: string): void` - Mark symbol as deleted with timestamp
  - `cleanupExpired(retentionDays: number): number` - Delete symbols older than retention period
- [X] T029 [US2] Implement `CrossReferenceRepository` class in `src/services/xref-repository.ts` with methods:
  - `insert(xref: CrossReference): string` - Create cross-reference
  - `findReferencesTo(symbolId: string): CrossReference[]` - Find all references TO a symbol (<100ms target)
  - `findReferencesFrom(symbolId: string): CrossReference[]` - Find all references FROM a symbol (<100ms target)
  - `findByType(refType: string): CrossReference[]` - Filter by reference type
- [X] T030 [US2] Add query performance monitoring for symbol lookups (log queries >50ms)
- [X] T031 [US2] Implement periodic cleanup function for deleted symbols in `src/services/symbol-repository.ts` (30-day retention per FR-002b)
- [X] T032 [US2] Add validation for symbol rename flow: create new symbol with new ID, soft-delete old symbol

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Enable Full-Text Search (Priority: P1)

**Goal**: Provide full-text search capabilities across code content and documentation

**Independent Test**: Index code content and verify search accuracy, BM25 ranking, and performance <100ms

### Implementation for User Story 3

- [ ] T033 [US3] Add FTS5 virtual table definition to `sql/migrations/001_initial_schema.sql`:
  ```sql
  CREATE VIRTUAL TABLE search USING fts5(
      content,
      documentation,
      file_id UNINDEXED,
      symbol_id UNINDEXED,
      file_path UNINDEXED,
      tokenize = 'unicode61 remove_diacritics 1 tokenchars "_."'
  );
  ```
- [ ] T034 [US3] Define `SearchResult` interface in `src/models/database-schema.ts` with fields: file_id, symbol_id, file_path, snippet, rank
- [ ] T035 [US3] Implement `SearchService` class in `src/services/search-service.ts` with methods:
  - `indexContent(fileId: string, symbolId: string | null, content: string, documentation: string | null, filePath: string): void` - Add content to FTS5 index
  - `search(query: string, limit: number): SearchResult[]` - Keyword search with BM25 ranking (<100ms target)
  - `searchPhrase(phrase: string, limit: number): SearchResult[]` - Exact phrase search
  - `searchPrefix(prefix: string, limit: number): SearchResult[]` - Prefix/autocomplete search
  - `searchWithWeights(query: string, contentWeight: number, docsWeight: number, limit: number): SearchResult[]` - Custom weighted search
- [ ] T036 [US3] Add snippet generation using FTS5 `snippet()` function with highlight markers
- [ ] T037 [US3] Add query performance monitoring for search operations (log queries >100ms)
- [ ] T038 [US3] Implement batch indexing for search content using transactions

**Checkpoint**: All P1 user stories (US1, US2, US3) should now be independently functional - MVP complete!

---

## Phase 6: User Story 4 - Store Code Chunks and Embeddings (Priority: P2)

**Goal**: Enable storage of semantic code chunks with vector embeddings for AI-powered search

**Independent Test**: Store chunks with embeddings and verify retrieval and similarity queries

### Implementation for User Story 4

- [ ] T039 [P] [US4] Create migration `sql/migrations/002_add_chunks_embeddings.sql` with chunks table DDL
- [ ] T040 [P] [US4] Add chunks table schema with fields: id (stable content-derived hash), file_id, symbol_id, content, context_before, context_after, language, line_start, line_end, created_at, deleted_at
- [ ] T041 [US4] Add chunks table indexes in migration 002:
  - `idx_chunks_file` (partial WHERE deleted_at IS NULL)
  - `idx_chunks_symbol` (partial WHERE deleted_at IS NULL)
  - `idx_chunks_id` (partial UNIQUE WHERE deleted_at IS NULL)
- [ ] T042 [US4] Add embeddings table to migration 002 with fields: chunk_id (PRIMARY KEY), embedding (BLOB, 1536 bytes), model, created_at
- [ ] T043 [US4] Add embeddings table index: `idx_embeddings_model` (filter by embedding model version)
- [ ] T044 [US4] Define `Chunk` entity interface in `src/models/database-schema.ts`
- [ ] T045 [US4] Define `Embedding` entity interface in `src/models/database-schema.ts`
- [ ] T046 [US4] Implement chunk ID generation function (SHA-256 hash of normalized content) in `src/lib/chunk-utils.ts`
- [ ] T047 [US4] Implement embedding encoding function (Float32Array → Buffer) in `src/lib/embedding-utils.ts`
- [ ] T048 [US4] Implement embedding decoding function (Buffer → Float32Array) in `src/lib/embedding-utils.ts`
- [ ] T049 [US4] Implement `ChunkRepository` class in `src/services/chunk-repository.ts` with methods:
  - `insert(chunk: Chunk): string` - Insert chunk with content-based ID
  - `findByFile(fileId: string): Chunk[]` - Find chunks in file
  - `findBySymbol(symbolId: string): Chunk | null` - Find chunk for symbol
  - `softDelete(chunkId: string): void` - Soft delete chunk
- [ ] T050 [US4] Implement `EmbeddingRepository` class in `src/services/embedding-repository.ts` with methods:
  - `insert(chunkId: string, embedding: number[], model: string): void` - Store embedding
  - `get(chunkId: string): Float32Array | null` - Retrieve embedding
  - `getAll(): Array<{chunkId: string, embedding: Float32Array}>` - Get all for similarity search
  - `deleteByChunk(chunkId: string): void` - Delete embedding when chunk deleted
- [ ] T051 [US4] Implement cosine similarity function in `src/lib/embedding-utils.ts`
- [ ] T052 [US4] Implement brute-force similarity search in `src/services/embedding-repository.ts`:
  - `findSimilar(queryEmbedding: number[], topK: number, minSimilarity: number): SimilarityResult[]`
- [ ] T053 [US4] Add validation for embedding dimensions (must be 384) and BLOB size (must be 1536 bytes)

**Checkpoint**: User Stories 1, 2, 3, AND 4 should all work independently

---

## Phase 7: User Story 5 - Track Schema Versions and Migrations (Priority: P2)

**Goal**: Enable graceful schema evolution with automatic migrations and integrity validation

**Independent Test**: Apply schema migrations and verify data integrity is maintained

### Implementation for User Story 5

- [ ] T054 [US5] Add meta table to `sql/migrations/001_initial_schema.sql` with fields: key (PRIMARY KEY), value, updated_at
- [ ] T055 [US5] Add migration_history table to `sql/migrations/001_initial_schema.sql` with fields: id (AUTOINCREMENT), version (UNIQUE), description, applied_at
- [ ] T056 [US5] Add migration_history index: `idx_migration_version` (UNIQUE on version)
- [ ] T057 [US5] Insert initial meta records in migration 001:
  - `schema_version = '1'`
  - `created_at = unixepoch()`
  - `retention_days = '30'`
- [ ] T058 [US5] Implement migration detection in `src/services/migration-runner.ts`:
  - `getCurrentVersion(): string` - Read schema_version from meta table
  - `getPendingMigrations(currentVersion: string): Migration[]` - Filter pending migrations
- [ ] T059 [US5] Enhance migration runner with transaction wrapping:
  - BEGIN TRANSACTION → Execute migration → Update meta → Record history → COMMIT
  - ROLLBACK on failure with error logging
- [ ] T060 [US5] Add migration validation before execution:
  - Check migration file format (version_description.sql)
  - Verify sequential version numbers
  - Detect duplicate or out-of-order migrations
- [ ] T061 [US5] Implement post-migration operations in `src/services/migration-runner.ts`:
  - Run `ANALYZE` to update query optimizer statistics
  - Run `PRAGMA integrity_check` to verify success
- [ ] T062 [US5] Add structured error logging for database operations in `src/lib/logger.ts`:
  - Log format: JSON lines (.jsonl)
  - Fields: timestamp, level (error/fatal), operation, query, parameters, error_code, error_message, stack_trace, context
  - Output to `.codeindex/logs/db-errors.jsonl`
- [ ] T063 [US5] Add slow query logging in `src/lib/logger.ts`:
  - Log queries exceeding thresholds: >50ms (symbols), >100ms (search), >1000ms (writes)
  - Fields: timestamp, level (warn), operation, query, parameters, duration_ms, result_count, threshold_ms
  - Output to `.codeindex/logs/slow-queries.jsonl`
- [ ] T064 [US5] Implement backup strategy helper in `src/lib/backup-utils.ts`:
  - `createBackup(dbPath: string): string` - Use `VACUUM INTO 'backup-{timestamp}.db'`
  - `cleanupOldBackups(backupDir: string, keepLast: number): void` - Keep only last N backups
- [ ] T065 [US5] Add rollback documentation in migration README explaining restore procedure

**Checkpoint**: User Stories 1-5 should all work independently with full migration support

---

## Phase 8: User Story 6 - Track Function Calls and Dependencies (Priority: P3)

**Goal**: Enable call graph analysis and dependency tracking for functions and methods

**Independent Test**: Store call relationships and verify call graph traversal queries

### Implementation for User Story 6

- [ ] T066 [US6] Create migration `sql/migrations/003_add_calls_table.sql` with calls table DDL
- [ ] T067 [US6] Add calls table schema with fields: id (AUTOINCREMENT), caller_symbol_id, callee_symbol_id, call_type, context, line_number, created_at
- [ ] T068 [US6] Add calls table indexes in migration 003:
  - `idx_calls_caller` (compound on caller_symbol_id, callee_symbol_id)
  - `idx_calls_callee` (on callee_symbol_id for reverse queries)
- [ ] T069 [US6] Add foreign key constraints for caller_symbol_id and callee_symbol_id (CASCADE on delete)
- [ ] T070 [US6] Define `Call` entity interface in `src/models/database-schema.ts`
- [ ] T071 [US6] Implement `CallGraphRepository` class in `src/services/call-graph-repository.ts` with methods:
  - `insert(call: Call): string` - Create call relationship
  - `findCallees(callerSymbolId: string): Call[]` - Find functions called by X (<100ms target)
  - `findCallers(calleeSymbolId: string): Call[]` - Find all callers of function Y (<100ms target)
  - `findCallGraph(symbolId: string, maxDepth: number): CallGraph` - Transitive call graph using recursive CTE
- [ ] T072 [US6] Implement cycle detection for circular dependencies in `src/services/call-graph-repository.ts`:
  - Use visited set during graph traversal to detect cycles
  - Return cycle information without infinite loops
- [ ] T073 [US6] Add query performance monitoring for call graph operations (log queries >100ms)

**Checkpoint**: All user stories (US1-US6) should now be independently functional

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T074 [P] Create SQL schema validation script that verifies all tables and indexes exist
- [ ] T075 [P] Add database statistics reporting function (table sizes, row counts, index overhead)
- [ ] T076 [P] Implement query plan analyzer helper (`EXPLAIN QUERY PLAN`) in `src/lib/query-analyzer.ts`
- [ ] T077 [P] Create database maintenance scheduler for periodic cleanup in `src/services/maintenance-scheduler.ts`:
  - Run cleanup_deleted_records every 24 hours
  - Run ANALYZE after cleanup
  - Run VACUUM if significant deletions (>1000 records)
- [ ] T078 [P] Add WAL checkpoint helper function (`PRAGMA wal_checkpoint(TRUNCATE)`)
- [ ] T079 [P] Document single-writer enforcement pattern in `src/services/write-lock.ts`:
  - `acquireWriteLock()` using `BEGIN IMMEDIATE`
  - Handle `SQLITE_BUSY` with exponential backoff
  - Timeout configuration (default 5000ms)
- [ ] T080 Add comprehensive JSDoc comments to all repository classes
- [ ] T081 Update quickstart.md with implementation examples if changes were made
- [ ] T082 Create database initialization helper `src/lib/database-init.ts` that combines all setup steps

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Depends on US1 for files table (via foreign key)
- **User Story 3 (P1)**: Can start after Foundational (Phase 2) - Can run parallel with US1/US2 (different tables)
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Depends on US1 (files) and US2 (symbols) via foreign keys
- **User Story 5 (P2)**: Can start after Foundational (Phase 2) - Depends on meta table (created in Foundational) for migration tracking
- **User Story 6 (P3)**: Can start after US2 complete (depends on symbols table)

### Within Each User Story

- SQL schema definitions (migrations) before TypeScript interfaces
- TypeScript interfaces before repository implementations
- Repository core methods before query optimization
- Repository implementations before logging/monitoring
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks (T001-T007) marked [P] can run in parallel
- All Foundational tasks (T011, T013-T014) marked [P] can run in parallel within Phase 2
- Once Foundational phase completes:
  - US1 (T015-T016) can start in parallel
  - US3 (T033) can start in parallel (independent table)
  - US2 must wait for US1 files table (T015 complete) due to foreign key dependency
- Within user stories:
  - US1: T015-T016 can run in parallel (both modify same migration file but different sections)
  - US2: T022-T025 can run in parallel (modify same migration, different table sections)
  - US4: T039-T043 can run in parallel (modify same migration, different table sections)
- All Polish tasks (T074-T079) marked [P] can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch schema and index definitions together (modifying same migration file):
Task: "Complete files table schema in sql/migrations/001_initial_schema.sql"
Task: "Add files table indexes in sql/migrations/001_initial_schema.sql"
# Note: These modify the same file but different sections (table DDL vs indexes)
```

---

## Implementation Strategy

### MVP First (User Stories 1, 2, 3 Only)

1. Complete Phase 1: Setup (T001-T007)
2. Complete Phase 2: Foundational (T008-T014) - CRITICAL - blocks all stories
3. Complete Phase 3: User Story 1 (T015-T021) - File tracking
4. Complete Phase 4: User Story 2 (T022-T032) - Symbol indexing and xrefs
5. Complete Phase 5: User Story 3 (T033-T038) - Full-text search
6. **STOP and VALIDATE**: Test all P1 stories independently
7. Deploy/demo if ready - MVP complete!

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (Files only)
3. Add User Story 2 → Test independently → Deploy/Demo (Files + Symbols)
4. Add User Story 3 → Test independently → Deploy/Demo (Files + Symbols + Search) - MVP!
5. Add User Story 4 → Test independently → Deploy/Demo (Add embeddings)
6. Add User Story 5 → Test independently → Deploy/Demo (Add migrations)
7. Add User Story 6 → Test independently → Deploy/Demo (Add call graph)
8. Complete Polish → Final release

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (T001-T014)
2. Once Foundational is done:
   - Developer A: User Story 1 (T015-T021) - Files
   - Developer B: User Story 3 (T033-T038) - Search (independent)
   - Developer C waits for US1 complete, then starts User Story 2 (T022-T032) - Symbols
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files or different sections of same file, no runtime dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- No tests explicitly requested in spec - all test tasks omitted
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts with runtime dependencies, cross-story dependencies that break independence

## Task Summary

- **Total tasks**: 82
- **Setup phase**: 7 tasks
- **Foundational phase**: 7 tasks
- **User Story 1 (P1)**: 7 tasks (Files)
- **User Story 2 (P1)**: 11 tasks (Symbols + Xrefs)
- **User Story 3 (P1)**: 6 tasks (Search)
- **User Story 4 (P2)**: 15 tasks (Chunks + Embeddings)
- **User Story 5 (P2)**: 12 tasks (Migrations + Logging)
- **User Story 6 (P3)**: 8 tasks (Call Graph)
- **Polish phase**: 9 tasks

**MVP Scope** (P1 stories only): Setup + Foundational + US1 + US2 + US3 = 38 tasks

**Parallel opportunities**: 15 tasks marked [P] can run in parallel within their phases
