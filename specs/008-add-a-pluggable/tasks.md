---
description: "Task breakdown for Pluggable Embedding Layer implementation"
---

# Tasks: Pluggable Embedding Layer

**Input**: Design documents from `/specs/008-add-a-pluggable/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Following TDD principles - tests written FIRST and must FAIL before implementation (Principle VI)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- **Single project**: `src/`, `tests/` at repository root (from plan.md line 105-140)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure for embedding layer

- [X] T001 Install ONNX Runtime dependency: `npm install onnxruntime-node --save` for local model execution
- [X] T002 Install sqlite-vec extension and configure in `.codeindex/index.db` for vector storage
- [X] T003 [P] Install neverthrow for Result type error handling: `npm install neverthrow --save`
- [X] T004 [P] Install dotenv for environment variable management: `npm install dotenv --save`
- [X] T005 Create directory structure: `src/services/embedding/`, `src/models/`, `tests/unit/adapters/`, `tests/integration/`, `tests/contract/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database Schema & Storage

- [X] T006 Create database migration for sqlite-vec extension setup in `.codeindex/index.db`
- [X] T007 Implement `vec_embeddings` virtual table schema in database migration (data-model.md lines 120-137)
- [X] T008 [P] Implement `model_configurations` table schema in database migration (data-model.md lines 146-166)
- [X] T009 [P] Implement `embedding_metadata` table schema in database migration (data-model.md lines 170-192)
- [X] T010 [P] Implement `embedding_operations_log` table schema in database migration (data-model.md lines 198-218)
- [X] T011 [P] Implement `schema_migrations` table for version tracking (data-model.md lines 387-392)

### Core Models & Types

- [X] T012 [P] Create `EmbeddingVector` model in `src/models/embedding-vector.ts` with properties from data-model.md lines 15-42
- [X] T013 [P] Create `ModelConfiguration` model in `src/models/model-config.ts` with properties from data-model.md lines 48-67
- [X] T014 [P] Extend existing `Chunk` model in `src/models/chunk.ts` to reference embeddings (data-model.md lines 88-101)

### Adapter Interface & Base Infrastructure

- [X] T015 Define `IEmbeddingAdapter` interface in `src/services/embedding/adapter-interface.ts` (research.md lines 66-159)
- [X] T016 [P] Define adapter error hierarchy in `src/services/embedding/adapter-interface.ts`: `AdapterError`, `AdapterInitializationError`, `AdapterNetworkError`, `AdapterTimeoutError`, `AdapterValidationError`, `AdapterRateLimitError` (research.md lines 249-287)
- [X] T017 [P] Implement Result/Either type wrappers using neverthrow in `src/lib/result-types.ts`
- [X] T018 [P] Implement retry logic with exponential backoff in `src/lib/retry-utils.ts` (research.md lines 310-352)
- [X] T019 [P] Implement circuit breaker pattern in `src/lib/circuit-breaker.ts` (research.md lines 357-416)

### Configuration Management

- [X] T020 Create `ConfigurationManager` in `src/lib/env-config.ts` with .env loading and adapter config validation (research.md lines 611-716)
- [X] T021 Define typed configuration interfaces in `src/lib/env-config.ts`: `AdapterConfig`, `OnnxAdapterConfig`, `HostedAdapterConfig` (research.md lines 545-606)

### Vector Storage Service

- [X] T022 Implement `VectorStorageService` in `src/services/vector-storage.ts` with sqlite-vec operations: insert, query, delete (data-model.md lines 224-315)
- [X] T023 Implement hash tracking service in `src/services/hash-tracker.ts` for chunk change detection (data-model.md lines 275-290)

### Registry & Factory Infrastructure

- [X] T024 Define `IAdapterFactory` interface in `src/services/embedding/model-registry.ts` (research.md lines 1239-1265)
- [X] T025 Implement `AdapterRegistry` class in `src/services/embedding/model-registry.ts` with register, unregister, getOrCreateAdapter methods (research.md lines 1269-1370)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Basic Embedding Generation with Default Model (Priority: P1) 🎯 MVP

**Goal**: Enable developers to generate embeddings for their codebase using the default all-MiniLM-L6-v2 model without any configuration

