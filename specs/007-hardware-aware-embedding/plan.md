# Implementation Plan: Hardware-Aware Embedding Selection

**Branch**: `007-hardware-aware-embedding` | **Date**: 2025-01-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-hardware-aware-embedding/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement automatic hardware detection and configuration system for optimal embedding generation. The system will detect CPU/MPS/CUDA capabilities at initialization, select appropriate embedding profiles (light/balanced/performance), support ONNX/PyTorch backends with quantization, implement graceful fallback chains for resource constraints, and provide CLI controls for configuration and diagnostics. All configuration persists in .codeindex/config.json with embeddings cached in SQLite.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: better-sqlite3 (database), NEEDS CLARIFICATION (embedding libraries: ONNX Runtime vs PyTorch bindings), NEEDS CLARIFICATION (hardware detection library), sentence-transformers models (via Hugging Face)
**Storage**: SQLite (embeddings cache in .codeindex/embeddings.db, configuration in .codeindex/config.json)
**Testing**: Vitest
**Target Platform**: Cross-platform CLI (Windows/macOS/Linux with CPU, Apple Silicon MPS, NVIDIA CUDA support)
**Project Type**: Single project (CLI tool)
**Performance Goals**: Hardware detection <2s, fallback transitions <5s, cache retrieval 10x faster than regeneration, process 1000+ files without failure
**Constraints**: Memory <500MB baseline (80% of available through batch adjustment), offline-capable (except initial model downloads), batch size range 32-256
**Scale/Scope**: Support codebases up to 100k files, handle 4GB-24GB GPU memory range, support 3 preset profiles + custom profiles

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Offline-First & Self-Contained ✅
- **PASS**: Core embedding functionality operates offline after initial model download
- **PASS**: All data stored in local SQLite (.codeindex/embeddings.db)
- **PASS**: Configuration in project-relative .codeindex/config.json
- **EXCEPTION**: Initial model downloads from Hugging Face require network (documented in Assumptions)

### II. Idempotent Operations ✅
- **PASS**: Hardware detection can be re-run (doctor command)
- **PASS**: Configuration commands (config set) can be repeated safely
- **PASS**: Embed --rebuild regenerates all embeddings idempotently
- **PASS**: Cache invalidation on dimension change is automatic and safe

### III. Specification-Driven Development ✅
- **PASS**: Feature follows Speckit workflow (Specify → Clarify → Plan → Tasks → Implement)
- **PASS**: spec.md contains prioritized user stories (P1, P2, P3)
- **PASS**: Acceptance scenarios defined for each user story
- **PASS**: Success criteria specified with measurable outcomes

### IV. User Story Prioritization & Independence ✅
- **PASS**: 5 user stories with clear priorities (P1: Hardware auto-detect, Graceful fallback; P2: CLI config, Diagnostics; P3: Custom profiles)
- **PASS**: Each story independently testable and valuable
- **PASS**: P1 stories form minimal viable product
- **PASS**: No blocking dependencies between user stories (infrastructure separated)

### V. Performance & Efficiency Targets ✅
- **PASS**: Hardware detection <2s (SC-001)
- **PASS**: Fallback transitions <5s (SC-006)
- **PASS**: Cache retrieval 10x faster than regeneration (SC-007)
- **PASS**: Memory usage targets with auto-adjustment (SC-008)
- **PASS**: Process 1000+ files on minimum hardware (SC-010)

### VI. Testing Discipline ✅
- **PASS**: Acceptance scenarios specified for each user story
- **PASS**: Each user story marked "Independent Test" with testing approach
- **PASS**: Edge cases identified and documented
- **PASS**: Testing framework specified (Vitest)

### VII. Project-Relative Paths & Cross-Platform ✅
- **PASS**: All storage in .codeindex/ relative to project root
- **PASS**: Configuration in .codeindex/config.json
- **PASS**: Target platforms explicitly include Windows/macOS/Linux
- **PASS**: CLI commands return appropriate exit codes (implicit in FR-015)

