# Implementation Plan: Pluggable Embedding Layer

**Branch**: `008-add-a-pluggable` | **Date**: 2025-10-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-add-a-pluggable/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Add a pluggable embedding layer that supports both local and hosted embedding models through a unified adapter interface. The system will use ONNX Runtime for local model execution (default: all-MiniLM-L6-v2) and store vectors in SQLite with the sqlite-vec extension. Embeddings are generated incrementally based on chunk hash changes, with support for model selection override, dry-run mode, and environment variable-based authentication for hosted services.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**:
- onnxruntime-node (local model execution)
- sqlite-vec extension (vector similarity search)
- better-sqlite3 (SQLite database access)
- dotenv (environment variable management)
- commander.js (CLI framework)

**Storage**: SQLite with sqlite-vec extension in `.codeindex/index.db`
**Testing**: Vitest (unit, integration, contract tests)
**Target Platform**: Cross-platform CLI (Windows, macOS, Linux)
**Project Type**: Single project (TypeScript CLI application)
**Performance Goals**:
- 100+ chunks/second embedding generation (SC-002)
- <100ms similarity queries for 1M vectors (SC-005)
- 10x faster incremental updates vs full re-index (SC-001)

**Constraints**:
- Offline-first architecture (Constitution Principle I)
- <500MB memory usage for model loading
- Project-relative paths only (Constitution Principle VII)
- Idempotent operations (Constitution Principle II)

**Scale/Scope**:
- Support codebases with 100,000+ chunks (SC-010)
- Handle 1 million vectors in similarity search (SC-005)
- Multiple embedding model adapters (local + hosted)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I: Offline-First & Self-Contained
**Status**: ⚠️ PARTIAL COMPLIANCE - Requires Justification

**Issue**: User Story 5 (Custom Adapter Integration) includes hosted model adapters that require network connectivity, which conflicts with the offline-first principle for core functionality.

**Justification**: Hosted adapters are explicitly marked as P3 (Priority 3) and represent optional extensibility, not core functionality. The core embedding feature (P1) uses local ONNX Runtime models and operates completely offline. Network-dependent features are isolated to the adapter interface and can be disabled/omitted without affecting core operations.

**Mitigation**:
- Default configuration uses only local models (FR-019)
- Hosted adapters are optional plugins, not required dependencies
- System remains fully functional without any network connectivity when using local adapters

### Principle II: Idempotent Operations
**Status**: ✅ COMPLIANT

Re-embedding operations are idempotent (FR-004): running the embed command multiple times produces the same vectors for unchanged chunks. Model switching triggers a clean rebuild (FR-020). All operations handle existing state gracefully.

### Principle III: Specification-Driven Development
**Status**: ✅ COMPLIANT

Feature follows Speckit workflow: spec.md → clarify → plan.md (this document) → tasks.md → implement. All user stories have priorities (P1-P3) and acceptance scenarios.

### Principle IV: User Story Prioritization & Independence
**Status**: ✅ COMPLIANT

User stories are prioritized (P1: basic embedding + incremental updates; P2: model selection + dry-run; P3: custom adapters) and independently testable. P1 stories can ship as MVP without P2/P3.

### Principle V: Performance & Efficiency Targets
**Status**: ✅ COMPLIANT

Success criteria (SC-001 through SC-010) specify measurable performance targets: 100+ chunks/second, <100ms queries, 10x incremental speedup, <500MB memory.

### Principle VI: Testing Discipline
**Status**: ✅ COMPLIANT

Feature spec includes "Independent Test" sections for each user story. Tests will be written following TDD principles using Vitest.

### Principle VII: Project-Relative Paths & Cross-Platform
**Status**: ✅ COMPLIANT

All storage uses project-relative paths (`.codeindex/index.db`). ONNX Runtime and Node.js provide cross-platform compatibility. CLI uses commander.js with proper exit codes.

**Overall Gate Status**: ✅ PASS (with documented justification for Principle I partial compliance)

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
│   ├── embedding-vector.ts      # EmbeddingVector entity with metadata
│   ├── model-config.ts          # ModelConfiguration settings
│   └── chunk.ts                 # Code chunk reference (extends existing)
├── services/
│   ├── embedding/
│   │   ├── adapter-interface.ts # IEmbeddingAdapter base interface
│   │   ├── onnx-adapter.ts      # Local ONNX Runtime adapter
│   │   ├── hosted-adapter.ts    # Base for hosted service adapters
│   │   ├── embedding-service.ts # Orchestration & batch processing
│   │   └── model-registry.ts    # Available models & validation
│   ├── vector-storage.ts        # sqlite-vec operations
│   └── hash-tracker.ts          # Chunk hash comparison logic
├── cli/
│   └── commands/
│       └── embed.ts             # New `code-index embed` command
└── lib/
    └── env-config.ts            # Environment variable & .env loading

tests/
├── contract/
│   └── embed-command.test.ts    # CLI interface contract tests
├── integration/
│   ├── embedding-workflow.test.ts  # End-to-end embed scenarios
│   └── vector-storage.test.ts      # sqlite-vec integration tests
└── unit/
    ├── adapters/
    │   ├── onnx-adapter.test.ts
    │   └── model-registry.test.ts
    └── services/
        ├── embedding-service.test.ts
        └── hash-tracker.test.ts
```

**Structure Decision**: Single project structure (Option 1) matches existing code-index CLI architecture. Embedding functionality is integrated as a new service layer with dedicated adapters subdirectory to support the pluggable architecture. CLI command added under existing `cli/commands/` directory for consistency.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle I: Hosted adapters (P3) require network | Extensibility for enterprise users with proprietary embedding services | Forcing all users to use only local models would limit adoption for organizations already invested in hosted ML infrastructure |

**Note**: This is the only documented complexity trade-off. The hosted adapter feature is isolated to P3 and does not affect core offline functionality.
