# Quick Start: Code Intelligence Protocol Server

Get started with the Code Intelligence MCP server in minutes.

---

## What is the MCP Server?

The Code Intelligence MCP (Model Context Protocol) server exposes your code-index database through a standard protocol that AI assistants can use to understand and navigate your codebase. It provides 8 powerful tools for code search, symbol navigation, and call graph analysis.

---

## Prerequisites

Before using the MCP server, you must:

1. **Index your codebase** with code-index CLI:
   ```bash
   code-index init    # Initialize project
   code-index index   # Build search index
   ```

2. **Verify index exists**:
   ```bash
   code-index doctor  # Check system health
   ```

Your project should have a `.codeindex/index.db` file after indexing.

---

## Starting the Server

### Basic Usage

Start the MCP server in your project directory:

```bash
code-index serve
```

The server will:
- ✅ Start on stdio (standard input/output)
- ✅ Connect to `.codeindex/index.db`
- ✅ Accept tool requests via JSON-RPC 2.0
- ✅ Log diagnostic output to stderr and `.codeindex/logs/mcp-server.log`

### With Authentication (Optional)

Enable authentication for shared environments:

```bash
export CODE_INDEX_AUTH_TOKEN="your-secret-token"
code-index serve
```

Clients must provide this token to access the server. Authentication is **disabled by default**.

---

## Using with AI Assistants

### Claude Code Integration

1. **Install code-index** globally or in your project:
   ```bash
   npm install -g @squirrelogic/code-index
   ```

2. **Start the server** in your project:
   ```bash
   cd /path/to/your/project
   code-index serve
   ```

3. **Configure MCP in Claude Code** (`.mcp.json` at project root):
   ```json
   {
     "mcpServers": {
       "code-index": {
         "command": "code-index",
         "args": ["serve"],
         "env": {
           "CODE_INDEX_DB": ".codeindex/index.db"
         }
       }
     }
   }
   ```

4. **Use from Claude Code tool picker**:
   - Open Claude Code
   - Type `/` to see available tools
   - Use tools like `search`, `find_def`, `find_refs`, etc.

### Other AI Assistants

Any MCP-compatible client can connect. The server uses stdio transport with JSON-RPC 2.0 protocol.

---

## Available Tools

### 1. search - Search Codebase

Find code matching a query:

```typescript
// Example tool call
{
  "query": "database connection",
  "directory": "src/services",
  "language": "typescript",
  "limit": 10
}
```

**Returns**: List of search results with file locations and code previews

### 2. find_def - Find Symbol Definition

Locate where a symbol (function, class, variable) is defined:

```typescript
{
  "symbol": "ApiClient"
}
```

**Returns**: Definition location with code preview

### 3. find_refs - Find Symbol References

Find all places a symbol is used:

```typescript
{
  "symbol": "fetchData"
}
```

**Returns**: List of reference locations with context

### 4. callers - Find Function Callers

See what functions call a given function:

```typescript
{
  "symbol": "processRequest"
}
```

**Returns**: List of caller locations

### 5. callees - Find Function Callees

See what functions are called by a given function:

```typescript
{
  "symbol": "handleRequest"
}
```

**Returns**: List of callee locations

### 6. open_at - Open File at Location

View code at a specific location:

```typescript
{
  "path": "src/index.ts",
  "line": 42,
  "contextLines": 10
}
```

**Returns**: Code preview at the specified location

### 7. refresh - Update Index

Refresh the search index for changed files:

```typescript
{
  "paths": ["src/api", "src/services/database.ts"]
}
```

Omit `paths` to refresh the entire codebase.

**Returns**: Number of files refreshed, duration, errors

### 8. symbols - List Symbols

List all symbols in a file or codebase:

```typescript
{
  "path": "src/api/client.ts"
}
```

Omit `path` to list all symbols across the codebase.

**Returns**: List of symbol definitions

---

## Understanding Tool Responses

All tool responses follow this format:

```typescript
{
  "content": [
    {
      "type": "text",
      "text": "{...JSON result...}"
    }
  ]
}
```

The `text` field contains a JSON string with the actual result.

### Example: Search Response

```json
{
  "query": "database connection",
  "total": 15,
  "returned": 10,
  "results": [
    {
      "anchor": {
        "file": "/project/src/services/db.ts",
        "line": 10,
        "column": 15
      },
      "preview": {
        "startLine": 8,
        "lines": [
          "import { Pool } from 'pg';",
          "",
          "export function createDatabaseConnection() {",
          "  return new Pool({",
          "    host: process.env.DB_HOST,"
        ]
      },
      "score": 0.95
    }
  ]
}
```

### Code Anchors

Every result includes a `CodeAnchor` pointing to the exact location:

```typescript
{
  "file": "/absolute/path/to/file.ts",
  "line": 42,        // 1-based line number
  "column": 15       // 1-based column (optional)
}
```

File paths are **absolute** and **clickable** in VSCode terminal.

### Code Previews

Each result includes a preview showing code in context:

```typescript
{
  "lines": [
    "  function getData() {",
    "    try {",
    "      const result = await fetch(url);",  // Target line
    "      return result.json();",
    "    } catch (error) {"
  ],
  "startLine": 40  // First line number in preview
}
```

Previews are limited to **10 lines** maximum.

---

## Configuration

### Environment Variables

- `CODE_INDEX_DB`: Path to database (default: `.codeindex/index.db`)
- `CODE_INDEX_AUTH_TOKEN`: Enable authentication (optional)
- `DEBUG`: Enable verbose logging (optional)

### Database Performance

For optimal performance with large codebases:

```bash
# The server automatically enables WAL mode for concurrency
# No configuration needed
```

---

## Troubleshooting

### Server Won't Start

**Problem**: `Error: Database not found`

**Solution**: Index your codebase first:
```bash
code-index init
code-index index
```

### Authentication Errors

**Problem**: `Error: Authentication failed`

**Solution**: Ensure client provides matching token:
```bash
export CODE_INDEX_AUTH_TOKEN="same-token-as-server"
```

### Slow Search Results

**Problem**: Searches take longer than expected

**Solution**:
1. Check codebase size: `code-index doctor`
2. Reduce result limit in search queries
3. Use directory or language filters to narrow scope
4. Consider refreshing index: `code-index refresh`

### Index Corruption

**Problem**: `Error: Index unavailable (code -32002)`

**Solution**: Diagnose and rebuild:
```bash
code-index doctor         # Diagnose issues
code-index index --force  # Rebuild index
```

---

## Best Practices

### 1. Keep Index Fresh

Update the index after making code changes:

```bash
# After editing files
code-index refresh

# Or use the MCP refresh tool from AI assistant
```

### 2. Use Filters for Large Codebases

Narrow search scope with filters:

```typescript
{
  "query": "auth",
  "directory": "src/auth",     // Only search in auth directory
  "language": "typescript",     // Only TypeScript files
  "limit": 20                   // Limit results
}
```

### 3. Combine Tools for Deep Understanding

Chain tools together:
1. **search** to find relevant code
2. **find_def** to understand what you found
3. **find_refs** to see usage patterns
4. **callers/callees** to understand call flow

### 4. Monitor Performance

Check server logs for performance insights:

```bash
tail -f .codeindex/logs/mcp-server.log
```

---

## Advanced Usage

### Custom Database Location

Specify a different database path:

```bash
CODE_INDEX_DB=/custom/path/index.db code-index serve
```

### Multiple Projects

Run separate server instances for each project:

```bash
# Terminal 1: Project A
cd /path/to/project-a
code-index serve

# Terminal 2: Project B
cd /path/to/project-b
code-index serve
```

Each instance serves one client via stdio.

### Testing with MCP Inspector

Debug tool calls with the official MCP inspector:

```bash
npx @modelcontextprotocol/inspector code-index serve
```

This opens a visual interface for testing tools.

---

## Performance Benchmarks

Expected performance (from specification):

| Operation | Target | Notes |
|-----------|--------|-------|
| Search | <500ms | For codebases <100k files |
| Symbol Navigation | <200ms | find_def, find_refs |
| Concurrent Requests | 50+ | Handled asynchronously |
| Index Refresh | <10s | Incremental updates |

---

## Next Steps

- **Learn More**: See [spec.md](./spec.md) for full feature specification
- **Implementation Details**: See [plan.md](./plan.md) for technical architecture
- **API Contract**: See [contracts/mcp-tools.yaml](./contracts/mcp-tools.yaml) for complete API
- **Report Issues**: Use the issue tracker in the repository

---

## FAQ

**Q: Do I need to restart the server after making code changes?**

A: No. Use the `refresh` tool to update the index while the server is running.

**Q: Can multiple clients connect to one server?**

A: No. Each server instance serves one client via stdio. For multiple clients, spawn separate server instances.

**Q: Is my code sent to external services?**

A: No. The MCP server operates completely offline. All data stays on your local machine.

**Q: How do I update the server to a new version?**

A: Update the code-index package:
```bash
npm update -g @squirrelogic/code-index
```

**Q: Can I use this with VSCode extension?**

A: Yes, if the VSCode extension supports MCP protocol. Configure it to spawn `code-index serve` as a child process.

---

## Getting Help

- **Documentation**: See specification files in `specs/010-expose-an-mcp/`
- **Logs**: Check `.codeindex/logs/mcp-server.log` for diagnostic information
- **Health Check**: Run `code-index doctor` to diagnose issues
- **Community**: Report issues or ask questions in the project repository
