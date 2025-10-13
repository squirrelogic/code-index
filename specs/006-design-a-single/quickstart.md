# Quickstart Guide: SQLite Database Schema for Code Index

**Feature**: Optimized Database Schema for Code Index Storage
**Branch**: `006-design-a-single`
**Date**: 2025-10-13

## Overview

This guide provides a practical introduction to implementing and using the code-index SQLite database schema. The database is designed for offline-first code indexing with full-text search, semantic embeddings, symbol tracking, and cross-reference analysis.

### Key Design Decisions

- **Single-file database**: All data stored in `.codeindex/index.db` for portability
- **384-dimensional embeddings**: Balanced storage (~1.5KB/chunk) using BLOB format
- **Soft deletes with 30-day retention**: Enables refactoring analysis while preventing unbounded growth
- **Single-writer model**: Enforced via `BEGIN IMMEDIATE`; unlimited concurrent readers via WAL mode
- **Code-aware FTS5 search**: Unicode61 tokenizer with custom tokenchars (`_` and `.`) for code identifiers
- **Performance targets**: Symbol queries <50ms, full-text search <100ms, incremental updates 1000 files in <10s

---

## Quick Start for Developers

### 1. Initialize the Database

```typescript
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

function initializeDatabase(dbPath: string): Database.Database {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Open database connection
    const db = new Database(dbPath);

    // Essential PRAGMA settings
    db.pragma('journal_mode = WAL');        // Enable Write-Ahead Logging
    db.pragma('synchronous = NORMAL');      // Balance safety and speed
    db.pragma('temp_store = MEMORY');       // Use memory for temp tables
    db.pragma('mmap_size = 30000000000');   // 30GB memory-mapped I/O
    db.pragma('cache_size = -64000');       // 64MB page cache
    db.pragma('foreign_keys = ON');         // Enable foreign key enforcement
    db.pragma('wal_autocheckpoint = 1000'); // Checkpoint every 1000 pages

    return db;
}

// Example usage
const db = initializeDatabase('.codeindex/index.db');
```

### 2. Apply Migrations

```typescript
interface Migration {
    version: string;
    description: string;
    sql: string;
}

function applyMigrations(db: Database.Database, migrations: Migration[]): void {
    // Get current schema version
    let currentVersion = '0';
    try {
        const result = db.prepare('SELECT value FROM meta WHERE key = ?')
            .get('schema_version');
        if (result) {
            currentVersion = result.value as string;
        }
    } catch (error) {
        // Meta table doesn't exist yet (fresh database)
        console.log('Initializing new database...');
    }

    // Filter pending migrations
    const pending = migrations.filter(m => m.version > currentVersion);

    if (pending.length === 0) {
        console.log('Database schema is up to date');
        return;
    }

    console.log(`Applying ${pending.length} migration(s)...`);

    for (const migration of pending) {
        console.log(`  Applying v${migration.version}: ${migration.description}`);

        db.exec('BEGIN TRANSACTION');
        try {
            // Execute migration SQL
            db.exec(migration.sql);

            // Update schema version
            db.prepare(`
                INSERT OR REPLACE INTO meta (key, value, updated_at)
                VALUES ('schema_version', ?, unixepoch())
            `).run(migration.version);

            // Record in migration history
            db.prepare(`
                INSERT INTO migration_history (version, description)
                VALUES (?, ?)
            `).run(migration.version, migration.description);

            db.exec('COMMIT');
            console.log(`  ✓ Migration v${migration.version} applied`);
        } catch (error) {
            db.exec('ROLLBACK');
            throw new Error(`Migration ${migration.version} failed: ${error.message}`);
        }
    }

    // Update query optimizer statistics
    db.exec('ANALYZE');
    console.log('All migrations completed successfully');
}

// Example: Load migrations from SQL files
function loadMigrations(migrationsDir: string): Migration[] {
    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    return files.map(file => {
        const [version, ...descParts] = path.basename(file, '.sql').split('_');
        return {
            version,
            description: descParts.join(' '),
            sql: fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
        };
    });
}

// Usage
const migrations = loadMigrations('sql/migrations');
applyMigrations(db, migrations);
```

