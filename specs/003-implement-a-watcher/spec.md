# Feature Specification: File Watcher and Git Hooks for Incremental Indexing

**Feature Branch**: `003-implement-a-watcher`
**Created**: 2025-10-12
**Status**: Draft
**Input**: User description: "Implement a watcher that reindexes only changed files (debounced). Add optional Git hooks: post-merge, post-checkout, and post-rewrite to trigger batch refresh. Provide --changed mode that reads the last commit diff. Acceptance: handles create/modify/rename/delete; ignores node_modules, build dirs, and .codeindex."

## Clarifications

### Session 2025-10-12

- Q: When multiple files change during the debounce period, how should the system prioritize processing? → A: Process files in dependency order (imports first)
- Q: How should the watcher handle symbolic links to files and directories? → A: Follow symlinks but avoid duplicate indexing
- Q: When the watcher encounters temporary file access errors, how should it recover? → A: Retry with exponential backoff (max 3 attempts)
- Q: When hundreds of files change simultaneously, what's the maximum batch size to process at once? → A: 100 files
- Q: What file size threshold should trigger binary file detection to skip content indexing? → A: 10MB
- Q: When the watcher is started in a directory without write permissions, how should it behave? → A: Fail with clear error message
- Q: When disk space is exhausted during reindexing, what should the system do? → A: Rollback transaction and pause watcher
- Q: How should the system handle network drives or slow filesystems? → A: Adaptive timeouts with performance mode
- Q: When Git repository is in detached HEAD state, how should --changed mode behave? → A: Use current HEAD commit normally
- Q: When existing Git hooks are present, how should system merge its hooks? → A: Append at end with comment markers

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Real-time File Watching with Automatic Reindexing (Priority: P1)

A developer wants their code index to stay automatically synchronized as they work. They start the file watcher which monitors their project directory for changes. When files are created, modified, renamed, or deleted, the watcher detects these changes and triggers incremental reindexing after a brief delay to batch multiple rapid changes together.

**Why this priority**: Core feature that provides the main value - keeping the index synchronized without manual intervention during development.

**Independent Test**: Can be tested by starting the watcher, making various file changes, and verifying the index is updated correctly with proper debouncing behavior.

**Acceptance Scenarios**:

1. **Given** watcher is running and a file is created, **When** debounce period expires, **Then** new file is added to the index
2. **Given** watcher is running and a file is modified, **When** debounce period expires, **Then** modified file is reindexed with updated content
3. **Given** watcher is running and a file is renamed, **When** debounce period expires, **Then** old entry is removed and new entry is added
4. **Given** watcher is running and a file is deleted, **When** debounce period expires, **Then** file entry is removed from index
5. **Given** watcher is running and files in ignored directories change, **When** changes occur in node_modules or build directories, **Then** these changes are not indexed

---

### User Story 2 - Changed Mode for Commit-based Updates (Priority: P2)

A developer wants to update their index based on what changed in the last commit. They run the CLI with --changed mode which reads the diff from the last Git commit and reindexes only the files that were modified in that commit. This is useful after pulling changes from other developers or switching branches.

**Why this priority**: Provides efficient indexing after Git operations without needing to run full reindex.

**Independent Test**: Can be tested by making a commit with specific file changes, then running --changed mode and verifying only those files are reindexed.

**Acceptance Scenarios**:

1. **Given** a Git repository with recent commit, **When** user runs with --changed mode, **Then** only files modified in last commit are reindexed
2. **Given** last commit has file additions, **When** user runs with --changed mode, **Then** new files are added to index
3. **Given** last commit has file deletions, **When** user runs with --changed mode, **Then** deleted files are removed from index
4. **Given** no commits in repository, **When** user runs with --changed mode, **Then** helpful message indicates no commit history

---

### User Story 3 - Git Hooks for Automatic Post-Operation Updates (Priority: P2)

A developer wants their index automatically updated after Git operations that change the working directory. They install optional Git hooks (post-merge, post-checkout, post-rewrite) which trigger batch refresh operations after these Git commands complete. This ensures the index stays synchronized when switching branches, merging, or rebasing.

**Why this priority**: Improves workflow integration by automatically maintaining index consistency during Git operations.

**Independent Test**: Can be tested by installing hooks, performing Git operations (merge, checkout, rebase), and verifying index is updated automatically.

**Acceptance Scenarios**:

1. **Given** post-merge hook is installed, **When** user merges a branch, **Then** index is refreshed with all merged changes
2. **Given** post-checkout hook is installed, **When** user switches branches, **Then** index is updated to reflect new branch contents
3. **Given** post-rewrite hook is installed, **When** user performs rebase, **Then** index is refreshed with rewritten history
4. **Given** Git hooks are installed but indexer is not available, **When** Git operation completes, **Then** hooks fail gracefully without blocking Git

---

### User Story 4 - Configure Ignore Patterns (Priority: P3)

A developer wants to customize which files and directories are excluded from watching and indexing. They configure ignore patterns that specify additional directories or file patterns to exclude beyond the default set (node_modules, build directories, .codeindex).

**Why this priority**: Provides flexibility for different project structures but not essential for core functionality.

