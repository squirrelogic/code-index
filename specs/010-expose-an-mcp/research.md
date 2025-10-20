# Research: Code Intelligence Protocol Server Implementation

**Feature**: 010-expose-an-mcp
**Date**: 2025-10-19
**Status**: Complete

This document consolidates research findings for implementing an MCP (Model Context Protocol) server that exposes code-index capabilities via JSON-RPC 2.0 over stdio transport.

---

## 1. MCP SDK Implementation

### Decision: Use @modelcontextprotocol/sdk

**Rationale**: The official TypeScript SDK provides complete JSON-RPC 2.0 and MCP protocol support with minimal boilerplate, type safety, and battle-tested transport implementations.

**Installation**:
```bash
npm install @modelcontextprotocol/sdk zod
```

**Key Features**:
- `Server` class for MCP server implementation
- `StdioServerTransport` for stdio communication
- Built-in request/response correlation
- Schema validation with Zod integration
- Automatic JSON-RPC error handling

**Alternatives Considered**:
- Custom JSON-RPC implementation - Rejected: Reinvents wheel, more error-prone
- `@hediet/json-rpc` - Rejected: Not MCP-specific, less community support

### Server Initialization Pattern

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "code-index-mcp",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}  // Declares server provides executable tools
    }
  }
);

// Connect to stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Tool Registration Patterns

**Pattern 1: Using setRequestHandler (Traditional)**
```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search",
        description: "Search the codebase",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", minimum: 1, maximum: 100, default: 10 }
          },
          required: ["query"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "search":
      const results = await performSearch(args.query, args.limit);
      return {
        content: [{ type: "text", text: JSON.stringify(results) }]
      };
    default:
      throw new McpError(-32601, `Unknown tool: ${name}`);
  }
});
```

**Pattern 2: Using Zod Schemas (Recommended)**
```typescript
import { z } from "zod";

server.tool(
  "search",
  {
    query: z.string().describe("Search query for code"),
    directory: z.string().optional().describe("Directory to search in"),
    language: z.string().optional().describe("Programming language filter"),
    limit: z.number().min(1).max(100).default(10).describe("Maximum results")
  },
  async ({ query, directory, language, limit }) => {
    // TypeScript automatically infers parameter types from Zod schema
    const results = await performSearch(query, { directory, language, limit });

    return {
      content: [{
        type: "text",
        text: JSON.stringify(results, null, 2)
      }]
    };
  }
);
```

---

## 2. Stdio Transport Implementation

### Decision: Use StdioServerTransport from MCP SDK

**Rationale**: Handles message framing, parsing, and JSON-RPC protocol automatically. Eliminates need for custom readline/stream handling.

**Key Characteristics**:
- **Single Client**: Each server instance serves exactly one client via stdio
- **Concurrent Requests**: Client can make multiple concurrent requests, handled asynchronously
- **Bidirectional**: Server receives requests and can send notifications
- **Platform Agnostic**: Works identically on Windows, macOS, Linux

### Message Format

**Protocol**: JSON-RPC 2.0 via newline-delimited JSON (NDJSON)

**Request Example**:
```json
{"jsonrpc":"2.0","id":"req-123","method":"tools/call","params":{"name":"search","arguments":{"query":"database"}}}
```

**Success Response**:
```json
{"jsonrpc":"2.0","id":"req-123","result":{"content":[{"type":"text","text":"{\"results\":[...]}"}]}}
```

**Error Response**:
```json
{"jsonrpc":"2.0","id":"req-123","error":{"code":-32002,"message":"Index unavailable"}}
```

### Logging Strategy

**CRITICAL RULE**: Never write to stdout except JSON-RPC messages.

**Implementation**:
```typescript
// Redirect all logs to stderr
console.error("Server initialized"); // ✅ Correct

// NEVER use console.log in stdio mode:
console.log("Debug info"); // ❌ Breaks protocol

// File-based logging for production
import { createWriteStream } from 'fs';

const logStream = createWriteStream('.codeindex/logs/mcp-server.log', { flags: 'a' });
const log = (level: string, message: string) => {
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, message });
  logStream.write(entry + '\n');
  process.stderr.write(`[${level}] ${message}\n`);
};
```

