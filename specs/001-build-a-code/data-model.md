# Data Model: Code-Index CLI Tool

**Date**: 2025-01-12
**Feature**: Code-Index CLI Tool
**Branch**: `001-build-a-code`

## Overview

This document defines the data entities, their relationships, and validation rules for the code-index CLI tool.

## Core Entities

### 1. ProjectConfiguration

Represents the initialization settings and preferences for a code-indexed project.

```typescript
interface ProjectConfiguration {
  // Unique identifier
  id: string;                    // UUID v4

  // Project metadata
  projectRoot: string;            // Absolute path to project root
  name: string;                   // Project name (derived from package.json or directory name)
  version: string;                // Configuration version (semver)

  // Index settings
  indexVersion: number;           // Index schema version for migrations
  createdAt: Date;                // ISO 8601 timestamp
  lastIndexedAt: Date | null;     // ISO 8601 timestamp or null if never indexed
  lastRefreshedAt: Date | null;   // ISO 8601 timestamp or null if never refreshed

  // Preferences
  ignorePatterns: string[];       // Additional patterns beyond .gitignore
  includePatterns: string[];      // Explicit include patterns (overrides ignores)
  maxFileSize: number;            // Maximum file size in bytes (default: 10MB)
  followSymlinks: boolean;        // Whether to follow symbolic links (default: false)

  // Performance settings
  batchSize: number;              // Files to process per transaction (default: 100)
  concurrency: number;            // Parallel file readers (default: 4)
}
```

**Validation Rules**:
- `projectRoot` must be an existing directory
- `version` must follow semver format
- `maxFileSize` must be positive integer, max 100MB
- `batchSize` must be between 1 and 1000
- `concurrency` must be between 1 and 16

### 2. CodeIndexEntry

Represents an indexed file with metadata and content information.

```typescript
interface CodeIndexEntry {
  // Unique identifier
  id: string;                     // UUID v4

  // File information
  path: string;                   // Relative path from project root
  absolutePath: string;           // Absolute path for validation
  filename: string;               // Base filename
  extension: string;              // File extension (e.g., '.ts', '.js')

  // Content metadata
  contentHash: string;            // SHA-256 hash of file content
  size: number;                   // File size in bytes
  lineCount: number;              // Number of lines in file
  encoding: string;               // File encoding (default: 'utf8')

  // Language detection
  language: string | null;        // Detected programming language
  isText: boolean;                // Whether file is text (vs binary)
  isBinary: boolean;              // Whether file is binary

  // Timestamps
  fileModifiedAt: Date;           // File system modification time
  indexedAt: Date;                // When file was indexed

  // Search optimization
  content: string | null;         // Full text content (null for binary)
  tokens: string[];               // Tokenized content for search
  symbols: Symbol[];              // Extracted symbols (functions, classes, etc.)
}

interface Symbol {
  name: string;                   // Symbol name
  type: SymbolType;               // 'function' | 'class' | 'interface' | 'variable' | 'constant'
  line: number;                   // Line number where symbol is defined
  column: number;                 // Column number where symbol starts
}

enum SymbolType {
  FUNCTION = 'function',
  CLASS = 'class',
  INTERFACE = 'interface',
  VARIABLE = 'variable',
  CONSTANT = 'constant',
  METHOD = 'method',
  PROPERTY = 'property'
}
```

**Validation Rules**:
- `path` must not contain `..` (no directory traversal)
- `size` must be non-negative
- `lineCount` must be non-negative
- `contentHash` must be valid SHA-256 (64 hex characters)
- Binary files should have `content` as null
- `fileModifiedAt` must be a valid timestamp

### 3. SearchResult

Represents a search query result with relevance scoring.

```typescript
interface SearchResult {
  // Reference to indexed entry
  entryId: string;                // References CodeIndexEntry.id
  entry: CodeIndexEntry;          // Populated entry data

  // Search metadata
  query: string;                  // Original search query
  queryType: QueryType;           // Type of search performed

  // Match information
  matches: Match[];               // All matches in this file
  relevanceScore: number;         // Calculated relevance (0-100)

  // Context
  snippet: string;                // Preview snippet with highlighted matches
  lineNumbers: number[];          // Line numbers containing matches
}

interface Match {
  line: number;                   // Line number of match
  column: number;                 // Column where match starts
  length: number;                 // Length of matched text
  text: string;                   // Matched text
  context: string;                // Surrounding context (±2 lines)
}

enum QueryType {
  TEXT = 'text',                  // Plain text search
  REGEX = 'regex',                // Regular expression search
  SYMBOL = 'symbol',              // Symbol/identifier search
  FILE = 'file'                   // Filename search
}
```

**Validation Rules**:
- `relevanceScore` must be between 0 and 100
- `matches` array must not be empty for valid results
- `lineNumbers` must be positive integers
- `snippet` maximum length 500 characters

### 4. HealthCheckResult

Represents diagnostic information about system health.

