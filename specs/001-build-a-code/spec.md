# Feature Specification: Code-Index CLI Tool

**Feature Branch**: `001-build-a-code`
**Created**: 2025-10-12
**Status**: Draft
**Input**: User description: "Build a code-index CLI that bootstraps a project with .codeindex/ (SQLite DB, logs), .claude/ (settings, hooks, tools), and a local MCP launcher script. Provide init, index, refresh, search, doctor, and uninstall commands. Requirements: idempotent; project-relative paths; no network required to run core features. Non-goals: cloud services, GUI."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Initialize and Bootstrap Project (Priority: P1)

A developer wants to quickly set up code indexing for their project. They run the initialization command in their project directory, and the CLI creates all necessary infrastructure including database, configuration files, and launcher scripts. The process is idempotent - running it multiple times causes no issues.

**Why this priority**: Core functionality that enables all other features. Without initialization, no other commands can function.

**Independent Test**: Can be fully tested by running init command in an empty directory and verifying all required files/directories are created with correct structure.

**Acceptance Scenarios**:

1. **Given** an empty project directory, **When** user runs init command, **Then** .codeindex/ and .claude/ directories are created with proper structure
2. **Given** a project already initialized, **When** user runs init command again, **Then** existing configuration is preserved and no errors occur
3. **Given** a partially initialized project (some files missing), **When** user runs init command, **Then** missing components are created without affecting existing ones

---

### User Story 2 - Index Project Codebase (Priority: P1)

A developer wants to create a searchable index of their entire codebase. They run the index command which scans all project files (respecting gitignore patterns), extracts relevant metadata, and stores it in a local SQLite database for fast searching.

**Why this priority**: Primary value proposition - enables fast code search and discovery without external dependencies.

**Independent Test**: Can be tested by creating sample project files, running index command, and verifying database contains expected entries.

**Acceptance Scenarios**:

1. **Given** a project with source code files, **When** user runs index command, **Then** all files are indexed in the SQLite database
2. **Given** a project with .gitignore file, **When** user runs index command, **Then** ignored files are excluded from indexing
3. **Given** an already indexed project with new files added, **When** user runs index command, **Then** only new and modified files are processed

---

### User Story 3 - Search Indexed Codebase (Priority: P1)

A developer needs to quickly find code patterns, function definitions, or specific implementations in their project. They use the search command with various query patterns and receive relevant results ranked by relevance.

**Why this priority**: Core user-facing feature that delivers the main value of having an indexed codebase.

**Independent Test**: Can be tested by indexing sample files with known content, then searching for specific patterns and verifying correct results are returned.

**Acceptance Scenarios**:

1. **Given** an indexed codebase, **When** user searches for a function name, **Then** all occurrences are returned with file paths and line numbers
2. **Given** an indexed codebase, **When** user searches with regex pattern, **Then** matching code snippets are returned
3. **Given** an empty or non-indexed project, **When** user runs search, **Then** helpful message prompts to run index first

---

### User Story 4 - Refresh Index for Changes (Priority: P2)

A developer has made changes to their codebase and wants to update the index efficiently. They run the refresh command which detects modified files since last index and updates only those entries, making the process fast for incremental updates.

**Why this priority**: Improves user experience by providing fast incremental updates rather than full re-indexing.

**Independent Test**: Can be tested by indexing a project, modifying specific files, running refresh, and verifying only changed files are updated in database.

**Acceptance Scenarios**:

1. **Given** an indexed project with file modifications, **When** user runs refresh command, **Then** only modified files are re-indexed
2. **Given** an indexed project with deleted files, **When** user runs refresh command, **Then** deleted entries are removed from index
3. **Given** an indexed project with no changes, **When** user runs refresh command, **Then** command completes quickly with no updates message

---

### User Story 5 - Diagnose System Health (Priority: P2)

A developer wants to verify their code-index installation is working correctly. They run the doctor command which checks database integrity, file permissions, configuration validity, and reports any issues with suggested fixes.

**Why this priority**: Helps users self-diagnose and fix issues, reducing support burden and improving reliability.

**Independent Test**: Can be tested by intentionally creating various error conditions (corrupt DB, missing files, bad permissions) and verifying doctor identifies each issue.

**Acceptance Scenarios**:

1. **Given** a healthy installation, **When** user runs doctor command, **Then** all checks pass with success message
2. **Given** a corrupted database file, **When** user runs doctor command, **Then** corruption is detected with repair suggestions
3. **Given** missing configuration files, **When** user runs doctor command, **Then** missing files are identified with re-init suggestion

---

### User Story 6 - Clean Uninstallation (Priority: P3)

A developer wants to completely remove code-index from their project. They run the uninstall command which removes all created directories, database files, and configurations, leaving the project in a clean state.

**Why this priority**: Nice-to-have feature for clean project maintenance, but not critical for core functionality.

**Independent Test**: Can be tested by initializing a project, adding custom configurations, running uninstall, and verifying all code-index artifacts are removed.

**Acceptance Scenarios**:

1. **Given** an initialized project, **When** user runs uninstall command, **Then** .codeindex/ and .claude/ directories are completely removed
2. **Given** an initialized project with user confirmation prompt, **When** user confirms uninstall, **Then** all artifacts are removed
3. **Given** a non-initialized project, **When** user runs uninstall command, **Then** appropriate message indicates nothing to uninstall

---

### Edge Cases

- What happens when indexing extremely large codebases (100k+ files)?
- How does system handle binary files or non-text formats?
- What happens when SQLite database reaches size limits?
- How does system handle symbolic links and circular references?
- What happens when file permissions prevent reading certain directories?
- How does system handle concurrent access to the database?
- What happens when running commands outside a project directory?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: CLI MUST provide init command to bootstrap project with .codeindex/ directory containing SQLite database and logs
- **FR-002**: CLI MUST provide init command to create .claude/ directory with settings, hooks, and tools configurations
- **FR-003**: CLI MUST generate a local MCP launcher script during initialization
- **FR-004**: CLI MUST provide index command to scan and index all project files into SQLite database
- **FR-005**: CLI MUST respect .gitignore patterns when indexing files
- **FR-006**: CLI MUST provide search command supporting text search, regex patterns, and code-aware queries
- **FR-007**: CLI MUST provide refresh command for incremental index updates based on file modification times
- **FR-008**: CLI MUST provide doctor command to diagnose and report system health issues
- **FR-009**: CLI MUST provide uninstall command to cleanly remove all created artifacts
- **FR-010**: All commands MUST be idempotent - running them multiple times produces same result
- **FR-011**: All file paths MUST be relative to project root directory
- **FR-012**: CLI MUST function completely offline without network connectivity
- **FR-013**: CLI MUST provide --help flag for all commands with usage examples
- **FR-014**: CLI MUST use appropriate exit codes (0 for success, non-zero for failures)
- **FR-015**: CLI MUST support both human-readable and JSON output formats
- **FR-016**: CLI MUST handle interruption signals gracefully (SIGINT, SIGTERM)
- **FR-017**: Index MUST support all text files initially, with progressive language-specific enhancements for top 5 languages (JavaScript/TypeScript, Python, Go, Java, C/C++)

### Key Entities

- **Project Configuration**: Represents initialization settings including database location, index preferences, ignored patterns
- **Code Index Entry**: Represents indexed file with path, content hash, modification time, language type, and extracted metadata
- **Search Result**: Represents matched code location with file path, line numbers, relevance score, and context snippet
- **MCP Launcher**: Represents generated script for launching Model Context Protocol tools locally
- **Health Check Result**: Represents diagnostic information including database status, file permissions, configuration validity

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Initialization completes in under 2 seconds for any project size
- **SC-002**: Indexing processes 1,000 files per second on average hardware
- **SC-003**: Search queries return results within 100ms for codebases under 100,000 files
- **SC-004**: Refresh command completes in under 10% of full index time for typical daily changes
- **SC-005**: 95% of users can successfully initialize and search without consulting documentation
- **SC-006**: Zero data loss during concurrent operations or interrupted processes
- **SC-007**: Memory usage stays under 500MB for codebases up to 1 million lines
- **SC-008**: Doctor command identifies 100% of common configuration issues
- **SC-009**: All commands work identically across Windows, macOS, and Linux platforms
- **SC-010**: CLI maintains backwards compatibility across minor version updates

## Assumptions

- File modification times are reliable indicators of content changes
- SQLite is sufficient for local indexing needs without requiring external database
- Users have read permissions for files they want to index
- Project directories follow common conventions (git repositories, standard build directories)
- Text-based source code files are the primary indexing target
- UTF-8 encoding is standard for source files
- Local filesystem provides adequate performance for indexing operations