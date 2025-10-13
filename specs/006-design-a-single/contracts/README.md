# Database Schema Contracts

This directory contains API contracts for the code-index SQLite database schema.

## Files

### schema-interface.yaml

Comprehensive contract document defining:

1. **Schema Contract (Database Level)**
   - Required tables with column definitions, types, and constraints
   - Required indexes for performance optimization
   - PRAGMA settings for database configuration
   - FTS5 virtual table configuration for full-text search
   - Soft delete patterns and retention policies

2. **Query Contracts (Interface Level)**
   - Symbol lookup operations (by name, file, type)
   - Cross-reference traversal (find usages, find references)
   - Full-text search (keyword, phrase, with ranking)
   - Chunk similarity search (application-level brute-force)
   - File change detection (hash comparison)
   - Deleted symbol cleanup (30-day retention)

3. **Migration Contracts**
   - Schema version tracking in `meta` table
   - Sequential migration file naming and application
   - Transaction-wrapped migration execution
   - Integrity check requirements
   - Backup and rollback procedures

4. **Logging Contracts**
   - Error logging structure (operation, query, parameters, stack trace)
   - Slow query logging (with performance thresholds)
   - Performance monitoring metrics

5. **Validation Rules**
   - Startup validation (integrity checks, schema version)
   - Write validation (single-writer enforcement, disk space)
   - Periodic maintenance (WAL checkpoint, ANALYZE, cleanup)

6. **Performance Benchmarks**
   - Target performance for each operation type
   - Monitoring and alerting thresholds

## Usage

### For Implementation

1. **Database Initialization**: Use the table definitions and PRAGMA settings to create the initial schema
2. **Query Implementation**: Reference query contracts for correct SQL syntax and expected performance
3. **Migration Development**: Follow migration contracts for creating and applying schema changes
4. **Logging Integration**: Implement structured logging according to logging contracts

### For Testing

1. **Contract Tests**: Validate that implemented schema matches contract definitions
2. **Performance Tests**: Verify operations meet performance targets
3. **Integration Tests**: Test query contracts with real data
4. **Migration Tests**: Verify migrations apply correctly and maintain integrity

### For Validation

Use the contract to validate:

```typescript
// Example: Validate table exists
const tables = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type = 'table'
  AND name = ?
`).all('symbols');

// Example: Validate index exists
const indexes = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type = 'index'
  AND name = ?
`).all('idx_symbols_name');

// Example: Validate performance target
const start = performance.now();
const results = db.prepare(`
  SELECT * FROM symbols
  WHERE symbol_name = ?
  AND deleted_at IS NULL
`).all('myFunction');
const duration = performance.now() - start;
assert(duration < 50, 'Symbol lookup should be <50ms');
```

## Key Design Decisions

1. **Single-Writer Model**: Use `BEGIN IMMEDIATE` to enforce single-writer semantics
2. **WAL Mode**: Enable concurrent readers during writes
3. **Soft Deletes**: 30-day retention with `deleted_at` timestamp
4. **Partial Indexes**: Exclude soft-deleted records for better performance
5. **FTS5 with unicode61**: Code-aware tokenization with custom tokenchars
6. **BLOB Embeddings**: IEEE 754 float32 encoding for 384-dim vectors
7. **Brute-Force Similarity**: Application-level cosine similarity (sufficient for 100k chunks)

## Performance Targets

| Operation | Target | Dataset |
|-----------|--------|---------|
| File by path | <10ms | Any |
| Symbol by name | <50ms | 100k+ symbols |
| Symbol by file | <50ms | Any |
| Find usages | <100ms | Any |
| Full-text search | <100ms | 1GB codebase |
| Similarity search | <200ms | 100k embeddings |
| Batch insert | 1000 files in <10s | Any |
| Cleanup deleted | <1s per 10k records | Any |

## Schema Version

Current contract version: **1.0.0**

Schema version (database): **1** (initial schema)

## References

- Specification: `../spec.md`
- Research: `../research.md`
- Implementation Plan: `../plan.md`
- SQLite Documentation: https://www.sqlite.org/docs.html
- FTS5 Documentation: https://www.sqlite.org/fts5.html
- better-sqlite3 Documentation: https://github.com/WiseLibs/better-sqlite3