**Independent Test**: Run embedding command on a sample codebase and verify that vector representations are generated and stored successfully

### Tests for User Story 1

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T026 [P] [US1] Contract test for `code-index embed` command exit codes in `tests/contract/embed-command.test.ts` (contracts/cli-embed-command.yaml lines 288-317)
- [ ] T027 [P] [US1] Contract test for `code-index embed` output format in `tests/contract/embed-command.test.ts` (contracts/cli-embed-command.yaml lines 84-111)
- [ ] T028 [P] [US1] Integration test for basic embedding workflow in `tests/integration/embedding-workflow.test.ts`: index chunks → embed → verify storage
- [ ] T029 [P] [US1] Unit test for ONNX adapter initialization in `tests/unit/adapters/onnx-adapter.test.ts`
- [ ] T030 [P] [US1] Unit test for ONNX adapter embedding generation in `tests/unit/adapters/onnx-adapter.test.ts`

### Implementation for User Story 1

- [X] T031 [P] [US1] Implement `OnnxEmbeddingAdapter` class in `src/services/embedding/onnx-adapter.ts` implementing `IEmbeddingAdapter` (research.md shows interface at lines 66-159)
- [X] T032 [P] [US1] Implement ONNX model loading and inference logic in `src/services/embedding/onnx-adapter.ts` using onnxruntime-node
- [X] T033 [US1] Implement `OnnxAdapterFactory` in `src/services/embedding/onnx-adapter-factory.ts` for creating ONNX adapter instances (research.md lines 1375-1415)
- [ ] T034 [US1] Download and configure default model (all-MiniLM-L6-v2) to `.codeindex/models/` directory
- [ ] T035 [US1] Insert default model configuration into `model_configurations` table with is_default=1
- [X] T036 [US1] Implement `EmbeddingService` orchestration in `src/services/embedding/embedding-service.ts` with initialize and embed methods (research.md lines 1519-1583)
- [X] T037 [US1] Implement batch processing logic in `EmbeddingService` for efficient embedding generation (FR-018)
- [X] T038 [US1] Implement CLI command `code-index embed` in `src/cli/commands/embed.ts` with basic options (contracts/cli-embed-command.yaml lines 9-71)
- [X] T039 [US1] Add progress reporting to embed command with progress bar and statistics (FR-015, contracts/cli-embed-command.yaml lines 99-110)
- [X] T040 [US1] Add error handling and clear error messages to embed command (FR-011, contracts/cli-embed-command.yaml lines 135-143)
- [ ] T041 [US1] Implement embedding metadata persistence in `embedding_metadata` table (data-model.md lines 170-192)
- [ ] T042 [US1] Implement operations logging in `embedding_operations_log` table (data-model.md lines 198-218)

**Checkpoint**: At this point, User Story 1 should be fully functional - users can run `code-index embed` and generate embeddings with the default model

---

## Phase 4: User Story 2 - Incremental Re-embedding Based on Changes (Priority: P1)

**Goal**: Enable developers to re-embed only changed portions of their codebase, avoiding unnecessary recomputation for large projects

**Independent Test**: Modify specific files, run embedding command, and verify that only chunks with changed hashes are re-embedded

### Tests for User Story 2

- [ ] T043 [P] [US2] Contract test for incremental embedding behavior in `tests/contract/embed-command.test.ts`: no changes → no updates
- [ ] T044 [P] [US2] Integration test for incremental updates in `tests/integration/embedding-workflow.test.ts`: modify files → only changed chunks embedded
- [ ] T045 [P] [US2] Integration test for deleted chunks cleanup in `tests/integration/embedding-workflow.test.ts`: delete file → embeddings removed
- [ ] T046 [P] [US2] Unit test for hash comparison logic in `tests/unit/services/hash-tracker.test.ts`

### Implementation for User Story 2

