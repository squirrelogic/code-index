# Research Document: Optimized SQLite Schema for Code Index Storage

**Date**: 2025-10-13
**Feature**: SQLite Database Schema with FTS5, Vector Storage, and Migrations
**Branch**: `006-design-a-single`

## Overview

This document captures all research decisions for implementing an optimized SQLite schema for code indexing. The schema includes tables for files, symbols, cross-references, calls, chunks, embeddings, and FTS5 full-text search capabilities, with comprehensive migration support and performance optimization.

## Technology Decisions

### 1. SQLite FTS5 Configuration

**Decision**: Use FTS5 with `unicode61` tokenizer (without porter stemming) and custom tokenchars for code identifiers

**Rationale**:
- **Code-aware tokenization**: `unicode61` handles Unicode properly and allows customization via `tokenchars` option to treat underscores, dots, and other code punctuation as part of tokens (e.g., `my_function`, `module.method`)
- **No stemming needed**: Code identifiers should match exactly; porter stemming would incorrectly match `user` to `users` or `data` to `datum`, which breaks code search semantics
- **Built-in BM25 ranking**: FTS5 includes BM25 (Best Match 25) ranking algorithm that considers term frequency, document length, and query structure for relevance scoring
- **Prefix matching support**: FTS5 supports prefix queries (e.g., `get*`) for autocompletion and partial matching
- **Performance**: FTS5 is significantly faster than FTS3/FTS4 and uses less disk space

**Alternatives considered**:
- **Porter tokenizer**: Rejected because stemming is inappropriate for code (would match incorrect identifiers)
- **Trigram tokenizer**: Rejected because it doesn't work with `tokenchars` option and is much slower (1.6x even with optimized implementations), though it enables substring matching
- **ASCII tokenizer**: Too limited for international codebases that may include Unicode comments or documentation

**Implementation details**:
```sql
CREATE VIRTUAL TABLE search USING fts5(
    content,
    documentation,
    file_path UNINDEXED,
    tokenize = 'unicode61 remove_diacritics 1 tokenchars "_."'
);

-- BM25 ranking with custom weights (content ranked higher than docs)
SELECT file_path, bm25(search, 2.0, 1.0) as rank
FROM search
WHERE search MATCH ?
ORDER BY rank
LIMIT 100;
```

**BM25 Configuration Notes**:
- Lower scores are more relevant (FTS5 uses negative scores; less negative = better match)
- Can provide custom weights per column: `bm25(search, 2.0, 1.0)` weights content 2x higher than documentation
- Default BM25 parameters: k1=1.2, b=0.75 (term saturation and document length normalization)
- For code search, equal weighting or slightly higher content weighting works best

---

### 2. Vector Storage in SQLite

**Decision**: Store 384-dimensional float vectors as BLOB using raw IEEE 754 32-bit float encoding

**Rationale**:
- **Space efficiency**: BLOB storage is most compact (384 floats × 4 bytes = 1,536 bytes per vector), compared to JSON (~3-4KB with formatting overhead)
- **No extensions required**: Works with standard SQLite, meeting offline-first and portability requirements
- **Simple brute-force search**: For code indexing use case with moderate dataset sizes (10k-100k chunks), brute-force cosine similarity is sufficient
- **Fast I/O**: BLOB retrieval is very fast in SQLite; compute similarity in application code using JavaScript TypedArray operations
- **Cross-platform**: IEEE 754 floats are portable across all platforms

**Alternatives considered**:
- **sqlite-vec extension**: Provides SIMD-optimized similarity functions but adds external dependency and binary compilation requirements
- **sqlite-vss with FAISS**: Too heavy for CLI tool; requires complex setup and large memory footprint
- **TEXT/JSON storage**: 2-3x larger storage, requires parsing overhead, not suitable for 100k+ vectors
- **FLOAT16 compression**: Would save 50% space but requires custom encoding/decoding and may impact precision for embeddings

**Implementation details**:
```typescript
// Storing embeddings (TypeScript/Node.js)
function encodeEmbedding(vector: number[]): Buffer {
    const buffer = Buffer.allocUnsafe(vector.length * 4);
    for (let i = 0; i < vector.length; i++) {
        buffer.writeFloatLE(vector[i], i * 4);
    }
    return buffer;
}

// Retrieving embeddings
function decodeEmbedding(blob: Buffer): Float32Array {
    return new Float32Array(blob.buffer, blob.byteOffset, blob.length / 4);
}

// Brute-force cosine similarity (in application code)
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

**Schema definition**:
```sql
CREATE TABLE embeddings (
    chunk_id TEXT PRIMARY KEY NOT NULL,
    embedding BLOB NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);

