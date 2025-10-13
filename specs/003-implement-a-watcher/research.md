# Technical Research: File Watcher and Git Hooks Implementation

**Branch**: `003-implement-a-watcher` | **Date**: 2025-10-12 | **Status**: Complete

This document contains technical research and decisions for implementing a file system watcher with incremental indexing for the code-index CLI tool.

---

## 1. File Watching Library Selection

### Decision: Use **chokidar** with aggressive ignore patterns

### Comparison Matrix

| Feature | chokidar | node:fs.watch | node-watch |
|---------|----------|---------------|------------|
| **Cross-platform** | ✅ Excellent (macOS, Linux, Windows) | ⚠️ Inconsistent behavior | ✅ Good |
| **Performance (10k files)** | ✅ Excellent | ⚠️ Variable | ✅ Good |
| **Performance (100k+ files)** | ❌ 1GB RAM, 50% CPU | ❌ Unreliable | ⚠️ Unknown |
| **Event reliability** | ✅ Normalized events | ❌ Platform-specific quirks | ✅ Simplified events |
| **Memory usage** | ⚠️ Scales with file count | ✅ Lower overhead | ✅ Minimal |
| **Symlink handling** | ✅ `followSymlinks` option | ⚠️ Manual handling | ⚠️ Limited docs |
| **Ignore patterns** | ✅ Built-in glob support | ❌ Manual filtering | ✅ RegExp/function |
| **Community/Maturity** | ✅ 30M+ repos, 34k stars | ✅ Native Node.js | ⚠️ 1.6k stars |
| **Dependencies** | ✅ Zero dependencies (v4+) | ✅ None (native) | ✅ Zero dependencies |
| **Weekly downloads** | ✅ 34M | N/A (native) | ⚠️ 580k |

### Rationale

**Why chokidar:**
1. **Cross-platform reliability**: Normalizes events across Linux (inotify), macOS (FSEvents), and Windows (ReadDirectoryChangesW)
2. **Mature ecosystem**: Used by Webpack, Vite, Parcel, and other major build tools
3. **Built-in ignore patterns**: Supports glob patterns out of the box
4. **Configurable symlink handling**: `followSymlinks: true/false` option
5. **Atomic write detection**: Handles editors that write files in chunks

**Why not node:fs.watch:**
- Platform-specific behavior inconsistencies (documented in Node.js official docs)
- Unreliable filename reporting on some platforms
- Requires manual event normalization
- No built-in ignore pattern support

**Why not node-watch:**
- Less battle-tested for large-scale projects
- Limited documentation on performance characteristics
- Smaller community and ecosystem

### Performance Considerations

**Known limitations with 100k+ files:**
- Chokidar exhibits memory issues beyond 100k files (1GB RAM constant usage)
- Our mitigation strategy:
  1. **Aggressive ignore patterns**: Default ignore for `node_modules/`, `dist/`, `build/`, `.git/`, `.codeindex/`
  2. **File extension filtering**: Only watch relevant code file extensions (`.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.go`, etc.)
  3. **Depth limiting**: Provide `maxDepth` option to limit recursive watching
  4. **Manual fallback**: Document polling mode for extremely large projects

**Configuration for optimal performance:**
```typescript
const watcher = chokidar.watch(projectRoot, {
  ignored: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/.codeindex/**',
    '**/*.log',
    '**/tmp/**',
    '**/.next/**',
    '**/.cache/**'
  ],
  persistent: true,
  ignoreInitial: false, // We need to track initial files
  followSymlinks: true, // Follow but track canonical paths
  awaitWriteFinish: {
    stabilityThreshold: 200, // Wait 200ms for file writes to complete
    pollInterval: 100
  },
  depth: undefined, // User-configurable
  usePolling: false, // Native events preferred
  interval: 100, // Polling interval (if enabled)
  binaryInterval: 300 // Binary file polling interval
});
```

### Symlink Handling Strategy

**Decision**: Follow symlinks but track canonical paths to prevent duplicate indexing

**Implementation approach:**
1. Set `followSymlinks: true` in chokidar options
2. Use `fs.realpath()` to resolve canonical paths before indexing
3. Store canonical paths in database to detect duplicates
4. Add symlink metadata to index entries for reference

