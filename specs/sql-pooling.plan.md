# Plan: Integrate @matteo.collina/sqlite-pool for Bulletproof Concurrency

## Overview
Integrate the battle-tested `@matteo.collina/sqlite-pool` library to handle SQLite connection pooling, eliminating concurrency issues between indexer, embedder, and search operations.

## Phase 1: Research & Setup (15 min)

### 1. Install the library
```bash
npm install @matteo.collina/sqlite-pool
```

### 2. Research the API
- Check GitHub repo: https://github.com/mcollina/sqlite-pool
- Review example usage
- Understand configuration options
- Check if it supports better-sqlite3 (synchronous)

**Expected API (based on standard pools):**
```typescript
import createPool from '@matteo.collina/sqlite-pool';

const pool = createPool({
  path: '.codeindex/index.db',
  max: 10,        // max connections
  min: 1,         // min connections
  acquireTimeout: 5000,
  idleTimeout: 30000
});

// Async API
await pool.query('SELECT * FROM symbols');
await pool.run('INSERT INTO symbols ...');
```

## Phase 2: Create Pool Service Wrapper (30 min)

### File: `src/services/DatabasePool.ts` (NEW)

```typescript
import createPool from '@matteo.collina/sqlite-pool';
import { join } from 'path';

export class DatabasePool {
  private pool: any;
  private dbPath: string;

  constructor(projectRoot: string) {
    this.dbPath = join(projectRoot, '.codeindex', 'index.db');
  }

  async initialize(): Promise<void> {
    this.pool = createPool({
      path: this.dbPath,
      max: 10,           // Allow up to 10 concurrent readers
      min: 1,            // Keep 1 connection warm
      acquireTimeout: 5000,
      idleTimeout: 30000,
      // Enable WAL mode
      onConnect: (db) => {
        db.pragma('journal_mode = WAL');
        db.pragma('busy_timeout = 5000');
      }
    });
  }

  async query(sql: string, params?: any[]): Promise<any[]> {
    return this.pool.query(sql, params);
  }

  async run(sql: string, params?: any[]): Promise<void> {
    return this.pool.run(sql, params);
  }

  async transaction<T>(fn: (db: any) => T): Promise<T> {
    // Pool should provide transaction API
    return this.pool.transaction(fn);
  }

  async close(): Promise<void> {
    await this.pool.close();
  }

  // Fallback: get raw connection for complex operations
  async withConnection<T>(fn: (db: any) => Promise<T>): Promise<T> {
    const conn = await this.pool.acquire();
    try {
      return await fn(conn);
    } finally {
      await this.pool.release(conn);
    }
  }
}
```

## Phase 3: Update DatabaseService (20 min)

### File: `src/services/database.ts` (MODIFY)

Add pool as optional dependency:

```typescript
import { DatabasePool } from './DatabasePool.js';

export class DatabaseService {
  private db: Database.Database | null = null;
  private pool: DatabasePool | null = null;
  private usePool: boolean;

  constructor(projectRoot: string, usePool = true) {
    this.projectRoot = projectRoot;
    this.usePool = usePool;

    if (usePool) {
      this.pool = new DatabasePool(projectRoot);
    }
  }

  async open(): Promise<void> {
    if (this.usePool && this.pool) {
      await this.pool.initialize();
      console.log('Using connection pool');
    } else {
      // Existing direct connection logic
      this.db = Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('busy_timeout = 5000');
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
    } else if (this.db) {
      this.db.close();
    }
  }

  // Helper for pool-aware transactions
  async withTransaction<T>(fn: (db: any) => T): Promise<T> {
    if (this.pool) {
      return this.pool.transaction(fn);
    } else {
      return this.db!.transaction(fn)();
    }
  }
}
```

## Phase 4: Fix Indexer Transactions (15 min)

### File: `src/services/indexer.ts` (MODIFY processBatch)

Wrap entire batch in ONE transaction:

```typescript
private async processBatch(): Promise<void> {
  if (this.currentBatch.length === 0) return;

  try {
    // Wrap EVERYTHING in one transaction
    await this.database.withTransaction(async (db) => {
      // 1. Insert into code_entries (use db from transaction)
      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO code_entries (...)
        VALUES (...)
      `);

      for (const entry of this.currentBatch) {
        insertStmt.run(...);
      }

      // 2. Insert into files table
      const fileStmt = db.prepare(`
        INSERT OR REPLACE INTO files (...)
        VALUES (...)
      `);

      for (const entry of this.currentBatch) {
        fileStmt.run(...);

        // 3. Parse and persist symbols (still in same transaction)
        if (!entry.isBinary && this.shouldParseFile(entry.language)) {
          const parseResult = await parse(...);

          // Call symbol persistence with same db transaction
          this.symbolPersistence.persistSymbolsInTransaction(
            db,
            fileId,
            parseResult.symbols,
            parseResult.calls,
            parseResult.imports,
            parseResult.exports
          );
        }
      }
    });

    this.currentBatch = [];
  } catch (error) {
    this.stats.errors.push(`Error processing batch: ${error}`);
    this.currentBatch = [];
  }
}
```

## Phase 5: Update Symbol Persistence (10 min)

### File: `src/services/symbol-persistence.ts` (MODIFY)

Add method that accepts transaction db:

```typescript
persistSymbolsInTransaction(
  db: any,  // Transaction db from pool
  fileId: string,
  symbols: Symbol[],
  calls: FunctionCall[] = [],
  _imports: ImportStatement[] = [],
  _exports: ExportStatement[] = []
): PersistenceResult {
  // Same logic as before, but use provided db instead of this.db
  const symbolStmt = db.prepare(`INSERT INTO symbols ...`);
  // ... rest of logic
}
```

## Phase 6: Update Commands (15 min)

### Index Command

```typescript
// Make async
.action(async (options: IndexCommandOptions) => {
  const database = new DatabaseService(cwd, usePool: true);
  await database.open();  // Now async

  // ... rest of logic

  await database.close();  // Now async
});
```

### Embed Command

Already closes/reopens between cycles, just needs pool:

```typescript
const database = new DatabaseService(dbPath, usePool: true);
await database.open();
// ... use database
await database.close();
```

### Search Command

```typescript
const database = new DatabaseService(cwd, usePool: true);
await database.open();
// Read operations work concurrently
await database.close();
```

## Phase 7: Testing (20 min)

### Test 1: Concurrent Index + Embed
```bash
# Terminal 1
code-index embed --daemon

# Terminal 2
code-index index --force

# Terminal 3
code-index search "test"

# Should all work without corruption
```

### Test 2: Stress Test
```bash
# Run 3 indexers + 2 embedders simultaneously
for i in {1..3}; do code-index index --force & done
for i in {1..2}; do code-index embed & done
wait

# Verify no corruption
sqlite3 .codeindex/index.db "PRAGMA integrity_check;"
```

### Test 3: Pool Crash Recovery

If pool doesn't support fallback, add manual fallback:
```typescript
try {
  await this.pool.query(...);
} catch (error) {
  console.warn('Pool error, falling back to direct access');
  this.usePool = false;
  this.openDirect();
}
```

## Phase 8: Configuration (5 min)

### File: `.codeindex/config.json` (ADD)

```json
{
  "database": {
    "usePool": true,
    "poolConfig": {
      "max": 10,
      "min": 1,
      "acquireTimeout": 5000,
      "idleTimeout": 30000
    }
  }
}
```

## Implementation Order

1. ✅ Install library
2. ✅ Research API (check if async/sync, transaction support)
3. ✅ Create DatabasePool wrapper
4. ✅ Update DatabaseService to support pool
5. ✅ Fix indexer transactions
6. ✅ Update symbol persistence
7. ✅ Update all commands to async
8. ✅ Test concurrent operations
9. ✅ Document usage

## Expected Outcomes

**Before:**
- Database corruption with concurrent operations
- SQLITE_CORRUPT_VTAB errors
- Manual coordination needed

**After:**
- ✅ Concurrent index + embed works perfectly
- ✅ No corruption
- ✅ Automatic connection management
- ✅ Proper transaction boundaries
- ✅ Better performance (connection reuse)

## Rollback Plan

If the library doesn't work as expected:
1. Remove pool dependency
2. Fall back to Option C (simple fix: WAL + better transactions + retry logic)
3. Keep transaction improvements

## Timeline

- Research & Install: 15 min
- Implementation: 1 hour
- Testing: 20 min
- **Total: ~1.5 hours**

## Questions to Answer During Research

1. Does the pool support better-sqlite3 (synchronous)?
2. Does it have transaction API?
3. How does it handle write vs read connections?
4. Is it truly async or sync under the hood?
5. Any known issues or limitations?

## Alternative: Fallback Plan (Option C)

If the pool library doesn't work, implement simple fixes:

1. **Enable busy_timeout:**
   ```typescript
   db.pragma('busy_timeout = 5000');
   ```

2. **Fix transaction boundaries** - wrap entire batch in ONE transaction

3. **Add retry logic:**
   ```typescript
   async function withRetry<T>(fn: () => T, maxRetries = 5): Promise<T> {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return fn();
       } catch (error) {
         if (error.code === 'SQLITE_BUSY' && i < maxRetries - 1) {
           await sleep(Math.pow(2, i) * 10); // Exponential backoff
           continue;
         }
         throw error;
       }
     }
   }
   ```

4. **Close connections between daemon cycles** (already implemented)

This fallback requires ~1 hour and solves 90% of concurrency issues.