-- No index needed for embeddings table; brute-force scan is expected
```

**Performance expectations**:
- Brute-force similarity search across 100k vectors: ~100-200ms in Node.js (single-threaded)
- Can optimize with worker threads for parallel processing if needed
- Storage: ~150MB for 100k embeddings (1.5KB each)

---

### 3. Index Optimization

**Decision**: Create compound indexes for common query patterns, with partial indexes to exclude soft-deleted records

**Rationale**:
- **Compound index efficiency**: SQLite uses leftmost prefix matching, so `(file_id, symbol_type)` index accelerates both `WHERE file_id = ?` and `WHERE file_id = ? AND symbol_type = ?`
- **Partial indexes for soft deletes**: Using `WHERE deleted_at IS NULL` in index definitions excludes soft-deleted rows, improving query performance and reducing index size
- **Foreign key indexes**: SQLite does NOT automatically index foreign keys; must create manually for join performance
- **UNIQUE vs non-unique**: Use UNIQUE only for enforcing constraints (e.g., file paths); use non-unique for query optimization (e.g., symbol lookups)

**Alternatives considered**:
- **Separate indexes per column**: Less efficient; compound indexes are faster for multi-column filters
- **Index everything**: Over-indexing slows INSERT/UPDATE/DELETE operations; limit to common query patterns
- **No partial indexes**: Would include soft-deleted rows in indexes, degrading active record query performance

**Implementation details**:
```sql
-- Compound index for symbol lookups (leftmost prefix matching)
CREATE INDEX idx_symbols_file_type ON symbols(file_id, symbol_type) WHERE deleted_at IS NULL;

-- Partial index for active symbols by name
CREATE INDEX idx_symbols_name ON symbols(symbol_name) WHERE deleted_at IS NULL;

-- Foreign key index for cross-references (manual, not automatic)
CREATE INDEX idx_xrefs_source ON xrefs(source_symbol_id);
CREATE INDEX idx_xrefs_target ON xrefs(target_symbol_id);

-- Unique index for file paths (constraint enforcement)
CREATE UNIQUE INDEX idx_files_path ON files(file_path);

-- Compound index for calls
CREATE INDEX idx_calls_caller ON calls(caller_symbol_id, callee_symbol_id);

-- Partial unique index for chunks (excludes soft-deleted)
CREATE UNIQUE INDEX idx_chunks_id ON chunks(id) WHERE deleted_at IS NULL;
```

**Query patterns supported**:
- Symbol lookup by file: `WHERE file_id = ?` (uses idx_symbols_file_type)
- Symbol lookup by file and type: `WHERE file_id = ? AND symbol_type = ?` (uses idx_symbols_file_type)
- Symbol lookup by name: `WHERE symbol_name = ? AND deleted_at IS NULL` (uses idx_symbols_name)
- Cross-reference traversal: `WHERE source_symbol_id = ?` (uses idx_xrefs_source)
- Call graph queries: `WHERE caller_symbol_id = ?` (uses idx_calls_caller)

**Index size estimation**:
- Indexes typically add 20-30% overhead to database size
- Partial indexes reduce overhead by excluding deleted records
- Monitor with: `SELECT SUM(pgsize) FROM dbstat WHERE name LIKE 'idx_%';`

---

### 4. Schema Versioning Patterns

**Decision**: Track version in `meta` table with sequential numbered migration files

**Rationale**:
- **Simple versioning**: SQLite's built-in `PRAGMA user_version` is too limited (integer only, no metadata); custom `meta` table allows storing version, migration history, and timestamps
- **Sequential migrations**: Numbered files (001_initial.sql, 002_add_embeddings.sql) ensure deterministic ordering
- **Migration history**: Track applied migrations in `meta` table to support idempotent execution and rollback tracking
- **Transaction safety**: Wrap each migration in a transaction for atomicity

**Alternatives considered**:
- **PRAGMA user_version**: Too limited; doesn't store migration metadata or history
- **Hash-based migrations**: More complex; sequential numbers are simpler for CLI tool
- **External migration tools (Flyway, Liquibase)**: Adds dependencies; inline migration is simpler for single-file database

**Implementation details**:
```sql
-- Meta table for version tracking
CREATE TABLE meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Initial version
INSERT INTO meta (key, value) VALUES ('schema_version', '1');

-- Migration history tracking
CREATE TABLE migration_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

