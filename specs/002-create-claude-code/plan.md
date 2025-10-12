# Implementation Plan: Claude Code Hooks and Installers

**Branch**: `002-create-claude-code` | **Date**: 2025-10-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-create-claude-code/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Create cross-platform Claude Code hooks and installers for the code-index CLI tool. The feature provides PreToolUse (policy enforcement), PostToolUse (index refresh), and SessionStart (cache warming) hooks that integrate with Claude Code's execution environment. All hooks follow a fail-open approach for reliability, implemented as native shell scripts (bash for Unix, PowerShell for Windows) with proper OS detection and permission handling.

## Technical Context

**Language/Version**: Bash 3.2+ (macOS/Linux), PowerShell 5.1+ (Windows)
**Primary Dependencies**: code-index CLI (existing), jq (for JSON parsing), flock/lockfile utilities
**Storage**: .claude/policies.json (configuration), .codeindex/logs/ (logging), .codeindex/index.db (SQLite)
**Testing**: Bats (Bash Automated Testing System), Pester (PowerShell testing)
**Target Platform**: macOS 10.15+, Linux (Ubuntu 20.04+/RHEL 8+), Windows 10/11
**Project Type**: CLI integration scripts
**Performance Goals**: Hook execution < 500ms for policy checks, < 2s for index refresh operations
**Constraints**: Must fail-open (exit 0) on errors, no network dependencies, cross-platform compatibility
**Scale/Scope**: 3 hook types, 2 installer scripts, support for concurrent executions with file locking

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Since the project constitution is not yet defined (template file exists), I'll apply standard software engineering principles:

- ✅ **Single Responsibility**: Each hook has a clear, focused purpose
- ✅ **Fail-Safe Design**: All hooks fail-open to prevent blocking Claude Code operations
- ✅ **Cross-Platform**: Native scripts for each platform ensure compatibility
- ✅ **Testability**: Each hook can be tested independently with mock inputs
- ✅ **Performance**: Clear performance targets defined (< 500ms for fast operations)
- ✅ **Logging & Observability**: Structured logging to .codeindex/logs/ for debugging

## Project Structure

### Documentation (this feature)

```
specs/002-create-claude-code/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
claude-hooks/
├── installers/
│   ├── install.sh           # Bash installer for macOS/Linux
│   ├── install.ps1          # PowerShell installer for Windows
│   ├── uninstall.sh         # Bash uninstaller
│   └── uninstall.ps1        # PowerShell uninstaller
├── hooks/
│   ├── unix/
│   │   ├── pre-tool-use.sh      # PreToolUse hook (bash)
│   │   ├── post-tool-use.sh     # PostToolUse hook (bash)
│   │   └── session-start.sh     # SessionStart hook (bash)
│   └── windows/
│       ├── pre-tool-use.ps1     # PreToolUse hook (PowerShell)
│       ├── post-tool-use.ps1    # PostToolUse hook (PowerShell)
│       └── session-start.ps1    # SessionStart hook (PowerShell)
├── templates/
│   └── policies.json        # Default policy configuration template
└── lib/
    ├── unix/
    │   └── common.sh        # Shared bash functions (logging, locking, CLI detection)
    └── windows/
        └── Common.ps1       # Shared PowerShell functions

tests/
├── unit/
│   ├── bash/               # Bats tests for bash hooks
│   └── powershell/        # Pester tests for PowerShell hooks
└── integration/
    ├── installation/      # Cross-platform installation tests
    └── hooks/            # Hook execution tests with mock Claude Code events
```

**Structure Decision**: Separate directories for Unix/Windows implementations to maintain clarity while sharing common functionality through libraries. Installers at root level for easy discovery, with clear separation between hook implementations and shared utilities.

## Complexity Tracking

*No constitution violations - standard patterns applied*

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Dual implementation | Separate bash/PowerShell scripts | Native scripts provide best OS integration without dependencies |
| File locking | Platform-specific mechanisms | Ensures safe concurrent execution without adding external dependencies |
| JSON parsing | jq (Unix) / ConvertFrom-Json (Windows) | Standard tools available on target platforms |