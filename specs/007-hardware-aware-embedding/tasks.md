# Tasks: Hardware-Aware Embedding Selection

**Feature Branch**: `007-hardware-aware-embedding`
**Input**: Design documents from `/specs/007-hardware-aware-embedding/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli-commands.yaml

**Tests**: Tests are NOT requested in this specification, so test tasks are NOT included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and create basic project structure for embedding functionality

- [X] T001 Install @xenova/transformers@^2.17.0 dependency for embedding models
- [X] T002 [P] Install cli-progress@^3.12.0 for progress bars
- [X] T003 [P] Install ora@^8.0.0 for spinners during model loading
- [X] T004 [P] Install opossum@^8.1.0 for circuit breaker pattern
- [X] T005 [P] Install p-limit@^5.0.0 for concurrency control
- [X] T006 Create src/models/ directory structure for embedding data models
- [X] T007 [P] Create src/services/hardware/ directory for hardware detection
- [X] T008 [P] Create src/services/embedding/ directory for core embedding logic
- [X] T009 [P] Create src/services/cache/ directory for cache management
- [X] T010 [P] Create src/lib/embedding/backends/ directory for ONNX/PyTorch backends
- [X] T011 [P] Create src/lib/embedding/quantization/ directory for quantization utilities

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core data models, configuration management, and cache infrastructure that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T012 [P] Create HardwareCapabilities model in src/models/HardwareCapabilities.ts (cpuCores, totalRAM, freeRAM, platform, arch, cpuModel, gpu, detectedAt, onnxProviders)
- [X] T013 [P] Create GPUInfo model in src/models/GPUInfo.ts (vendor, name, memory, driverVersion, computeCapability, metalVersion)
- [X] T014 [P] Create EmbeddingProfile model in src/models/EmbeddingProfile.ts (name, model, modelVersion, backend, device, quantization, batchSize, dimensions, cacheDir) with preset profiles (light, balanced, performance)
- [X] T015 [P] Create EmbeddingConfig model in src/models/EmbeddingConfig.ts (version, profile, hardwareCapabilities, fallbackHistory, createdAt, updatedAt)
- [X] T016 [P] Create EmbeddingModel model in src/models/EmbeddingModel.ts (modelId, modelVersion, backend, device, quantization, dimensions, loadedAt, modelPath, pipeline)
- [X] T017 [P] Create EmbeddingCacheEntry model in src/models/EmbeddingCacheEntry.ts (id, contentHash, modelId, modelVersion, dimensions, embedding, createdAt, lastAccessedAt)
- [X] T018 [P] Create FallbackEvent model in src/models/FallbackEvent.ts (timestamp, level, action, from, to, reason, success)
- [X] T019 Implement ConfigService in src/services/config/ConfigService.ts (load/save .codeindex/config.json, validate configuration, handle version upgrades)
- [X] T020 Implement EmbeddingCache service in src/services/cache/EmbeddingCache.ts (SQLite operations: create embeddings table, insert/update/query cache, invalidate by dimension/model, handle binary blob storage)
- [X] T021 Setup SQLite schema for embeddings cache in src/services/cache/EmbeddingCache.ts (CREATE TABLE embeddings with indexes on contentHash+modelId+modelVersion+dimensions, lastAccessedAt, modelId+dimensions)
- [X] T022 Configure Transformers.js environment in src/lib/embedding/EmbeddingEnv.ts (set cacheDir to .codeindex/models, configure offline behavior, set allowLocalModels)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - First-Time Setup with Hardware Auto-Detection (Priority: P1) 🎯 MVP

**Goal**: System automatically detects hardware capabilities (CPU-only, Apple Silicon MPS, NVIDIA CUDA) and selects optimal embedding profile without manual configuration

**Independent Test**: Run tool on different hardware configurations (CPU-only VM, Apple Silicon Mac, NVIDIA GPU workstation) and verify appropriate profile selection and successful embedding generation

### Implementation for User Story 1

- [X] T023 [P] [US1] Implement HardwareDetector service in src/services/hardware/HardwareDetector.ts (detect CPU cores/model, total/free RAM, platform/arch using Node.js os module)
- [X] T024 [P] [US1] Implement GPU detection for NVIDIA in src/services/hardware/HardwareDetector.ts (parse nvidia-smi output for GPU name, memory, driver version, compute capability)
- [X] T025 [P] [US1] Implement GPU detection for Apple Silicon in src/services/hardware/HardwareDetector.ts (parse system_profiler output for Metal version, unified memory)
- [X] T026 [P] [US1] Implement ONNX Runtime provider detection in src/services/hardware/HardwareDetector.ts (check available execution providers: CPU, CUDA, CoreML, DirectML)
- [X] T027 [US1] Implement CapabilityEvaluator service in src/services/hardware/CapabilityEvaluator.ts (evaluate which profiles are supported, calculate recommended batch sizes, validate device compatibility)
- [X] T028 [US1] Implement ProfileManager service in src/services/embedding/ProfileManager.ts (auto-select profile based on hardware: CPU→light+int8, MPS→balanced+fp16, CUDA→performance+fp16)
- [X] T029 [US1] Integrate hardware detection into init command in src/cli/commands/init.ts (run hardware detection, select profile, persist config to .codeindex/config.json, display results)
- [X] T030 [US1] Implement ModelLoader service in src/services/embedding/ModelLoader.ts (singleton lazy loading pattern, download models from Hugging Face, cache locally, handle progress callbacks)
- [X] T031 [US1] Implement EmbeddingService orchestration in src/services/embedding/EmbeddingService.ts (coordinate hardware detection, profile selection, model loading, batch processing)
- [X] T032 [US1] Implement embed command in src/cli/commands/embed.ts (load config, initialize EmbeddingService, process files in batches, cache results, display progress with cli-progress)
- [X] T033 [US1] Add validation and error handling for hardware detection failures (graceful degradation to CPU-only if detection fails)
- [X] T034 [US1] Add logging for hardware detection and profile selection using existing logger

**Checkpoint**: At this point, User Story 1 should be fully functional - tool auto-detects hardware and generates embeddings on all platforms

---

## Phase 4: User Story 4 - Graceful Fallback During Resource Constraints (Priority: P1)

**Goal**: When encountering resource limitations (OOM, GPU unavailable, model loading failures), system automatically falls back to a working configuration while maintaining service continuity

**Independent Test**: Simulate failure conditions (limit memory, disable GPU, corrupt model files) and verify system continues with logged fallbacks

**Note**: Implementing US4 before US2/US3 because fallback handling is critical for reliability and should be in MVP

### Implementation for User Story 4

- [X] T035 [P] [US4] Implement FallbackChain service in src/services/embedding/FallbackChain.ts (define fallback chain: reduce_batch → switch_device → switch_model → switch_quantization)
- [X] T036 [US4] Implement batch size reduction fallback in src/services/embedding/FallbackChain.ts (detect OOM errors, reduce batch size by 50%, retry with minimum batch size of 1)
- [X] T037 [US4] Implement device switching fallback in src/services/embedding/FallbackChain.ts (detect GPU unavailable errors, switch CUDA→CPU or MPS→CPU, reset pipeline)
- [X] T038 [US4] Implement model switching fallback in src/services/embedding/FallbackChain.ts (detect model load failures, switch to lighter model, warn about cache invalidation)
- [X] T039 [US4] Implement quantization switching fallback in src/services/embedding/FallbackChain.ts (switch to int8 quantization on memory constraints)
- [X] T040 [US4] Integrate circuit breaker pattern in src/services/embedding/EmbeddingService.ts using opossum (timeout 30s, error threshold 50%, reset timeout 60s, fallback to cache)
- [X] T041 [US4] Implement fallback event logging in src/services/embedding/FallbackChain.ts (log to .codeindex/logs/embedding.jsonl in JSON Lines format with timestamp, action, from/to config, reason, success)
- [X] T042 [US4] Store fallback history in EmbeddingConfig (last 10 events in config.json)
- [X] T043 [US4] Add retry logic for model downloads in src/services/embedding/ModelLoader.ts (3 retries with exponential backoff, only retry network errors)
- [X] T044 [US4] Update embed command to handle fallback chains gracefully (continue processing, display fallback warnings, log all actions, never fail completely if fallback exists)
- [X] T045 [US4] Add memory-adaptive batch processing in src/services/embedding/EmbeddingService.ts (monitor heap usage, auto-reduce batch size at 80% memory pressure)

**Checkpoint**: System should now handle resource constraints gracefully and never fail completely when fallback options exist

---

## Phase 5: User Story 2 - Configuration Management via CLI (Priority: P2)

**Goal**: Power users can customize embedding configuration (profile, model, quantization, batch size) through CLI commands with persistence to .codeindex/config.json

**Independent Test**: Run config set commands, verify changes persist in config file, and verify changes are applied on next embedding run

### Implementation for User Story 2

- [ ] T046 [P] [US2] Implement config set embedding.profile command in src/cli/commands/config.ts (validate profile exists, warn if hardware incompatible, detect dimension changes, save to config)
- [ ] T047 [P] [US2] Implement config set embedding.model command in src/cli/commands/config.ts (validate model ID or local path, detect model dimensions, warn if dimension changes, support --version flag)
- [ ] T048 [P] [US2] Implement config set embedding.backend command in src/cli/commands/config.ts (validate backend is onnx or pytorch, check backend available, save to config)
- [ ] T049 [P] [US2] Implement config set embedding.quantization command in src/cli/commands/config.ts (validate quantization level, check compatibility with backend+device, save to config)
- [ ] T050 [P] [US2] Implement config set embedding.batchSize command in src/cli/commands/config.ts (validate range 1-256, save to config)
- [ ] T051 [P] [US2] Implement config set embedding.cacheDir command in src/cli/commands/config.ts (validate path, create directory if needed, check writable, save to config, note about not moving existing cache)
- [ ] T052 [US2] Implement --rebuild flag for embed command in src/cli/commands/embed.ts (clear all cache entries, regenerate all embeddings)
- [ ] T053 [US2] Implement dimension change detection in src/services/config/ConfigService.ts (compare new vs current dimensions, warn user, trigger cache invalidation)
- [ ] T054 [US2] Implement cache invalidation on dimension change in src/services/cache/EmbeddingCache.ts (DELETE FROM embeddings WHERE dimensions = old_dimension)
- [ ] T055 [US2] Add configuration validation in src/services/config/ConfigService.ts (validate all config fields, check hardware compatibility, verify model exists)
- [ ] T056 [US2] Add exit codes for all config commands per CLI contract (0=success, 1=invalid value, 2=not writable, 3=incompatible)

**Checkpoint**: Configuration management should be fully functional - users can customize all settings via CLI

---

## Phase 6: User Story 3 - System Diagnostics and Health Check (Priority: P2)

**Goal**: Developers can understand active embedding configuration, verify hardware detection, and troubleshoot performance issues through doctor command

**Independent Test**: Run doctor command on various hardware configurations and verify accurate reporting of all system parameters

### Implementation for User Story 3

- [ ] T057 [US3] Implement doctor command in src/cli/commands/doctor.ts (re-detect hardware, load config, validate model, check ONNX providers, report recent fallbacks)
- [ ] T058 [US3] Add hardware diagnostics display in src/cli/commands/doctor.ts (format CPU, RAM, GPU, platform details in human-readable format)
- [ ] T059 [US3] Add configuration diagnostics display in src/cli/commands/doctor.ts (show profile, model, dimensions, backend, device, quantization, batch size)
- [ ] T060 [US3] Add model status diagnostics in src/cli/commands/doctor.ts (check if cached locally, show size, show path, validate compatibility with hardware)
- [ ] T061 [US3] Add ONNX Runtime provider diagnostics in src/cli/commands/doctor.ts (list available providers, show active provider)
- [ ] T062 [US3] Add cache diagnostics in src/cli/commands/doctor.ts (show location, size, entry count, calculate hit rate from lastAccessedAt timestamps)
- [ ] T063 [US3] Add recent fallback history display in src/cli/commands/doctor.ts (show last 10 fallback events from config.fallbackHistory)
- [ ] T064 [US3] Implement configuration issue detection in src/cli/commands/doctor.ts (detect CUDA configured but unavailable, batch size too large for RAM, model not cached, etc.)
- [ ] T065 [US3] Add recommendations engine in src/cli/commands/doctor.ts (suggest fixes for detected issues like batch size reduction, device switching, profile changes)
- [ ] T066 [US3] Implement --json flag for doctor command (output diagnostics as structured JSON per CLI contract)
- [ ] T067 [US3] Implement --verbose flag for doctor command (show detailed hardware info, full ONNX provider list, model metadata)
- [ ] T068 [US3] Add exit codes for doctor command per CLI contract (0=healthy, 1=config issues, 2=hardware detection failed, 3=model validation failed)

**Checkpoint**: Diagnostics should be fully functional - users can troubleshoot and understand system status

---

## Phase 7: User Story 5 - Custom Profile Creation (Priority: P3)

**Goal**: Advanced users can create custom embedding profiles with specific combinations of backend, model, and quantization settings not covered by presets

**Independent Test**: Create custom profiles with various parameter combinations and verify they are saved, loaded, and applied correctly

### Implementation for User Story 5

- [ ] T069 [US5] Extend ProfileManager to support custom profiles in src/services/embedding/ProfileManager.ts (load custom profiles from config, validate custom profile parameters)
- [ ] T070 [US5] Implement config set embedding.profile command for custom profiles in src/cli/commands/config.ts (create new profile if name not in presets, validate all required fields)
- [ ] T071 [US5] Add custom profile validation in src/services/embedding/ProfileManager.ts (validate model exists, backend+device+quantization compatible, batch size in range)
- [ ] T072 [US5] Implement profile listing command in src/cli/commands/config.ts (show all available profiles: presets + custom, include profile details)
- [ ] T073 [US5] Implement profile deletion command in src/cli/commands/config.ts (delete custom profile, prevent deletion of preset profiles)
- [ ] T074 [US5] Add custom profile persistence in src/services/config/ConfigService.ts (store custom profiles in config.json under customProfiles section)
- [ ] T075 [US5] Support switching between preset and custom profiles in src/cli/commands/config.ts (validate profile exists in either presets or custom)

**Checkpoint**: Custom profiles should be fully functional - advanced users can create and manage specialized configurations

---

## Phase 8: Backend Implementation & Optimization

**Purpose**: Implement ONNX backend, quantization utilities, and performance optimizations

- [ ] T076 [P] Implement ONNXBackend in src/lib/embedding/backends/ONNXBackend.ts (initialize ONNX Runtime with execution providers, configure quantization, handle device selection)
- [ ] T077 [P] Implement PyTorchBackend stub in src/lib/embedding/backends/PyTorchBackend.ts (basic structure for future PyTorch support, throw not implemented error)
- [ ] T078 [P] Implement QuantizationUtils in src/lib/embedding/quantization/QuantizationUtils.ts (helper functions for int8/int4/fp16/fp32 configuration, validate quantization compatibility)
- [ ] T079 Implement batch processing with length sorting in src/services/embedding/EmbeddingService.ts (sort texts by length to minimize padding, process in batches, restore original order)
- [ ] T080 Implement streaming architecture for large file sets in src/services/embedding/EmbeddingService.ts (process files in bounded memory pool using p-limit, stream database writes, add GC hints every 100 files)
- [ ] T081 Add progress reporting with ora spinner in src/services/embedding/ModelLoader.ts (show model download progress, display loading percentage)
- [ ] T082 Add progress reporting with cli-progress in src/cli/commands/embed.ts (multi-bar for files and embeddings, show ETA, display memory usage using v8.getHeapStatistics)
- [ ] T083 Implement model caching strategy in src/services/embedding/ModelLoader.ts (check cached version vs config version, invalidate cache on version change, store models in .codeindex/models/)

---

## Phase 9: CLI Integration & User Experience

**Purpose**: Integrate all functionality into CLI commands with proper output formatting and error handling

- [ ] T084 [P] Add --files flag to embed command in src/cli/commands/embed.ts (filter to specific files, validate files exist)
- [ ] T085 [P] Add --profile flag to embed command in src/cli/commands/embed.ts (temporary profile override without saving to config)
- [ ] T086 [P] Add --json flag to embed command in src/cli/commands/embed.ts (output results as JSON per CLI contract with summary, hardware, model, fallbacks, failures)
- [ ] T087 [P] Add --progress/--no-progress flags to embed command in src/cli/commands/embed.ts (control progress bar display)
- [ ] T088 Update existing init command to integrate hardware detection (if init already exists, add hardware detection step)
- [ ] T089 Implement human-readable output formatting for all commands (success messages with checkmarks, warning messages for fallbacks, error messages with context)
- [ ] T090 Implement JSON output formatting for all commands with --json flag (structured output for automation per CLI contract)
- [ ] T091 Add exit code handling for all commands per CLI contract specifications (0=success, 1-5=various error types)
- [ ] T092 Add global --verbose flag support for detailed logging across all commands
- [ ] T093 Add global --quiet flag support to suppress non-error output

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements, documentation, and validation across all user stories

- [ ] T094 [P] Add comprehensive error messages for all failure scenarios (model not found, network errors, OOM, GPU unavailable, etc.)
- [ ] T095 [P] Implement consistent logging format across all services (timestamp, level, service, message)
- [ ] T096 [P] Add input validation for all CLI arguments and options
- [ ] T097 Code cleanup: Extract magic numbers to constants (batch size limits, memory thresholds, retry counts, timeouts)
- [ ] T098 Code cleanup: Add JSDoc comments to all public methods and classes
- [ ] T099 Performance optimization: Profile memory usage and optimize batch processing for 1000+ files
- [ ] T100 Performance optimization: Validate hardware detection completes within 2s target (SC-001)
- [ ] T101 Performance optimization: Validate fallback transitions complete within 5s target (SC-006)
- [ ] T102 Performance optimization: Validate cache retrieval is 10x faster than regeneration (SC-007)
- [ ] T103 Security: Validate model IDs to prevent path traversal attacks
- [ ] T104 Security: Sanitize all user inputs in CLI commands
- [ ] T105 Run through quickstart.md scenarios to validate end-to-end workflows (first-time setup, regenerate embeddings, switch profiles, diagnose issues)
- [ ] T106 Validate all success criteria from spec.md are met (SC-001 through SC-010)
- [ ] T107 Validate constitution compliance: offline-first (except initial downloads), idempotent operations, project-relative paths
- [ ] T108 Add TypeScript type checking for all new code (ensure no any types)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) - Critical for MVP
- **User Story 4 (Phase 4)**: Depends on US1 (Phase 3) - Adds fallback handling to MVP
- **User Story 2 (Phase 5)**: Depends on Foundational (Phase 2) and US1 (Phase 3) - Can start after MVP works
- **User Story 3 (Phase 6)**: Depends on Foundational (Phase 2) and US1 (Phase 3) - Can start after MVP works
- **User Story 5 (Phase 7)**: Depends on US2 (Phase 5) - Extends configuration management
- **Backend Implementation (Phase 8)**: Depends on Foundational (Phase 2) - Can overlap with user stories
- **CLI Integration (Phase 9)**: Depends on all user story implementations
- **Polish (Phase 10)**: Depends on all previous phases

### User Story Dependencies

- **User Story 1 (P1)**: Hardware auto-detection - CRITICAL MVP feature - Must complete first
- **User Story 4 (P1)**: Graceful fallback - CRITICAL for reliability - Should complete before US2/US3
- **User Story 2 (P2)**: Configuration management - Extends US1 with manual controls - No blocking dependencies
- **User Story 3 (P2)**: Diagnostics - Extends US1 with visibility - No blocking dependencies
- **User Story 5 (P3)**: Custom profiles - Extends US2 - Depends on configuration management

### Within Each User Story

- Foundational models and services before user story implementation
- Hardware detection before profile selection (US1)
- Profile selection before model loading (US1)
- Model loading before embedding generation (US1)
- Basic embedding before fallback handling (US1 → US4)
- Basic configuration before dimension change detection (US2)
- Basic operations before diagnostics (US3)
- Preset profiles before custom profiles (US5)

### Parallel Opportunities

**Setup (Phase 1)**:
- T002-T005: All dependency installations can run in parallel
- T007-T011: All directory creations can run in parallel

**Foundational (Phase 2)**:
- T012-T018: All model definitions can run in parallel (different files)
- T020-T021: Cache service and schema can run in parallel with other services

**User Story 1 (Phase 3)**:
- T023-T026: All hardware detection implementations can run in parallel (different aspects)

**After MVP Complete**:
- User Story 2 (Phase 5) and User Story 3 (Phase 6) can run in parallel (independent functionality)

**Backend Implementation (Phase 8)**:
- T076-T078: Backend implementations can run in parallel (different files)

**CLI Integration (Phase 9)**:
- T084-T087: Flag implementations can run in parallel (different options)
- T089-T090: Output formatting can run in parallel (different formats)

**Polish (Phase 10)**:
- T094-T096: Error messages, logging, and validation can run in parallel
- T097-T098: Code cleanup tasks can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# Launch all model definitions together:
Task: "Create HardwareCapabilities model in src/models/HardwareCapabilities.ts"
Task: "Create GPUInfo model in src/models/GPUInfo.ts"
Task: "Create EmbeddingProfile model in src/models/EmbeddingProfile.ts"
Task: "Create EmbeddingConfig model in src/models/EmbeddingConfig.ts"
Task: "Create EmbeddingModel model in src/models/EmbeddingModel.ts"
Task: "Create EmbeddingCacheEntry model in src/models/EmbeddingCacheEntry.ts"
Task: "Create FallbackEvent model in src/models/FallbackEvent.ts"
```