**Migration workflow**:
```typescript
// TypeScript migration runner pseudo-code
interface Migration {
    version: string;
    description: string;
    up: string;  // SQL script
    down?: string;  // Rollback SQL (optional)
}

async function runMigrations(db: Database, migrations: Migration[]) {
    const currentVersion = db.prepare('SELECT value FROM meta WHERE key = ?')
        .get('schema_version')?.value || '0';

    const pending = migrations.filter(m => m.version > currentVersion);

    for (const migration of pending) {
        db.exec('BEGIN TRANSACTION');
        try {
            db.exec(migration.up);
            db.prepare('UPDATE meta SET value = ? WHERE key = ?')
                .run(migration.version, 'schema_version');
            db.prepare('INSERT INTO migration_history (version, description) VALUES (?, ?)')
                .run(migration.version, migration.description);
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw new Error(`Migration ${migration.version} failed: ${error}`);
        }
    }
}
```

**Migration file naming convention**:
```
sql/migrations/
├── 001_initial_schema.sql
├── 002_add_embeddings.sql
├── 003_add_calls_table.sql
├── 004_add_fts5_search.sql
└── README.md  (documents migration policy)
```

**Rollback strategy**:
- Store rollback SQL in migration metadata (optional, for critical migrations)
- For most CLI tool migrations, rollback = restore from backup
- Document migration as one-way when rollback is not feasible (e.g., data type changes)
- Always backup database before applying migrations: `VACUUM INTO 'backup.db'`

---

### 5. Single-Writer WAL Mode

**Decision**: Enable WAL (Write-Ahead Logging) mode with single-writer enforcement

**Rationale**:
- **Concurrency**: WAL allows unlimited readers during writes, critical for CLI tool that may run searches while indexing
- **Performance**: WAL is faster for write-heavy workloads; writes don't block readers
- **Crash safety**: WAL provides better durability; uncommitted transactions are rolled back automatically
- **Single-writer enforcement**: CLI tool nature means single indexing process; detect and reject concurrent writes explicitly

**Alternatives considered**:
- **DELETE mode (default)**: Slower; writers block all readers, unacceptable for search during indexing
- **TRUNCATE mode**: Similar to DELETE but faster cleanup; still blocks readers during writes
- **BEGIN IMMEDIATE**: Locks database early to prevent concurrent writes, but doesn't provide reader concurrency

**Implementation details**:
```sql
-- Enable WAL mode (persistent setting, stored in database file)
PRAGMA journal_mode = WAL;

-- Additional performance settings for WAL
PRAGMA synchronous = NORMAL;  -- Faster than FULL, still safe with WAL
PRAGMA wal_autocheckpoint = 1000;  -- Checkpoint every 1000 pages
PRAGMA mmap_size = 30000000000;  -- 30GB memory-mapped I/O (virtual, not physical)
PRAGMA temp_store = MEMORY;  -- Use memory for temp tables
```

**Concurrency control**:
```typescript
// Detect concurrent writers using an immediate transaction
function acquireWriteLock(db: Database): boolean {
    try {
        db.exec('BEGIN IMMEDIATE');  // Fails if another writer exists
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
```

**WAL characteristics**:
- Persistent setting: Once set, WAL mode applies to all connections
- Same-host only: All processes must be on same machine (not network filesystem)
- Checkpoint process: Periodically merges WAL file back to main database
- File handles: Creates `-wal` and `-shm` files alongside main database

**Performance expectations**:
- Readers: 95%+ of single-reader performance during writes (per SC-006)
- Writers: 2-3x faster than DELETE mode for bulk operations
- WAL file size: Typically <10% of database size between checkpoints

---

### 6. Soft Delete Patterns

**Decision**: Use `deleted_at` timestamp with 30-day retention and periodic cleanup

**Rationale**:
- **Audit trail**: Retaining deleted symbols for 30 days supports refactoring analysis and "what changed" queries
- **Bounded growth**: 30-day retention prevents unbounded database growth from soft-deleted records
- **Query performance**: Partial indexes (`WHERE deleted_at IS NULL`) exclude deleted records from active queries
- **Simple implementation**: Single nullable timestamp column is simpler than separate deleted/archived tables

**Alternatives considered**:
- **Immediate hard delete**: Loses history; can't track refactorings or answer "what was deleted" queries
- **Indefinite retention**: Unbounded growth; database size increases without limit
- **Separate archive table**: More complex; requires triggers or application logic to move records

