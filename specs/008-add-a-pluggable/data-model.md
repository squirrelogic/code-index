# Data Model: Pluggable Embedding Layer

**Feature**: 008-add-a-pluggable
**Date**: 2025-10-14
**Status**: Design Phase

## Overview

This document defines the data model for the pluggable embedding layer, including entity definitions, SQLite schema with sqlite-vec extension, and relationship mappings.

---

## Entities

### 1. EmbeddingVector

Represents a generated embedding vector with associated metadata.

**Properties**:
- `id`: INTEGER PRIMARY KEY - Unique identifier
- `chunk_id`: TEXT NOT NULL - Reference to the code chunk (FK to chunks table)
- `vector`: FLOAT[384] - Embedding vector (384 dimensions for all-MiniLM-L6-v2)
- `model_id`: TEXT NOT NULL - Model identifier (e.g., "all-MiniLM-L6-v2")
- `model_version`: TEXT NOT NULL - Model version for tracking
- `dimensions`: INTEGER NOT NULL - Vector dimensions for validation
- `created_at`: TEXT NOT NULL - ISO 8601 timestamp
- `chunk_hash`: TEXT NOT NULL - Hash of chunk content for change detection

**Relationships**:
- Many-to-One with CodeChunk (via chunk_id)
- Many-to-One with ModelConfiguration (via model_id)

**Validation Rules**:
- Vector dimensions must match model's expected output (FR-013)
- chunk_id must reference existing chunk
- chunk_hash must be deterministic and stable

**State Transitions**:
- Created → Active (when successfully stored)
- Active → Stale (when chunk_hash changes)
- Stale → Deleted (when cleaned up per FR-014)

---

### 2. ModelConfiguration

Represents configuration for a specific embedding model.

**Properties**:
- `id`: TEXT PRIMARY KEY - Unique model identifier (e.g., "all-MiniLM-L6-v2")
- `name`: TEXT NOT NULL - Display name
- `adapter_type`: TEXT NOT NULL - Adapter type ("onnx", "openai", "anthropic", "custom")
- `dimensions`: INTEGER NOT NULL - Expected vector dimensions
- `version`: TEXT NOT NULL - Model version
- `is_default`: INTEGER NOT NULL DEFAULT 0 - Boolean flag for default model
- `config_json`: TEXT - JSON blob for adapter-specific configuration
- `created_at`: TEXT NOT NULL - ISO 8601 timestamp
- `last_used_at`: TEXT - Last usage timestamp

**Relationships**:
- One-to-Many with EmbeddingVector

**Validation Rules**:
- Only one model can have is_default = 1
- dimensions must be positive integer
- adapter_type must be one of: "onnx", "openai", "anthropic", "custom"

---

### 3. EmbeddingMetadata

Stores additional metadata about embedding generation for observability.

**Properties**:
- `id`: INTEGER PRIMARY KEY - Unique identifier
- `embedding_id`: INTEGER NOT NULL - Reference to EmbeddingVector
- `processing_time_ms`: INTEGER - Time taken to generate embedding
- `batch_id`: TEXT - Identifier for the batch this embedding was part of
- `error_count`: INTEGER DEFAULT 0 - Number of errors during generation
- `last_error`: TEXT - Last error message if any
- `retry_count`: INTEGER DEFAULT 0 - Number of retries attempted

**Relationships**:
- One-to-One with EmbeddingVector (via embedding_id)

---

### 4. CodeChunk (extends existing)

Reference to existing chunk entity from code indexing. This model defines the foreign key relationship.

**Key Properties** (relevant to embeddings):
- `id`: TEXT PRIMARY KEY - Unique chunk identifier
- `file_path`: TEXT NOT NULL - Relative file path
- `content_hash`: TEXT NOT NULL - Hash for change detection
- `content`: TEXT NOT NULL - Actual code content

**Extension for Embeddings**:
- No schema changes needed
- chunk_hash in EmbeddingVector tracks the hash at embedding time

