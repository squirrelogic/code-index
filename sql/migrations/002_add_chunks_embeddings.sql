-- ============================================================================
-- Migration: Add Chunks and Embeddings Tables
-- Version: 002
-- Description: Add semantic code chunks with vector embeddings for AI-powered search
-- ============================================================================

-- ============================================================================
-- Chunks Table: Semantic code units for AI processing
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
-- Embeddings Table: Vector embeddings for semantic search
-- ============================================================================
CREATE TABLE embeddings (
    chunk_id TEXT PRIMARY KEY NOT NULL,
    embedding BLOB NOT NULL CHECK (length(embedding) = 1536),
    model TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);

-- Index on model for filtering by embedding version
CREATE INDEX idx_embeddings_model ON embeddings(model);
