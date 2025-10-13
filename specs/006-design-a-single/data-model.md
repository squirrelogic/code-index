# Data Model: SQLite Schema for Code Index Storage

**Feature**: Optimized Database Schema for Code Index Storage
**Branch**: `006-design-a-single`
**Date**: 2025-10-13
**Status**: Complete

## Overview

This document defines the complete data model for the code-index SQLite database. The schema supports offline-first code indexing with full-text search, semantic embeddings, symbol tracking, and cross-reference analysis. The design prioritizes query performance, data integrity, and graceful schema evolution.

## Core Design Principles

1. **Single-file portability**: All data stored in one SQLite database file (`.codeindex/index.db`)
2. **Read-optimized**: 90%+ read operations; optimized indexes for common queries
3. **Soft delete with retention**: 30-day retention for deleted symbols; automatic cleanup
4. **Single-writer model**: Enforced via BEGIN IMMEDIATE; unlimited concurrent readers via WAL mode
5. **Schema versioning**: Sequential migrations tracked in meta table
6. **Code-aware search**: FTS5 with unicode61 tokenizer, no stemming, custom tokenchars for code identifiers
7. **Offline vector storage**: 384-dimensional embeddings stored as BLOB; brute-force similarity in application code

---

## Entity Definitions

### 1. File Entity

Represents a source code file in the indexed codebase.

**Purpose**: Track file metadata for incremental updates and deduplication.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY, NOT NULL | ULID or UUID v4 for stable identifier |
| `file_path` | TEXT | NOT NULL, UNIQUE (WHERE deleted_at IS NULL) | Project-relative path (e.g., `src/main.ts`) |
| `content_hash` | TEXT | NOT NULL | SHA-256 hex digest for change detection |
| `language` | TEXT | NOT NULL | Language identifier (e.g., `typescript`, `python`) |
| `size` | INTEGER | NOT NULL | File size in bytes |
| `modified_at` | INTEGER | NOT NULL | Unix timestamp of last modification |
| `indexed_at` | INTEGER | NOT NULL, DEFAULT (unixepoch()) | Unix timestamp when indexed |
| `deleted_at` | INTEGER | NULL | Unix timestamp when soft-deleted; NULL = active |

**Relationships**:
- One-to-many with `symbols` (file contains multiple symbols)
- One-to-many with `chunks` (file contains multiple chunks)

**Validation Rules**:
- `file_path` must be project-relative (no absolute paths)
- `content_hash` must be 64 hex characters (SHA-256)
- `size` must be >= 0
- `modified_at` <= `indexed_at`
- `deleted_at` must be >= `indexed_at` if not NULL

**State Transitions**:
- **Created**: `deleted_at` = NULL
- **Soft-deleted**: `deleted_at` = current timestamp
- **Restored**: Not supported; create new record instead

**Uniqueness**:
- `file_path` must be unique among active files (partial unique index excludes soft-deleted)

---

### 2. Symbol Entity

Represents a code symbol (function, class, variable, constant, type).

**Purpose**: Enable symbol lookup, cross-references, and refactoring analysis.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY, NOT NULL | ULID or UUID v4 for stable identifier |
| `file_id` | TEXT | NOT NULL, FOREIGN KEY → files(id) ON DELETE CASCADE | Parent file identifier |
| `symbol_name` | TEXT | NOT NULL | Symbol name (e.g., `calculateTotal`) |
| `symbol_type` | TEXT | NOT NULL | One of: `function`, `class`, `variable`, `constant`, `type`, `interface`, `method` |
| `signature` | TEXT | NULL | Full signature (e.g., `function calculateTotal(items: Item[]): number`) |
| `documentation` | TEXT | NULL | Extracted documentation/comments |
| `line_start` | INTEGER | NOT NULL | Starting line number (1-indexed) |
| `line_end` | INTEGER | NOT NULL | Ending line number (1-indexed, inclusive) |
| `created_at` | INTEGER | NOT NULL, DEFAULT (unixepoch()) | Unix timestamp when created |
| `deleted_at` | INTEGER | NULL | Unix timestamp when soft-deleted; NULL = active |

**Relationships**:
- Many-to-one with `files` (symbol belongs to one file)
- One-to-many with `xrefs` (symbol can be referenced by many others)
- One-to-many with `calls` (symbol can call or be called by others)
- One-to-one with `chunks` (symbol may have associated chunk)

**Validation Rules**:
- `symbol_type` must be in allowed set (enforced via CHECK or application logic)
- `line_end` >= `line_start`
- `line_start` >= 1
- `deleted_at` must be >= `created_at` if not NULL
- Symbol rename = create new record with new ID + soft-delete old record (FR-002a)

**State Transitions**:
```
[Created] → [Active] → [Soft-Deleted] → [Purged]
   ↓           ↓            ↓              ↓
deleted_at  deleted_at   deleted_at    Hard DELETE
= NULL      = NULL       = timestamp   after 30 days
```

**Symbol Identity on Rename**:
- When a symbol is renamed, a **new** symbol record is created with a new ID
- The old symbol record is soft-deleted (`deleted_at` set to current timestamp)
- This provides clear lineage tracking for refactoring analysis (FR-002a)

**Retention Policy**:
- Soft-deleted symbols retained for 30 days (FR-002b)
- Automatic cleanup removes symbols where `deleted_at < (now - 30 days)`
- VACUUM recommended after bulk cleanups to reclaim space

---

### 3. Cross-Reference (xref) Entity

Represents a usage reference from one symbol to another.