### 3. Verify Schema Integrity

```typescript
function verifyDatabase(db: Database.Database): void {
    console.log('Running database verification checks...');

    // 1. Integrity check
    const integrityResult = db.pragma('integrity_check');
    if (integrityResult[0].integrity_check !== 'ok') {
        throw new Error(`Integrity check failed: ${integrityResult[0].integrity_check}`);
    }
    console.log('  ✓ Integrity check passed');

    // 2. Foreign key check
    const fkResult = db.pragma('foreign_key_check');
    if (fkResult.length > 0) {
        throw new Error(`Foreign key violations detected: ${JSON.stringify(fkResult)}`);
    }
    console.log('  ✓ Foreign key constraints valid');

    // 3. Verify WAL mode
    const walMode = db.pragma('journal_mode');
    if (walMode[0].journal_mode !== 'wal') {
        throw new Error('WAL mode not enabled');
    }
    console.log('  ✓ WAL mode enabled');

    // 4. Verify required tables exist
    const requiredTables = ['files', 'symbols', 'xrefs', 'calls', 'chunks', 'embeddings', 'search', 'meta', 'migration_history'];
    const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table'
    `).all() as { name: string }[];

    const tableNames = new Set(tables.map(t => t.name));
    for (const table of requiredTables) {
        if (!tableNames.has(table)) {
            throw new Error(`Required table missing: ${table}`);
        }
    }
    console.log('  ✓ All required tables present');

    console.log('Database verification completed successfully');
}

// Usage
verifyDatabase(db);
```

---

## Common Operations

### Inserting Files and Symbols

```typescript
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

interface FileRecord {
    path: string;
    content: string;
    language: string;
    modifiedAt: Date;
}

function insertFile(db: Database.Database, file: FileRecord): string {
    const fileId = randomUUID();
    const contentHash = createHash('sha256').update(file.content).digest('hex');
    const size = Buffer.byteLength(file.content);

    const stmt = db.prepare(`
        INSERT INTO files (id, file_path, content_hash, language, size, modified_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (file_path) DO UPDATE SET
            content_hash = excluded.content_hash,
            size = excluded.size,
            modified_at = excluded.modified_at,
            indexed_at = unixepoch()
    `);

    stmt.run(
        fileId,
        file.path,
        contentHash,
        file.language,
        size,
        Math.floor(file.modifiedAt.getTime() / 1000)
    );

    return fileId;
}

interface SymbolRecord {
    fileId: string;
    name: string;
    type: 'function' | 'class' | 'variable' | 'constant' | 'type' | 'interface' | 'method';
    signature?: string;
    documentation?: string;
    lineStart: number;
    lineEnd: number;
}

