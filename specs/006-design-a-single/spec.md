# Feature Specification: Optimized Database Schema for Code Index Storage

**Feature Branch**: `006-design-a-single`
**Created**: 2025-10-12
**Status**: Draft
**Input**: User description: "Design a single-file SQLite schema with tables: files, symbols, xrefs, calls, chunks, embeddings, and FTS5 virtual table search. Include meta(schema_version) and migrations. Acceptance: PRAGMA integrity_check clean; indexes for common lookups; <50ms typical symbol queries on medium repos."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Store and Track Code Files (Priority: P1)

A developer wants to store information about all indexed code files in their project. The database tracks each file's path, content hash, language, size, and modification time, enabling the system to identify changed files and avoid redundant processing. This forms the foundation for all other code analysis features.

**Why this priority**: Core functionality - without file tracking, no other indexing features can function properly.

**Independent Test**: Can be tested by storing file information and verifying accurate retrieval, update detection, and deduplication.

**Acceptance Scenarios**:

1. **Given** a new file to index, **When** stored in database, **Then** file record is created with path, hash, and metadata
2. **Given** an existing file with changes, **When** updated, **Then** modification is detected via hash comparison
3. **Given** multiple identical files, **When** indexed, **Then** duplicate content is identified and linked
4. **Given** a file query by path, **When** executed, **Then** results return in under 10ms

---

### User Story 2 - Index Code Symbols and Relationships (Priority: P1)

A developer wants to store and query code symbols (functions, classes, variables) with their relationships and cross-references. The database maintains symbol definitions, their locations, types, and references between symbols, enabling features like "go to definition" and "find all references".

**Why this priority**: Essential for code navigation and understanding - enables core IDE-like features in the code index.

**Independent Test**: Can be tested by storing symbols with references and verifying accurate symbol lookup and reference traversal.

**Acceptance Scenarios**:

1. **Given** a function definition, **When** stored, **Then** symbol record includes name, signature, location, and type
2. **Given** a symbol reference, **When** queried, **Then** all usage locations are returned with context
3. **Given** a class hierarchy, **When** indexed, **Then** parent-child relationships are correctly maintained
4. **Given** a symbol lookup query, **When** executed on medium-sized repo, **Then** results return in under 50ms
5. **Given** cross-file references, **When** queried, **Then** references across file boundaries are correctly linked
6. **Given** a renamed function, **When** re-indexed, **Then** new symbol record is created and old record is marked deleted with timestamp
7. **Given** deleted symbols older than 30 days, **When** cleanup runs, **Then** expired records are purged from database

---

### User Story 3 - Enable Full-Text Search (Priority: P1)

A developer wants to search their codebase using natural language queries. The database provides full-text search capabilities across code content, comments, and documentation, returning relevant results ranked by relevance with highlighted matches.

**Why this priority**: Critical for code discovery - developers need to find code by content, not just by symbol names.

**Independent Test**: Can be tested by indexing code content and verifying search results accuracy, ranking, and performance.

**Acceptance Scenarios**:

1. **Given** indexed code content, **When** searching for keywords, **Then** relevant code sections are returned with matches highlighted
2. **Given** a phrase search, **When** executed, **Then** exact phrase matches rank higher than partial matches
3. **Given** a search with common terms, **When** executed, **Then** results are ranked by relevance not just frequency
4. **Given** a complex search query, **When** executed on large codebase, **Then** results return in under 100ms

---

### User Story 4 - Store Code Chunks and Embeddings (Priority: P2)

A developer wants to store semantic code chunks with their vector embeddings for AI-powered search and analysis. The database maintains code chunks at function/method granularity along with their numerical embeddings, enabling semantic similarity search and code understanding features.

**Why this priority**: Enables advanced AI features but not essential for basic code indexing functionality.

**Independent Test**: Can be tested by storing chunks with embeddings and verifying retrieval and similarity queries work correctly.

**Acceptance Scenarios**:

1. **Given** a code function, **When** chunked and stored, **Then** chunk record includes content, context, and stable ID
2. **Given** vector embeddings for chunks, **When** stored, **Then** 384-dimensional embeddings are efficiently retrievable by chunk ID
3. **Given** a similarity query, **When** executed, **Then** semantically similar chunks are returned ranked by similarity
4. **Given** duplicate chunk content, **When** indexed, **Then** identical chunks share the same chunk ID

---

### User Story 5 - Track Schema Versions and Migrations (Priority: P2)

A developer wants the database to handle schema evolution gracefully. The system tracks schema versions and applies migrations automatically when needed, ensuring smooth upgrades without data loss and maintaining backward compatibility where possible.

**Why this priority**: Important for maintainability but system can function initially without migration support.

**Independent Test**: Can be tested by applying schema migrations and verifying data integrity is maintained.

**Acceptance Scenarios**:

1. **Given** an older schema version, **When** application starts, **Then** migrations are automatically applied
2. **Given** a migration script, **When** executed, **Then** schema is updated and version number incremented
3. **Given** a failed migration, **When** rolled back, **Then** database returns to previous consistent state
4. **Given** integrity check command, **When** executed after migration, **Then** database passes all integrity checks
5. **Given** any database error, **When** logged, **Then** structured context including operation type and parameters is recorded
6. **Given** a slow query exceeding threshold, **When** detected, **Then** query details and execution time are logged for analysis

---

### User Story 6 - Track Function Calls and Dependencies (Priority: P3)

A developer wants to understand call graphs and dependencies in their code. The database stores information about function calls, method invocations, and module dependencies, enabling visualization of code flow and impact analysis.

**Why this priority**: Valuable for advanced analysis but not required for core indexing and search functionality.

**Independent Test**: Can be tested by storing call relationships and verifying call graph traversal queries.