**Purpose**: Enable "find all references" and dependency analysis.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY, NOT NULL | ULID or UUID v4 for identifier |
| `source_symbol_id` | TEXT | NOT NULL, FOREIGN KEY → symbols(id) ON DELETE CASCADE | Symbol making the reference |
| `target_symbol_id` | TEXT | NOT NULL, FOREIGN KEY → symbols(id) ON DELETE CASCADE | Symbol being referenced |
| `reference_type` | TEXT | NOT NULL | One of: `read`, `write`, `call`, `inherit`, `implement`, `import` |
| `context` | TEXT | NULL | Surrounding code context (optional) |
| `line_number` | INTEGER | NULL | Line where reference occurs |
| `created_at` | INTEGER | NOT NULL, DEFAULT (unixepoch()) | Unix timestamp when created |

**Relationships**:
- Many-to-one with `symbols` (source)
- Many-to-one with `symbols` (target)

**Validation Rules**:
- `source_symbol_id` ≠ `target_symbol_id` (no self-references)
- `reference_type` must be in allowed set
- `line_number` >= 1 if not NULL

**Query Patterns**:
- Find all references to a symbol: `WHERE target_symbol_id = ?`
- Find all symbols referenced by a symbol: `WHERE source_symbol_id = ?`
- Cross-file references: JOIN with files via symbols

**Uniqueness**:
- No UNIQUE constraint; same reference can occur multiple times at different locations

---

### 4. Call Entity

Represents a function/method call relationship.

**Purpose**: Enable call graph analysis and dependency tracking.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY, NOT NULL | ULID or UUID v4 for identifier |
| `caller_symbol_id` | TEXT | NOT NULL, FOREIGN KEY → symbols(id) ON DELETE CASCADE | Function making the call |
| `callee_symbol_id` | TEXT | NOT NULL, FOREIGN KEY → symbols(id) ON DELETE CASCADE | Function being called |
| `call_type` | TEXT | NOT NULL | One of: `direct`, `indirect`, `dynamic`, `recursive` |
| `context` | TEXT | NULL | Call site context (optional) |
| `line_number` | INTEGER | NULL | Line where call occurs |
| `created_at` | INTEGER | NOT NULL, DEFAULT (unixepoch()) | Unix timestamp when created |

**Relationships**:
- Many-to-one with `symbols` (caller)
- Many-to-one with `symbols` (callee)

**Validation Rules**:
- `caller_symbol_id` and `callee_symbol_id` must reference symbols with `symbol_type` in (`function`, `method`)
- `call_type` must be in allowed set
- `line_number` >= 1 if not NULL
- Recursive calls allowed: `caller_symbol_id` = `callee_symbol_id`

**Query Patterns**:
- Find all functions called by X: `WHERE caller_symbol_id = ?`
- Find all callers of function Y: `WHERE callee_symbol_id = ?`
- Transitive dependencies: Recursive CTE for call graph traversal

**Circular Dependency Handling**:
- Application code must detect cycles using visited set during graph traversal
- No database-level cycle detection (would require triggers or complex constraints)

---

### 5. Chunk Entity

Represents a semantic code unit (function/method level) for AI processing.

**Purpose**: Store code chunks for embedding generation and semantic search.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY, NOT NULL | Stable content-based identifier (hash of normalized content) |
| `file_id` | TEXT | NOT NULL, FOREIGN KEY → files(id) ON DELETE CASCADE | Parent file identifier |
| `symbol_id` | TEXT | NULL, FOREIGN KEY → symbols(id) ON DELETE SET NULL | Associated symbol (if any) |
| `content` | TEXT | NOT NULL | Actual code content |
| `context_before` | TEXT | NULL | Preceding context (e.g., class definition) |
| `context_after` | TEXT | NULL | Following context (optional) |
| `language` | TEXT | NOT NULL | Programming language |
| `line_start` | INTEGER | NOT NULL | Starting line number |
| `line_end` | INTEGER | NOT NULL | Ending line number |
| `created_at` | INTEGER | NOT NULL, DEFAULT (unixepoch()) | Unix timestamp when created |
| `deleted_at` | INTEGER | NULL | Unix timestamp when soft-deleted; NULL = active |

**Relationships**:
- Many-to-one with `files` (chunk belongs to one file)
- Many-to-one with `symbols` (chunk may be associated with one symbol)
- One-to-one with `embeddings` (chunk has one embedding)

**Validation Rules**:
- `line_end` >= `line_start`
- `content` must not be empty
- `id` is deterministic: hash(normalized(`content`)) for deduplication
- Duplicate content → same `id` → only one chunk record

**Stable Identifier Design**:
- Chunk ID = SHA-256(normalized content) where normalization removes:
  - Leading/trailing whitespace
  - Consistent indentation (dedent to zero)
  - Comments (optional, configurable)
- Identical code → same chunk ID → embedding reuse

**State Transitions**:
- Similar to symbols: active → soft-deleted → purged after 30 days
- When file is deleted, chunks cascade delete via foreign key

---

### 6. Embedding Entity

Represents a 384-dimensional vector embedding for semantic search.

**Purpose**: Enable similarity-based code search and AI-powered features.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `chunk_id` | TEXT | PRIMARY KEY, NOT NULL, FOREIGN KEY → chunks(id) ON DELETE CASCADE | Associated chunk identifier |
| `embedding` | BLOB | NOT NULL | 384-dimensional float vector (1536 bytes) |
| `model` | TEXT | NOT NULL | Embedding model identifier (e.g., `all-MiniLM-L6-v2`) |
| `created_at` | INTEGER | NOT NULL, DEFAULT (unixepoch()) | Unix timestamp when created |

**Relationships**:
- One-to-one with `chunks` (each chunk has one embedding)

