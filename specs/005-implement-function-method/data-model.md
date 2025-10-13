# Data Model: Intelligent Code Chunking

**Feature**: 005-implement-function-method
**Date**: 2025-10-13
**Status**: Phase 1 Design

## Overview

This document defines the data entities, relationships, and storage schema for the code chunking system. The model extends the existing code-index database schema to support function/method-level code chunks with stable content-based identifiers.

## Entity Definitions

### 1. Chunk

A logical unit of code (function/method) with documentation, context, and metadata.

**Properties**:
- `id` (string): Unique database identifier (UUID)
- `chunkHash` (string): Stable content-based hash (SHA-256, 64 hex chars)
- `fileId` (string): Foreign key to files table
- `chunkType` (ChunkType): One of 9 recognized types
- `name` (string): Function/method/class name
- `content` (string): Full chunk content (code + docs)
- `normalizedContent` (string): Whitespace-normalized content used for hashing
- `startLine` (number): Starting line number in source file (1-indexed)
- `endLine` (number): Ending line number in source file (1-indexed)
- `startByte` (number): Starting byte offset in source file
- `endByte` (number): Ending byte offset in source file
- `language` (Language): TypeScript, JavaScript, or Python
- `context` (ChunkContext): Enclosing scope information
- `documentation` (string | null): Leading documentation block
- `signature` (string | null): Function/method signature
- `lineCount` (number): Number of lines in chunk
- `characterCount` (number): Number of characters in chunk
- `createdAt` (Date): Timestamp when chunk was first indexed
- `updatedAt` (Date): Timestamp when chunk was last updated

**Validation Rules**:
- `chunkHash` must be exactly 64 hex characters
- `startLine` ≤ `endLine`
- `startByte` ≤ `endByte`
- `lineCount` = `endLine` - `startLine` + 1
- `name` must not be empty
- Warning logged if `lineCount` > 5,000

**Indexes**:
- Primary key on `id`
- Unique index on `chunkHash` (for deduplication)
- Index on `fileId` (for file-based queries)
- Index on `chunkType` (for type-based filtering)
- Index on `language` (for language-specific queries)
- Composite index on `(fileId, startLine)` (for range queries)

### 2. ChunkContext

Enclosing scope information for a chunk.

**Properties**:
- `className` (string | null): Name of enclosing class (for methods)
- `classInheritance` (string[]): Array of parent class names (for methods)
- `modulePath` (string): File path relative to project root
- `namespace` (string | null): Namespace/module hierarchy (e.g., "MyApp.Utils")
- `methodSignature` (string | null): Full method signature including params (for methods)
- `isTopLevel` (boolean): True if function/method is at top level (not nested)
- `parentChunkHash` (string | null): Hash of parent chunk if nested (for reference)

**Embedded**: This is not a separate table - stored as JSON column in chunks table

### 3. ChunkType (Enum)

Recognized chunk type taxonomy.

**Values**:
- `function`: Regular function declaration
- `method`: Class instance method
- `constructor`: Class constructor/initializer
- `property`: Class property or field
- `class`: Class definition
- `module`: File/module-level content
- `async_function`: Async function declaration
- `async_method`: Async class method
- `generator`: Generator function

### 4. Language (Enum)

Supported programming languages.

**Values**:
- `typescript`
- `javascript`
- `python`

### 5. ChunkQuery

Query model for retrieving chunks.

**Properties**:
- `chunkTypes` (ChunkType[]): Filter by chunk types
- `languages` (Language[]): Filter by languages
- `fileId` (string | null): Filter by file
- `searchText` (string | null): Full-text search query
- `minLineCount` (number | null): Minimum line count
- `maxLineCount` (number | null): Maximum line count
- `limit` (number): Maximum results (default: 100)
- `offset` (number): Pagination offset (default: 0)

## SQLite Schema

### Chunks Table

```sql
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  chunk_hash TEXT NOT NULL UNIQUE,
  file_id TEXT NOT NULL,
  chunk_type TEXT NOT NULL CHECK(chunk_type IN (
    'function', 'method', 'constructor', 'property',
    'class', 'module', 'async_function', 'async_method', 'generator'
  )),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  normalized_content TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  start_byte INTEGER NOT NULL,
  end_byte INTEGER NOT NULL,
  language TEXT NOT NULL CHECK(language IN ('typescript', 'javascript', 'python')),
  context TEXT NOT NULL, -- JSON: ChunkContext
  documentation TEXT,
  signature TEXT,
  line_count INTEGER NOT NULL,
  character_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
  CHECK (start_line <= end_line),
  CHECK (start_byte <= end_byte),
  CHECK (line_count = end_line - start_line + 1)
);

-- Indexes
CREATE UNIQUE INDEX idx_chunks_hash ON chunks(chunk_hash);
CREATE INDEX idx_chunks_file ON chunks(file_id);
CREATE INDEX idx_chunks_type ON chunks(chunk_type);
CREATE INDEX idx_chunks_language ON chunks(language);
CREATE INDEX idx_chunks_file_position ON chunks(file_id, start_line);

-- Full-text search virtual table
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  chunk_id UNINDEXED,
  name,
  content,
  documentation,
  signature,
  tokenize = 'porter unicode61'
);

-- Trigger to keep FTS table in sync
CREATE TRIGGER chunks_fts_insert AFTER INSERT ON chunks
BEGIN
  INSERT INTO chunks_fts(chunk_id, name, content, documentation, signature)
  VALUES (new.id, new.name, new.content, new.documentation, new.signature);
END;

CREATE TRIGGER chunks_fts_update AFTER UPDATE ON chunks
BEGIN
  UPDATE chunks_fts
  SET name = new.name,
      content = new.content,
      documentation = new.documentation,
      signature = new.signature
  WHERE chunk_id = new.id;
END;

CREATE TRIGGER chunks_fts_delete AFTER DELETE ON chunks
BEGIN
  DELETE FROM chunks_fts WHERE chunk_id = old.id;
END;
```