**Acceptance Scenarios**:

1. **Given** a function with calls to others, **When** indexed, **Then** call relationships are stored with caller and callee information
2. **Given** a function name, **When** querying callers, **Then** all functions that call it are returned
3. **Given** a dependency query, **When** executed, **Then** transitive dependencies are correctly identified
4. **Given** circular dependencies, **When** detected, **Then** system handles without infinite loops

---

### Edge Cases

- What happens when database file grows beyond file system limits?
- When multiple processes attempt concurrent writes, system must detect and reject/queue the conflict with clear error message
- What happens when indexes become fragmented after many updates?
- How does system recover from corrupted database files?
- What happens with extremely long symbol names or file paths?
- How are binary or non-UTF8 file contents handled?
- What happens when running out of disk space during write operations?
- How does system handle case-sensitive vs case-insensitive file systems?

## Clarifications

### Session 2025-10-13

- Q: When a function is renamed but its signature and location remain similar, should the symbol be treated as the same entity with an updated name, or as a completely new symbol? → A: New symbol (new ID, mark old as deleted) - Clear lineage, better for tracking refactorings
- Q: Should the database support concurrent writes from multiple processes, or enforce single-writer semantics? → A: Single writer only (queue/reject concurrent writes) - Simpler, more reliable, sufficient for CLI
- Q: What is the expected dimension size for vector embeddings? → A: 384 dimensions - Balanced storage (~1.5KB/chunk), good quality, widely used (e.g., MiniLM)
- Q: Should deleted symbol records be retained indefinitely, purged after a time period, or removed immediately after a grace period? → A: Retain 30 days then purge - Recent history available, bounded growth, good for analysis
- Q: What level of database operation logging should be implemented? → A: Structured error + slow query logging

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Database MUST store file information including path, hash, size, language, and modification time
- **FR-002**: Database MUST store symbol information including name, kind, signature, documentation, and location
- **FR-002a**: When a symbol is renamed or refactored, the database MUST create a new symbol record with a new ID and mark the old record as deleted (not update in place)
- **FR-002b**: Deleted symbol records MUST be retained for 30 days from deletion timestamp, then automatically purged to prevent unbounded growth
- **FR-003**: Database MUST maintain cross-references between symbols showing usage relationships
- **FR-004**: Database MUST store function call relationships with caller and callee information
- **FR-005**: Database MUST store code chunks with stable IDs and associated metadata
- **FR-006**: Database MUST store 384-dimensional floating-point vector embeddings linked to code chunks
- **FR-007**: Database MUST provide full-text search across code content and documentation
- **FR-008**: Database MUST track schema version in metadata table
- **FR-009**: Database MUST support schema migrations with version tracking
- **FR-010**: Database MUST maintain referential integrity between related tables
- **FR-011**: Database MUST have indexes for common query patterns
- **FR-012**: Symbol queries MUST complete in under 50ms for medium-sized repositories
- **FR-013**: Database MUST pass integrity checks without errors
- **FR-014**: Database MUST use single file storage for portability
- **FR-015**: Database MUST handle concurrent read operations safely
- **FR-015a**: Database MUST enforce single-writer semantics, queuing or rejecting concurrent write attempts to ensure data consistency
- **FR-016**: Full-text search MUST support phrase and proximity queries
- **FR-017**: Database MUST efficiently handle incremental updates
- **FR-018**: Database MUST log all errors with structured context (operation type, parameters, stack trace)
- **FR-019**: Database MUST log queries that exceed performance thresholds (e.g., >50ms for symbols, >100ms for searches)

### Key Entities

- **File**: Source code file with path, content hash, size, language, and timestamps
- **Symbol**: Code element (function, class, variable) with name, type, location, and signature. Each symbol has a unique ID; when a symbol is renamed or refactored, a new symbol record is created with a new ID and the old record is marked as deleted with a deletion timestamp, enabling clear lineage tracking. Deleted symbols are retained for 30 days then automatically purged.
- **Cross-Reference**: Usage relationship between symbols showing where symbols are referenced
- **Call**: Function/method invocation relationship with caller and callee information
- **Chunk**: Semantic code unit with content, context, and stable identifier
- **Embedding**: 384-dimensional floating-point vector representation of code chunk for similarity search (approximately 1.5KB storage per embedding)
- **Search Index**: Full-text search structure for content and documentation
- **Schema Metadata**: Version information and migration history

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Symbol lookup queries complete in under 50ms for repositories with 100,000+ symbols
- **SC-002**: Full-text searches return results in under 100ms for codebases up to 1GB
- **SC-003**: Database integrity check passes 100% of the time after normal operations
- **SC-004**: Incremental updates process 1,000 file changes in under 10 seconds
- **SC-005**: Database size remains under 2x the size of indexed source code
- **SC-006**: Concurrent read operations maintain 95%+ of single-reader performance
- **SC-007**: Schema migrations complete in under 30 seconds for typical databases
- **SC-008**: Cross-reference queries return complete results in under 100ms
- **SC-009**: Storage overhead for indexes stays under 30% of total database size
- **SC-010**: 99.9% of queries complete without errors or timeouts

## Assumptions

- Single-file database is acceptable for portability and simplicity
- Read operations significantly outnumber write operations
- Medium-sized repositories contain 10,000-100,000 files
- Symbol names and paths follow standard naming conventions
- Vector embeddings are 384-dimensional floating-point arrays (compatible with models like all-MiniLM-L6-v2)
- Full-text search prioritizes code-aware tokenization
- Schema changes are infrequent after initial development
- Database corruption is rare with proper transaction handling
- Only one indexing operation runs at a time (single-writer model), which is typical for CLI tools
- Structured logging captures errors and slow queries for troubleshooting without impacting normal operation performance