```typescript
async function getCanonicalPath(filePath: string): Promise<string> {
  try {
    return await fs.promises.realpath(filePath);
  } catch (error) {
    // If symlink is broken, return original path
    return filePath;
  }
}

async function shouldIndexFile(filePath: string, db: Database): Promise<boolean> {
  const canonicalPath = await getCanonicalPath(filePath);

  // Check if canonical path already indexed
  const existing = db.query(
    'SELECT path FROM index_entries WHERE canonical_path = ?',
    [canonicalPath]
  ).get();

  return !existing;
}
```

---

## 2. Debouncing Strategy

### Decision: 500ms delay with intelligent batching and dependency-aware processing

### Debouncing Parameters

**Default delay**: 500ms
- Research shows 300-500ms is optimal for user-triggered events
- 500ms balances responsiveness with batching efficiency
- Configurable via settings for different use cases

**Delay recommendations by scenario:**
- **Development editing**: 500ms (default)
- **Build system integration**: 1000ms (more batching)
- **CI/CD environments**: 100ms (faster feedback)

### Batching Strategy

**Event accumulation:**
```typescript
interface FileChangeEvent {
  type: 'create' | 'modify' | 'delete' | 'rename';
  path: string;
  canonicalPath: string;
  timestamp: number;
}

class DebounceManager {
  private buffer: Map<string, FileChangeEvent> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private readonly delay: number = 500;

  addEvent(event: FileChangeEvent): void {
    // Use canonical path as key to deduplicate
    const key = event.canonicalPath;

    // If same file has multiple events, keep the latest
    const existing = this.buffer.get(key);
    if (existing) {
      // Coalesce events: multiple modifies → single modify
      // Delete after create → remove both (net zero)
      event.type = this.coalesceEventTypes(existing.type, event.type);
    }

    this.buffer.set(key, event);
    this.resetTimer();
  }

  private coalesceEventTypes(
    first: FileChangeEvent['type'],
    second: FileChangeEvent['type']
  ): FileChangeEvent['type'] {
    // create → modify = create
    if (first === 'create' && second === 'modify') return 'create';

    // create → delete = null (remove from buffer)
    if (first === 'create' && second === 'delete') return 'delete';

    // modify → modify = modify
    if (first === 'modify' && second === 'modify') return 'modify';

    // modify → delete = delete
    if (first === 'modify' && second === 'delete') return 'delete';

    return second;
  }

  private resetTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delay);
  }

  private async flush(): Promise<void> {
    const events = Array.from(this.buffer.values());
    this.buffer.clear();

    // Sort by dependency order before processing
    const sortedEvents = await this.sortByDependencyOrder(events);

    // Process in batches of 100
    const batches = this.chunkArray(sortedEvents, 100);
    for (const batch of batches) {
      await this.processBatch(batch);
    }
  }
}
```

### Handling Different Event Types in Same Batch

**Event prioritization:**
1. **Deletes first**: Remove entries before processing other changes
2. **Creates and modifies by dependency order**: Process dependencies before dependents
3. **Renames as delete + create**: Treat as two separate operations

**Rename handling:**
```typescript
// chokidar emits 'unlink' followed by 'add' for renames
// We detect renames by timing and store as atomic operation
private detectRename(unlinkPath: string, addPath: string, timeDiff: number): boolean {
  // If unlink followed by add within 100ms, likely a rename
  return timeDiff < 100;
}
```

### Dependency Order Processing

**Decision**: Parse imports/requires to build dependency graph

**Implementation approach:**
```typescript
interface DependencyGraph {
  nodes: Map<string, FileNode>;
  edges: Map<string, Set<string>>;
}

interface FileNode {
  path: string;
  imports: string[];
  level: number; // Topological depth
}

async function sortByDependencyOrder(events: FileChangeEvent[]): Promise<FileChangeEvent[]> {
  const graph = await buildDependencyGraph(events.map(e => e.path));
  const sorted = topologicalSort(graph);

  // Map sorted paths back to events
  const pathToEvent = new Map(events.map(e => [e.path, e]));
  return sorted.map(path => pathToEvent.get(path)!).filter(Boolean);
}

function topologicalSort(graph: DependencyGraph): string[] {
  // Kahn's algorithm for topological sort
  const inDegree = new Map<string, number>();
  const queue: string[] = [];
  const result: string[] = [];

  // Calculate in-degrees
  for (const [node, deps] of graph.edges) {
    if (!inDegree.has(node)) inDegree.set(node, 0);
    for (const dep of deps) {
      inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
    }
  }

  // Find nodes with no dependencies
  for (const node of graph.nodes.keys()) {
    if (!inDegree.get(node)) queue.push(node);
  }

  // Process queue
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    for (const dependent of graph.edges.get(node) || []) {
      const degree = inDegree.get(dependent)! - 1;
      inDegree.set(dependent, degree);
      if (degree === 0) queue.push(dependent);
    }
  }

  return result;
}
```