---

## SQLite Schema

### Extension Setup

```sql
-- Load sqlite-vec extension
.load ./sqlite-vec

-- Verify extension loaded
SELECT vec_version();
```

### Table: embeddings

Stores embedding vectors using sqlite-vec virtual table.

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
  embedding FLOAT[384],              -- Vector column (384 dimensions)
  chunk_id TEXT PARTITION KEY,       -- Partition by chunk for faster lookup
  model_id TEXT,                     -- Filterable metadata
  +chunk_hash TEXT,                  -- Auxiliary column (non-filterable)
  +created_at TEXT,                  -- Auxiliary column
  +model_version TEXT                -- Auxiliary column
);

-- Index for chunk_id lookups
CREATE INDEX IF NOT EXISTS idx_vec_embeddings_chunk_id
ON vec_embeddings(chunk_id);

-- Index for model_id lookups
CREATE INDEX IF NOT EXISTS idx_vec_embeddings_model_id
ON vec_embeddings(model_id);
```

**Notes**:
- `PARTITION KEY` on chunk_id provides 3x faster queries when filtering by chunk
- Columns prefixed with `+` are auxiliary (stored but not filterable in WHERE clauses)
- Vector similarity searches use cosine distance

### Table: model_configurations

```sql
CREATE TABLE IF NOT EXISTS model_configurations (
  id TEXT PRIMARY KEY,               -- e.g., "all-MiniLM-L6-v2"
  name TEXT NOT NULL,                -- e.g., "Local: all-MiniLM-L6-v2"
  adapter_type TEXT NOT NULL CHECK(adapter_type IN ('onnx', 'openai', 'anthropic', 'custom')),
  dimensions INTEGER NOT NULL CHECK(dimensions > 0),
  version TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1)),
  config_json TEXT,                  -- JSON blob for adapter config
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

-- Ensure only one default model
CREATE UNIQUE INDEX IF NOT EXISTS idx_model_configurations_default
ON model_configurations(is_default) WHERE is_default = 1;

-- Index for adapter type filtering
CREATE INDEX IF NOT EXISTS idx_model_configurations_adapter_type
ON model_configurations(adapter_type);
```

### Table: embedding_metadata

```sql
CREATE TABLE IF NOT EXISTS embedding_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chunk_id TEXT NOT NULL,            -- Foreign key to chunks table
  embedding_rowid INTEGER NOT NULL,  -- Reference to vec_embeddings rowid
  processing_time_ms INTEGER,
  batch_id TEXT,
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);

-- Index for chunk_id lookups
CREATE INDEX IF NOT EXISTS idx_embedding_metadata_chunk_id
ON embedding_metadata(chunk_id);

-- Index for batch_id analytics
CREATE INDEX IF NOT EXISTS idx_embedding_metadata_batch_id
ON embedding_metadata(batch_id);
```

### Table: embedding_operations_log

Audit log for embedding operations (useful for debugging and analytics).

```sql
CREATE TABLE IF NOT EXISTS embedding_operations_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL CHECK(operation IN ('generate', 're-embed', 'delete', 'model-switch')),
  model_id TEXT NOT NULL,
  chunks_affected INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  success INTEGER NOT NULL CHECK(success IN (0, 1)),
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Index for operation type analytics
CREATE INDEX IF NOT EXISTS idx_embedding_operations_log_operation
ON embedding_operations_log(operation);

-- Index for model_id tracking
CREATE INDEX IF NOT EXISTS idx_embedding_operations_log_model_id
ON embedding_operations_log(model_id);
```

---

## Query Patterns

### 1. Insert Embedding Vector

```sql
-- Insert into vec_embeddings
INSERT INTO vec_embeddings (
  embedding,
  chunk_id,
  model_id,
  chunk_hash,
  created_at,
  model_version
)
VALUES (
  :vector,           -- Float32Array
  :chunk_id,
  :model_id,
  :chunk_hash,
  datetime('now'),
  :model_version
);

