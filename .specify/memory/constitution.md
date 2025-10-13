# Code-Index CLI Constitution

<!--
Sync Impact Report:
Version: 1.0.0 (Initial constitution)
Modified principles: N/A (new document)
Added sections: All sections are new
Removed sections: N/A
Templates requiring updates:
  ✅ plan-template.md - Already aligned with Constitution Check section
  ✅ spec-template.md - Already aligned with user story prioritization
  ✅ tasks-template.md - Already aligned with independent story implementation
  ✅ CLAUDE.md - Already references key principles from spec
Follow-up TODOs: None
-->

## Core Principles

### I. Offline-First & Self-Contained

The code-index CLI MUST operate completely offline without network connectivity for all core features. All data storage MUST use local SQLite databases stored in project-relative paths. No external services, cloud dependencies, or network calls are permitted in core functionality. This ensures reliability, privacy, and speed regardless of network conditions.

**Rationale**: Users need code indexing to work in air-gapped environments, on airplanes, or with unreliable networks. Local-first architecture eliminates latency, privacy concerns, and external dependencies.

### II. Idempotent Operations

All CLI commands MUST be idempotent - running them multiple times produces the same result without errors or unintended side effects. Initialization can be re-run to restore missing components. Indexing can be re-run to rebuild the database. All operations MUST handle existing state gracefully.

**Rationale**: Users should never fear running a command twice. Idempotency enables reliable automation, simplified error recovery, and reduced cognitive load.

### III. Specification-Driven Development (Speckit Workflow)

All features MUST follow the Speckit workflow: Specify → Clarify → Plan → Tasks → Implement. Each feature begins with a specification in `specs/###-feature-name/spec.md` that defines user stories with priorities (P1, P2, P3), acceptance scenarios, and success criteria. Implementation planning happens in `plan.md`, task breakdown in `tasks.md`, and execution via `/speckit.implement`.

**Rationale**: Structured feature development prevents scope creep, enables better collaboration, and ensures every feature has clear acceptance criteria before implementation begins.

### IV. User Story Prioritization & Independence

User stories MUST be prioritized (P1, P2, P3...) and independently implementable. Each user story must be testable on its own and deliver standalone value. P1 stories represent the MVP that can ship first. Stories MUST NOT create blocking dependencies on each other - foundational infrastructure is separated into a distinct phase.

**Rationale**: Independent stories enable parallel development, incremental delivery, and allow teams to ship MVPs quickly. Users get value from P1 completion even if P2/P3 are delayed.

### V. Performance & Efficiency Targets

Performance requirements MUST be specified upfront and tracked throughout development. For code-index CLI: indexing at 1,000 files/second, search responses under 100ms for <100k files, memory usage under 500MB. Use benchmarking and profiling to verify these targets. Optimize critical paths first; avoid premature optimization elsewhere.

**Rationale**: Performance is a feature, not an afterthought. Explicit targets prevent performance regressions and ensure the tool remains fast as features are added.

### VI. Testing Discipline

Testing requirements MUST be explicitly stated in feature specifications. When tests are required, they MUST be written before implementation (TDD). Tests are organized by type: contract tests (CLI interface validation), integration tests (component workflows), and unit tests (individual functions). Use Vitest for all testing.

**Rationale**: Test-first development catches issues early and ensures code is designed for testability. Optional testing acknowledges that some features (documentation, scripts) may not require formal tests.

### VII. Project-Relative Paths & Cross-Platform

All file paths MUST be relative to project root and work identically on Windows, macOS, and Linux. Use Node.js path utilities, never hardcode separators. Configuration and data directories (`.codeindex/`, `.claude/`) MUST be consistently located at project root. CLI MUST use appropriate exit codes (0 for success, non-zero for failure).

**Rationale**: Cross-platform consistency ensures users have identical experiences regardless of OS. Project-relative paths enable portability and version control of configurations.

## Development Workflow

### Feature Lifecycle

1. **Specify** (`/speckit.specify`): Create feature spec with user stories, priorities, acceptance scenarios
2. **Clarify** (`/speckit.clarify`): Resolve ambiguities with targeted questions
3. **Plan** (`/speckit.plan`): Generate implementation plan, research, data models, contracts
4. **Tasks** (`/speckit.tasks`): Break down plan into dependency-ordered tasks by user story
5. **Implement** (`/speckit.implement`): Execute tasks, typically starting with P1 MVP

### Task Organization

Tasks MUST be grouped by user story to enable independent implementation. Foundational infrastructure (database setup, core models) is separated into a blocking "Foundational" phase that completes before any user stories begin. Within user stories, tasks can often run in parallel if marked `[P]` (different files, no dependencies).

### MVP-First Approach

The first complete implementation should focus on the P1 user story only: Setup → Foundational → User Story 1 → Test & Validate. This delivers the minimum viable product quickly. P2, P3 stories are added incrementally after P1 proves viable.

## Quality Standards

### Code Quality

- TypeScript MUST use strict mode with no implicit `any`
- All public APIs MUST have JSDoc comments
- Use ESLint for linting, Prettier for formatting (configuration must be project-consistent)
- Complexity violations (e.g., overly complex functions) MUST be justified in the Complexity Tracking section of `plan.md`

### Error Handling

- All errors MUST be logged to `.codeindex/logs/*.jsonl` in JSON lines format
- CLI MUST provide helpful error messages with actionable next steps
- Use appropriate exit codes for different failure types
- Handle interruption signals gracefully (SIGINT, SIGTERM)

### Output Formats

- All commands MUST support both human-readable and JSON output (via `--json` flag)
- Human-readable output uses clear formatting with chalk for colors
- JSON output is suitable for scripting and automation

## Governance

### Constitution Authority

This constitution supersedes all other development practices. Feature specifications, implementation plans, and pull requests MUST comply with these principles. Any deviation MUST be documented with explicit justification in the relevant plan's Complexity Tracking section.

### Amendments

Constitution amendments require:
1. Documented rationale explaining why the change is necessary
2. Impact assessment on existing features and templates
3. Migration plan for features that need updates
4. Version bump following semantic versioning rules (see below)
5. Update to all dependent templates in `.specify/templates/`

### Versioning

Constitution versions follow MAJOR.MINOR.PATCH:
- **MAJOR**: Backward incompatible changes (e.g., removing/redefining core principles)
- **MINOR**: New principles added or sections materially expanded
- **PATCH**: Clarifications, typo fixes, non-semantic refinements

### Compliance Review

All code reviews MUST verify:
- Specifications follow Speckit workflow and include prioritized user stories
- Implementation plans include Constitution Check section
- Tasks are organized by user story with independent testability
- Performance targets are specified and tracked
- Project structure matches plan.md decisions

**Version**: 1.0.0 | **Ratified**: 2025-10-13 | **Last Amended**: 2025-10-13
