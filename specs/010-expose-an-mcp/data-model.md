# Data Model: Code Intelligence Protocol Server

**Feature**: 010-expose-an-mcp
**Date**: 2025-10-19

This document defines the data entities, types, and schemas for the MCP server implementation.

---

## 1. Core Entities

### CodeAnchor

**Purpose**: Represents a precise location in source code

**Fields**:
- `file`: Absolute file path
- `line`: Line number (1-based for display)
- `column`: Optional column number (1-based for display)

**Validation**:
- `file` must be non-empty string
- `line` must be positive integer >= 1
- `column` (if present) must be non-negative integer >= 0

**TypeScript Definition**:
```typescript
interface CodeAnchor {
  file: string;
  line: number;
  column?: number;
}
```

**Zod Schema**:
```typescript
import { z } from 'zod';

const CodeAnchorSchema = z.object({
  file: z.string().min(1).describe("Absolute file path"),
  line: z.number().int().positive().describe("Line number (1-based)"),
  column: z.number().int().nonnegative().optional().describe("Column number (1-based)")
});
```

---

### CodePreview

**Purpose**: Provides context around a code location with surrounding lines

**Fields**:
- `lines`: Array of code lines (max 10)
- `startLine`: Line number of first line in preview (1-based)

**Validation**:
- `lines` array must have 1-10 elements
- Each line must be string (can be empty)
- `startLine` must be positive integer >= 1

**TypeScript Definition**:
```typescript
interface CodePreview {
  lines: string[];
  startLine: number;
}
```

**Zod Schema**:
```typescript
const CodePreviewSchema = z.object({
  lines: z.array(z.string()).min(1).max(10).describe("Preview lines (max 10)"),
  startLine: z.number().int().positive().describe("First line number in preview (1-based)")
});
```

---

### SearchResult

**Purpose**: Represents a single search match with location and preview

**Fields**:
- `anchor`: Code location where match was found
- `preview`: Code snippet showing match in context
- `score`: Optional relevance score (0.0 to 1.0)

**Validation**:
- `anchor` must be valid CodeAnchor
- `preview` must be valid CodePreview
- `score` (if present) must be between 0.0 and 1.0

**TypeScript Definition**:
```typescript
interface SearchResult {
  anchor: CodeAnchor;
  preview: CodePreview;
  score?: number;
}
```

**Zod Schema**:
```typescript
const SearchResultSchema = z.object({
  anchor: CodeAnchorSchema,
  preview: CodePreviewSchema,
  score: z.number().min(0).max(1).optional().describe("Relevance score (0-1)")
});
```

---

### SymbolDefinition

**Purpose**: Represents a symbol definition location with metadata

**Fields**:
- `symbol`: Symbol name
- `kind`: Symbol type (function, class, interface, variable, etc.)
- `anchor`: Location where symbol is defined
- `preview`: Code showing the definition
- `containerName`: Optional parent symbol name (class/namespace containing this symbol)

**Validation**:
- `symbol` must be non-empty string
- `kind` must be one of predefined symbol kinds
- `anchor` must be valid CodeAnchor
- `preview` must be valid CodePreview

**TypeScript Definition**:
```typescript
type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'constant'
  | 'method'
  | 'property'
  | 'enum'
  | 'namespace';

interface SymbolDefinition {
  symbol: string;
  kind: SymbolKind;
  anchor: CodeAnchor;
  preview: CodePreview;
  containerName?: string;
}
```

**Zod Schema**:
```typescript
const SymbolKindSchema = z.enum([
  'function',
  'class',
  'interface',
  'type',
  'variable',
  'constant',
  'method',
  'property',
  'enum',
  'namespace'
]);

const SymbolDefinitionSchema = z.object({
  symbol: z.string().min(1).describe("Symbol name"),
  kind: SymbolKindSchema.describe("Symbol type"),
  anchor: CodeAnchorSchema,
  preview: CodePreviewSchema,
  containerName: z.string().optional().describe("Parent symbol name (e.g., containing class)")
});
```

---

### SymbolReference

**Purpose**: Represents a location where a symbol is used/referenced

**Fields**:
- `symbol`: Symbol name being referenced
- `anchor`: Location of the reference
- `preview`: Code showing the reference in context
- `isWrite`: Whether this is a write/assignment (vs read/usage)

**TypeScript Definition**:
```typescript
interface SymbolReference {
  symbol: string;
  anchor: CodeAnchor;
  preview: CodePreview;
  isWrite: boolean;
}
```

**Zod Schema**:
```typescript
const SymbolReferenceSchema = z.object({
  symbol: z.string().min(1),
  anchor: CodeAnchorSchema,
  preview: CodePreviewSchema,
  isWrite: z.boolean().describe("True if this is a write/assignment, false for read/usage")
});
```

---

### CallRelationship

**Purpose**: Represents a caller/callee relationship between functions

**Fields**:
- `caller`: Function making the call
- `callee`: Function being called
- `anchor`: Location of the call site
- `preview`: Code showing the call