- [ ] T047 [P] [US2] Implement hash comparison logic in `HashTrackerService` in `src/services/hash-tracker.ts` (data-model.md lines 275-290)
- [ ] T048 [US2] Implement incremental embedding strategy in `EmbeddingService`: compare chunk hashes before embedding (FR-004)
- [ ] T049 [US2] Implement orphaned embeddings cleanup in `VectorStorageService` (FR-014, data-model.md lines 293-300)
- [ ] T050 [US2] Add skip tracking and statistics to `EmbeddingService` for reporting unchanged chunks
- [ ] T051 [US2] Update embed command output to display "Skipped: N chunks (no changes)" (contracts/cli-embed-command.yaml lines 99-110)
- [ ] T052 [US2] Add `--force` flag to embed command for full re-embedding override (contracts/cli-embed-command.yaml lines 34-39)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work - incremental updates are 10x faster than full re-indexing (SC-001)

---

## Phase 5: User Story 3 - Model Selection Override (Priority: P2)

**Goal**: Enable power users to use a specific embedding model instead of the default, for better quality or different embedding dimensions

**Independent Test**: Run embed command with different model overrides and verify that the specified models are used

### Tests for User Story 3

- [ ] T053 [P] [US3] Contract test for `--model` parameter validation in `tests/contract/embed-command.test.ts`
- [ ] T054 [P] [US3] Contract test for invalid model error messages in `tests/contract/embed-command.test.ts` (contracts/cli-embed-command.yaml lines 135-143)
- [ ] T055 [P] [US3] Integration test for model switching with dimension change in `tests/integration/embedding-workflow.test.ts`: switch model → all embeddings cleared
- [ ] T056 [P] [US3] Unit test for model registry validation in `tests/unit/adapters/model-registry.test.ts`

### Implementation for User Story 3

- [ ] T057 [P] [US3] Implement model validation in `AdapterRegistry` to check model existence
- [ ] T058 [US3] Implement dimension compatibility checking in `EmbeddingService`: compare new model dimensions with existing
- [ ] T059 [US3] Implement full re-embed workflow in `EmbeddingService` when dimensions change (FR-020)
- [ ] T060 [US3] Add confirmation prompt to embed command when model switching requires re-embedding all chunks
- [ ] T061 [US3] Implement `--model` parameter in embed command (contracts/cli-embed-command.yaml lines 15-23)
- [ ] T062 [US3] Add model listing functionality to show available models: `code-index embed --list-models`

**Checkpoint**: At this point, User Stories 1, 2, AND 3 should all work - users can override the default model

---

## Phase 6: User Story 4 - Dry-Run Mode for Planning (Priority: P2)

**Goal**: Enable developers to preview what would be embedded without actually performing the computation, useful for understanding scope of changes

**Independent Test**: Run embed command with dry-run flag and verify that no actual embeddings are generated but a detailed report is provided

### Tests for User Story 4

- [ ] T063 [P] [US4] Contract test for `--dry-run` flag behavior in `tests/contract/embed-command.test.ts`: no database changes (contracts/cli-embed-command.yaml lines 306-311)
- [ ] T064 [P] [US4] Contract test for dry-run output format in `tests/contract/embed-command.test.ts` (contracts/cli-embed-command.yaml lines 113-130)
- [ ] T065 [P] [US4] Integration test for dry-run performance in `tests/integration/embedding-workflow.test.ts`: completes in <5 seconds for 10k files (SC-004)

### Implementation for User Story 4

- [ ] T066 [US4] Implement dry-run mode in `EmbeddingService`: analyze chunks without embedding
- [ ] T067 [US4] Add dry-run statistics calculation: would embed, would skip, would delete counts
- [ ] T068 [US4] Implement estimated duration and throughput calculation for dry-run output
- [ ] T069 [US4] Add `--dry-run` flag to embed command (contracts/cli-embed-command.yaml lines 25-31)
- [ ] T070 [US4] Format dry-run output per contract specification (contracts/cli-embed-command.yaml lines 113-130)

**Checkpoint**: At this point, User Stories 1-4 should all work - users can preview changes before committing resources

---

## Phase 7: User Story 5 - Custom Adapter Integration (Priority: P3)

**Goal**: Enable organizations to integrate their own embedding service or use a hosted model provider through a custom adapter

**Independent Test**: Configure a custom adapter and verify that embeddings are generated through the custom service

### Tests for User Story 5