### Graceful Shutdown

**Pattern**:
```typescript
const activeRequests = new Map<string, Promise<any>>();

async function shutdown() {
  console.error("Shutting down...");

  // Wait for active requests with timeout
  const timeout = new Promise(resolve => setTimeout(resolve, 10000));
  const allRequests = Promise.all(Array.from(activeRequests.values()));
  await Promise.race([allRequests, timeout]);

  // Close database
  db.close();

  // Flush logs
  logStream.end();

  process.exit(0);
}

process.stdin.on('end', shutdown);
process.stdin.on('close', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

### Concurrency Handling

For SQLite with better-sqlite3:
```typescript
import Database from "better-sqlite3";

const db = new Database('.codeindex/index.db', { readonly: true });
db.pragma('journal_mode = WAL'); // Enable Write-Ahead Logging for concurrency

// Multiple async handlers can read concurrently
server.tool("search", { query: z.string() }, async ({ query }) => {
  const results = db.prepare('SELECT * FROM files WHERE content MATCH ?').all(query);
  return { content: [{ type: "text", text: JSON.stringify(results) }] };
});

server.tool("find_def", { symbol: z.string() }, async ({ symbol }) => {
  const def = db.prepare('SELECT * FROM symbols WHERE name = ?').get(symbol);
  return { content: [{ type: "text", text: JSON.stringify(def) }] };
});
```

---

## 3. Authentication Implementation

### Decision: Environment Variable Token

**Rationale**: OAuth 2.1 is overkill for local stdio servers. Environment variable provides simple, secure auth for shared environments while remaining disabled by default.

**Implementation**:
```typescript
class AuthenticatedMCPServer {
  private authToken?: string;

  constructor() {
    this.authToken = process.env.CODE_INDEX_AUTH_TOKEN;
  }

  private checkAuth(request: any) {
    if (!this.authToken) return; // Auth disabled

    const clientToken = request.params._meta?.authToken;
    if (!clientToken || clientToken !== this.authToken) {
      throw new McpError(
        -32001,
        "Authentication failed: Invalid or missing token"
      );
    }
  }

