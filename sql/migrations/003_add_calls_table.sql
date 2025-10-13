-- Migration 003: Add calls table for function call graph tracking
-- Description: Enable call graph analysis and dependency tracking for functions and methods
-- Applied: [timestamp will be set by migration runner]

-- ============================================================================
-- Calls Table: Track function/method call relationships
-- ============================================================================

CREATE TABLE IF NOT EXISTS calls (
    -- Primary key
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Relationship identifiers
    caller_symbol_id TEXT NOT NULL,
    callee_symbol_id TEXT NOT NULL,

    -- Call metadata
    call_type TEXT NOT NULL CHECK(call_type IN ('direct', 'indirect', 'dynamic', 'import')),
    context TEXT,  -- Surrounding code context (optional)
    line_number INTEGER,  -- Line where call occurs (optional)

    -- Timestamps
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),

    -- Foreign key constraints (CASCADE on delete)
    FOREIGN KEY (caller_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
    FOREIGN KEY (callee_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);

-- ============================================================================
-- Indexes for Call Graph Queries
-- ============================================================================

-- Index for finding all callees of a function (X calls Y)
-- Compound index on caller + callee for efficient lookups
CREATE INDEX idx_calls_caller ON calls(caller_symbol_id, callee_symbol_id);

-- Index for finding all callers of a function (reverse query: who calls Y?)
-- Essential for "find all references" and impact analysis
CREATE INDEX idx_calls_callee ON calls(callee_symbol_id);

-- ============================================================================
-- Validation & Statistics
-- ============================================================================

-- Verify table creation
SELECT 'calls table created' AS status;

-- Initialize statistics
ANALYZE calls;