**Validation Rules**:
- `embedding` must be exactly 1536 bytes (384 floats × 4 bytes)
- `model` should follow convention: `<provider>/<model-name>` or model name

**Vector Storage Format**:
```typescript
// Encoding: Float32 little-endian (IEEE 754)
function encodeEmbedding(vector: number[]): Buffer {
    if (vector.length !== 384) {
        throw new Error('Embedding must be 384-dimensional');
    }
    const buffer = Buffer.allocUnsafe(384 * 4);
    for (let i = 0; i < 384; i++) {
        buffer.writeFloatLE(vector[i], i * 4);
    }
    return buffer;
}

function decodeEmbedding(blob: Buffer): Float32Array {
    if (blob.length !== 1536) {
        throw new Error('Invalid embedding size');
    }
    return new Float32Array(blob.buffer, blob.byteOffset, 384);
}
```

**Similarity Search**:
- Implemented in application code (not SQL)
- Brute-force cosine similarity for typical dataset sizes (10k-100k)
- Expected performance: 100-200ms for 100k vectors

**No Index Required**:
- No B-tree index on `embedding` (not useful for BLOB similarity)
- Brute-force scan is expected; application computes cosine similarity

---

### 7. Search Index Entity (FTS5 Virtual Table)

Full-text search index for code content and documentation.

**Purpose**: Enable fast keyword-based code search.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `file_id` | TEXT | UNINDEXED | Reference to file (not searchable) |
| `symbol_id` | TEXT | UNINDEXED | Reference to symbol (not searchable) |
| `content` | TEXT | INDEXED | Code content (searchable) |
| `documentation` | TEXT | INDEXED | Documentation/comments (searchable) |
| `file_path` | TEXT | UNINDEXED | File path for display (not searchable) |

**Virtual Table Configuration**:
```sql
CREATE VIRTUAL TABLE search USING fts5(
    content,                  -- Searchable: code content
    documentation,            -- Searchable: docs/comments
    file_id UNINDEXED,       -- Not searchable: for JOIN
    symbol_id UNINDEXED,     -- Not searchable: for JOIN
    file_path UNINDEXED,     -- Not searchable: display only
    tokenize = 'unicode61 remove_diacritics 1 tokenchars "_."'
);
```

**Tokenizer Configuration**:
- **unicode61**: Full Unicode support (international codebases)
- **remove_diacritics 1**: Normalize accented characters
- **tokenchars "_."**: Treat underscores and dots as part of tokens
  - `my_function` → single token (not `my` + `function`)
  - `module.method` → single token (not `module` + `method`)

**No Porter Stemming**:
- Code identifiers must match exactly
- Stemming would incorrectly match `user` to `users`, `data` to `datum`

**Query Patterns**:
```sql
-- Basic keyword search
SELECT file_path, snippet(search, 0, '[', ']', '...', 32) AS snippet
FROM search
WHERE search MATCH 'calculateTotal'
ORDER BY bm25(search);

-- Phrase search (exact match)
SELECT * FROM search
WHERE search MATCH '"function calculateTotal"'
ORDER BY bm25(search);

-- Prefix search (autocomplete)
SELECT * FROM search
WHERE search MATCH 'calc*'
ORDER BY bm25(search);

-- Multi-column weighted search
SELECT file_path, bm25(search, 2.0, 1.0) AS rank
FROM search
WHERE search MATCH ?
ORDER BY rank
LIMIT 100;
```

**BM25 Ranking**:
- Lower scores = more relevant (negative values; less negative = better)
- Default weights: equal across columns
- Custom weights: `bm25(search, 2.0, 1.0)` → content 2x, documentation 1x
- Parameters: k1=1.2 (term saturation), b=0.75 (length normalization)

---

### 8. Meta Entity

Schema metadata for versioning and configuration.

**Purpose**: Track schema version and store configuration key-value pairs.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `key` | TEXT | PRIMARY KEY, NOT NULL | Configuration key (e.g., `schema_version`) |
| `value` | TEXT | NOT NULL | Configuration value (string representation) |
| `updated_at` | INTEGER | NOT NULL, DEFAULT (unixepoch()) | Unix timestamp of last update |

**Standard Keys**:
- `schema_version`: Current schema version (e.g., `1`, `2`, `3`)
- `created_at`: Database creation timestamp
- `last_migration`: Last applied migration version
- `retention_days`: Soft-delete retention period (default: `30`)

**Validation Rules**:
- `schema_version` must be a positive integer (as string)
- `value` encoding depends on key (string, number, JSON)

**Usage**:
```typescript
// Read schema version
const version = db.prepare('SELECT value FROM meta WHERE key = ?')
    .get('schema_version')?.value || '0';

// Update schema version
db.prepare('UPDATE meta SET value = ?, updated_at = unixepoch() WHERE key = ?')
    .run('2', 'schema_version');
```

---

### 9. Migration History Entity

Tracks applied schema migrations.

**Purpose**: Enable idempotent migration execution and audit trail.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-incrementing ID |
| `version` | TEXT | NOT NULL, UNIQUE | Migration version (e.g., `001`, `002`) |
| `description` | TEXT | NOT NULL | Human-readable description |
| `applied_at` | INTEGER | NOT NULL, DEFAULT (unixepoch()) | Unix timestamp when applied |

**Validation Rules**:
- `version` must be unique (no duplicate migrations)
- `version` should follow convention: `001`, `002`, `003` (zero-padded)

**Usage**:
```typescript
// Check if migration applied
const applied = db.prepare('SELECT 1 FROM migration_history WHERE version = ?')
    .get('002') !== undefined;

// Record migration
db.prepare('INSERT INTO migration_history (version, description) VALUES (?, ?)')
    .run('002', 'Add embeddings table');
```