- [ ] T071 [P] [US5] Unit test for ResilientAdapter wrapper in `tests/unit/adapters/resilient-adapter.test.ts`: retry logic
- [ ] T072 [P] [US5] Unit test for ResilientAdapter circuit breaker in `tests/unit/adapters/resilient-adapter.test.ts`
- [ ] T073 [P] [US5] Integration test for hosted adapter with mock API in `tests/integration/hosted-adapter.test.ts`
- [ ] T074 [P] [US5] Contract test for custom adapter registration in `tests/contract/adapter-contract.test.ts`
- [ ] T075 [P] [US5] Unit test for configuration manager with environment variables in `tests/unit/services/env-config.test.ts`

### Implementation for User Story 5

- [ ] T076 [P] [US5] Implement base `HostedEmbeddingAdapter` class in `src/services/embedding/hosted-adapter.ts` with HTTP client and authentication
- [ ] T077 [P] [US5] Implement `ResilientAdapter` wrapper in `src/services/embedding/resilient-adapter.ts` combining retry + circuit breaker (research.md lines 427-469)
- [ ] T078 [US5] Implement `HostedAdapterFactory` in `src/services/embedding/model-registry.ts` for creating hosted adapters (research.md lines 1420-1483)
- [ ] T079 [US5] Implement environment variable loading for hosted adapter credentials in `ConfigurationManager` (FR-021)
- [ ] T080 [US5] Add API key validation and secure handling in `ConfigurationManager` (never log full keys)
- [ ] T081 [US5] Create example custom adapter implementation in `examples/custom-adapter.ts` for documentation
- [ ] T082 [US5] Implement rate limiting for hosted adapters in `HostedEmbeddingAdapter`
- [ ] T083 [US5] Add fallback adapter configuration support in `EmbeddingService`

**Checkpoint**: All user stories should now be independently functional - extensibility for enterprise users complete

---

## Phase 8: Testing & Quality Assurance

**Purpose**: Comprehensive testing and validation across all user stories

- [ ] T084 [P] Create `MockEmbeddingAdapter` for fast unit testing in `tests/mocks/mock-adapter.ts` (research.md lines 998-1089)
- [ ] T085 [P] Implement abstract `AdapterContractTests` suite in `tests/contract/adapter-contract-tests.ts` (research.md lines 832-994)
- [ ] T086 [P] Run contract tests for `OnnxEmbeddingAdapter` extending `AdapterContractTests`
- [ ] T087 [P] Run contract tests for `HostedEmbeddingAdapter` extending `AdapterContractTests`
- [ ] T088 [P] Implement property-based tests for adapter invariants in `tests/unit/adapters/property-tests.test.ts` (research.md lines 1094-1130)
- [ ] T089 [P] Integration test for vector storage with sqlite-vec in `tests/integration/vector-storage.test.ts`
- [ ] T090 [P] Performance test for embedding throughput (≥100 chunks/sec) in `tests/performance/throughput.test.ts` (SC-002)
- [ ] T091 [P] Performance test for similarity query speed (<100ms for 1M vectors) in `tests/performance/query-speed.test.ts` (SC-005)
- [ ] T092 [P] Performance test for incremental update speedup (10x faster) in `tests/performance/incremental.test.ts` (SC-001)

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

### Documentation

- [ ] T093 [P] Create custom adapter development guide in `docs/custom-adapters.md` with `IEmbeddingAdapter` interface examples
- [ ] T094 [P] Create configuration examples in `docs/configuration.md`: local models, hosted models, .env setup
- [ ] T095 [P] Document error codes and handling in `docs/error-handling.md`
- [ ] T096 [P] Update main README.md with embedding feature overview and quickstart link

### CLI Enhancements

- [ ] T097 [P] Add `--json` flag to embed command for machine-readable output (contracts/cli-embed-command.yaml lines 51-55)
- [ ] T098 [P] Add `--verbose` and `--quiet` flags to embed command (contracts/cli-embed-command.yaml lines 57-70)
- [ ] T099 [P] Implement JSON output format per contract (contracts/cli-embed-command.yaml lines 148-184)
- [ ] T100 [P] Add `--batch-size` parameter to embed command (contracts/cli-embed-command.yaml lines 41-48)

### Additional Features