**Implementation details**:
```sql
-- Soft delete pattern in symbols table
CREATE TABLE symbols (
    id TEXT PRIMARY KEY NOT NULL,
    file_id TEXT NOT NULL,
    symbol_name TEXT NOT NULL,
    symbol_type TEXT NOT NULL,
    signature TEXT,
    documentation TEXT,
    line_start INTEGER NOT NULL,
    line_end INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER,  -- NULL = active, unix timestamp = deleted
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- Partial indexes exclude soft-deleted records
CREATE INDEX idx_symbols_name ON symbols(symbol_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_symbols_file_type ON symbols(file_id, symbol_type) WHERE deleted_at IS NULL;

-- Query active symbols (index-optimized)
SELECT * FROM symbols WHERE symbol_name = ? AND deleted_at IS NULL;

-- Query recently deleted symbols (table scan, infrequent query)
SELECT * FROM symbols WHERE deleted_at IS NOT NULL AND deleted_at > unixepoch() - (30 * 86400);

-- Periodic cleanup (run daily or weekly)
DELETE FROM symbols WHERE deleted_at IS NOT NULL AND deleted_at < unixepoch() - (30 * 86400);
```

**Unique constraint handling**:
```sql
-- Problem: Unique indexes include soft-deleted rows
-- Solution: Partial unique index excludes soft-deleted rows
CREATE UNIQUE INDEX idx_files_path ON files(file_path) WHERE deleted_at IS NULL;

-- This allows re-creating a file after soft deletion without conflict
```

**Cleanup strategy**:
```typescript
// Periodic cleanup function (run as part of 'refresh' or 'doctor' command)
function cleanupDeletedRecords(db: Database, retentionDays: number = 30) {
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - (retentionDays * 86400);

    const result = db.prepare(`
        DELETE FROM symbols
        WHERE deleted_at IS NOT NULL
          AND deleted_at < ?
    `).run(cutoffTimestamp);

    // Log cleanup activity
    if (result.changes > 0) {
        console.log(`Purged ${result.changes} symbols older than ${retentionDays} days`);
    }

    // Run VACUUM periodically to reclaim space (expensive operation)
    if (result.changes > 1000) {
        db.exec('VACUUM');
    }
}
```

**Performance considerations**:
- Filtered indexes ensure active record queries are fast (no table scan)
- Cleanup query scans deleted records only (small subset)
- VACUUM reclaims space but is expensive (run when database idle)
- Monitor deleted record count: `SELECT COUNT(*) FROM symbols WHERE deleted_at IS NOT NULL`

---

### 7. Performance Benchmarks and Query Optimization

**Decision**: Optimize for read-heavy workload with prepared statements, batch writes, and strategic indexing

**Rationale**:
- **Expected workload**: 90%+ reads (symbol lookups, searches), 10% writes (indexing, updates)
- **SQLite capabilities**: Can achieve 100k+ SELECT/sec with proper configuration; millions of operations per second for simple queries
- **Batch writes**: Grouping operations in transactions provides 10-100x speedup over individual commits
- **Prepared statements**: Reusing prepared statements eliminates parsing overhead
- **Index-covered queries**: Indexes that include all queried columns avoid table lookups

**Alternatives considered**:
- **Asynchronous driver**: Adds complexity; sync API is simpler and sufficient for CLI tool
- **Read-only connections**: Could optimize readers but adds connection management complexity
- **Separate read/write databases**: Over-engineered for CLI tool use case

**Implementation details**:

**Essential PRAGMA settings** (apply on every connection):
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;  -- FULL is safer but slower; NORMAL is safe with WAL
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 30000000000;  -- 30GB virtual memory mapping
PRAGMA cache_size = -64000;  -- 64MB page cache (negative = kibibytes)
```

**Batch write pattern**:
```typescript
// Batch indexing: 10-100x faster than individual transactions
function indexFiles(db: Database, files: File[]) {
    const insertFile = db.prepare(`
        INSERT INTO files (id, file_path, content_hash, language, size, modified_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (file_path) DO UPDATE SET
            content_hash = excluded.content_hash,
            size = excluded.size,
            modified_at = excluded.modified_at
    `);

    const insertMany = db.transaction((files) => {
        for (const file of files) {
            insertFile.run(file.id, file.path, file.hash, file.language, file.size, file.modified);
        }
    });

    insertMany(files);  // Single transaction, 10-100x faster
}
```

**Prepared statement reuse**:
```typescript
// Prepare once, execute many times
class SymbolRepository {
    private findByNameStmt: Statement;
    private findByFileStmt: Statement;