```typescript
interface HealthCheckResult {
  // Check metadata
  timestamp: Date;                // When check was performed
  version: string;                // CLI version

  // Component status
  database: ComponentStatus;      // SQLite database status
  filesystem: ComponentStatus;    // File system access status
  configuration: ComponentStatus; // Configuration validity

  // Statistics
  stats: {
    totalFiles: number;           // Total indexed files
    totalSize: number;            // Total size of indexed files (bytes)
    lastIndexed: Date | null;     // Last indexing timestamp
    databaseSize: number;         // SQLite database file size
    indexVersion: number;         // Current index schema version
  };

  // Issues found
  issues: Issue[];               // List of detected issues
  suggestions: string[];         // Recommended fixes
}

interface ComponentStatus {
  name: string;                  // Component name
  status: 'healthy' | 'warning' | 'error';
  message: string;               // Status description
  details?: any;                 // Additional diagnostic data
}

interface Issue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  component: string;             // Which component has the issue
  description: string;           // What's wrong
  suggestion: string;            // How to fix it
}
```

**Validation Rules**:
- All numeric stats must be non-negative
- `status` must be one of the defined enum values
- `severity` must be one of the defined enum values

### 5. MCPConfiguration

Represents the .mcp.json configuration for Model Context Protocol.

```typescript
interface MCPConfiguration {
  mcpServers: {
    [serverName: string]: MCPServer;
  };
}

interface MCPServer {
  command: string;               // Command to execute
  args?: string[];               // Command arguments
  env?: Record<string, string>;  // Environment variables
}
```

**Validation Rules**:
- `command` must be a valid executable path or command
- Environment variable names must be valid identifiers

## Database Schema

### SQLite Tables

```sql
-- Project configuration (single row)
CREATE TABLE project_config (
  id TEXT PRIMARY KEY,
  project_root TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  index_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_indexed_at TEXT,
  last_refreshed_at TEXT,
  ignore_patterns TEXT,  -- JSON array
  include_patterns TEXT, -- JSON array
  max_file_size INTEGER DEFAULT 10485760,
  follow_symlinks INTEGER DEFAULT 0,
  batch_size INTEGER DEFAULT 100,
  concurrency INTEGER DEFAULT 4
);

-- Indexed files
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  absolute_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  extension TEXT,
  content_hash TEXT NOT NULL,
  size INTEGER NOT NULL,
  line_count INTEGER NOT NULL,
  encoding TEXT DEFAULT 'utf8',
  language TEXT,
  is_text INTEGER DEFAULT 1,
  is_binary INTEGER DEFAULT 0,
  file_modified_at TEXT NOT NULL,
  indexed_at TEXT NOT NULL,
  content TEXT,
  tokens TEXT,  -- JSON array
  symbols TEXT  -- JSON array
);

-- Indexes for performance
CREATE INDEX idx_files_path ON files(path);
CREATE INDEX idx_files_extension ON files(extension);
CREATE INDEX idx_files_language ON files(language);
CREATE INDEX idx_files_modified ON files(file_modified_at);
CREATE INDEX idx_files_hash ON files(content_hash);

-- Full-text search virtual table
CREATE VIRTUAL TABLE files_fts USING fts5(
  path,
  filename,
  content,
  tokenize='porter'
);

-- Trigger to keep FTS in sync
CREATE TRIGGER files_fts_insert AFTER INSERT ON files
BEGIN
  INSERT INTO files_fts(rowid, path, filename, content)
  VALUES (new.rowid, new.path, new.filename, new.content);
END;

CREATE TRIGGER files_fts_update AFTER UPDATE ON files
BEGIN
  UPDATE files_fts
  SET path = new.path,
      filename = new.filename,
      content = new.content
  WHERE rowid = new.rowid;
END;

CREATE TRIGGER files_fts_delete AFTER DELETE ON files
BEGIN
  DELETE FROM files_fts WHERE rowid = old.rowid;
END;
```

## State Transitions

### File Indexing States

```
┌─────────┐      ┌──────────┐      ┌─────────┐
│   New   │ ───> │ Indexing │ ───> │ Indexed │
└─────────┘      └──────────┘      └─────────┘
                       │                 │
                       ▼                 ▼
                  ┌─────────┐      ┌──────────┐
                  │  Error  │      │ Modified │
                  └─────────┘      └──────────┘
                                        │
                                        ▼
                                  ┌──────────┐
                                  │Refreshing│
                                  └──────────┘
```

### Project Lifecycle States

```
┌──────────────┐      ┌─────────────┐      ┌──────────┐
│Uninitialized│ ───> │ Initialized │ ───> │ Indexed  │
└──────────────┘      └─────────────┘      └──────────┘
                            │                     │
                            ▼                     ▼
                      ┌─────────────┐      ┌──────────┐
                      │   Corrupt   │      │ Outdated │
                      └─────────────┘      └──────────┘
```

## Relationships

1. **ProjectConfiguration** (1) ← → (N) **CodeIndexEntry**
   - One project has many indexed files

2. **CodeIndexEntry** (1) ← → (N) **SearchResult**
   - One file can appear in many search results

3. **CodeIndexEntry** (1) ← → (N) **Symbol**
   - One file contains many symbols

## Data Constraints

1. **Uniqueness Constraints**:
   - File paths must be unique within a project
   - Project configuration is singleton (one per database)

2. **Referential Integrity**:
   - Search results must reference existing index entries
   - Symbols must reference existing files

3. **Business Rules**:
   - Cannot index files larger than `maxFileSize`
   - Binary files should not have text content stored
   - Ignored files should never be indexed
   - File paths must be within project root

## Migration Strategy

The `index_version` field in ProjectConfiguration enables schema migrations:

1. Version 1: Initial schema (current)
2. Future versions will include migration scripts in `/migrations/` directory
3. Doctor command will detect and suggest migrations
4. Migrations will be automatic but reversible