-- Get the rowid for metadata
SELECT last_insert_rowid() AS embedding_rowid;

-- Insert metadata
INSERT INTO embedding_metadata (
  chunk_id,
  embedding_rowid,
  processing_time_ms,
  batch_id
)
VALUES (:chunk_id, :embedding_rowid, :processing_time_ms, :batch_id);
```

### 2. Find Similar Code (Cosine Similarity)

```sql
-- Find top N similar chunks to a query vector
SELECT
  chunk_id,
  model_id,
  chunk_hash,
  vec_distance_cosine(embedding, :query_vector) AS distance,
  (1 - vec_distance_cosine(embedding, :query_vector)) AS similarity
FROM vec_embeddings
WHERE model_id = :model_id
ORDER BY distance ASC
LIMIT :top_k;
```

### 3. Check if Chunk Needs Re-embedding

```sql
-- Compare chunk_hash with current hash
SELECT
  ve.chunk_id,
  ve.chunk_hash AS embedded_hash,
  c.content_hash AS current_hash,
  CASE
    WHEN ve.chunk_hash != c.content_hash THEN 1
    ELSE 0
  END AS needs_reembedding
FROM vec_embeddings ve
INNER JOIN chunks c ON ve.chunk_id = c.id
WHERE ve.model_id = :model_id
  AND ve.chunk_hash != c.content_hash;
```

### 4. Delete Orphaned Embeddings (FR-014)

```sql
-- Find embeddings where chunk no longer exists
DELETE FROM vec_embeddings
WHERE chunk_id NOT IN (SELECT id FROM chunks);

-- Metadata cascades automatically due to ON DELETE CASCADE
```

### 5. Switch Models (FR-020)

```sql
-- Delete all embeddings for old model
DELETE FROM vec_embeddings
WHERE model_id = :old_model_id;

-- Metadata cleanup handled by triggers or manual cleanup
DELETE FROM embedding_metadata
WHERE chunk_id NOT IN (
  SELECT DISTINCT chunk_id FROM vec_embeddings
);
```

### 6. Get Embedding Statistics

```sql
-- Count embeddings by model
SELECT
  model_id,
  COUNT(*) as total_embeddings,
  AVG(processing_time_ms) as avg_processing_time_ms
FROM vec_embeddings ve
LEFT JOIN embedding_metadata em ON ve.chunk_id = em.chunk_id
GROUP BY model_id;
```

---

## Data Volume Estimates

### Scale Targets (from SC-010)

- **Codebases**: 100,000+ chunks
- **Vectors**: Up to 1 million embeddings
- **Models**: 1-5 configurations typically

### Storage Requirements

**Per Embedding**:
- Vector data: 384 dimensions × 4 bytes = 1,536 bytes
- Metadata: ~200 bytes (chunk_id, model_id, timestamps, etc.)
- **Total**: ~1,736 bytes per embedding

**For 100k chunks**:
- Vector data: ~146 MB
- Metadata: ~20 MB
- **Total**: ~166 MB

**For 1M vectors**:
- Vector data: ~1.46 GB
- Metadata: ~200 MB
- **Total**: ~1.66 GB

### Performance Characteristics

From research (research-sqlite-vec.md):
- **< 100k vectors**: < 75ms queries (excellent)
- **500k vectors**: ~190ms queries (acceptable)
- **1M vectors**: ~350ms queries (within SC-005 <100ms for <1M target - requires optimization)

**Optimization for 1M scale**:
- Use partition keys (chunk_id) for filtered queries
- Consider matryoshka embeddings (reduce dimensions)
- Implement binary quantization if needed

---

## Migrations and Versioning

### Migration Strategy

Each schema change requires a migration file:

```
migrations/
├── 001_initial_embeddings.sql
├── 002_add_metadata_table.sql
├── 003_add_operations_log.sql
└── ...
```

### Version Tracking

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Data Integrity Rules

### 1. Referential Integrity

- All chunk_ids in vec_embeddings MUST exist in chunks table
- All model_ids in vec_embeddings SHOULD exist in model_configurations
- All embedding_metadata entries MUST reference valid vec_embeddings rowid

### 2. Consistency Rules

- Vector dimensions MUST match model_configurations.dimensions
- Only ONE model can have is_default = 1
- chunk_hash MUST match chunks.content_hash at creation time

### 3. Cleanup Rules

- When a chunk is deleted, cascade delete its embeddings (FK constraint)
- When a model is switched, delete ALL embeddings for old model (FR-020)
- Periodically clean orphaned metadata entries

---

## Concurrency Considerations

### WAL Mode (Write-Ahead Logging)

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```