**Import parsing strategy:**
- Use lightweight regex for common patterns: `import .* from ['"](.*)['"]`, `require\(['"](.*)['"]`
- Don't parse full AST (too expensive for large projects)
- Cache dependency relationships between debounce cycles
- Invalidate cache when files are modified

---

## 3. Git Integration

### Decision: Use **simple-git** library with custom hook installation

### Library Selection: simple-git

**Why simple-git over alternatives:**
- **Simplicity**: Zero dependencies, straightforward API
- **Promise-based**: Modern async/await interface
- **Active maintenance**: Last published 4 months ago
- **Comprehensive API**: Supports diff, log, show, and all git operations
- **Type safety**: Full TypeScript definitions

**Alternatives considered:**
- **git-js/simple-git**: More popular (5846 dependent projects) but similar API
- **isomorphic-git**: Pure JavaScript implementation, but overkill for our needs
- **Direct shell execution**: Less portable and harder to test

### Reading Git Diffs Efficiently

**For --changed mode (last commit):**
```typescript
import simpleGit from 'simple-git';

async function getChangedFilesFromLastCommit(): Promise<ChangedFile[]> {
  const git = simpleGit();

  // Get last commit hash
  const log = await git.log({ maxCount: 1 });
  if (!log.latest) {
    throw new Error('No commit history found');
  }

  // Use diff --name-status for efficient file list with change types
  const diff = await git.diff([
    '--name-status',
    'HEAD~1',
    'HEAD'
  ]);

  return parseDiffOutput(diff);
}

interface ChangedFile {
  path: string;
  status: 'A' | 'M' | 'D' | 'R' | 'C'; // Added, Modified, Deleted, Renamed, Copied
  oldPath?: string; // For renames
}

function parseDiffOutput(diffOutput: string): ChangedFile[] {
  return diffOutput
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      const [status, ...paths] = line.split('\t');
      const path = paths[paths.length - 1]; // Last path is new path for renames

      return {
        path,
        status: status[0] as ChangedFile['status'],
        oldPath: status[0] === 'R' ? paths[0] : undefined
      };
    });
}
```

**For Git hook integration:**
```typescript
async function getChangedFilesFromGitOperation(
  operation: 'merge' | 'checkout' | 'rewrite',
  oldRef: string,
  newRef: string
): Promise<string[]> {
  const git = simpleGit();

  // Use diff --name-only for just file list (faster)
  const diff = await git.diff([
    '--name-only',
    oldRef,
    newRef
  ]);

  return diff.split('\n').filter(line => line.trim());
}
```

**Performance optimization:**
- Use `--name-only` when only paths are needed (no status)
- Use `--name-status` when change type matters
- Avoid full diff output unless content comparison is needed
- Use `--no-pager` flag to prevent interactive pager issues

### Installing Git Hooks Programmatically

**Decision**: Manual hook installation with validation, not package-based

**Why manual installation:**
- **User control**: Explicit opt-in for hook installation
- **No package conflicts**: Avoid conflicts with husky, lint-staged, etc.
- **Transparency**: Users see exactly what hooks are installed
- **Flexibility**: Easy to uninstall or modify