---

## SQLite Schema DDL

### Core Tables

```sql
-- ============================================================================
-- File Table: Source code file metadata
-- ============================================================================
CREATE TABLE files (
    id TEXT PRIMARY KEY NOT NULL,
    file_path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    language TEXT NOT NULL,
    size INTEGER NOT NULL CHECK (size >= 0),
    modified_at INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER,
    CHECK (modified_at <= indexed_at),
    CHECK (deleted_at IS NULL OR deleted_at >= indexed_at)
);

-- Unique index for file paths (excludes soft-deleted)
CREATE UNIQUE INDEX idx_files_path ON files(file_path) WHERE deleted_at IS NULL;

-- Index for content hash lookups (deduplication)
CREATE INDEX idx_files_hash ON files(content_hash) WHERE deleted_at IS NULL;

-- Index for language-based queries
CREATE INDEX idx_files_language ON files(language) WHERE deleted_at IS NULL;

-- ============================================================================
-- Symbol Table: Code symbols with soft delete
-- ============================================================================
CREATE TABLE symbols (
    id TEXT PRIMARY KEY NOT NULL,
    file_id TEXT NOT NULL,
    symbol_name TEXT NOT NULL,
    symbol_type TEXT NOT NULL CHECK (
        symbol_type IN ('function', 'class', 'variable', 'constant', 'type', 'interface', 'method')
    ),
    signature TEXT,
    documentation TEXT,
    line_start INTEGER NOT NULL CHECK (line_start >= 1),
    line_end INTEGER NOT NULL CHECK (line_end >= line_start),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER,
    CHECK (deleted_at IS NULL OR deleted_at >= created_at),
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- Partial index for active symbols by name
CREATE INDEX idx_symbols_name ON symbols(symbol_name) WHERE deleted_at IS NULL;

-- Compound index for file + type lookups (leftmost prefix matching)
CREATE INDEX idx_symbols_file_type ON symbols(file_id, symbol_type) WHERE deleted_at IS NULL;

-- Index for soft-delete cleanup queries
CREATE INDEX idx_symbols_deleted ON symbols(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- Cross-Reference Table: Symbol usage relationships
-- ============================================================================
CREATE TABLE xrefs (
    id TEXT PRIMARY KEY NOT NULL,
    source_symbol_id TEXT NOT NULL,
    target_symbol_id TEXT NOT NULL,
    reference_type TEXT NOT NULL CHECK (
        reference_type IN ('read', 'write', 'call', 'inherit', 'implement', 'import')
    ),
    context TEXT,
    line_number INTEGER CHECK (line_number IS NULL OR line_number >= 1),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    CHECK (source_symbol_id != target_symbol_id),
    FOREIGN KEY (source_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
    FOREIGN KEY (target_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);

-- Index for "find all references to X"
CREATE INDEX idx_xrefs_target ON xrefs(target_symbol_id);

-- Index for "find all references from X"
CREATE INDEX idx_xrefs_source ON xrefs(source_symbol_id);

-- Compound index for reference type filtering
CREATE INDEX idx_xrefs_type ON xrefs(reference_type, target_symbol_id);

-- ============================================================================
-- Call Table: Function/method call relationships
-- ============================================================================
CREATE TABLE calls (
    id TEXT PRIMARY KEY NOT NULL,
    caller_symbol_id TEXT NOT NULL,
    callee_symbol_id TEXT NOT NULL,
    call_type TEXT NOT NULL CHECK (
        call_type IN ('direct', 'indirect', 'dynamic', 'recursive')
    ),
    context TEXT,
    line_number INTEGER CHECK (line_number IS NULL OR line_number >= 1),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (caller_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
    FOREIGN KEY (callee_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);

-- Compound index for call graph queries (caller → callee)
CREATE INDEX idx_calls_caller ON calls(caller_symbol_id, callee_symbol_id);

-- Index for reverse call graph queries (find callers)
CREATE INDEX idx_calls_callee ON calls(callee_symbol_id);

-- ============================================================================
-- Chunk Table: Semantic code units for AI processing
-- ============================================================================
CREATE TABLE chunks (
    id TEXT PRIMARY KEY NOT NULL,
    file_id TEXT NOT NULL,
    symbol_id TEXT,
    content TEXT NOT NULL CHECK (length(content) > 0),
    context_before TEXT,
    context_after TEXT,
    language TEXT NOT NULL,
    line_start INTEGER NOT NULL CHECK (line_start >= 1),
    line_end INTEGER NOT NULL CHECK (line_end >= line_start),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER,
    CHECK (deleted_at IS NULL OR deleted_at >= created_at),
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE SET NULL
);

-- Partial unique index for active chunks (content-based deduplication)
CREATE UNIQUE INDEX idx_chunks_id ON chunks(id) WHERE deleted_at IS NULL;

-- Index for file-based queries
CREATE INDEX idx_chunks_file ON chunks(file_id) WHERE deleted_at IS NULL;

-- Index for symbol-based queries
CREATE INDEX idx_chunks_symbol ON chunks(symbol_id) WHERE deleted_at IS NULL;

-- ============================================================================
-- Embedding Table: Vector embeddings for semantic search
-- ============================================================================
CREATE TABLE embeddings (
    chunk_id TEXT PRIMARY KEY NOT NULL,
    embedding BLOB NOT NULL CHECK (length(embedding) = 1536),
    model TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);

-- No B-tree index on embedding BLOB (not useful for similarity search)
-- Index on model for filtering by embedding version
CREATE INDEX idx_embeddings_model ON embeddings(model);

-- ============================================================================
-- Search Table: FTS5 virtual table for full-text search
-- ============================================================================
CREATE VIRTUAL TABLE search USING fts5(
    content,                  -- Searchable: code content
    documentation,            -- Searchable: documentation/comments
    file_id UNINDEXED,       -- Not searchable: for JOIN with files table
    symbol_id UNINDEXED,     -- Not searchable: for JOIN with symbols table
    file_path UNINDEXED,     -- Not searchable: display only
    tokenize = 'unicode61 remove_diacritics 1 tokenchars "_."'
);

-- FTS5 automatically creates internal indexes; no manual indexes needed

-- ============================================================================
-- Meta Table: Schema version and configuration
-- ============================================================================
CREATE TABLE meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Initial schema version
INSERT INTO meta (key, value) VALUES ('schema_version', '1');
INSERT INTO meta (key, value) VALUES ('created_at', unixepoch());
INSERT INTO meta (key, value) VALUES ('retention_days', '30');

-- ============================================================================
-- Migration History Table: Applied migration tracking
-- ============================================================================
CREATE TABLE migration_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Index for version lookups
CREATE UNIQUE INDEX idx_migration_version ON migration_history(version);
```