    constructor(db: Database) {
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

**Query optimization checklist**:
1. Use `EXPLAIN QUERY PLAN` to verify index usage
2. Ensure compound indexes match query column order
3. Use partial indexes to exclude soft-deleted records
4. Limit result sets with `LIMIT` clauses
5. Use index-covered queries (all columns in index)
6. Run `ANALYZE` periodically to update statistics

**ANALYZE command**:
```sql
-- Run after bulk updates to update query optimizer statistics
ANALYZE;

-- Check index effectiveness
SELECT * FROM sqlite_stat1;
```

**Performance targets (from spec)**:
- Symbol lookup: <50ms for 100k+ symbols (SC-001)
- Full-text search: <100ms for 1GB codebase (SC-002)
- Incremental update: 1000 files in <10s (SC-004)
- Cross-reference query: <100ms (SC-008)

**Expected performance characteristics**:
- File by path lookup (indexed): <1ms
- Symbol by name lookup (indexed): <5ms
- Symbol by file lookup (indexed): <10ms
- Cross-reference traversal (indexed): <20ms
- FTS5 search (indexed): 50-100ms depending on result count
- Batch insert (transacted): 1000 files in 1-2 seconds
- VACUUM operation: Proportional to database size, ~1 second per 100MB

**Performance monitoring**:
```typescript
// Log slow queries for optimization
function executeWithLogging(db: Database, query: string, params: any[], threshold: number = 50) {
    const start = performance.now();
    const result = db.prepare(query).all(...params);
    const duration = performance.now() - start;

    if (duration > threshold) {
        logger.warn({
            type: 'slow_query',
            query: query,
            params: params,
            duration_ms: duration,
            result_count: result.length
        });
    }

    return result;
}
```

---

## Schema Design Summary

### Table Overview

1. **files**: Core file metadata (path, hash, language, size, timestamps)
2. **symbols**: Code elements (functions, classes, variables) with soft delete support
3. **xrefs**: Cross-references between symbols (usage relationships)
4. **calls**: Function/method call relationships (call graph)
5. **chunks**: Semantic code units for AI processing (function/method level)
6. **embeddings**: 384-dim float vectors for semantic search (BLOB storage)
7. **search**: FTS5 virtual table for full-text search (unicode61 tokenizer)
8. **meta**: Schema version and configuration metadata
9. **migration_history**: Applied migration tracking

### Index Strategy

- **Compound indexes**: For multi-column queries (file_id + symbol_type)
- **Partial indexes**: Exclude soft-deleted records (WHERE deleted_at IS NULL)
- **Foreign key indexes**: Manual creation required (SQLite doesn't auto-index FKs)
- **Unique indexes**: Only for constraint enforcement, not optimization
- **FTS5 indexes**: Automatic via FTS5 virtual table

### Performance Configuration

- **WAL mode**: Concurrent readers during writes
- **Synchronous NORMAL**: Balance safety and speed
- **Memory-mapped I/O**: 30GB virtual addressing
- **Page cache**: 64MB in-memory cache
- **Batch transactions**: Group writes for 10-100x speedup

### Migration Strategy

- **Sequential versioning**: Numbered migration files (001, 002, ...)
- **Meta table tracking**: Version and history stored in database
- **Transaction safety**: Wrap each migration in transaction
- **Rollback support**: Optional rollback SQL for critical migrations

### Soft Delete Pattern

- **30-day retention**: Balance history and storage
- **Partial indexes**: Optimize active record queries
- **Periodic cleanup**: Remove expired records
- **VACUUM**: Reclaim space after cleanup

---

## Next Steps

With research complete, proceed to Phase 1:

1. **Generate data-model.md**: Define tables, columns, types, constraints, and relationships
2. **Create schema.sql**: Initial schema DDL with indexes
3. **Document migration patterns**: Migration file structure and runner implementation
4. **Generate quickstart.md**: Usage guide for database operations
5. **Create contract tests**: Verify schema integrity and performance benchmarks

All NEEDS CLARIFICATION items from the spec have been resolved:
- ✅ FTS5 tokenizer: unicode61 with custom tokenchars for code
- ✅ Vector storage: BLOB with IEEE 754 floats, brute-force similarity
- ✅ Index optimization: Compound indexes, partial indexes for soft deletes
- ✅ Schema versioning: Meta table with sequential migrations
- ✅ WAL mode: Single-writer, unlimited readers
- ✅ Soft deletes: 30-day retention with periodic cleanup
- ✅ Performance: Batch writes, prepared statements, strategic indexing