**Installation approach:**
```typescript
import * as fs from 'fs/promises';
import * as path from 'path';

interface HookConfig {
  name: 'post-merge' | 'post-checkout' | 'post-rewrite';
  script: string;
}

async function installGitHook(config: HookConfig): Promise<void> {
  const gitDir = await findGitDirectory();
  const hookPath = path.join(gitDir, 'hooks', config.name);

  // Check if hook already exists
  let existingContent = '';
  try {
    existingContent = await fs.readFile(hookPath, 'utf-8');
  } catch (error) {
    // Hook doesn't exist, that's fine
  }

  // Check if our hook is already installed
  const marker = '# code-index hook';
  if (existingContent.includes(marker)) {
    console.log(`Hook ${config.name} already installed`);
    return;
  }

  // Preserve existing hook content
  const hookScript = existingContent
    ? `${existingContent}\n\n${marker}\n${config.script}`
    : `#!/bin/sh\n\n${marker}\n${config.script}`;

  await fs.writeFile(hookPath, hookScript, { mode: 0o755 });
  console.log(`Installed ${config.name} hook`);
}

async function findGitDirectory(): Promise<string> {
  const git = simpleGit();
  const root = await git.revparse(['--git-dir']);
  return path.resolve(root.trim());
}
```

**Hook scripts:**
```bash
# post-merge hook
#!/bin/sh
# code-index hook
PREV_HEAD=$1
NEW_HEAD=$(git rev-parse HEAD)
code-index refresh --git-range "${PREV_HEAD}..${NEW_HEAD}" &

# post-checkout hook
#!/bin/sh
# code-index hook
PREV_HEAD=$1
NEW_HEAD=$2
BRANCH_CHECKOUT=$3

if [ "$BRANCH_CHECKOUT" = "1" ]; then
  code-index refresh --git-range "${PREV_HEAD}..${NEW_HEAD}" &
fi

# post-rewrite hook
#!/bin/sh
# code-index hook
OPERATION=$1
while read OLD_SHA NEW_SHA; do
  code-index refresh --git-range "${OLD_SHA}..${NEW_SHA}" &
done
```

### Making Hooks Optional and Non-Blocking

**1. Optional installation:**
```typescript
// CLI command: code-index hooks install [--hooks post-merge,post-checkout,post-rewrite]
async function installHooksCommand(options: { hooks?: string[] }): Promise<void> {
  const selectedHooks = options.hooks || ['post-merge', 'post-checkout', 'post-rewrite'];

  for (const hookName of selectedHooks) {
    try {
      await installGitHook(hookConfigs[hookName]);
    } catch (error) {
      console.warn(`Failed to install ${hookName} hook:`, error);
    }
  }
}
```

**2. Non-blocking execution:**
- Run indexer in background using `&` in shell script
- Set timeout for hook execution (5 seconds max)
- Exit with success code even if indexer fails
- Log errors to `.codeindex/logs/` instead of blocking git

```bash
# Non-blocking hook pattern
#!/bin/sh
# code-index hook
(
  code-index refresh --git-range "$1..$2" >> .codeindex/logs/git-hook.log 2>&1
) &
exit 0 # Always succeed
```

**3. Graceful failure:**
```typescript
async function refreshFromGitHook(oldRef: string, newRef: string): Promise<void> {
  try {
    const files = await getChangedFilesFromGitOperation('merge', oldRef, newRef);
    await indexFiles(files);
  } catch (error) {
    // Log error but don't throw
    await logError('git-hook', error);
    // Hook succeeds even if indexing fails
  }
}
```

### Handling Detached HEAD State

**Detection:**
```typescript
async function isDetachedHead(): Promise<boolean> {
  const git = simpleGit();
  const status = await git.status();
  return status.detached;
}

async function getCurrentRef(): Promise<string> {
  const git = simpleGit();
  if (await isDetachedHead()) {
    // Use commit SHA instead of branch name
    const log = await git.log({ maxCount: 1 });
    return log.latest?.hash || 'HEAD';
  }
  const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
  return branch.trim();
}
```

**Hook behavior in detached HEAD:**
- Hooks still execute normally
- Use commit SHAs instead of branch names for diff ranges
- Provide clear logging about detached HEAD state
- Don't prevent hook from running

---

## 4. Performance Optimization

### Handling Bursts of 1000+ Simultaneous Changes

**Scenario**: `npm install` or `git checkout` with large dependency changes

**Strategy**: Chunk processing with priority queue

```typescript
interface ProcessingQueue {
  high: FileChangeEvent[]; // User's source files
  medium: FileChangeEvent[]; // Configuration files
  low: FileChangeEvent[]; // Dependencies, build outputs
}