**TypeScript Definition**:
```typescript
interface CallRelationship {
  caller: string;
  callee: string;
  anchor: CodeAnchor;
  preview: CodePreview;
}
```

**Zod Schema**:
```typescript
const CallRelationshipSchema = z.object({
  caller: z.string().min(1).describe("Function making the call"),
  callee: z.string().min(1).describe("Function being called"),
  anchor: CodeAnchorSchema,
  preview: CodePreviewSchema
});
```

---

## 2. Tool Input/Output Schemas

### Search Tool

**Input**:
```typescript
const SearchInputSchema = z.object({
  query: z.string().min(1).describe("Search query for code"),
  directory: z.string().optional().describe("Directory filter (relative to project root)"),
  language: z.string().optional().describe("Programming language filter (e.g., 'typescript', 'python')"),
  limit: z.number().int().min(1).max(100).default(10).describe("Maximum results (1-100)")
});

type SearchInput = z.infer<typeof SearchInputSchema>;
```

**Output**:
```typescript
const SearchOutputSchema = z.object({
  query: z.string(),
  total: z.number().int().nonnegative().describe("Total matches found"),
  returned: z.number().int().nonnegative().describe("Number of results returned"),
  results: z.array(SearchResultSchema)
});

type SearchOutput = z.infer<typeof SearchOutputSchema>;
```

---

### Find Definition Tool

**Input**:
```typescript
const FindDefinitionInputSchema = z.object({
  symbol: z.string().min(1).describe("Symbol name to find definition for")
});

type FindDefinitionInput = z.infer<typeof FindDefinitionInputSchema>;
```

**Output**:
```typescript
const FindDefinitionOutputSchema = z.object({
  symbol: z.string(),
  found: z.boolean(),
  definition: SymbolDefinitionSchema.optional()
});

type FindDefinitionOutput = z.infer<typeof FindDefinitionOutputSchema>;
```

---

### Find References Tool

**Input**:
```typescript
const FindReferencesInputSchema = z.object({
  symbol: z.string().min(1).describe("Symbol name to find references for")
});

type FindReferencesInput = z.infer<typeof FindReferencesInputSchema>;
```

**Output**:
```typescript
const FindReferencesOutputSchema = z.object({
  symbol: z.string(),
  total: z.number().int().nonnegative(),
  references: z.array(SymbolReferenceSchema)
});

type FindReferencesOutput = z.infer<typeof FindReferencesOutputSchema>;
```

---

### Callers Tool

**Input**:
```typescript
const CallersInputSchema = z.object({
  symbol: z.string().min(1).describe("Function name to find callers of")
});

type CallersInput = z.infer<typeof CallersInputSchema>;
```

**Output**:
```typescript
const CallersOutputSchema = z.object({
  symbol: z.string(),
  total: z.number().int().nonnegative(),
  callers: z.array(CallRelationshipSchema)
});

type CallersOutput = z.infer<typeof CallersOutputSchema>;
```

---

### Callees Tool

**Input**:
```typescript
const CalleesInputSchema = z.object({
  symbol: z.string().min(1).describe("Function name to find callees of")
});

type CalleesInput = z.infer<typeof CalleesInputSchema>;
```

**Output**:
```typescript
const CalleesOutputSchema = z.object({
  symbol: z.string(),
  total: z.number().int().nonnegative(),
  callees: z.array(CallRelationshipSchema)
});

type CalleesOutput = z.infer<typeof CalleesOutputSchema>;
```

---

### Open At Tool

**Input**:
```typescript
const OpenAtInputSchema = z.object({
  path: z.string().min(1).describe("File path (absolute or relative to project root)"),
  line: z.number().int().positive().describe("Line number (1-based)"),
  contextLines: z.number().int().min(0).max(50).default(10).describe("Number of context lines around target line")
});

type OpenAtInput = z.infer<typeof OpenAtInputSchema>;
```

**Output**:
```typescript
const OpenAtOutputSchema = z.object({
  anchor: CodeAnchorSchema,
  preview: CodePreviewSchema,
  exists: z.boolean()
});

type OpenAtOutput = z.infer<typeof OpenAtOutputSchema>;
```

---

### Refresh Tool

**Input**:
```typescript
const RefreshInputSchema = z.object({
  paths: z.array(z.string()).optional().describe("Specific paths to refresh (if omitted, refresh all)")
});

type RefreshInput = z.infer<typeof RefreshInputSchema>;
```

**Output**:
```typescript
const RefreshOutputSchema = z.object({
  refreshed: z.number().int().nonnegative().describe("Number of files refreshed"),
  duration: z.number().positive().describe("Duration in milliseconds"),
  errors: z.array(z.object({
    path: z.string(),
    error: z.string()
  }))
});

type RefreshOutput = z.infer<typeof RefreshOutputSchema>;
```

---

### Symbols Tool

**Input**:
```typescript
const SymbolsInputSchema = z.object({
  path: z.string().optional().describe("File path to list symbols from (if omitted, list all symbols)")
});

type SymbolsInput = z.infer<typeof SymbolsInputSchema>;
```