**Overall Status**: PASS - All constitution principles satisfied. One documented exception for initial model downloads.

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
│   ├── EmbeddingConfig.ts        # Configuration models for profiles, hardware
│   ├── HardwareCapabilities.ts   # Hardware detection results
│   └── EmbeddingCache.ts         # Cache entry models
├── services/
│   ├── hardware/
│   │   ├── HardwareDetector.ts   # CPU/MPS/CUDA detection
│   │   └── CapabilityEvaluator.ts # Evaluate what hardware can support
│   ├── embedding/
│   │   ├── EmbeddingService.ts   # Main embedding orchestration
│   │   ├── ModelLoader.ts        # Load ONNX/PyTorch models
│   │   ├── ProfileManager.ts     # Manage light/balanced/performance profiles
│   │   └── FallbackChain.ts      # Handle graceful degradation
│   ├── cache/
│   │   └── EmbeddingCache.ts     # SQLite cache operations
│   └── config/
│       └── ConfigService.ts      # Read/write .codeindex/config.json
├── cli/
│   └── commands/
│       ├── embed.ts              # embed --rebuild command
│       ├── config.ts             # config set commands
│       └── doctor.ts             # doctor diagnostics command
└── lib/
    └── embedding/
        ├── backends/
        │   ├── ONNXBackend.ts    # ONNX Runtime integration
        │   └── PyTorchBackend.ts # PyTorch integration
        └── quantization/
            └── QuantizationUtils.ts # int8/int4/fp16 handling

tests/
├── contract/
│   └── embedding-cli.test.ts     # CLI interface tests
├── integration/
│   ├── hardware-detection.test.ts # Hardware auto-detect flows
│   ├── fallback-chain.test.ts     # Fallback scenarios
│   └── profile-switching.test.ts  # Profile configuration tests
└── unit/
    ├── services/
    │   ├── HardwareDetector.test.ts
    │   ├── ProfileManager.test.ts
    │   └── FallbackChain.test.ts
    └── lib/
        └── backends/
            ├── ONNXBackend.test.ts
            └── PyTorchBackend.test.ts
```

**Structure Decision**: Using single project structure (Option 1) as this is a CLI tool. New directories added under src/ for embedding-specific functionality:
- `src/services/hardware/` - Hardware detection and capability evaluation
- `src/services/embedding/` - Core embedding logic with model loading and fallback
- `src/services/cache/` - Embedding cache management
- `src/lib/embedding/backends/` - ONNX and PyTorch backend implementations
- `src/lib/embedding/quantization/` - Quantization utilities

This structure maintains existing project organization while cleanly separating embedding concerns.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

No violations - Constitution Check passed in initial review and remains valid after Phase 1 design.

## Phase 1 Completion Summary

### Artifacts Generated

1. **research.md** - Comprehensive research on:
   - Embedding libraries (@huggingface/transformers selected)
   - Hardware detection (hybrid approach: Node.js os + CLI tools)
   - Model loading patterns (singleton lazy loading)
   - Batch processing (dynamic sizing 32-256)
   - Memory management (streaming with bounded pool)
   - Error handling (circuit breaker + fallback chain)
   - Progress reporting (cli-progress + ora)

2. **data-model.md** - Entity definitions:
   - HardwareCapabilities (CPU, RAM, GPU detection results)
   - GPUInfo (NVIDIA/Apple/AMD GPU details)
   - EmbeddingProfile (light/balanced/performance presets)
   - EmbeddingConfig (persisted configuration)
   - EmbeddingModel (loaded model instance)
   - EmbeddingCacheEntry (SQLite cached embeddings)
   - FallbackEvent (logged fallback actions)

3. **contracts/cli-commands.yaml** - CLI interface contract:
   - `config set embedding.*` commands (profile, model, backend, quantization, batchSize, cacheDir)
   - `embed` command (with --rebuild, --files, --profile, --json options)
   - `doctor` command (diagnostics with --json, --verbose options)
   - Complete input/output specifications
   - Error handling and exit codes

4. **quickstart.md** - User documentation:
   - Quick start guide (3-step setup)
   - Hardware profile descriptions
   - Customization examples
   - Common workflows (regenerate, specific files, override profile)
   - Troubleshooting guide
   - Fallback chain explanation
   - Best practices
   - Performance expectations

### Re-Evaluation: Constitution Check (Post-Design)

All constitution principles remain satisfied after Phase 1 design:

✅ **I. Offline-First** - Embeddings work offline after model download
✅ **II. Idempotent** - All commands safely re-runnable
✅ **III. Specification-Driven** - Followed Speckit workflow completely
✅ **IV. User Story Independence** - P1/P2/P3 stories remain independent
✅ **V. Performance Targets** - All specified targets achievable
✅ **VI. Testing Discipline** - Test approach defined for each user story
✅ **VII. Project-Relative Paths** - All paths relative to `.codeindex/`

**Phase 1 Status**: ✅ Complete - Ready for Phase 2 (Tasks)

### Next Steps

Run `/speckit.tasks` to generate task breakdown for implementation.
