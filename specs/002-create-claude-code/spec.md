# Feature Specification: Claude Code Hooks and Installers

**Feature Branch**: `002-create-claude-code`
**Created**: 2025-10-12
**Status**: Draft
**Input**: User description: "Create Claude Code hooks and installers for macOS/Linux (bash) and Windows (PowerShell). Hooks must fail-open: if the CLI isn't found, log a friendly message and exit 0. Provide PreToolUse (policy), PostToolUse (refresh on edits), and SessionStart (warm caches). Include OS detection and chmod +x/execution policy notes."

## Clarifications

### Session 2025-10-12
- Q: For the hook scripts themselves, which language should they be written in? → A: Native shell scripts matching the installer (bash for Unix, PowerShell for Windows)
- Q: Where should the PreToolUse hook store and read its policy configuration? → A: JSON file in .claude/policies.json
- Q: Where should hooks write their log output for debugging and monitoring? → A: .codeindex/logs/ directory with hook-specific files
- Q: How should the PostToolUse hook determine which files were modified by Claude Code? → A: Parse tool event context from Claude Code
- Q: How should hooks handle concurrent executions? → A: Use file locks for critical sections only

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install Hooks Cross-Platform (Priority: P1)

A developer wants to install Claude Code hooks for their code-index CLI tool. They run the installer script appropriate for their operating system, which automatically detects the OS, creates the necessary hook files in the correct location, sets proper permissions, and provides clear feedback about what was installed.

**Why this priority**: Core functionality that enables all hook features. Without proper installation, no hooks can function.

**Independent Test**: Can be tested by running installer on each OS and verifying hooks are created in correct locations with proper permissions and configurations.

**Acceptance Scenarios**:

1. **Given** a macOS or Linux system with code-index CLI installed, **When** user runs bash installer script, **Then** hooks are created in .claude/hooks/ with executable permissions
2. **Given** a Windows system with code-index CLI installed, **When** user runs PowerShell installer script, **Then** hooks are created in .claude/hooks/ with appropriate execution policy settings
3. **Given** a system without code-index CLI installed, **When** user runs installer, **Then** installer provides helpful message about installing CLI first but still creates hooks

---

### User Story 2 - PreToolUse Hook for Policy Enforcement (Priority: P1)

A developer wants to enforce project-specific policies before any tool is used by Claude Code. The PreToolUse hook runs before each tool execution, checks configured policies, and can block or allow tool usage based on project rules. If the code-index CLI is unavailable, the hook logs a friendly message and allows the operation to continue.

**Why this priority**: Essential security and governance feature that protects against unwanted operations.

**Independent Test**: Can be tested by triggering tool use in Claude Code and verifying hook executes, enforces policies, and fails safely when CLI is missing.

**Acceptance Scenarios**:

1. **Given** PreToolUse hook is installed and CLI is available, **When** Claude Code attempts to use a tool, **Then** hook checks policies and allows/blocks based on configuration
2. **Given** PreToolUse hook is installed but CLI is missing, **When** Claude Code attempts to use a tool, **Then** hook logs friendly message and exits with code 0 (fail-open)
3. **Given** PreToolUse hook encounters an error during execution, **When** policy check fails, **Then** hook fails open with exit code 0 and logs the error

---

### User Story 3 - PostToolUse Hook for Index Refresh (Priority: P2)

A developer wants their code index automatically updated after Claude Code modifies files. The PostToolUse hook runs after file-modifying tools complete, detects which files changed, and triggers an incremental index refresh. The hook operates silently in the background without blocking Claude Code operations.

**Why this priority**: Improves user experience by keeping index synchronized automatically without manual intervention.

**Independent Test**: Can be tested by modifying files through Claude Code and verifying index is updated afterward, with proper fail-open behavior when CLI is missing.

**Acceptance Scenarios**:

1. **Given** PostToolUse hook is installed and file was edited, **When** edit operation completes, **Then** hook triggers incremental index refresh for modified files
2. **Given** PostToolUse hook is installed but CLI is missing, **When** edit operation completes, **Then** hook logs friendly message and exits with code 0
3. **Given** PostToolUse hook is installed and non-edit tool was used, **When** tool completes, **Then** hook skips refresh and exits quickly

---

### User Story 4 - SessionStart Hook for Cache Warming (Priority: P2)

A developer wants optimal performance from the first interaction with Claude Code. The SessionStart hook runs when a new Claude Code session begins, warming up caches by pre-loading frequently accessed index data and checking system health. This reduces latency for initial operations.

**Why this priority**: Enhances performance and user experience but not critical for core functionality.

**Independent Test**: Can be tested by starting new Claude Code sessions and measuring initial operation performance, verifying cache warming occurs.

**Acceptance Scenarios**:

1. **Given** SessionStart hook is installed, **When** new Claude Code session starts, **Then** hook warms index cache and performs health check
2. **Given** SessionStart hook is installed but CLI is missing, **When** new session starts, **Then** hook logs friendly message and exits with code 0
3. **Given** SessionStart hook detects issues during health check, **When** session starts, **Then** hook logs warnings but still exits with code 0

---

### User Story 5 - Uninstall Hooks Cleanly (Priority: P3)

A developer wants to remove Claude Code hooks from their system. They run the uninstaller script which removes all hook files, cleans up configurations, and provides confirmation of what was removed.

**Why this priority**: Nice-to-have for clean system management but not essential for core functionality.

**Independent Test**: Can be tested by installing hooks, then running uninstaller and verifying all hook artifacts are removed.

**Acceptance Scenarios**:

1. **Given** hooks are installed on the system, **When** user runs uninstaller script, **Then** all hook files are removed from .claude/hooks/
2. **Given** no hooks are installed, **When** user runs uninstaller script, **Then** script reports nothing to uninstall
3. **Given** partial hook installation exists, **When** user runs uninstaller, **Then** existing hooks are removed and status is reported

---

### Edge Cases

- What happens when hooks are called with unexpected arguments or in unexpected contexts?
- How do hooks handle concurrent executions or race conditions? (Resolved: Use file locks for critical sections only)
- What happens when file permissions prevent hook execution?
- How do hooks handle different shell environments and configurations?
- What happens when hooks are installed but .claude directory doesn't exist?
- How do hooks handle very long-running operations or timeouts?
- What happens when system resources (disk space, memory) are exhausted?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Installer MUST detect operating system automatically (macOS, Linux, Windows)
- **FR-002**: Installer MUST create hooks in .claude/hooks/ directory relative to project root
- **FR-002a**: Hook scripts MUST be implemented as native shell scripts (bash for Unix, PowerShell for Windows)
- **FR-003**: Bash installer MUST set executable permissions (chmod +x) on hook scripts
- **FR-004**: PowerShell installer MUST provide guidance on execution policy requirements
- **FR-005**: All hooks MUST fail-open - if code-index CLI is not found, log friendly message and exit with code 0
- **FR-006**: PreToolUse hook MUST execute before any tool operation in Claude Code
- **FR-007**: PreToolUse hook MUST be able to check and enforce project-specific policies
- **FR-007a**: Policy configuration MUST be stored in .claude/policies.json file
- **FR-008**: PostToolUse hook MUST execute after file-modifying operations
- **FR-009**: PostToolUse hook MUST trigger incremental index refresh for changed files
- **FR-009a**: PostToolUse hook MUST parse tool event context from Claude Code to identify modified files
- **FR-010**: SessionStart hook MUST execute when new Claude Code session begins
- **FR-011**: SessionStart hook MUST warm caches by pre-loading frequently used index data
- **FR-012**: All hooks MUST log operations to .codeindex/logs/ directory with hook-specific files (e.g., pre-tool-use.log, post-tool-use.log, session-start.log)
- **FR-013**: All hooks MUST handle errors gracefully without crashing or hanging
- **FR-013a**: Hooks MUST use file locks for critical sections (e.g., index updates) to handle concurrent executions safely
- **FR-014**: Installer MUST provide clear output about what was installed and where
- **FR-015**: Uninstaller MUST remove all hook files and configurations cleanly
- **FR-016**: Hooks MUST work with relative paths from project root
- **FR-017**: Hooks MUST complete within reasonable time limits (under 5 seconds for most operations)

### Key Entities

- **Hook Configuration**: Represents settings for each hook including enabled state, policies, and parameters
- **Hook Event**: Represents trigger event from Claude Code with context about tool being used (includes tool name, parameters, and affected files)
- **Installation State**: Represents what hooks are installed, their versions, and health status
- **Policy Rule**: Represents a single policy check with conditions and actions
- **Cache State**: Represents warmed cache data and last refresh timestamp

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Installation completes in under 10 seconds on all supported operating systems
- **SC-002**: Hooks execute within 500ms for fast operations (policy checks, cache checks)
- **SC-003**: Fail-open behavior ensures 100% of operations succeed even when CLI is missing
- **SC-004**: 95% of users can install hooks without reading documentation
- **SC-005**: Zero Claude Code operations are blocked due to hook failures
- **SC-006**: PostToolUse refresh completes within 2 seconds for typical file changes
- **SC-007**: SessionStart cache warming reduces first operation latency by 50% or more
- **SC-008**: All hooks maintain less than 1% CPU usage when idle
- **SC-009**: Hook logs stay under 10MB with automatic rotation
- **SC-010**: Hooks work identically across all supported operating systems

## Assumptions

- Users have appropriate permissions to create files in .claude directory
- Claude Code provides standard hook interface and event information
- Project root can be determined from hook execution context
- File system operations are atomic and reliable
- Operating system can be detected reliably through environment variables
- Users understand basic concepts of hooks and automated scripts
- Friendly error messages are preferred over technical error codes
- Fail-open is acceptable security posture for this use case