---

## Index Definitions

### Index Strategy

1. **Foreign key indexes**: SQLite does NOT automatically index foreign keys
2. **Compound indexes**: Support multi-column queries with leftmost prefix matching
3. **Partial indexes**: Exclude soft-deleted records to improve query performance
4. **Unique constraints**: Only where business logic requires (e.g., file paths)

### Index Coverage Analysis

| Query Pattern | Index Used | Expected Performance |
|---------------|------------|---------------------|
| File by path | `idx_files_path` (UNIQUE) | <1ms |
| File by hash | `idx_files_hash` | <5ms |
| Symbol by name | `idx_symbols_name` (PARTIAL) | <5ms |
| Symbols in file | `idx_symbols_file_type` (COMPOUND) | <10ms |
| Symbols in file by type | `idx_symbols_file_type` (COMPOUND) | <5ms |
| References to symbol | `idx_xrefs_target` | <20ms |
| References from symbol | `idx_xrefs_source` | <20ms |
| Callers of function | `idx_calls_callee` | <20ms |
| Callees of function | `idx_calls_caller` (COMPOUND) | <20ms |
| Chunks in file | `idx_chunks_file` (PARTIAL) | <10ms |
| Full-text search | FTS5 internal indexes | <100ms |

### Partial Index Benefits

**Problem**: Soft-deleted records degrade query performance for active records.

**Solution**: Partial indexes with `WHERE deleted_at IS NULL` exclude deleted records.

**Example**:
```sql
-- Without partial index: Table scan includes deleted records
SELECT * FROM symbols WHERE symbol_name = 'foo';
-- Query plan: SCAN TABLE symbols

-- With partial index: Index scan excludes deleted records
CREATE INDEX idx_symbols_name ON symbols(symbol_name) WHERE deleted_at IS NULL;
SELECT * FROM symbols WHERE symbol_name = 'foo' AND deleted_at IS NULL;
-- Query plan: SEARCH TABLE symbols USING INDEX idx_symbols_name (symbol_name=?)
```

**Performance Impact**:
- Index size: ~30% smaller (no deleted records)
- Query speed: 2-5x faster (no deleted record filtering)
- Write speed: Unchanged (deleted records not in index)

### Index Maintenance

```sql
-- Analyze indexes after bulk operations
ANALYZE;

-- Check index usage statistics
SELECT * FROM sqlite_stat1;

-- Check index size overhead
SELECT
    name,
    SUM(pgsize) / 1024.0 / 1024.0 AS size_mb
FROM dbstat
WHERE name LIKE 'idx_%'
GROUP BY name
ORDER BY size_mb DESC;

-- Verify index is used (explain query plan)
EXPLAIN QUERY PLAN
SELECT * FROM symbols WHERE symbol_name = ? AND deleted_at IS NULL;
```

---

## Migration Strategy

### Migration Files Structure

```
sql/migrations/
├── 001_initial_schema.sql       # Initial schema (all tables)
├── 002_add_embeddings.sql       # Add embeddings table (if not in v1)
├── 003_add_calls_table.sql      # Add calls table (if not in v1)
├── 004_add_fts5_search.sql      # Add FTS5 virtual table
├── 005_add_partial_indexes.sql  # Add partial indexes for soft-deleted
└── README.md                    # Migration policy documentation
```

### Migration Workflow

```typescript
interface Migration {
    version: string;
    description: string;
    up: string;        // SQL to apply migration
    down?: string;     // SQL to rollback (optional)
}

function runMigrations(db: Database, migrations: Migration[]) {
    // Get current schema version
    const currentVersion = db.prepare('SELECT value FROM meta WHERE key = ?')
        .get('schema_version')?.value || '0';

    // Filter pending migrations
    const pending = migrations.filter(m => m.version > currentVersion);

    if (pending.length === 0) {
        console.log('Database schema is up to date');
        return;
    }

    console.log(`Applying ${pending.length} migrations...`);

    for (const migration of pending) {
        console.log(`Applying migration ${migration.version}: ${migration.description}`);

        // Wrap in transaction for atomicity
        db.exec('BEGIN TRANSACTION');

        try {
            // Execute migration SQL
            db.exec(migration.up);

            // Update schema version
            db.prepare('UPDATE meta SET value = ?, updated_at = unixepoch() WHERE key = ?')
                .run(migration.version, 'schema_version');

            // Record in migration history
            db.prepare('INSERT INTO migration_history (version, description) VALUES (?, ?)')
                .run(migration.version, migration.description);

            // Commit transaction
            db.exec('COMMIT');

            console.log(`✓ Migration ${migration.version} applied successfully`);
        } catch (error) {
            // Rollback on failure
            db.exec('ROLLBACK');
            throw new Error(`Migration ${migration.version} failed: ${error.message}`);
        }
    }

    // Run ANALYZE after migrations
    db.exec('ANALYZE');

    console.log('All migrations completed successfully');
}
```