- [ ] T101 [P] Implement `code-index download-model <name>` command for model management
- [ ] T102 [P] Add embedding statistics to `code-index doctor` command
- [ ] T103 [P] Create database migration rollback functionality for schema changes
- [ ] T104 [P] Add embedding status to `code-index status` command output

### Validation & Testing

- [ ] T105 Validate quickstart.md scenarios manually: basic embedding, incremental updates, model switching
- [ ] T106 Run full test suite and ensure all tests pass: `npm test`
- [ ] T107 Run TypeScript compilation and fix any type errors: `npm run build`
- [ ] T108 Run linting and formatting: `npm run lint && npm run format`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-7)**: All depend on Foundational phase completion
  - US1 + US2 (P1 priority) should be completed first for MVP
  - US3 + US4 (P2 priority) can follow
  - US5 (P3 priority) is optional for extensibility
- **Testing (Phase 8)**: Depends on implementation of stories being tested
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Extends US1 but independently testable
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Works with US1+US2 models
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Analysis-only, no embedding required
- **User Story 5 (P3)**: Can start after Foundational (Phase 2) - Completely independent adapter implementation

### Within Each User Story

- Tests MUST be written and FAIL before implementation (TDD)
- Models before services
- Services before CLI commands
- Core implementation before enhancements
- Story complete before moving to next priority

### Parallel Opportunities

#### Phase 1: Setup
- T003 (neverthrow), T004 (dotenv) can run in parallel

#### Phase 2: Foundational
- Database tables (T008, T009, T010, T011) can run in parallel after T007
- Core models (T012, T013, T014) can run in parallel
- Error types and utilities (T016, T017, T018, T019) can run in parallel after T015

#### Phase 3: User Story 1
- All tests (T026-T030) can run in parallel
- ONNX adapter and factory (T031-T033) can run in parallel

#### Phase 4: User Story 2
- All tests (T043-T046) can run in parallel

#### Phase 5: User Story 3
- All tests (T053-T056) can run in parallel

#### Phase 6: User Story 4
- All tests (T063-T065) can run in parallel

#### Phase 7: User Story 5
- All tests (T071-T075) can run in parallel
- Hosted adapter and resilient wrapper (T076, T077) can run in parallel

#### Phase 8: Testing
- All test implementations (T084-T092) can run in parallel

#### Phase 9: Polish
- All documentation tasks (T093-T096) can run in parallel
- All CLI enhancement tasks (T097-T100) can run in parallel
- All additional feature tasks (T101-T104) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (write first, ensure they fail):
Task T026: "Contract test for code-index embed command exit codes"
Task T027: "Contract test for code-index embed output format"
Task T028: "Integration test for basic embedding workflow"
Task T029: "Unit test for ONNX adapter initialization"
Task T030: "Unit test for ONNX adapter embedding generation"

# Then launch model implementations together:
Task T031: "Implement OnnxEmbeddingAdapter class"
Task T032: "Implement ONNX model loading and inference logic"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Basic Embedding)
4. Complete Phase 4: User Story 2 (Incremental Updates)
5. **STOP and VALIDATE**: Test US1 + US2 independently
6. Deploy/demo if ready - this is a complete MVP with core functionality

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Basic embedding works! (Initial release candidate)
3. Add User Story 2 → Test independently → Incremental updates work! (MVP complete - production ready)
4. Add User Story 3 → Test independently → Model selection works! (Enhanced flexibility)
5. Add User Story 4 → Test independently → Dry-run mode works! (Better UX)
6. Add User Story 5 → Test independently → Custom adapters work! (Enterprise ready)
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers after Foundational phase completes:
- Developer A: User Story 1 + User Story 2 (P1 priority, core MVP)
- Developer B: User Story 3 + User Story 4 (P2 priority, enhancements)
- Developer C: User Story 5 (P3 priority, extensibility)
- All developers: Phase 8 Testing (comprehensive validation)
- Team together: Phase 9 Polish (documentation and final touches)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD discipline)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Performance targets from spec.md success criteria (SC-001 through SC-010)
- Constitution Principle I partial compliance: Hosted adapters (P3) are optional and isolated
- All paths assume single project structure per plan.md