function insertSymbol(db: Database.Database, symbol: SymbolRecord): string {
    const symbolId = randomUUID();

    const stmt = db.prepare(`
        INSERT INTO symbols (
            id, file_id, symbol_name, symbol_type,
            signature, documentation, line_start, line_end
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        symbolId,
        symbol.fileId,
        symbol.name,
        symbol.type,
        symbol.signature || null,
        symbol.documentation || null,
        symbol.lineStart,
        symbol.lineEnd
    );

    return symbolId;
}

// Batch insert for performance (10-100x faster)
function insertFilesBatch(db: Database.Database, files: FileRecord[]): void {
    const insertStmt = db.prepare(`
        INSERT INTO files (id, file_path, content_hash, language, size, modified_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((files: FileRecord[]) => {
        for (const file of files) {
            const fileId = randomUUID();
            const contentHash = createHash('sha256').update(file.content).digest('hex');
            const size = Buffer.byteLength(file.content);

            insertStmt.run(
                fileId,
                file.path,
                contentHash,
                file.language,
                size,
                Math.floor(file.modifiedAt.getTime() / 1000)
            );
        }
    });

    insertMany(files); // Single transaction: 100x faster than individual inserts
}
```

### Creating Cross-References

```typescript
interface CrossReferenceRecord {
    sourceSymbolId: string;
    targetSymbolId: string;
    referenceType: 'read' | 'write' | 'call' | 'inherit' | 'implement' | 'import';
    context?: string;
    lineNumber?: number;
}

function insertCrossReference(db: Database.Database, xref: CrossReferenceRecord): string {
    const xrefId = randomUUID();

    const stmt = db.prepare(`
        INSERT INTO xrefs (
            id, source_symbol_id, target_symbol_id,
            reference_type, context, line_number
        )
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        xrefId,
        xref.sourceSymbolId,
        xref.targetSymbolId,
        xref.referenceType,
        xref.context || null,
        xref.lineNumber || null
    );

    return xrefId;
}
```

### Storing Embeddings

```typescript
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

function insertEmbedding(
    db: Database.Database,
    chunkId: string,
    embedding: number[],
    model: string = 'all-MiniLM-L6-v2'
): void {
    const embeddingBlob = encodeEmbedding(embedding);

    const stmt = db.prepare(`
        INSERT INTO embeddings (chunk_id, embedding, model)
        VALUES (?, ?, ?)
    `);

    stmt.run(chunkId, embeddingBlob, model);
}

function getEmbedding(db: Database.Database, chunkId: string): Float32Array | null {
    const stmt = db.prepare('SELECT embedding FROM embeddings WHERE chunk_id = ?');
    const result = stmt.get(chunkId) as { embedding: Buffer } | undefined;

    return result ? decodeEmbedding(result.embedding) : null;
}
```

### Full-Text Search Queries

```typescript
interface SearchResult {
    fileId: string;
    symbolId: string | null;
    filePath: string;
    snippet: string;
    rank: number;
}

function searchCode(
    db: Database.Database,
    query: string,
    limit: number = 100
): SearchResult[] {
    const stmt = db.prepare(`
        SELECT
            file_id,
            symbol_id,
            file_path,
            snippet(search, 0, '[', ']', '...', 32) as snippet,
            bm25(search, 2.0, 1.0) as rank
        FROM search
        WHERE search MATCH ?
        ORDER BY rank
        LIMIT ?
    `);

    return stmt.all(query, limit) as SearchResult[];
}

// Example: Phrase search (exact match)
function searchPhrase(db: Database.Database, phrase: string): SearchResult[] {
    return searchCode(db, `"${phrase}"`);
}

// Example: Prefix search (autocomplete)
function searchPrefix(db: Database.Database, prefix: string): SearchResult[] {
    return searchCode(db, `${prefix}*`);
}

// Example: Multi-term search with boolean operators
function searchAdvanced(db: Database.Database, terms: string[]): SearchResult[] {
    // FTS5 query syntax: AND, OR, NOT
    const query = terms.join(' AND ');
    return searchCode(db, query);
}
```

### Finding Symbols and References

```typescript
interface Symbol {
    id: string;
    fileId: string;
    symbolName: string;
    symbolType: string;
    signature: string | null;
    documentation: string | null;
    lineStart: number;
    lineEnd: number;
}

function findSymbolByName(db: Database.Database, name: string): Symbol[] {
    const stmt = db.prepare(`
        SELECT *
        FROM symbols
        WHERE symbol_name = ? AND deleted_at IS NULL
    `);

    return stmt.all(name) as Symbol[];
}

function findSymbolsInFile(db: Database.Database, fileId: string): Symbol[] {
    const stmt = db.prepare(`
        SELECT *
        FROM symbols
        WHERE file_id = ? AND deleted_at IS NULL
        ORDER BY line_start
    `);

    return stmt.all(fileId) as Symbol[];
}

interface Reference {
    id: string;
    sourceSymbolId: string;
    targetSymbolId: string;
    referenceType: string;
    context: string | null;
    lineNumber: number | null;
}

function findReferencesToSymbol(db: Database.Database, symbolId: string): Reference[] {
    const stmt = db.prepare(`
        SELECT *
        FROM xrefs
        WHERE target_symbol_id = ?
    `);

    return stmt.all(symbolId) as Reference[];
}

function findReferencesFromSymbol(db: Database.Database, symbolId: string): Reference[] {
    const stmt = db.prepare(`
        SELECT *
        FROM xrefs
        WHERE source_symbol_id = ?
    `);

    return stmt.all(symbolId) as Reference[];
}
```

### Handling Soft Deletes and Cleanup

```typescript
function softDeleteSymbol(db: Database.Database, symbolId: string): void {
    const stmt = db.prepare(`
        UPDATE symbols
        SET deleted_at = unixepoch()
        WHERE id = ? AND deleted_at IS NULL
    `);

    stmt.run(symbolId);
}

function cleanupDeletedRecords(db: Database.Database, retentionDays: number = 30): number {
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - (retentionDays * 86400);

    const stmt = db.prepare(`
        DELETE FROM symbols
        WHERE deleted_at IS NOT NULL
          AND deleted_at < ?
    `);

    const result = stmt.run(cutoffTimestamp);
    return result.changes;
}

function performMaintenance(db: Database.Database): void {
    console.log('Running maintenance...');

    // 1. Cleanup expired soft-deleted records
    const deletedCount = cleanupDeletedRecords(db, 30);
    console.log(`  Purged ${deletedCount} expired symbols`);

    // 2. Update query optimizer statistics
    db.exec('ANALYZE');
    console.log('  Updated query optimizer statistics');

    // 3. Checkpoint WAL file
    db.pragma('wal_checkpoint(TRUNCATE)');
    console.log('  Checkpointed WAL file');

    // 4. Vacuum if significant deletions (reclaim space)
    if (deletedCount > 1000) {
        console.log('  Running VACUUM to reclaim space...');
        db.exec('VACUUM');
    }

    // 5. Integrity check
    const integrityResult = db.pragma('integrity_check');
    if (integrityResult[0].integrity_check !== 'ok') {
        throw new Error(`Integrity check failed: ${integrityResult[0].integrity_check}`);
    }
    console.log('  ✓ Integrity check passed');

    console.log('Maintenance completed successfully');
}
```

---

## Performance Guidelines

### 1. Batch Operations for Writes

**Problem**: Individual transactions are slow due to disk sync on every commit.

**Solution**: Group operations in a single transaction.

```typescript
// SLOW: Individual transactions (~10 inserts/sec)
for (const symbol of symbols) {
    insertSymbol(db, symbol);
}

// FAST: Batch transaction (~1000+ inserts/sec)
const insertStmt = db.prepare(`
    INSERT INTO symbols (id, file_id, symbol_name, symbol_type, line_start, line_end)
    VALUES (?, ?, ?, ?, ?, ?)
`);

const insertMany = db.transaction((symbols: SymbolRecord[]) => {
    for (const symbol of symbols) {
        insertStmt.run(randomUUID(), symbol.fileId, symbol.name, symbol.type, symbol.lineStart, symbol.lineEnd);
    }
});

insertMany(symbols); // 100x faster!
```

### 2. Prepared Statement Reuse

**Problem**: Parsing SQL on every execution is expensive.

**Solution**: Prepare once, execute many times.

```typescript
class SymbolRepository {
    private findByNameStmt: Database.Statement;
    private findByFileStmt: Database.Statement;
    private insertStmt: Database.Statement;

    constructor(private db: Database.Database) {
        // Prepare statements once during initialization
        this.findByNameStmt = db.prepare(`
            SELECT * FROM symbols
            WHERE symbol_name = ? AND deleted_at IS NULL
        `);

        this.findByFileStmt = db.prepare(`
            SELECT * FROM symbols
            WHERE file_id = ? AND deleted_at IS NULL
        `);

        this.insertStmt = db.prepare(`
            INSERT INTO symbols (id, file_id, symbol_name, symbol_type, line_start, line_end)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
    }

    findByName(name: string): Symbol[] {
        return this.findByNameStmt.all(name) as Symbol[];
    }

    findByFile(fileId: string): Symbol[] {
        return this.findByFileStmt.all(fileId) as Symbol[];
    }

    insert(symbol: SymbolRecord): string {
        const id = randomUUID();
        this.insertStmt.run(id, symbol.fileId, symbol.name, symbol.type, symbol.lineStart, symbol.lineEnd);
        return id;
    }
}

// Usage
const repo = new SymbolRepository(db);
const symbols = repo.findByName('calculateTotal'); // Instant - no SQL parsing
```

### 3. Index Usage Verification

Always verify that queries use indexes for optimal performance:

```typescript
function verifyQueryPlan(db: Database.Database, query: string, params: any[]): void {
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${query}`).all(...params);
    console.log('Query plan:', plan);

    // Check if using an index
    const usesIndex = plan.some((row: any) =>
        row.detail.includes('USING INDEX') || row.detail.includes('SEARCH')
    );

    if (!usesIndex) {
        console.warn('⚠ Query may be slow - not using an index!');
    }
}

// Example usage
verifyQueryPlan(
    db,
    'SELECT * FROM symbols WHERE symbol_name = ? AND deleted_at IS NULL',
    ['testFunction']
);
```

### 4. When to Run ANALYZE

Run `ANALYZE` to update query optimizer statistics after:

- Bulk inserts or updates (>1000 records)
- Schema migrations
- Significant deletions
- Weekly maintenance

```typescript
function shouldRunAnalyze(db: Database.Database): boolean {
    // Get row counts from last analyze
    const stats = db.prepare('SELECT * FROM sqlite_stat1').all() as any[];

    // If stats are empty or outdated, run analyze
    if (stats.length === 0) {
        return true;
    }

    // Check if row counts have changed significantly
    const currentSymbolCount = db.prepare('SELECT COUNT(*) as count FROM symbols').get() as { count: number };
    const lastAnalyzeCount = stats.find((s: any) => s.tbl === 'symbols')?.stat || '0';
    const lastCount = parseInt(lastAnalyzeCount.split(' ')[0]);

    // If >10% change, run analyze
    return Math.abs(currentSymbolCount.count - lastCount) > lastCount * 0.1;
}

// Usage
if (shouldRunAnalyze(db)) {
    console.log('Running ANALYZE...');
    db.exec('ANALYZE');
}
```

---

## Troubleshooting

### Checking Database Integrity

```typescript
function checkDatabaseHealth(db: Database.Database): void {
    console.log('Database Health Check');
    console.log('='.repeat(60));

    // 1. Integrity check
    const integrity = db.pragma('integrity_check');
    console.log('Integrity:', integrity[0].integrity_check);

    // 2. Foreign key violations
    const fkViolations = db.pragma('foreign_key_check');
    console.log('Foreign key violations:', fkViolations.length);
    if (fkViolations.length > 0) {
        console.log('Violations:', fkViolations);
    }

    // 3. Database size
    const pageCount = db.pragma('page_count')[0].page_count;
    const pageSize = db.pragma('page_size')[0].page_size;
    const sizeBytes = pageCount * pageSize;
    console.log(`Database size: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB`);

    // 4. WAL file size
    const walInfo = db.pragma('wal_checkpoint(PASSIVE)');
    console.log('WAL checkpoint info:', walInfo);

    // 5. Table row counts
    const tables = ['files', 'symbols', 'xrefs', 'calls', 'chunks', 'embeddings'];
    console.log('\nTable row counts:');
    for (const table of tables) {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
        console.log(`  ${table}: ${count.count.toLocaleString()}`);
    }

    // 6. Soft-deleted records
    const deletedSymbols = db.prepare(`
        SELECT COUNT(*) as count FROM symbols WHERE deleted_at IS NOT NULL
    `).get() as { count: number };
    console.log(`\nSoft-deleted symbols: ${deletedSymbols.count}`);

    console.log('='.repeat(60));
}

// Usage
checkDatabaseHealth(db);
```

### Investigating Slow Queries

```typescript
interface QueryStats {
    query: string;
    duration: number;
    rowsReturned: number;
    usesIndex: boolean;
}

function analyzeQuery(db: Database.Database, query: string, params: any[]): QueryStats {
    // Get query plan
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${query}`).all(...params);
    const usesIndex = plan.some((row: any) =>
        row.detail.includes('USING INDEX') || row.detail.includes('SEARCH')
    );

    // Measure execution time
    const start = performance.now();
    const results = db.prepare(query).all(...params);
    const duration = performance.now() - start;

    return {
        query,
        duration: Math.round(duration * 100) / 100,
        rowsReturned: results.length,
        usesIndex
    };
}

// Example usage
const stats = analyzeQuery(
    db,
    'SELECT * FROM symbols WHERE symbol_name = ?',
    ['testFunction']
);

console.log('Query stats:', stats);
if (!stats.usesIndex) {
    console.warn('⚠ Query is not using an index - consider adding one!');
}
if (stats.duration > 50) {
    console.warn('⚠ Query exceeded 50ms threshold!');
}
```

### Managing Database Size

```typescript
function getDatabaseSizeInfo(db: Database.Database): void {
    // Total database size
    const pageCount = db.pragma('page_count')[0].page_count;
    const pageSize = db.pragma('page_size')[0].page_size;
    const totalSize = pageCount * pageSize;

    // Size by table
    const tableStats = db.prepare(`
        SELECT
            name,
            SUM(pgsize) as size_bytes
        FROM dbstat
        WHERE name NOT LIKE 'sqlite_%'
        GROUP BY name
        ORDER BY size_bytes DESC
    `).all() as { name: string; size_bytes: number }[];

    console.log('Database Size Analysis');
    console.log('='.repeat(60));
    console.log(`Total: ${(totalSize / 1024 / 1024).toFixed(2)} MB\n`);

    console.log('By table:');
    for (const table of tableStats) {
        const sizeMB = table.size_bytes / 1024 / 1024;
        const percentage = (table.size_bytes / totalSize) * 100;
        console.log(`  ${table.name.padEnd(20)} ${sizeMB.toFixed(2).padStart(8)} MB  (${percentage.toFixed(1)}%)`);
    }

    // Index overhead
    const indexSize = db.prepare(`
        SELECT SUM(pgsize) as size_bytes
        FROM dbstat
        WHERE name LIKE 'idx_%'
    `).get() as { size_bytes: number };

    const indexPercentage = (indexSize.size_bytes / totalSize) * 100;
    console.log(`\nIndex overhead: ${(indexSize.size_bytes / 1024 / 1024).toFixed(2)} MB (${indexPercentage.toFixed(1)}%)`);

    // Soft-deleted records impact
    const deletedCount = db.prepare(`
        SELECT COUNT(*) as count FROM symbols WHERE deleted_at IS NOT NULL
    `).get() as { count: number };

    if (deletedCount.count > 0) {
        console.log(`\nSoft-deleted symbols: ${deletedCount.count}`);
        console.log('Run cleanup to reclaim space: cleanupDeletedRecords(db)');
    }

    console.log('='.repeat(60));
}

// Usage
getDatabaseSizeInfo(db);
```

### Handling Write Conflicts (Single-Writer Model)

```typescript
function acquireWriteLock(db: Database.Database, timeoutMs: number = 5000): boolean {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        try {
            db.exec('BEGIN IMMEDIATE'); // Acquires write lock
            return true;
        } catch (error: any) {
            if (error.code === 'SQLITE_BUSY') {
                // Another writer is active, wait and retry
                const elapsed = Date.now() - startTime;
                const remaining = timeoutMs - elapsed;

                if (remaining > 0) {
                    // Exponential backoff
                    const delay = Math.min(100, 10 * Math.pow(2, elapsed / 1000));
                    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
                    continue;
                }
            }
            throw error;
        }
    }

    return false;
}