class BatchProcessor {
  private readonly MAX_BATCH_SIZE = 100;
  private readonly CONCURRENT_BATCHES = 2;

  async processBurst(events: FileChangeEvent[]): Promise<void> {
    // Prioritize user source files over dependencies
    const prioritized = this.prioritizeEvents(events);

    // Split into chunks
    const chunks = this.chunkArray(prioritized, this.MAX_BATCH_SIZE);

    // Process chunks with limited concurrency
    for (let i = 0; i < chunks.length; i += this.CONCURRENT_BATCHES) {
      const batch = chunks.slice(i, i + this.CONCURRENT_BATCHES);
      await Promise.all(batch.map(chunk => this.processChunk(chunk)));

      // Progress reporting
      console.log(`Processed ${Math.min(i + this.CONCURRENT_BATCHES, chunks.length)}/${chunks.length} batches`);
    }
  }

  private prioritizeEvents(events: FileChangeEvent[]): FileChangeEvent[] {
    const queue: ProcessingQueue = { high: [], medium: [], low: [] };

    for (const event of events) {
      if (event.path.includes('node_modules')) {
        queue.low.push(event);
      } else if (event.path.match(/\.(json|yaml|yml|config\.)$/)) {
        queue.medium.push(event);
      } else {
        queue.high.push(event);
      }
    }

    return [...queue.high, ...queue.medium, ...queue.low];
  }
}
```

**Backpressure mechanism:**
```typescript
class BackpressureManager {
  private queuedEvents = 0;
  private readonly MAX_QUEUED = 10000;

  async addEvent(event: FileChangeEvent): Promise<void> {
    // If queue is too large, pause watcher
    if (this.queuedEvents >= this.MAX_QUEUED) {
      await this.pauseWatcher();
      await this.drainQueue();
      await this.resumeWatcher();
    }

    this.queuedEvents++;
    await this.processEvent(event);
    this.queuedEvents--;
  }
}
```

### Memory-Efficient Watching of Large Projects

**Strategy**: Lazy watching with depth limits

```typescript
interface WatcherConfig {
  maxDepth?: number; // Limit recursion depth
  maxFiles?: number; // Limit total files watched
  sampleRate?: number; // Watch every Nth file in huge directories
}

class MemoryEfficientWatcher {
  async watch(config: WatcherConfig): Promise<void> {
    const watcher = chokidar.watch(projectRoot, {
      depth: config.maxDepth || undefined,

      // Use awaitWriteFinish to avoid partial reads
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      },

      // Aggressive ignore patterns
      ignored: this.getIgnorePatterns(),

      // Disable features we don't need
      usePolling: false,
      persistent: true,
      ignorePermissionErrors: true
    });

    // Monitor memory usage
    this.monitorMemory(watcher);
  }

  private monitorMemory(watcher: FSWatcher): void {
    setInterval(() => {
      const usage = process.memoryUsage();
      if (usage.heapUsed > 400 * 1024 * 1024) { // 400MB threshold
        console.warn('High memory usage detected, consider adding more ignore patterns');
      }
    }, 30000); // Check every 30 seconds
  }
}
```

**File extension filtering:**
```typescript
const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx',
  '.py', '.rb', '.java', '.go',
  '.c', '.cpp', '.h', '.hpp',
  '.rs', '.swift', '.kt',
  '.php', '.cs', '.scala'
]);

function shouldWatchFile(filePath: string): boolean {
  const ext = path.extname(filePath);
  return CODE_EXTENSIONS.has(ext);
}
```

### Batch Size Optimization

**Decision**: 100 files per batch (from spec)

**Rationale:**
- SQLite can handle bulk inserts efficiently
- Balance between throughput and memory usage
- Small enough to provide progress feedback
- Large enough to amortize transaction overhead

**SQLite batch optimization:**
```typescript
async function indexBatch(files: FileChangeEvent[]): Promise<void> {
  const db = getDatabase();

  // Use a single transaction for entire batch
  const transaction = db.transaction((files: FileChangeEvent[]) => {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO index_entries
      (path, canonical_path, content, indexed_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const file of files) {
      const content = fs.readFileSync(file.path, 'utf-8');
      insertStmt.run(
        file.path,
        file.canonicalPath,
        content,
        Date.now()
      );
    }
  });

  // Execute entire batch atomically
  transaction(files);
}
```

### Avoiding Duplicate Indexing of Symlinks

**Strategy**: Canonical path tracking (covered in section 1)

**Additional optimization:**
```typescript
class SymlinkCache {
  private cache = new Map<string, string>(); // path -> canonical path