  async handleToolCall(request: CallToolRequest) {
    this.checkAuth(request);
    // ... proceed with tool execution
  }
}
```

**Default Behavior**: Auth disabled (no CODE_INDEX_AUTH_TOKEN set)

**Alternatives Considered**:
- OAuth 2.1 - Rejected: Too complex for local stdio use case
- API key in .env file - Rejected: Environment variable is simpler and standard

---

## 4. Code Preview Formatting

### Decision: Tabular Format with Line Numbers

**Rationale**: Follows industry standards (ripgrep, fzf, bat) for familiarity and readability.

**Format Pattern**:
```
src/index.ts:42
  40 │   function getData() {
  41 │     try {
  42 :       const result = await fetch(url);
  43 │       return result.json();
  44 │     } catch (error) {
```

### Context Window

**Decision**: 3 lines before + match line + 6 lines after = 10 total

**Rationale**: Provides sufficient context while respecting 10-line limit. Asymmetric window (more after) shows function/block continuation.

**Implementation**:
```typescript
interface CodePreview {
  filePath: string;
  lineNumber: number;      // 1-based
  column?: number;         // 1-based
  matchedLine: string;
  beforeContext: string[]; // 3 lines
  afterContext: string[];  // 6 lines
}

function extractPreview(
  fileContent: string,
  matchLine: number,      // 0-based internally
  beforeLines: number = 3,
  afterLines: number = 6
): CodePreview {
  const lines = fileContent.split('\n');
  const startLine = Math.max(0, matchLine - beforeLines);
  const endLine = Math.min(lines.length - 1, matchLine + afterLines);

  return {
    filePath: '',
    lineNumber: matchLine + 1,
    matchedLine: lines[matchLine],
    beforeContext: lines.slice(startLine, matchLine),
    afterContext: lines.slice(matchLine + 1, endLine + 1)
  };
}
```

### Line Truncation

**Decision**: 150 characters max with smart truncation

**Implementation**:
```typescript
function truncateLine(
  line: string,
  matchPosition?: number,
  maxLength: number = 150
): string {
  if (line.length <= maxLength) return line;

  // Center on match if provided
  if (matchPosition !== undefined) {
    const halfWindow = Math.floor(maxLength / 2);
    let start = Math.max(0, matchPosition - halfWindow);
    let end = Math.min(line.length, start + maxLength);

    if (end === line.length && end - start < maxLength) {
      start = Math.max(0, end - maxLength);
    }

    let result = line.slice(start, end);
    if (start > 0) result = '…' + result.slice(1);
    if (end < line.length) result = result.slice(0, -1) + '…';

    return result;
  }

  return line.slice(0, maxLength - 1) + '…';
}
```

### File Anchors

**Decision**: `file:line:col` format for VSCode compatibility

**Rationale**: VSCode terminal auto-detects this format and makes it clickable.

**Implementation**:
```typescript
function generateAnchor(preview: CodePreview): string {
  return preview.column
    ? `${preview.filePath}:${preview.lineNumber}:${preview.column}`
    : `${preview.filePath}:${preview.lineNumber}`;
}
```

### Edge Cases

**Binary Files**:
```typescript
function isBinaryFile(content: Buffer): boolean {
  const checkLength = Math.min(8192, content.length);
  for (let i = 0; i < checkLength; i++) {
    if (content[i] === 0) return true; // NUL byte detection
  }
  return false;
}
```

**Special Characters**:
```typescript
function sanitizeForTerminal(line: string): string {
  return line
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
    .replace(/\t/g, '  '); // Replace tabs with spaces
}
```

---

## 5. Error Handling

### Decision: Standard JSON-RPC Error Codes + Custom Codes

**Error Code Mapping**:
- `-32700`: Parse error (invalid JSON)
- `-32600`: Invalid request (protocol violation)
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error
- **`-32001`**: Authentication failed (custom)
- **`-32002`**: Index unavailable/corrupted (custom)

**Implementation**:
```typescript
import { McpError } from "@modelcontextprotocol/sdk/types.js";

async function handleSearch(query: string) {
  try {
    // Check database availability
    if (!isDatabaseAvailable()) {
      throw new McpError(
        -32002,
        "Index unavailable: Database is corrupted or missing",
        { suggestion: "Run 'code-index doctor' to diagnose" }
      );
    }

    if (!query || query.trim().length === 0) {
      throw new McpError(-32602, "Query parameter cannot be empty");
    }

    const results = await db.search(query);
    return { content: [{ type: "text", text: JSON.stringify(results) }] };

  } catch (error) {
    if (error instanceof McpError) throw error;

    // Handle database-specific errors
    if (error.code === 'SQLITE_CORRUPT') {
      throw new McpError(-32002, "Database corruption detected");
    }

    throw new McpError(-32603, `Search failed: ${error.message}`);
  }
}
```

---

## 6. Performance Optimizations

### Database Configuration

**Decision**: WAL mode + readonly connections

```typescript
import Database from "better-sqlite3";

const db = new Database('.codeindex/index.db', { readonly: true });
db.pragma('journal_mode = WAL'); // Write-Ahead Logging
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64MB cache
```

**Rationale**: WAL mode allows concurrent reads without blocking. Readonly flag prevents accidental writes.

### Prepared Statements

**Decision**: Cache prepared statements for frequent queries

```typescript
class QueryCache {
  private cache = new Map<string, Database.Statement>();

  prepare(sql: string): Database.Statement {
    if (!this.cache.has(sql)) {
      this.cache.set(sql, db.prepare(sql));
    }
    return this.cache.get(sql)!;
  }
}

const queryCache = new QueryCache();

async function search(query: string, limit: number) {
  const stmt = queryCache.prepare('SELECT * FROM files WHERE content MATCH ? LIMIT ?');
  return stmt.all(query, limit);
}
```

### Result Limiting

**Decision**: Enforce limits at database level + application level

```typescript
const MAX_RESULTS = 100;
const MAX_PREVIEW_LINES = 10;

async function search(query: string, requestedLimit: number) {
  const limit = Math.min(requestedLimit, MAX_RESULTS);
  const results = db.prepare('SELECT * FROM files WHERE content MATCH ? LIMIT ?')
    .all(query, limit);

  return results.map(r => ({
    ...r,
    preview: extractPreview(r.content, r.lineNumber).slice(0, MAX_PREVIEW_LINES)
  }));
}
```

---

## 7. Testing Strategy

### Contract Tests

**Decision**: Verify MCP protocol compliance

```typescript
import { describe, it, expect } from 'vitest';

describe('MCP Protocol Compliance', () => {
  it('should respond to list_tools request', async () => {
    const response = await callMCPServer({ method: 'tools/list' });
    expect(response.tools).toBeInstanceOf(Array);
    expect(response.tools).toContainEqual(
      expect.objectContaining({
        name: 'search',
        description: expect.any(String),
        inputSchema: expect.any(Object)
      })
    );
  });

  it('should return valid JSON-RPC responses', async () => {
    const response = await callMCPServer({
      method: 'tools/call',
      params: { name: 'search', arguments: { query: 'test' } }
    });

    expect(response).toHaveProperty('jsonrpc', '2.0');
    expect(response).toHaveProperty('result');
  });
});
```

### Integration Tests

**Decision**: Test full server lifecycle

```typescript
describe('MCP Server Integration', () => {
  it('should start server and handle requests', async () => {
    const server = spawn('node', ['dist/cli/commands/serve.js']);

    // Send request via stdin
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'tools/call',
      params: { name: 'search', arguments: { query: 'database' } }
    }) + '\n');

    // Read response from stdout
    const response = await readLineFromStream(server.stdout);
    const result = JSON.parse(response);

    expect(result.result.content).toBeDefined();

    server.kill();
  });
});
```

---

## 8. Key Takeaways

### Architecture Decisions

| Component | Decision | Rationale |
|-----------|----------|-----------|
| SDK | @modelcontextprotocol/sdk | Official, type-safe, battle-tested |
| Transport | StdioServerTransport | Handles framing automatically |
| Schema Validation | Zod | Type inference + runtime validation |
| Database | better-sqlite3 (existing) | Sync API, WAL concurrency |
| Authentication | Environment variable | Simple, secure, disabled by default |
| Preview Format | Tabular with line numbers | Industry standard (ripgrep/fzf) |
| Error Codes | JSON-RPC + custom | Standard compliance + domain-specific |

### File Structure

```
src/
├── models/
│   └── mcp-types.ts          # MCP protocol types, CodeAnchor, CodePreview
├── services/
│   ├── mcp-server.ts         # Main server implementation
│   ├── preview-formatter.ts  # Code preview extraction and formatting
│   └── mcp-tools.ts          # Tool handler implementations
├── cli/commands/
│   └── serve.ts              # CLI command: code-index serve
└── lib/
    └── mcp-auth.ts           # Authentication middleware

tests/
├── contract/
│   └── mcp-protocol.test.ts  # MCP protocol compliance
├── integration/
│   └── mcp-server.test.ts    # Full server lifecycle tests
└── unit/
    ├── mcp-tools.test.ts     # Tool handler unit tests
    └── preview-formatter.test.ts
```

### Performance Targets

- Search: <500ms for <100k files (SC-002)
- Symbol navigation: <200ms (SC-003)
- Concurrent requests: 50+ handled asynchronously (SC-005)
- Index refresh: <10s incremental (SC-006)

### Next Steps

1. Implement data model (mcp-types.ts)
2. Create MCP server service (mcp-server.ts)
3. Implement 8 tool handlers
4. Add preview formatter
5. Create CLI serve command
6. Write contract tests
7. Integration testing with Claude Code
