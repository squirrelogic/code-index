-- Migration 004: Add embedding tables for pluggable embedding layer
-- Description: Enable vector embeddings for semantic code search with sqlite-vec extension
-- Applied: [timestamp will be set by migration runner]

-- ============================================================================
-- Extension Loading: sqlite-vec for vector similarity search
-- ============================================================================
-- Note: sqlite-vec extension will be loaded programmatically via TypeScript
-- See src/services/database.ts for runtime loading with sqliteVec.load(db)

-- ============================================================================
-- Model Configurations Table: Available embedding models
-- ============================================================================

CREATE TABLE IF NOT EXISTS model_configurations (
    -- Primary key
    id TEXT PRIMARY KEY,  -- e.g., "all-MiniLM-L6-v2"

    -- Model metadata
    name TEXT NOT NULL,  -- Display name: e.g., "Local: all-MiniLM-L6-v2"
    adapter_type TEXT NOT NULL CHECK(adapter_type IN ('onnx', 'openai', 'anthropic', 'custom')),
    dimensions INTEGER NOT NULL CHECK(dimensions > 0),
    version TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1)),

    -- Adapter configuration (JSON blob for adapter-specific settings)
    config_json TEXT,

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
);

-- Ensure only one default model
CREATE UNIQUE INDEX IF NOT EXISTS idx_model_configurations_default
ON model_configurations(is_default) WHERE is_default = 1;

-- Index for adapter type filtering
CREATE INDEX IF NOT EXISTS idx_model_configurations_adapter_type
ON model_configurations(adapter_type);

-- ============================================================================
-- Vector Embeddings Virtual Table: sqlite-vec storage
-- ============================================================================
-- Note: This table will be created programmatically after loading sqlite-vec extension
-- The schema is defined here for documentation purposes:
--
-- CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
--   embedding FLOAT[384],              -- Vector column (384 dimensions)
--   chunk_id TEXT PARTITION KEY,       -- Partition by chunk for faster lookup
--   model_id TEXT,                     -- Filterable metadata
--   +chunk_hash TEXT,                  -- Auxiliary column (non-filterable)
--   +created_at TEXT,                  -- Auxiliary column
--   +model_version TEXT                -- Auxiliary column
-- );
--
-- CREATE INDEX IF NOT EXISTS idx_vec_embeddings_chunk_id ON vec_embeddings(chunk_id);
-- CREATE INDEX IF NOT EXISTS idx_vec_embeddings_model_id ON vec_embeddings(model_id);

-- ============================================================================
-- Embedding Metadata Table: Processing information
-- ============================================================================

CREATE TABLE IF NOT EXISTS embedding_metadata (
    -- Primary key
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Relationships
    chunk_id TEXT NOT NULL,            -- Foreign key to chunks table
    embedding_rowid INTEGER NOT NULL,  -- Reference to vec_embeddings rowid

    -- Performance metrics
    processing_time_ms INTEGER,
    batch_id TEXT,

    -- Error tracking
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Foreign key constraints
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);

-- Index for chunk_id lookups
CREATE INDEX IF NOT EXISTS idx_embedding_metadata_chunk_id
ON embedding_metadata(chunk_id);

-- Index for batch_id analytics
CREATE INDEX IF NOT EXISTS idx_embedding_metadata_batch_id
ON embedding_metadata(batch_id);

-- ============================================================================
-- Embedding Operations Log: Audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS embedding_operations_log (
    -- Primary key
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Operation details
    operation TEXT NOT NULL CHECK(operation IN ('generate', 're-embed', 'delete', 'model-switch')),
    model_id TEXT NOT NULL,

    -- Statistics
    chunks_affected INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,

    -- Status
    success INTEGER NOT NULL CHECK(success IN (0, 1)),
    error_message TEXT,

    -- Timestamps
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);

-- Index for operation type analytics
CREATE INDEX IF NOT EXISTS idx_embedding_operations_log_operation
ON embedding_operations_log(operation);

-- Index for model_id tracking
CREATE INDEX IF NOT EXISTS idx_embedding_operations_log_model_id
ON embedding_operations_log(model_id);

-- ============================================================================
-- Schema Migrations Table: Track migration history
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    -- Primary key
    version INTEGER PRIMARY KEY,

    -- Migration details
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- Insert Default Model Configuration
-- ============================================================================

INSERT INTO model_configurations (
    id,
    name,
    adapter_type,
    dimensions,
    version,
    is_default,
    config_json
) VALUES (
    'all-MiniLM-L6-v2',
    'Local: all-MiniLM-L6-v2',
    'onnx',
    384,
    '1.0',
    1,
    '{"modelPath": ".codeindex/models/all-MiniLM-L6-v2.onnx", "threads": 4}'
);

-- ============================================================================
-- Validation & Statistics
-- ============================================================================

-- Verify table creation
SELECT 'model_configurations table created' AS status;
SELECT 'embedding_metadata table created' AS status;
SELECT 'embedding_operations_log table created' AS status;
SELECT 'schema_migrations table created' AS status;

-- Initialize statistics
ANALYZE model_configurations;
ANALYZE embedding_metadata;
ANALYZE embedding_operations_log;
ANALYZE schema_migrations;