function performWriteOperation(db: Database.Database, operation: () => void): void {
    if (!acquireWriteLock(db)) {
        throw new Error('Another indexing operation is in progress. Please wait and try again.');
    }

    try {
        operation();
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}

// Usage
performWriteOperation(db, () => {
    // Your write operations here
    insertFile(db, myFile);
    insertSymbol(db, mySymbol);
});
```

---

## Code Examples

### Complete Database Initialization

```typescript
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

class CodeIndexDatabase {
    private db: Database.Database;

    constructor(dbPath: string = '.codeindex/index.db') {
        this.db = this.initializeDatabase(dbPath);
    }

    private initializeDatabase(dbPath: string): Database.Database {
        // Ensure directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Open database
        const db = new Database(dbPath);

        // Configure PRAGMA settings
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('temp_store = MEMORY');
        db.pragma('mmap_size = 30000000000');
        db.pragma('cache_size = -64000');
        db.pragma('foreign_keys = ON');
        db.pragma('wal_autocheckpoint = 1000');

        return db;
    }

    applyMigrations(migrationsDir: string): void {
        const migrations = this.loadMigrations(migrationsDir);
        applyMigrations(this.db, migrations);
    }

    private loadMigrations(dir: string): Migration[] {
        const files = fs.readdirSync(dir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        return files.map(file => {
            const [version, ...descParts] = path.basename(file, '.sql').split('_');
            return {
                version,
                description: descParts.join(' '),
                sql: fs.readFileSync(path.join(dir, file), 'utf-8')
            };
        });
    }

    verify(): void {
        verifyDatabase(this.db);
    }

    maintenance(): void {
        performMaintenance(this.db);
    }

    close(): void {
        this.db.close();
    }

    getConnection(): Database.Database {
        return this.db;
    }
}

// Usage
const codeIndex = new CodeIndexDatabase('.codeindex/index.db');
codeIndex.applyMigrations('sql/migrations');
codeIndex.verify();

// Use the database
const db = codeIndex.getConnection();
// ... your operations ...

// Cleanup
codeIndex.close();
```

### Vector Similarity Search

```typescript
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

interface SimilarityResult {
    chunkId: string;
    similarity: number;
    content?: string;
}

function findSimilarChunks(
    db: Database.Database,
    queryEmbedding: number[],
    topK: number = 10,
    minSimilarity: number = 0.7
): SimilarityResult[] {
    // Get all embeddings (brute-force scan)
    const allEmbeddings = db.prepare(`
        SELECT e.chunk_id, e.embedding, c.content
        FROM embeddings e
        JOIN chunks c ON e.chunk_id = c.id
        WHERE c.deleted_at IS NULL
    `).all() as { chunk_id: string; embedding: Buffer; content: string }[];

    const queryVector = new Float32Array(queryEmbedding);
    const results: SimilarityResult[] = [];

    // Compute similarity for each embedding
    for (const row of allEmbeddings) {
        const embedding = decodeEmbedding(row.embedding);
        const similarity = cosineSimilarity(queryVector, embedding);

        if (similarity >= minSimilarity) {
            results.push({
                chunkId: row.chunk_id,
                similarity,
                content: row.content
            });
        }
    }

    // Sort by similarity (descending) and take top K
    return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
}

// Usage
const queryEmbedding = [...]; // 384-dimensional vector
const similar = findSimilarChunks(db, queryEmbedding, 10, 0.8);
console.log('Similar chunks:', similar);
```

### Soft Delete and Cleanup Automation

```typescript
class CleanupScheduler {
    private intervalId: NodeJS.Timeout | null = null;

    constructor(
        private db: Database.Database,
        private retentionDays: number = 30,
        private intervalHours: number = 24
    ) {}

    start(): void {
        if (this.intervalId) {
            throw new Error('Cleanup scheduler already running');
        }

        console.log(`Starting cleanup scheduler (every ${this.intervalHours} hours)`);

        // Run immediately on start
        this.runCleanup();

        // Schedule periodic cleanup
        this.intervalId = setInterval(
            () => this.runCleanup(),
            this.intervalHours * 60 * 60 * 1000
        );
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('Cleanup scheduler stopped');
        }
    }

    private runCleanup(): void {
        console.log('Running scheduled cleanup...');

        try {
            performMaintenance(this.db);
        } catch (error) {
            console.error('Cleanup failed:', error);
        }
    }
}

// Usage
const scheduler = new CleanupScheduler(db, 30, 24);
scheduler.start();

// When shutting down
process.on('SIGINT', () => {
    scheduler.stop();
    db.close();
    process.exit(0);
});
```

---

## References

For detailed implementation information, see:

- **[spec.md](./spec.md)**: Complete feature specification with user stories and acceptance criteria
- **[plan.md](./plan.md)**: Implementation plan and technical context
- **[research.md](./research.md)**: Technology decisions and design rationale
- **[data-model.md](./data-model.md)**: Complete entity definitions and SQLite schema DDL
- **[contracts/](./contracts/)**: Schema interface contracts

For questions or issues, refer to the planning documents or consult the project maintainers.