### Migration Safety

1. **Transaction wrapping**: Each migration runs in a transaction; failure = automatic rollback
2. **Idempotent checks**: Check `migration_history` to skip already-applied migrations
3. **Backup before migration**: Use `VACUUM INTO 'backup.db'` before applying
4. **Version validation**: Ensure sequential application (no gaps)
5. **Integrity check**: Run `PRAGMA integrity_check` after migration

### Example Migration

**File**: `002_add_embeddings.sql`

```sql
-- Migration: Add embeddings table
-- Version: 002
-- Description: Add vector embeddings support for semantic search

CREATE TABLE embeddings (
    chunk_id TEXT PRIMARY KEY NOT NULL,
    embedding BLOB NOT NULL CHECK (length(embedding) = 1536),
    model TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);

CREATE INDEX idx_embeddings_model ON embeddings(model);
```

**Rollback** (optional, stored in migration metadata):

```sql
DROP TABLE IF EXISTS embeddings;
```

### Migration Versioning Convention

- **Version format**: Zero-padded 3-digit numbers (`001`, `002`, `003`)
- **Sequential application**: Migrations applied in order
- **No gaps**: Version N requires versions 1 through N-1 applied
- **Description**: Short, imperative verb phrase (e.g., "Add embeddings table")

---

## Performance Considerations

### Expected Query Patterns

| Operation | Frequency | Target Latency | Optimization |
|-----------|-----------|----------------|--------------|
| File by path lookup | Very High | <1ms | UNIQUE index on file_path |
| Symbol by name lookup | Very High | <5ms | Partial index on symbol_name |
| Symbols in file | High | <10ms | Compound index (file_id, symbol_type) |
| Cross-reference traversal | Medium | <20ms | Foreign key indexes |
| Full-text search | Medium | <100ms | FTS5 with BM25 ranking |
| Call graph traversal | Low | <50ms | Compound index on caller |
| Similarity search | Low | <200ms | Brute-force in application code |
| Bulk file insert | Low | 1000 files in <10s | Batch transactions |

### Performance Configuration

**Essential PRAGMA settings** (apply on every connection):

```sql
-- Enable WAL mode for concurrent readers
PRAGMA journal_mode = WAL;

-- Balance safety and speed (safe with WAL)
PRAGMA synchronous = NORMAL;

-- Use memory for temp tables
PRAGMA temp_store = MEMORY;

-- Memory-mapped I/O (30GB virtual)
PRAGMA mmap_size = 30000000000;

-- Page cache size (64MB)
PRAGMA cache_size = -64000;

-- Auto-checkpoint every 1000 pages
PRAGMA wal_autocheckpoint = 1000;
```

### Batch Write Optimization

**Problem**: Individual transactions are slow (fsync on every commit).

**Solution**: Batch operations in a single transaction.

**Example**:

```typescript
// Slow: Individual transactions (10 files/sec)
for (const file of files) {
    db.prepare('INSERT INTO files (...) VALUES (...)').run(file);
}

// Fast: Batch transaction (1000+ files/sec)
const insertFile = db.prepare('INSERT INTO files (...) VALUES (...)');
const insertMany = db.transaction((files) => {
    for (const file of files) {
        insertFile.run(file);
    }
});
insertMany(files);  // Single transaction: 100x faster
```

### Prepared Statement Reuse

**Problem**: Parsing SQL on every execution is expensive.

**Solution**: Prepare once, execute many times.

**Example**:

```typescript
class SymbolRepository {
    private findByNameStmt: Statement;
    private findByFileStmt: Statement;

    constructor(db: Database) {
        // Prepare statements once
        this.findByNameStmt = db.prepare(`
            SELECT * FROM symbols
            WHERE symbol_name = ? AND deleted_at IS NULL
        `);
        this.findByFileStmt = db.prepare(`
            SELECT * FROM symbols
            WHERE file_id = ? AND deleted_at IS NULL
        `);
    }

    findByName(name: string): Symbol[] {
        return this.findByNameStmt.all(name);
    }

    findByFile(fileId: string): Symbol[] {
        return this.findByFileStmt.all(fileId);
    }
}
```

### Query Optimization Checklist

1. ✅ Use `EXPLAIN QUERY PLAN` to verify index usage
2. ✅ Ensure compound indexes match query column order
3. ✅ Use partial indexes to exclude soft-deleted records
4. ✅ Limit result sets with `LIMIT` clauses
5. ✅ Use index-covered queries (all columns in index)
6. ✅ Run `ANALYZE` after bulk updates
7. ✅ Monitor slow queries (log queries >50ms for symbols, >100ms for search)

### Periodic Maintenance