---

## Parallel Example: User Story 1 Hardware Detection

```bash
# Launch all hardware detection implementations together:
Task: "Implement HardwareDetector service - CPU detection"
Task: "Implement GPU detection for NVIDIA"
Task: "Implement GPU detection for Apple Silicon"
Task: "Implement ONNX Runtime provider detection"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 4)

1. Complete Phase 1: Setup (T001-T011)
2. Complete Phase 2: Foundational (T012-T022) - CRITICAL - blocks all stories
3. Complete Phase 3: User Story 1 (T023-T034) - Auto-detection and basic embedding
4. Complete Phase 4: User Story 4 (T035-T045) - Graceful fallback handling
5. **STOP and VALIDATE**: Test on CPU-only, Apple Silicon, and NVIDIA GPU
6. Deploy/demo MVP if ready

**MVP Scope**: Hardware auto-detection + graceful fallback = reliable embedding generation on any hardware

### Incremental Delivery

1. **MVP (P1 Stories)**: Setup + Foundational + US1 + US4 → Reliable auto-configured embedding
2. **Configuration Management**: Add US2 → Power users can customize settings
3. **Diagnostics**: Add US3 → Users can troubleshoot and understand system
4. **Advanced Customization**: Add US5 → Advanced users create custom profiles
5. **Optimization**: Complete Phase 8 + 9 + 10 → Production-ready performance and UX

### Parallel Team Strategy

With multiple developers after MVP:

1. Team completes Setup + Foundational + US1 + US4 together (MVP)
2. Once MVP complete:
   - Developer A: User Story 2 (Configuration)
   - Developer B: User Story 3 (Diagnostics)
   - Developer C: Backend Implementation (Phase 8)
3. Stories complete and integrate independently

---

## Task Count Summary

- **Phase 1 (Setup)**: 11 tasks
- **Phase 2 (Foundational)**: 11 tasks
- **Phase 3 (US1 - Auto-Detection)**: 12 tasks
- **Phase 4 (US4 - Fallback)**: 11 tasks
- **Phase 5 (US2 - Configuration)**: 11 tasks
- **Phase 6 (US3 - Diagnostics)**: 12 tasks
- **Phase 7 (US5 - Custom Profiles)**: 7 tasks
- **Phase 8 (Backend Implementation)**: 8 tasks
- **Phase 9 (CLI Integration)**: 10 tasks
- **Phase 10 (Polish)**: 15 tasks

**Total**: 108 tasks

**MVP Scope** (Phases 1-4): 45 tasks

---

## Notes

- [P] tasks = different files, no dependencies between them
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Tests are NOT included per feature specification
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- MVP focuses on P1 user stories (1 and 4) for reliable auto-configured embedding
- US2 and US3 can be implemented in parallel after MVP
- US5 extends US2 functionality
- Phase 8-10 can overlap with user story development