  async getCanonicalPath(filePath: string): Promise<string> {
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)!;
    }

    const canonical = await fs.promises.realpath(filePath);
    this.cache.set(filePath, canonical);

    // LRU cache with max 10k entries
    if (this.cache.size > 10000) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    return canonical;
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }
}
```

---

## 5. Error Handling

### Exponential Backoff Implementation

**Decision**: 3 retries with exponential backoff (1s, 2s, 4s)

**Implementation:**
```typescript
interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffFactor: number;
}

class RetryManager {
  private readonly config: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 4000, // 4 seconds
    backoffFactor: 2
  };

  async retry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain error types
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        if (attempt < this.config.maxAttempts - 1) {
          const delay = Math.min(
            this.config.baseDelay * Math.pow(this.config.backoffFactor, attempt),
            this.config.maxDelay
          );

          console.warn(
            `${context} failed (attempt ${attempt + 1}/${this.config.maxAttempts}), ` +
            `retrying in ${delay}ms...`,
            error
          );

          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    console.error(
      `${context} failed after ${this.config.maxAttempts} attempts:`,
      lastError!
    );
    throw lastError!;
  }

  private isNonRetryableError(error: any): boolean {
    // Don't retry on certain error codes
    const nonRetryableCodes = [
      'ENOENT', // File not found
      'EISDIR', // Is a directory
      'ENOTDIR', // Not a directory
      'EINVAL' // Invalid argument
    ];

    return nonRetryableCodes.includes(error.code);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

**Usage:**
```typescript
const retryManager = new RetryManager();

async function indexFile(filePath: string): Promise<void> {
  await retryManager.retry(
    async () => {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      await saveToDatabase(filePath, content);
    },
    `Indexing ${filePath}`
  );
}
```

### Handling Permission Errors Gracefully

**Strategy**: Skip and log, don't fail entire batch

```typescript
async function indexBatchWithErrorHandling(files: FileChangeEvent[]): Promise<void> {
  const results = await Promise.allSettled(
    files.map(file => indexFileWithRetry(file))
  );

  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r, i) => ({ file: files[i], error: r.reason }));

  if (errors.length > 0) {
    console.warn(`Failed to index ${errors.length}/${files.length} files`);

    for (const { file, error } of errors) {
      if (error.code === 'EACCES') {
        console.warn(`Permission denied: ${file.path}`);
      } else if (error.code === 'EMFILE') {
        console.error('Too many open files, consider reducing batch size');
      } else {
        console.warn(`Error indexing ${file.path}:`, error);
      }
    }

    // Log errors to file for later analysis
    await logErrors(errors);
  }
}
```

**Permission error mitigation:**
```typescript
async function checkFileAccess(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function indexFileIfAccessible(filePath: string): Promise<void> {
  if (!(await checkFileAccess(filePath))) {
    console.warn(`Skipping inaccessible file: ${filePath}`);
    return;
  }

  await indexFile(filePath);
}
```

### Recovery from File System Errors

**Error categorization:**
```typescript
enum ErrorSeverity {
  Transient, // Retry with backoff
  Permanent, // Skip file and continue
  Fatal // Abort operation
}

function categorizeError(error: any): ErrorSeverity {
  // Transient errors - retry
  if (['EBUSY', 'EMFILE', 'ENFILE', 'EAGAIN'].includes(error.code)) {
    return ErrorSeverity.Transient;
  }

  // Permanent errors - skip
  if (['EACCES', 'EPERM', 'ENOENT', 'EISDIR'].includes(error.code)) {
    return ErrorSeverity.Permanent;
  }

  // Fatal errors - abort
  if (['ENOSPC', 'EROFS'].includes(error.code)) {
    return ErrorSeverity.Fatal;
  }

  // Unknown errors - treat as transient
  return ErrorSeverity.Transient;
}

async function handleError(error: any, context: string): Promise<void> {
  const severity = categorizeError(error);

  switch (severity) {
    case ErrorSeverity.Transient:
      // Will be retried by RetryManager
      throw error;

    case ErrorSeverity.Permanent:
      console.warn(`Skipping due to permanent error in ${context}:`, error.message);
      return; // Skip this file

    case ErrorSeverity.Fatal:
      console.error(`Fatal error in ${context}:`, error.message);
      throw new Error(`Fatal error: ${error.message}`);
  }
}
```

### Dealing with Network Drives and Slow Filesystems

**Strategy**: Polling mode with increased timeouts

```typescript
interface FileSystemConfig {
  isNetworkDrive: boolean;
  isSlowFilesystem: boolean;
}

async function detectFilesystemType(path: string): Promise<FileSystemConfig> {
  // Heuristic: Check if filesystem is slow by measuring read time
  const start = Date.now();
  try {
    await fs.promises.readFile(path, 'utf-8');
  } catch {
    // Ignore errors, we're just timing
  }
  const duration = Date.now() - start;

  return {
    isNetworkDrive: duration > 500, // Network drives typically slower
    isSlowFilesystem: duration > 200
  };
}

function getWatcherConfig(fsConfig: FileSystemConfig): any {
  if (fsConfig.isNetworkDrive || fsConfig.isSlowFilesystem) {
    return {
      usePolling: true, // Native events unreliable on network drives
      interval: 5000, // Poll every 5 seconds
      binaryInterval: 10000,
      awaitWriteFinish: {
        stabilityThreshold: 2000, // Wait longer for file stability
        pollInterval: 500
      }
    };
  }

  // Fast local filesystem
  return {
    usePolling: false,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100
    }
  };
}
```

**Timeout configuration:**
```typescript
async function indexFileWithTimeout(
  filePath: string,
  timeout: number = 30000 // 30 seconds
): Promise<void> {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Timeout')), timeout);
  });

  await Promise.race([
    indexFile(filePath),
    timeoutPromise
  ]);
}
```

---

## Summary of Key Decisions

### 1. File Watching Library
- **Choice**: chokidar with aggressive ignore patterns
- **Rationale**: Cross-platform reliability, mature ecosystem, built-in ignore support
- **Mitigation**: File extension filtering and depth limits for 100k+ file projects

### 2. Debouncing
- **Delay**: 500ms (configurable)
- **Batching**: Coalesce events, deduplicate by canonical path
- **Processing**: Dependency-aware ordering using topological sort
- **Batch size**: 100 files per batch

### 3. Git Integration
- **Library**: simple-git
- **Diff reading**: `git diff --name-status` for efficient file lists
- **Hooks**: Manual installation with non-blocking background execution
- **Detached HEAD**: Use commit SHAs instead of branch names

### 4. Performance
- **Burst handling**: Priority queue with chunked processing
- **Memory**: Monitoring + warnings at 400MB threshold
- **Symlinks**: Canonical path deduplication with LRU cache
- **Batch optimization**: Single transaction per batch

### 5. Error Handling
- **Retry**: Exponential backoff (1s, 2s, 4s) for 3 attempts
- **Permissions**: Skip and log, don't fail batch
- **Categorization**: Transient (retry), Permanent (skip), Fatal (abort)
- **Slow filesystems**: Polling mode with increased timeouts

---

## Dependencies to Add

```json
{
  "dependencies": {
    "chokidar": "^3.6.0",
    "simple-git": "^3.28.0"
  }
}
```

---

## References

1. [chokidar GitHub](https://github.com/paulmillr/chokidar) - File watching library
2. [simple-git NPM](https://www.npmjs.com/package/simple-git) - Git operations
3. [Node.js fs.watch documentation](https://nodejs.org/api/fs.html#fs_fs_watch_filename_options_listener) - Native file watching
4. [Git hooks documentation](https://git-scm.com/docs/githooks) - Git hook types and parameters
5. [Exponential backoff best practices](https://www.codewithyou.com/blog/how-to-implement-retry-with-exponential-backoff-in-nodejs)
6. [Topological sort for dependency resolution](https://en.wikipedia.org/wiki/Topological_sorting)