```typescript
// Run during 'refresh' or 'doctor' command
function performMaintenance(db: Database) {
    // 1. Clean up expired soft-deleted records
    const cutoff = Math.floor(Date.now() / 1000) - (30 * 86400);
    const deleted = db.prepare('DELETE FROM symbols WHERE deleted_at < ?').run(cutoff);
    console.log(`Purged ${deleted.changes} expired symbols`);

    // 2. Update query optimizer statistics
    db.exec('ANALYZE');

    // 3. Checkpoint WAL file
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

    // 4. Vacuum if significant deletions (reclaim space)
    if (deleted.changes > 1000) {
        console.log('Running VACUUM to reclaim space...');
        db.exec('VACUUM');
    }

    // 5. Integrity check
    const result = db.pragma('integrity_check');
    if (result[0].integrity_check !== 'ok') {
        throw new Error(`Database integrity check failed: ${result[0].integrity_check}`);
    }

    console.log('Maintenance completed successfully');
}
```

---

## Database Size Estimation

### Storage Calculations

**For a typical medium-sized repository** (10,000 files, 100,000 symbols):

| Table | Rows | Avg Row Size | Total Size |
|-------|------|-------------|------------|
| `files` | 10,000 | 200 bytes | ~2 MB |
| `symbols` | 100,000 | 300 bytes | ~30 MB |
| `xrefs` | 500,000 | 150 bytes | ~75 MB |
| `calls` | 200,000 | 150 bytes | ~30 MB |
| `chunks` | 50,000 | 1 KB | ~50 MB |
| `embeddings` | 50,000 | 1.5 KB | ~75 MB |
| `search` (FTS5) | 100,000 | 500 bytes | ~50 MB |
| **Subtotal** | | | **~312 MB** |
| **Indexes** | | +30% | **~94 MB** |
| **Total** | | | **~406 MB** |

**Expected database size**: 400-500 MB for medium-sized repositories.

**Success Criterion**: Database size < 2x source code size (SC-005).

### Space Optimization

1. **Partial indexes**: Reduce index size by excluding soft-deleted records (~30% savings)
2. **Periodic VACUUM**: Reclaim space after bulk deletions
3. **Compression**: SQLite page-level compression (optional, via zlib extension)
4. **BLOB storage**: Most compact for embeddings (no JSON overhead)

---

## Database Integrity and Validation

### Integrity Check

```sql
-- Run after migrations or major operations
PRAGMA integrity_check;
-- Expected result: [{ integrity_check: 'ok' }]

-- Quick check (faster but less thorough)
PRAGMA quick_check;
```

### Foreign Key Validation

```sql
-- Enable foreign key enforcement (must be set per connection)
PRAGMA foreign_keys = ON;

-- Check for orphaned records
PRAGMA foreign_key_check;
```

### Constraint Validation

```sql
-- Check for constraint violations
-- Symbols: line_end >= line_start
SELECT id FROM symbols WHERE line_end < line_start;

-- Files: modified_at <= indexed_at
SELECT id FROM files WHERE modified_at > indexed_at;

-- Embeddings: blob size = 1536 bytes
SELECT chunk_id FROM embeddings WHERE length(embedding) != 1536;
```

### Performance Benchmarks

**Target metrics** (from spec success criteria):

- ✅ Symbol lookup: <50ms for 100k+ symbols (SC-001)
- ✅ Full-text search: <100ms for 1GB codebase (SC-002)
- ✅ Integrity check: 100% pass rate (SC-003)
- ✅ Incremental update: 1000 files in <10s (SC-004)
- ✅ Database size: <2x source code (SC-005)
- ✅ Concurrent reads: 95%+ of single-reader performance (SC-006)
- ✅ Schema migration: <30s (SC-007)
- ✅ Cross-reference query: <100ms (SC-008)
- ✅ Index overhead: <30% (SC-009)
- ✅ Query success rate: 99.9% (SC-010)

---

## Concurrency Model

### Single-Writer Enforcement

**Design**: Enforce single writer via `BEGIN IMMEDIATE` transaction.

**Implementation**:

```typescript
function acquireWriteLock(db: Database): boolean {
    try {
        db.exec('BEGIN IMMEDIATE');  // Acquires write lock
        return true;
    } catch (error) {
        if (error.code === 'SQLITE_BUSY') {
            return false;  // Another writer is active
        }
        throw error;
    }
}

// Usage in CLI commands
if (!acquireWriteLock(db)) {
    throw new Error('Another indexing operation is in progress. Please wait and try again.');
}

try {
    // Perform write operations
    // ...
    db.exec('COMMIT');
} catch (error) {
    db.exec('ROLLBACK');
    throw error;
}
```

### Unlimited Concurrent Readers (WAL Mode)

**WAL mode benefits**:
- Readers do NOT block during writes
- Writers do NOT block readers
- Expected: 95%+ of single-reader performance (SC-006)

**WAL characteristics**:
- `-wal` file contains uncommitted changes
- `-shm` file contains shared memory index
- Checkpoint process merges WAL back to main database

### Busy Handler

```typescript
// Configure busy timeout (wait up to 5 seconds for lock)
db.pragma('busy_timeout = 5000');

// Custom busy handler (more control)
db.function('busy_handler', (attempts: number) => {
    if (attempts > 100) {
        return 0;  // Give up after 100 attempts
    }
    const delay = Math.min(100, attempts * 10);  // Exponential backoff
    setTimeout(() => {}, delay);
    return 1;  // Retry
});
```

---

## Error Handling and Logging

### Structured Error Logging

**Requirement**: Log all database errors with structured context (FR-018).

**Implementation**:

```typescript
interface DatabaseError {
    type: 'database_error';
    operation: string;        // e.g., 'INSERT', 'SELECT', 'UPDATE'
    table?: string;
    error_code: string;       // SQLite error code
    error_message: string;
    parameters?: any[];
    stack_trace: string;
    timestamp: string;
}

function logDatabaseError(operation: string, error: any, context?: any) {
    const errorLog: DatabaseError = {
        type: 'database_error',
        operation,
        table: context?.table,
        error_code: error.code || 'UNKNOWN',
        error_message: error.message,
        parameters: context?.parameters,
        stack_trace: error.stack,
        timestamp: new Date().toISOString()
    };

    // Write to structured log file (JSON Lines format)
    fs.appendFileSync('.codeindex/logs/database.jsonl', JSON.stringify(errorLog) + '\n');
}
```

### Slow Query Logging

**Requirement**: Log queries exceeding performance thresholds (FR-019).

**Implementation**:

```typescript
interface SlowQueryLog {
    type: 'slow_query';
    operation: string;
    query: string;
    parameters: any[];
    duration_ms: number;
    result_count?: number;
    timestamp: string;
}

function executeWithLogging(db: Database, query: string, params: any[], threshold: number = 50): any[] {
    const start = performance.now();
    const result = db.prepare(query).all(...params);
    const duration = performance.now() - start;

    if (duration > threshold) {
        const slowLog: SlowQueryLog = {
            type: 'slow_query',
            operation: query.split(' ')[0],  // e.g., 'SELECT'
            query,
            parameters: params,
            duration_ms: Math.round(duration),
            result_count: result.length,
            timestamp: new Date().toISOString()
        };

        fs.appendFileSync('.codeindex/logs/database.jsonl', JSON.stringify(slowLog) + '\n');
    }

    return result;
}
```

### Common Error Codes

| Code | Meaning | Handling |
|------|---------|----------|
| `SQLITE_BUSY` | Database locked | Retry with exponential backoff |
| `SQLITE_LOCKED` | Table locked | Retry with backoff |
| `SQLITE_CONSTRAINT` | Constraint violation | Check constraint and retry or fail |
| `SQLITE_CORRUPT` | Database corrupted | Restore from backup |
| `SQLITE_FULL` | Disk full | Alert user and abort |
| `SQLITE_IOERR` | I/O error | Check disk health |

---

## Security Considerations

### SQL Injection Prevention

**Requirement**: Always use prepared statements with parameter binding.

**Example**:

```typescript
// UNSAFE: String concatenation (SQL injection risk)
const unsafe = db.prepare(`SELECT * FROM files WHERE file_path = '${userInput}'`).all();

// SAFE: Parameter binding
const safe = db.prepare('SELECT * FROM files WHERE file_path = ?').all(userInput);
```

### Database File Permissions

```bash
# Set restrictive permissions on database file
chmod 600 .codeindex/index.db
chmod 600 .codeindex/index.db-wal
chmod 600 .codeindex/index.db-shm
```

### Sensitive Data Handling

- **No passwords or secrets**: Code index should not store sensitive data
- **Audit logging**: Log all write operations for audit trail
- **Backup encryption**: Consider encrypting backups if stored remotely

---

## Testing Strategy

### Contract Tests

Verify schema matches specification:

```typescript
describe('Database Schema Contract', () => {
    it('should have all required tables', () => {
        const tables = db.prepare(`
            SELECT name FROM sqlite_master WHERE type='table'
        `).all();

        expect(tables).toContainEqual({ name: 'files' });
        expect(tables).toContainEqual({ name: 'symbols' });
        expect(tables).toContainEqual({ name: 'xrefs' });
        expect(tables).toContainEqual({ name: 'calls' });
        expect(tables).toContainEqual({ name: 'chunks' });
        expect(tables).toContainEqual({ name: 'embeddings' });
        expect(tables).toContainEqual({ name: 'meta' });
        expect(tables).toContainEqual({ name: 'migration_history' });
    });

    it('should pass integrity check', () => {
        const result = db.pragma('integrity_check');
        expect(result[0].integrity_check).toBe('ok');
    });

    it('should have WAL mode enabled', () => {
        const result = db.pragma('journal_mode');
        expect(result[0].journal_mode).toBe('wal');
    });
});
```

### Performance Tests

Verify performance targets:

```typescript
describe('Performance Benchmarks', () => {
    it('should complete symbol lookup in <50ms', () => {
        const start = performance.now();
        db.prepare('SELECT * FROM symbols WHERE symbol_name = ?').all('testFunction');
        const duration = performance.now() - start;

        expect(duration).toBeLessThan(50);
    });

    it('should insert 1000 files in <10s', () => {
        const files = generateTestFiles(1000);
        const start = performance.now();

        const insertFile = db.prepare('INSERT INTO files (...) VALUES (...)');
        const insertMany = db.transaction((files) => {
            for (const file of files) {
                insertFile.run(file);
            }
        });
        insertMany(files);

        const duration = (performance.now() - start) / 1000;
        expect(duration).toBeLessThan(10);
    });
});
```

---

## Summary

This data model provides:

1. ✅ **Comprehensive schema** for code indexing with files, symbols, cross-references, calls, chunks, embeddings, and FTS5 search
2. ✅ **Soft delete with retention** for symbols (30-day retention, automatic cleanup)
3. ✅ **Performance optimization** with compound indexes, partial indexes, and WAL mode
4. ✅ **Schema versioning** with sequential migrations and meta table tracking
5. ✅ **Single-writer enforcement** with unlimited concurrent readers
6. ✅ **Structured logging** for errors and slow queries
7. ✅ **Code-aware search** with FTS5 unicode61 tokenizer and custom tokenchars
8. ✅ **Offline vector storage** with 384-dimensional embeddings as BLOB

**Next Steps**:
1. Implement schema DDL in `sql/schema.sql`
2. Create migration runner in TypeScript
3. Build repository classes for database access
4. Write contract and performance tests
5. Document quickstart guide for developers