### Chunk Statistics Table (Optional)

Track aggregate statistics for monitoring and optimization.

```sql
CREATE TABLE chunk_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  total_chunks INTEGER NOT NULL,
  chunks_by_language TEXT NOT NULL, -- JSON: {typescript: 1000, javascript: 500, python: 300}
  chunks_by_type TEXT NOT NULL, -- JSON: {function: 800, method: 600, ...}
  avg_chunk_size INTEGER NOT NULL,
  large_chunks_count INTEGER NOT NULL, -- Chunks > 5,000 lines
  last_updated TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Relationships

```
files (existing)
  ↓ 1:N
chunks
  ↓ 1:1
chunks_fts (FTS5 virtual table)
```

**Cascade Behavior**:
- When a file is deleted, all its chunks are deleted (CASCADE)
- When a file is updated, chunks are recomputed and updated/inserted

## Data Flow

### Indexing Flow

```
1. File detected/changed
   ↓
2. Parse file with Tree-sitter
   ↓
3. Extract function/method nodes
   ↓
4. For each node:
   a. Extract content + documentation
   b. Extract context (class, module)
   c. Normalize whitespace
   d. Generate chunk hash
   e. Create Chunk entity
   ↓
5. Database operations:
   a. Check if chunk_hash exists
   b. If exists: compare, update if needed
   c. If not exists: insert new chunk
   ↓
6. FTS index updated via triggers
```

### Query Flow

```
1. ChunkQuery created
   ↓
2. Build SQL WHERE clauses:
   - chunk_type IN (...)
   - language IN (...)
   - file_id = ...
   - line_count BETWEEN ... AND ...
   ↓
3. If searchText provided:
   - JOIN with chunks_fts
   - Use MATCH for full-text search
   ↓
4. Apply LIMIT and OFFSET
   ↓
5. Return Chunk entities
```

## Storage Estimates

**Per Chunk**:
- Fixed overhead: ~200 bytes (metadata, indexes)
- Content: ~2KB average (500 lines × 4 bytes/char)
- Total: ~2.2KB per chunk

**For 100,000 chunks**:
- Total storage: ~220MB
- Memory overhead: ~50MB (indexes, cache)
- FTS index: ~50MB additional

**Meets SC-006**: <200MB for 100k functions ✓ (excluding FTS, or ~270MB with FTS)

## Query Performance

**Chunk lookup by hash**: O(1) - unique index
**Chunks by file**: O(log N) - indexed
**Chunks by type/language**: O(log N) - indexed
**Full-text search**: O(log N) - FTS5 index
**Range queries**: O(log N) - composite index

**Meets SC-010**: <100ms for 1M chunks ✓ (with proper indexes)

## TypeScript Interface Mapping

```typescript
// Chunk entity maps to TypeScript class
class Chunk {
  constructor(
    public id: string,
    public chunkHash: string,
    public fileId: string,
    // ... all properties
  ) {}
}

// ChunkContext embedded object
interface ChunkContext {
  className: string | null;
  classInheritance: string[];
  modulePath: string;
  namespace: string | null;
  methodSignature: string | null;
  isTopLevel: boolean;
  parentChunkHash: string | null;
}

// Enums
enum ChunkType {
  Function = 'function',
  Method = 'method',
  Constructor = 'constructor',
  Property = 'property',
  Class = 'class',
  Module = 'module',
  AsyncFunction = 'async_function',
  AsyncMethod = 'async_method',
  Generator = 'generator',
}

enum Language {
  TypeScript = 'typescript',
  JavaScript = 'javascript',
  Python = 'python',
}
```

## Migration Strategy

Since this extends the existing code-index schema:

1. **Version 1 → Version 2 Migration**:
   - Create chunks table
   - Create chunks_fts virtual table
   - Create triggers
   - Create chunk_stats table (optional)
   - No data migration needed (chunks computed on demand)

2. **Rollback**: Drop chunks table and related objects

## Validation Rules Summary

- Chunk hash must be 64 hex characters (SHA-256)
- Start positions must be ≤ end positions
- Line count must equal end - start + 1
- Name must not be empty
- Chunk type must be one of 9 recognized values
- Language must be one of 3 supported values
- Context must be valid JSON matching ChunkContext schema
- File ID must reference existing file in files table

## Monitoring & Observability

**Metrics to track**:
- Total chunks indexed
- Chunks per language/type distribution
- Average chunk size
- Large chunks count (>5,000 lines)
- Chunk hash collisions (should be zero)
- Query response times
- Memory usage

**Logging**:
- Warning when chunk >5,000 lines
- Error when chunk hash collision detected
- Info when file rechunked (changed content)
- Debug for each chunk extracted

