# Database Migrations

This directory contains versioned SQL migration files for the code-index database schema.

## Migration File Format

Migration files follow this naming convention:

```
{version}_{description}.sql
```

Examples:
- `001_initial_schema.sql` - Initial database schema
- `002_add_chunks_embeddings.sql` - Add chunks and embeddings tables
- `003_add_calls_table.sql` - Add function call tracking

**Version Format**: Zero-padded 3-digit numbers (`001`, `002`, `003`)

## Migration Workflow

### Applying Migrations

Migrations are applied automatically using the `MigrationRunner` class:

```typescript
import Database from 'better-sqlite3';
import { MigrationRunner } from './src/services/migration-runner.js';

const db = new Database('.codeindex/index.db');
const runner = new MigrationRunner(db, './sql/migrations');

// Apply all pending migrations
const applied = runner.applyMigrations();
console.log(`Applied ${applied} migration(s)`);
```

### Migration Execution Process

Each migration runs through these steps:

1. **Validation**: Check for duplicate versions, invalid formats, and gaps
2. **Transaction Start**: `BEGIN TRANSACTION`
3. **Execute Migration SQL**: Run the migration file content
4. **Update Schema Version**: Update `meta.schema_version`
5. **Record History**: Insert into `migration_history` table
6. **Transaction Commit**: `COMMIT`
7. **Post-Migration Operations**:
   - Run `ANALYZE` to update query optimizer statistics
   - Run `PRAGMA integrity_check` to verify database health

If any step fails, the transaction is rolled back automatically.

## Creating a New Migration

### 1. Create Migration File

Create a new file in `sql/migrations/` with the next sequential version:

```sql
-- ============================================================================
-- Migration: Add New Feature
-- Version: 003
-- Description: Add call tracking table for function dependencies
-- ============================================================================

CREATE TABLE calls (
    id TEXT PRIMARY KEY NOT NULL,
    caller_symbol_id TEXT NOT NULL,
    callee_symbol_id TEXT NOT NULL,
    call_type TEXT NOT NULL,
    context TEXT,
    line_number INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (caller_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
    FOREIGN KEY (callee_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);

CREATE INDEX idx_calls_caller ON calls(caller_symbol_id, callee_symbol_id);
CREATE INDEX idx_calls_callee ON calls(callee_symbol_id);
```

### 2. Test Migration Locally

Before committing, test the migration on a local database:

```bash
# Create test database
cp .codeindex/index.db .codeindex/index-test.db

# Run migration (in your CLI or test script)
# Migration runner will automatically detect and apply new migrations
```

### 3. Verify Integrity

After applying:

```sql
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```

Expected result: `ok` for both checks.

## Rollback Strategy

**Important**: SQLite does not support native migration rollback. Instead, use database backups.

### Before Migration: Create Backup

Always create a backup before applying migrations:

```typescript
import { backupManager } from './src/lib/backup-utils.js';

// Create backup
const backupPath = backupManager.createBackup('.codeindex/index.db');
console.log(`Backup created: ${backupPath}`);

// Now apply migrations safely
runner.applyMigrations();
```

### Rollback Procedure

If a migration causes issues:

#### Option 1: Restore from Backup (Recommended)

```typescript
import { backupManager } from './src/lib/backup-utils.js';

// List available backups
const backups = backupManager.listBackups('.codeindex/index.db');
console.log('Available backups:', backups);

// Restore from most recent backup
const latestBackup = backups[0];
backupManager.restore(latestBackup.path, '.codeindex/index.db');
```

#### Option 2: Manual Rollback (Advanced)

If you have a small, reversible change:

1. **Stop all database connections**
2. **Create a backup of current state** (safety measure)
3. **Manually reverse changes** using SQL:

```sql
-- Example: Rolling back table creation
DROP TABLE IF EXISTS new_table;
DROP INDEX IF EXISTS idx_new_table_field;

-- Update schema version (decrement)
UPDATE meta SET value = '001', updated_at = unixepoch()
WHERE key = 'schema_version';

-- Remove migration history record
DELETE FROM migration_history WHERE version = '002';
```

4. **Verify integrity**:

```sql
PRAGMA integrity_check;
```

#### Option 3: Forward Fix (Production)

In production, prefer a **forward fix** over rollback:

1. Create a new migration that fixes the issue
2. Apply the fix migration
3. Keep moving forward (avoid reverting)

**Example**: If migration 003 has a bug, create migration 004 to fix it.

### Backup Retention Policy

The `BackupManager` automatically maintains backups:

- **Default retention**: Last 10 backups
- **Automatic cleanup**: Old backups deleted after retention limit
- **Backup location**: `.codeindex/backups/`

Configure retention:

```typescript
const backupManager = new BackupManager({
  backupDir: '.codeindex/backups',
  keepLast: 20  // Keep last 20 backups
});
```

## Migration Best Practices

### 1. Keep Migrations Small and Focused