**Output**:
```typescript
const SymbolsOutputSchema = z.object({
  path: z.string().optional(),
  total: z.number().int().nonnegative(),
  symbols: z.array(SymbolDefinitionSchema)
});

type SymbolsOutput = z.infer<typeof SymbolsOutputSchema>;
```

---

## 3. MCP Protocol Types

### ToolResponse

**Purpose**: Standard MCP tool response format

**TypeScript Definition**:
```typescript
interface ToolResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}
```

### ToolDefinition

**Purpose**: MCP tool metadata for tool listing

**TypeScript Definition**:
```typescript
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}
```

---

## 4. Helper Types

### PreviewConfig

**Purpose**: Configuration for code preview extraction

**TypeScript Definition**:
```typescript
interface PreviewConfig {
  beforeLines: number;      // Lines before match (default: 3)
  afterLines: number;       // Lines after match (default: 6)
  maxLineLength: number;    // Truncate threshold (default: 150)
  highlightMatch: boolean;  // Whether to highlight match term (default: true)
}

const defaultPreviewConfig: PreviewConfig = {
  beforeLines: 3,
  afterLines: 6,
  maxLineLength: 150,
  highlightMatch: true
};
```

---

## 5. Database Schema Integration

The MCP server relies on the existing SQLite schema from the code-index database. Key tables:

### files

```sql
CREATE TABLE files (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  content TEXT,
  language TEXT,
  last_modified INTEGER
);

CREATE VIRTUAL TABLE files_fts USING fts5(
  path,
  content,
  content=files,
  content_rowid=id
);
```

### symbols

```sql
CREATE TABLE symbols (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  file_id INTEGER,
  line INTEGER,
  column INTEGER,
  container_name TEXT,
  FOREIGN KEY(file_id) REFERENCES files(id)
);

CREATE INDEX idx_symbols_name ON symbols(name);
CREATE INDEX idx_symbols_file ON symbols(file_id);
```

### call_graph

```sql
CREATE TABLE call_graph (
  id INTEGER PRIMARY KEY,
  caller_id INTEGER,
  callee_id INTEGER,
  file_id INTEGER,
  line INTEGER,
  FOREIGN KEY(caller_id) REFERENCES symbols(id),
  FOREIGN KEY(callee_id) REFERENCES symbols(id),
  FOREIGN KEY(file_id) REFERENCES files(id)
);

CREATE INDEX idx_call_graph_caller ON call_graph(caller_id);
CREATE INDEX idx_call_graph_callee ON call_graph(callee_id);
```

---

## 6. Type Exports

All types and schemas should be exported from a central module:

```typescript
// src/models/mcp-types.ts

export {
  // Core entities
  CodeAnchor,
  CodeAnchorSchema,
  CodePreview,
  CodePreviewSchema,
  SearchResult,
  SearchResultSchema,
  SymbolDefinition,
  SymbolDefinitionSchema,
  SymbolKind,
  SymbolKindSchema,
  SymbolReference,
  SymbolReferenceSchema,
  CallRelationship,
  CallRelationshipSchema,

  // Tool inputs
  SearchInput,
  SearchInputSchema,
  FindDefinitionInput,
  FindDefinitionInputSchema,
  FindReferencesInput,
  FindReferencesInputSchema,
  CallersInput,
  CallersInputSchema,
  CalleesInput,
  CalleesInputSchema,
  OpenAtInput,
  OpenAtInputSchema,
  RefreshInput,
  RefreshInputSchema,
  SymbolsInput,
  SymbolsInputSchema,

  // Tool outputs
  SearchOutput,
  SearchOutputSchema,
  FindDefinitionOutput,
  FindDefinitionOutputSchema,
  FindReferencesOutput,
  FindReferencesOutputSchema,
  CallersOutput,
  CallersOutputSchema,
  CalleesOutput,
  CalleesOutputSchema,
  OpenAtOutput,
  OpenAtOutputSchema,
  RefreshOutput,
  RefreshOutputSchema,
  SymbolsOutput,
  SymbolsOutputSchema,

  // MCP protocol types
  ToolResponse,
  ToolDefinition,

  // Helper types
  PreviewConfig,
  defaultPreviewConfig
};
```

---

## 7. Validation Strategy

All tool inputs MUST be validated using Zod schemas before processing:

```typescript
async function handleSearchTool(args: unknown): Promise<ToolResponse> {
  // Validate input
  const validated = SearchInputSchema.parse(args);

  // Process with type-safe parameters
  const results = await performSearch(validated);

  // Return validated output
  const output: SearchOutput = {
    query: validated.query,
    total: results.length,
    returned: Math.min(results.length, validated.limit),
    results: results.slice(0, validated.limit)
  };

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(output, null, 2)
    }]
  };
}
```

---

## Summary

This data model provides:
- **Type Safety**: Full TypeScript types with Zod runtime validation
- **MCP Compliance**: Proper tool input/output schemas
- **Consistency**: All responses include code anchors and previews
- **Extensibility**: Easy to add new tool types or fields
- **Database Integration**: Maps cleanly to existing SQLite schema