**Independent Test**: Can be tested by configuring custom ignore patterns and verifying watcher excludes specified paths.

**Acceptance Scenarios**:

1. **Given** custom ignore patterns configured, **When** watcher monitors changes, **Then** files matching patterns are excluded
2. **Given** default ignore patterns, **When** no custom configuration exists, **Then** node_modules, build dirs, and .codeindex are excluded
3. **Given** conflicting ignore patterns, **When** file matches both include and exclude, **Then** exclude takes precedence

---

### Edge Cases

- What happens when hundreds of files change simultaneously (e.g., dependency updates)? System processes in batches of 100 files maximum
- How does system handle file permission changes that prevent reading? System retries with exponential backoff up to 3 times
- What happens when watcher is started in a directory without write permissions? System fails with clear error message explaining write permissions are required
- How does system handle symbolic links and their targets changing? System follows symlinks but tracks canonical paths to prevent duplicate indexing when both link and target are watched
- What happens when disk space is exhausted during reindexing? System rolls back current batch transaction and pauses watcher until space available
- How does system handle network drives or slow filesystems? System uses configurable I/O timeouts (30s default) with automatic performance mode that increases debounce delays and reduces batch sizes
- What happens when Git repository is in a detached HEAD state? --changed mode uses current HEAD commit as reference point and processes changes normally
- How does system handle binary files or extremely large files? Files over 10MB trigger binary detection; binary files are skipped from content indexing

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Watcher MUST monitor file system for create, modify, rename, and delete events
- **FR-002**: Watcher MUST implement debouncing with configurable delay (default 500ms) to batch rapid changes
- **FR-002a**: When processing batched changes, system MUST process files in dependency order (imports/requires first) to ensure accurate symbol resolution
- **FR-002b**: System MUST process large change sets in batches of maximum 100 files to prevent memory exhaustion
- **FR-003**: Watcher MUST ignore changes in node_modules, build directories, and .codeindex by default
- **FR-004**: Watcher MUST support additional ignore patterns through configuration
- **FR-005**: CLI MUST provide --changed mode that reads diff from last Git commit
- **FR-006**: --changed mode MUST identify added, modified, and deleted files from commit diff (including detached HEAD state)
- **FR-007**: System MUST provide installable Git hooks for post-merge, post-checkout, and post-rewrite (appending to existing hooks with comment markers)
- **FR-008**: Git hooks MUST trigger batch refresh of affected files
- **FR-009**: Git hooks MUST be optional and not required for core functionality
- **FR-010**: All reindexing operations MUST be incremental (only changed files)
- **FR-011**: Watcher MUST provide clear status output showing files being processed
- **FR-012**: System MUST handle file rename operations as delete plus create
- **FR-013**: Watcher MUST recover gracefully from temporary file access errors using exponential backoff (1s, 2s, 4s) with maximum 3 retry attempts before logging warning and continuing
- **FR-014**: Git hooks MUST fail gracefully if indexer is not available
- **FR-015**: Debounce delay MUST be configurable through settings
- **FR-016**: Watcher MUST support pausing and resuming without losing state
- **FR-017**: System MUST respect .gitignore patterns in addition to explicit ignore patterns
- **FR-018**: Watcher MUST follow symbolic links but track canonical paths to prevent duplicate indexing
- **FR-019**: System MUST skip content indexing for files larger than 10MB after binary content detection
- **FR-020**: Watcher MUST detect disk space exhaustion and pause operations with rollback of incomplete transactions
- **FR-021**: System MUST detect slow filesystem performance and automatically switch to performance mode with longer timeouts (30s default) and adjusted batch parameters

### Key Entities

- **File Change Event**: Represents a detected file system change with type (create/modify/rename/delete), path, and timestamp
- **Debounce Buffer**: Represents accumulated changes waiting to be processed after delay period
- **Ignore Pattern**: Represents a rule for excluding files or directories from watching and indexing
- **Commit Diff**: Represents changes between commits with affected file lists
- **Git Hook Configuration**: Represents installed hooks and their triggering conditions

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Watcher detects file changes within 100ms of occurrence
- **SC-002**: Debouncing reduces indexing operations by 80% or more during rapid changes
- **SC-003**: Incremental indexing completes within 2 seconds for typical development changes (10-20 files)
- **SC-004**: --changed mode processes commit diffs of 1000 files in under 5 seconds
- **SC-005**: Git hooks add less than 1 second overhead to Git operations
- **SC-006**: 90% of users can install and configure watcher without documentation
- **SC-007**: Memory usage stays under 100MB while watching projects with 100,000+ files
- **SC-008**: Zero index corruption incidents during concurrent file operations
- **SC-009**: Watcher maintains 99.9% uptime during 8-hour development sessions
- **SC-010**: Ignore patterns reduce unnecessary indexing operations by 95% or more

## Assumptions

- File system provides reliable change notification events
- Git is installed and accessible for --changed mode and hooks
- Users understand basic Git concepts (commits, branches, hooks)
- Debounce delay of 500ms is appropriate default for most workflows
- File renames can be detected or inferred from delete/create pairs
- Build directories follow common naming conventions (dist, build, out)
- Users want automatic indexing during active development
- Incremental indexing is always preferred over full reindexing