❌ **Bad**: Large migration with multiple unrelated changes
```sql
-- 003_big_update.sql
CREATE TABLE calls (...);
CREATE TABLE events (...);
ALTER TABLE symbols ADD COLUMN new_field TEXT;
DROP TABLE old_unused_table;
```

✅ **Good**: Separate migrations for each logical change
```sql
-- 003_add_calls_table.sql
CREATE TABLE calls (...);

-- 004_add_events_table.sql
CREATE TABLE events (...);

-- 005_add_symbol_field.sql
ALTER TABLE symbols ADD COLUMN new_field TEXT;
```

### 2. Test Migrations with Real Data

Don't just test with empty databases:

```bash
# Copy production-like data to test database
cp production-sample.db test.db

# Apply migration
# Verify data integrity and query performance
```

### 3. Add Indexes for Foreign Keys

SQLite does NOT automatically index foreign keys. Always add indexes:

```sql
-- Bad: No index on foreign key
CREATE TABLE xrefs (
    source_symbol_id TEXT NOT NULL,
    FOREIGN KEY (source_symbol_id) REFERENCES symbols(id)
);

-- Good: Index on foreign key
CREATE TABLE xrefs (
    source_symbol_id TEXT NOT NULL,
    FOREIGN KEY (source_symbol_id) REFERENCES symbols(id)
);
CREATE INDEX idx_xrefs_source ON xrefs(source_symbol_id);
```

### 4. Use Partial Indexes for Soft Deletes

Exclude soft-deleted records from indexes:

```sql
-- Slower: Index includes deleted records
CREATE INDEX idx_symbols_name ON symbols(symbol_name);

-- Faster: Partial index excludes deleted records
CREATE INDEX idx_symbols_name ON symbols(symbol_name)
WHERE deleted_at IS NULL;
```

### 5. Add CHECK Constraints for Data Integrity

```sql
CREATE TABLE symbols (
    line_start INTEGER NOT NULL CHECK (line_start >= 1),
    line_end INTEGER NOT NULL CHECK (line_end >= line_start),
    symbol_type TEXT NOT NULL CHECK (
        symbol_type IN ('function', 'class', 'variable', 'constant', 'type')
    )
);
```

### 6. Document Breaking Changes

If a migration changes the API or data format, document it:

```sql
-- ============================================================================
-- Migration: Rename column
-- Version: 005
-- Description: Rename 'content_hash' to 'checksum' for clarity
--
-- BREAKING CHANGE: Application code must update all references from
-- 'content_hash' to 'checksum'
-- ============================================================================
```

## Troubleshooting

### Migration Fails with "SQLITE_BUSY"

**Cause**: Another process has a lock on the database.

**Solution**:
1. Close all database connections
2. Check for stale WAL locks: `rm .codeindex/index.db-wal .codeindex/index.db-shm`
3. Retry migration

### Migration Fails with "table already exists"

**Cause**: Migration was partially applied before.

**Solution**:
1. Check `migration_history` table: `SELECT * FROM migration_history;`
2. Manually clean up: `DROP TABLE IF EXISTS problematic_table;`
3. Remove history record: `DELETE FROM migration_history WHERE version = 'XXX';`
4. Retry migration

### Integrity Check Fails

**Cause**: Database corruption or foreign key violations.

**Solution**:
1. Check foreign key violations: `PRAGMA foreign_key_check;`
2. Check detailed integrity: `PRAGMA integrity_check;`
3. If corrupted, restore from backup: `backupManager.restore()`

## Migration Logs

All migration operations are logged to:

- **General logs**: `.codeindex/logs/general.jsonl`
- **Error logs**: `.codeindex/logs/db-errors.jsonl`

View recent migrations:

```bash
# View last 10 lines of general log
tail -n 10 .codeindex/logs/general.jsonl | jq .

# Search for migration errors
grep '"type":"database_error"' .codeindex/logs/db-errors.jsonl | jq .
```

## Schema Version Tracking

Current schema version is stored in the `meta` table:

```sql
SELECT value FROM meta WHERE key = 'schema_version';
```

Migration history is tracked in the `migration_history` table:

```sql
SELECT * FROM migration_history ORDER BY applied_at DESC;
```

## Emergency Rollback Checklist

If you need to rollback immediately:

- [ ] Stop the application
- [ ] Close all database connections
- [ ] Create a backup of current state (safety measure)
- [ ] List available backups: `backupManager.listBackups()`
- [ ] Identify the backup to restore (before problematic migration)
- [ ] Restore database: `backupManager.restore(backupPath, dbPath)`
- [ ] Verify integrity: `PRAGMA integrity_check;`
- [ ] Restart application with restored database
- [ ] Document the issue for post-mortem

## Further Reading

- [SQLite Foreign Keys](https://www.sqlite.org/foreignkeys.html)
- [SQLite Indexes](https://www.sqlite.org/lang_createindex.html)
- [SQLite VACUUM](https://www.sqlite.org/lang_vacuum.html)
- [SQLite PRAGMA Statements](https://www.sqlite.org/pragma.html)