**Benefits**:
- Readers don't block writers
- Writers don't block readers
- Better concurrency for embedding operations

### Transaction Strategy

**Batch Inserts**:
```sql
BEGIN TRANSACTION;
-- Insert 100 embeddings
COMMIT;
```

**Performance**: 96,000+ inserts/second with transactions (from research)

---

## Security Considerations

### 1. SQL Injection Prevention

- Use prepared statements for ALL queries
- Never concatenate user input into SQL

### 2. Data Privacy

- Embeddings contain semantic information from code
- Store embeddings locally in `.codeindex/index.db`
- Never transmit embeddings to external services (unless using hosted adapter with explicit consent)

### 3. API Key Storage

- NEVER store API keys in database
- Use environment variables (FR-021)
- Reference model_configurations.config_json should NOT contain secrets

---

## Testing Data Model

### Test Fixtures

```typescript
// Test data for embeddings
const testEmbedding = {
  chunk_id: 'chunk-123',
  vector: new Float32Array(384).fill(0.5), // Normalized vector
  model_id: 'all-MiniLM-L6-v2',
  model_version: '1.0',
  dimensions: 384,
  chunk_hash: 'abc123hash'
};

const testModelConfig = {
  id: 'all-MiniLM-L6-v2',
  name: 'Local: all-MiniLM-L6-v2',
  adapter_type: 'onnx',
  dimensions: 384,
  version: '1.0',
  is_default: 1
};
```

### Schema Validation Tests

- Verify vec_embeddings virtual table creation
- Test PARTITION KEY performance improvement
- Validate foreign key constraints
- Test CASCADE deletion behavior

---

## Future Enhancements

### 1. Binary Quantization (Performance)

```sql
-- Future: Add binary quantized vectors for faster search
ALTER TABLE vec_embeddings ADD COLUMN embedding_binary BINARY[48];
```

**Benefits**: 32x storage reduction, 95% accuracy retention

### 2. Matryoshka Embeddings (Flexibility)

Store embeddings at multiple dimensions (384, 192, 96) for performance tuning.

### 3. Hybrid Search (Quality)

Combine FTS5 full-text search with vector similarity:

```sql
-- Future: Join with FTS5 results
SELECT DISTINCT ve.chunk_id
FROM vec_embeddings ve
INNER JOIN chunks_fts fts ON ve.chunk_id = fts.rowid
WHERE fts MATCH :keywords
ORDER BY vec_distance_cosine(ve.embedding, :query_vector)
LIMIT 10;
```

---

## References

- **sqlite-vec documentation**: https://github.com/asg017/sqlite-vec
- **Research**: `research-sqlite-vec.md` (comprehensive sqlite-vec analysis)
- **Spec**: `spec.md` (functional requirements FR-001 through FR-022)
- **Performance targets**: SC-001 through SC-010

---

## Document Metadata

- **Created**: 2025-10-14
- **Feature**: 008-add-a-pluggable
- **Phase**: Design (Phase 1)
- **Status**: Ready for Implementation
- **Next Steps**: Generate CLI contracts, implement schema in code
