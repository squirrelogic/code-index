# Code-Index CLI

A fast, offline TypeScript/Node.js CLI tool for local code indexing and search using SQLite.

## Features

- 🚀 **Fast Indexing** - Process 1,000+ files per second
- 🔍 **Instant Search** - Full-text and regex search with <100ms response time
- 🧠 **Hybrid Search** - Combines lexical (BM25) + semantic (vector) search with configurable fusion
- 🌳 **AST-Based Symbol Index** - Tree-sitter powered parsing with full symbol extraction
- 🔗 **Call Graph Tracking** - Navigate function calls, callers, and callees
- 💾 **Offline First** - All data stored locally in SQLite + JSON
- 🔄 **Incremental Updates** - Refresh only changed files
- 👀 **File Watcher** - Real-time index updates with debounced change detection
- 🪝 **Git Hooks** - Automatic indexing after merge, checkout, and rebase
- 🏥 **Self-Diagnostic** - Built-in health checks with auto-fix capabilities
- 🤖 **MCP Server** - Model Context Protocol server for AI assistant integration
- 📦 **Zero Dependencies** - Minimal runtime dependencies

## Requirements

- Node.js 20 or higher
- npm or yarn

## Installation

### Global Installation (Recommended)

```bash
npm install -g @squirrelogic/code-index
```

### Local Installation

```bash
npm install --save-dev @squirrelogic/code-index
```

## Quick Start

1. Initialize code-index in your project:

```bash
code-index init
```

This creates:
- `.codeindex/` - Database, AST files, and logs directory
- `.claude/` - Configuration directory for Claude integration
- `.mcp.json` - Model Context Protocol configuration
- Updates `.gitignore` to exclude code-index artifacts

2. Index your codebase:

```bash
code-index index
```

3. Search for code:

```bash
# Text search
code-index search "function handleUser"

# Regex search
code-index search --regex "async.*fetch.*data"

# Case-sensitive search
code-index search --case-sensitive "API_KEY"
```

## Commands

### `code-index init`

Initialize code-index in your project.

**Options:**
- `--force` - Reinitialize and overwrite existing configuration
- `--json` - Output results in JSON format

**Example:**
```bash
code-index init --force
```

### `code-index index`

Build or rebuild the search index for your codebase.

**Options:**
- `-v, --verbose` - Show detailed progress information
- `-j, --json` - Output results in JSON format

**Example:**
```bash
code-index index --verbose
```

### `code-index search <query>`

Search the indexed codebase for patterns.

**Options:**
- `-r, --regex` - Treat query as regular expression
- `-c, --case-sensitive` - Perform case-sensitive search
- `-l, --limit <number>` - Limit number of results (default: 20)
- `-j, --json` - Output results in JSON format
- `--hybrid` - Enable hybrid search (combines lexical + semantic ranking)
- `--alpha <number>` - Lexical weight for hybrid search (0.0-1.0, default: 0.5)
- `--beta <number>` - Vector weight for hybrid search (0.0-1.0, default: 0.4)
- `--gamma <number>` - Tie-breaker weight for hybrid search (0.0-1.0, default: 0.1)
- `--config <path>` - Custom ranking config file path
- `--lexical-only` - Use only lexical (BM25) search
- `--vector-only` - Use only vector (semantic) search
- `--no-diversification` - Disable path diversification in results
- `--explain` - Show detailed score breakdown for each result

**Examples:**
```bash
# Simple text search
code-index search "TODO"

# Regex pattern search
code-index search --regex "class.*Controller"

# Limit results
code-index search "import" --limit 10

# JSON output for scripting
code-index search "error" --json | jq '.results[].path'

# Hybrid search (combines lexical + semantic)
code-index search --hybrid "user authentication"

# Adjust fusion weights (prioritize exact matches)
code-index search --hybrid "API endpoint" --alpha 0.7 --beta 0.3

# Show detailed score explanations
code-index search --hybrid "error handling" --explain

# Use custom ranking configuration
code-index search --hybrid "database query" --config ./my-ranking-config.json
```

### `code-index refresh`

Update the index for modified files only (incremental update).

**Options:**
- `-v, --verbose` - Show detailed progress information
- `-j, --json` - Output results in JSON format

**Example:**
```bash
code-index refresh --verbose
```

### `code-index doctor`

Diagnose system health and suggest fixes.

**Options:**
- `-v, --verbose` - Show detailed diagnostic information
- `-f, --fix` - Attempt to automatically fix issues
- `-j, --json` - Output results in JSON format

**Example:**
```bash
# Check system health
code-index doctor

# Auto-fix issues
code-index doctor --fix
```

### `code-index watch`

Watch file system for changes and automatically update the index in real-time.

**Options:**
- `--delay <ms>` - Debounce delay in milliseconds (default: 500)
- `--batch-size <n>` - Number of files to process per batch (default: 100)
- `--ignore <pattern>` - Additional patterns to ignore
- `--max-depth <n>` - Limit directory recursion depth
- `--extensions <list>` - Comma-separated list of file extensions to watch
- `-v, --verbose` - Show detailed progress information
- `-j, --json` - Output results in JSON format

**Examples:**
```bash
# Start watching with default settings
code-index watch

# Watch with custom debounce delay
code-index watch --delay 1000

# Watch only specific file types
code-index watch --extensions js,ts,py

# Watch with depth limit (good for large projects)
code-index watch --max-depth 5 --ignore "test/*"
```

### `code-index hooks`

Manage Git hooks for automatic indexing after Git operations.

**Subcommands:**
- `install` - Install Git hooks
- `uninstall` - Remove Git hooks
- `status` - Show hook installation status

**Options:**
- `--hooks <list>` - Comma-separated list of hooks to install (post-merge, post-checkout, post-rewrite)
- `--force` - Force reinstall hooks
- `-j, --json` - Output results in JSON format

**Examples:**
```bash
# Install all hooks (recommended)
code-index hooks install

# Install specific hooks
code-index hooks install --hooks post-merge,post-checkout

# Check hook status
code-index hooks status

# Remove all hooks
code-index hooks uninstall
```

### `code-index diagnose`

Run comprehensive diagnostics and suggest fixes for common issues.

**Options:**
- `--fix` - Attempt to automatically fix detected issues
- `--report` - Generate a full diagnostic report
- `-v, --verbose` - Show detailed diagnostic information
- `-j, --json` - Output results in JSON format

**Examples:**
```bash
# Check system health
code-index diagnose

# Auto-fix detected issues
code-index diagnose --fix

# Generate diagnostic report
code-index diagnose --report
```

### `code-index metrics`

View collected search performance metrics.

**Options:**
- `--json` - Output metrics in JSON format
- `--log-dir <path>` - Path to logs directory (default: .codeindex/logs)

**Examples:**
```bash
# View performance statistics
code-index metrics

# Export metrics as JSON
code-index metrics --json > performance-report.json
```

### `code-index serve`

Start the MCP (Model Context Protocol) server for code intelligence. The server listens on stdio for JSON-RPC 2.0 requests and provides 8 tool functions for AI assistants to navigate and understand codebases.

**Available Tools:**
- `search` - Hybrid semantic + lexical search across codebase
- `find_def` - Find symbol definitions with exact name matching (fast path via symbol index)
- `find_refs` - Find all references to a symbol (imports, exports, calls)
- `callers` - Find all functions/methods that call a given function
- `callees` - Find all functions/methods called by a given function
- `open_at` - Open file at specific line with context
- `refresh` - Incremental index update (automatically reloads symbol index)
- `symbols` - List all symbols in a file or entire codebase

**Symbol Index Features:**
- Exact symbol name matching (O(1) lookup via hash map)
- Prefix, substring, and fuzzy matching (k-gram indexed)
- Full AST information including signatures, call graphs, and line ranges
- Automatically populated on server start from persisted AST files
- Re-initialized after refresh operations for immediate availability

**Options:**
- `-p, --project <path>` - Project root directory (defaults to current directory)

**Environment Variables:**
- `CODE_INDEX_AUTH_TOKEN` - Optional authentication token (when set, clients must provide matching token)

**Examples:**
```bash
# Start MCP server (requires indexed codebase)
code-index serve

# Start with authentication
CODE_INDEX_AUTH_TOKEN=secret code-index serve

# Start for specific project
code-index serve --project /path/to/project
```

**Integration:**

Create an `.mcp.json` file in your project to configure MCP clients:

```json
{
  "mcpServers": {
    "code-index": {
      "command": "code-index",
      "args": ["serve"],
      "env": {
        "CODE_INDEX_AUTH_TOKEN": ""
      }
    }
  }
}
```

For Claude Code integration, the server will be automatically detected and available in the tool picker.

**Notes:**
- Server uses stdio transport (stdin/stdout for JSON-RPC messages)
- All responses include file anchors (`file:line:col`) with precise symbol locations
- Code previews extracted from source files or AST spans
- Symbol definitions include full metadata: signatures, call graphs, line ranges, and kind (function, class, interface, etc.)
- Symbol index loads on first request (~100ms for 1000 files)
- Supports concurrent requests (handles 50+ simultaneous queries)
- Gracefully handles SIGTERM/SIGINT for clean shutdown with in-flight request completion

### `code-index uninstall`

Remove all code-index artifacts from your project.

**Options:**
- `-y, --yes` - Skip confirmation prompt
- `-v, --verbose` - Show detailed removal information
- `-j, --json` - Output results in JSON format

**Example:**
```bash
code-index uninstall --yes
```

## Configuration

### Gitignore Integration

Code-index automatically respects your `.gitignore` patterns. Files and directories listed in `.gitignore` will not be indexed.

### File Size Limits

By default, files larger than 10MB are skipped during indexing to maintain performance.

### Supported Languages

Code-index automatically detects and tags files with their programming language based on extension:

- JavaScript/TypeScript (`.js`, `.jsx`, `.ts`, `.tsx`) - **AST parsing with Tree-sitter**
- Python (`.py`) - **AST parsing with Tree-sitter**
- Java (`.java`)
- C/C++ (`.c`, `.cpp`, `.h`, `.hpp`)
- Go (`.go`)
- Rust (`.rs`)
- And 40+ more languages

**AST Parsing:**
Languages with AST parsing get full symbol extraction including:
- Function/method definitions with signatures
- Class/interface/type definitions
- Import/export statements
- Call graph relationships (caller/callee tracking)
- Precise line/column location spans

## Symbol Index

The symbol index provides fast, precise symbol lookup for code navigation. Built on Tree-sitter parsing and k-gram indexing, it enables instant "go to definition" and call graph traversal.

### Features

- **Exact Matching** - O(1) hash-based lookup for symbol names
- **Fuzzy Matching** - K-gram indexed prefix, substring, and edit-distance matching
- **Full Metadata** - Function signatures, line ranges, call graphs
- **Multiple Symbol Types** - Functions, classes, interfaces, types, enums, constants, components
- **Call Graphs** - Bidirectional tracking (callers ↔ callees)
- **Import/Export Tracking** - Full dependency graph

### Supported Symbol Types

| Type | Languages | Metadata |
|------|-----------|----------|
| Functions | TS/JS, Python | Signature, parameters, return type, calls, called_by |
| Classes | TS/JS, Python | Methods, properties, extends |
| Interfaces | TS/JS | Properties, methods, extends |
| Type Aliases | TS/JS | Type definition |
| Enums | TS/JS | Members |
| Constants | TS/JS, Python | Type, value |
| Components | TS/JS/JSX | Props, hooks |

### Usage via MCP

```bash
# Start MCP server
code-index serve

# From AI assistant (e.g., Claude Code):
# Find definition
mcp__code-index__find_def(symbol: "findPackageRoot")

# Find who calls this function
mcp__code-index__callers(symbol: "findPackageRoot")

# Find what this function calls
mcp__code-index__callees(symbol: "findPackageRoot")

# List all symbols in file
mcp__code-index__symbols(path: "src/services/indexer.ts")
```

### Performance

- **Exact Match**: <10ms
- **Fuzzy Match**: <50ms (1000 symbols)
- **Load Time**: ~100ms for 1000 files
- **Memory**: ~1MB per 1000 symbols

## Hybrid Search

Hybrid search combines the precision of lexical search (BM25) with the semantic understanding of vector search to deliver superior code search results.

### How It Works

1. **Dual Retrieval**: Fetches top-200 candidates from both lexical (exact/fuzzy text matches) and vector (semantic similarity) components in parallel
2. **Fusion**: Combines rankings using Reciprocal Rank Fusion (RRF) with configurable weights (α, β, γ)
3. **Diversification**: Applies path-based diversification to ensure results span multiple files/directories
4. **Tie-Breaking**: Uses advanced heuristics (symbol type, path priority, language match) to order similarly-scored results

### Usage Examples

```bash
# Basic hybrid search
code-index search --hybrid "authentication logic"

# Prioritize exact matches (increase lexical weight)
code-index search --hybrid "JWT token" --alpha 0.7 --beta 0.3

# Prioritize semantic matches (increase vector weight)
code-index search --hybrid "how to handle errors" --alpha 0.3 --beta 0.6

# Explain rankings
code-index search --hybrid "database connection" --explain
```

### Configuration File

Create `.codeindex/ranking-config.json` to customize hybrid search behavior:

```json
{
  "version": "1.0",
  "fusion": {
    "alpha": 0.5,      // Lexical weight (exact text matches)
    "beta": 0.4,       // Vector weight (semantic similarity)
    "gamma": 0.1,      // Tie-breaker weight
    "rrfK": 60         // RRF constant (higher = less impact of rank position)
  },
  "diversification": {
    "enabled": true,
    "lambda": 0.7,     // 0.0 = max diversity, 1.0 = pure relevance
    "maxPerFile": 3    // Max results from single file in top-10
  },
  "tieBreakers": {
    "symbolTypeWeight": 0.3,       // Prioritize functions/classes
    "pathPriorityWeight": 0.3,     // Prioritize src/ over tests/
    "languageMatchWeight": 0.2,    // Match query language context
    "identifierMatchWeight": 0.2   // Exact identifier matches
  },
  "performance": {
    "candidateLimit": 200,  // Candidates per source
    "timeoutMs": 300,       // SLA target
    "earlyTerminationTopK": 10
  }
}
```

The configuration file supports hot-reload—changes take effect immediately without restarting.

### Performance Targets

- **Latency**: <300ms for top-10 results on medium repos (10k-50k files)
- **Memory**: <500MB typical usage
- **Throughput**: Supports 100 concurrent searches

### When to Use Hybrid vs. Lexical

**Use Hybrid Search When:**
- Looking for concepts ("error handling patterns")
- Exploring unfamiliar codebases
- Natural language queries ("how to validate user input")
- You want both exact matches AND related code

**Use Lexical Search When:**
- Searching for specific symbols or strings
- Regex pattern matching
- Performance is critical (<100ms requirement)
- You know exact identifiers or keywords

## Performance

- **Indexing Speed**: 1,000+ files/second
- **Search Response**: <100ms for codebases under 100k files
- **Memory Usage**: <500MB for 1M lines of code
- **Database Size**: ~10% of indexed code size

## Data Storage

All data is stored locally in your project:

```
.codeindex/
├── index.db           # SQLite database with hybrid index (embeddings + sparse vectors)
├── ast/              # Parsed AST files (JSON) - one per source file
│   └── *.json        # Symbol definitions, call graphs, imports/exports
├── models/           # ONNX embedding models for semantic search
│   └── gte-small.onnx
└── logs/             # JSON lines log files
    ├── mcp-server.log              # MCP server activity
    └── search-performance.jsonl    # Search metrics
```

**AST Files:**
- One JSON file per source file, named using encoded path (e.g., `src_services_indexer.ts.json`)
- Contains extracted symbols: functions, classes, interfaces, types, enums, constants, components
- Includes call graphs (what each function calls and is called by)
- Import/export tracking for dependency analysis
- Precise source location spans (line/column ranges)

## Integration

### Claude Integration

Code-index is designed to work seamlessly with Claude.ai through the Model Context Protocol (MCP). The `.claude/` directory structure enables:

- Custom settings and preferences
- Hooks for code analysis
- Tool integrations

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Index codebase
  run: |
    npm install -g @squirrelogic/code-index
    code-index init
    code-index index
    code-index search "TODO" --json > todos.json
```

## Troubleshooting

### Common Issues

1. **"Project not initialized"**
   - Run `code-index init` first

2. **"Database corrupted"**
   - Run `code-index doctor --fix`
   - Or reinitialize: `code-index init --force`

3. **"Permission denied"**
   - Check file permissions for `.codeindex/` directory
   - Run `code-index doctor` for specific issues

4. **Slow indexing**
   - Check available disk space
   - Ensure no antivirus is scanning `.codeindex/`
   - Consider excluding large binary files

### Debug Mode

Set the `DEBUG` environment variable for detailed logging:

```bash
DEBUG=code-index code-index index
```

### MCP Server Issues

1. **"Symbol not found" after indexing**
   - The MCP server needs to be restarted to load new symbols
   - Or use the `refresh` MCP tool which automatically reloads the symbol index

2. **MCP server logs location**
   - Check `.codeindex/logs/mcp-server.log` for server activity
   - Logs include symbol index statistics on load

3. **Symbol index not loading**
   - Ensure `.codeindex/ast/` directory contains JSON files
   - Check MCP logs for "Symbol index loaded: X symbols from Y files"
   - Verify files were indexed with `code-index index`

## Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT © [Squirrel Logic]

## Changelog

### 4.0.0 (MCP Server Integration + AST Symbol Index)
- **New Features:**
  - 🤖 **MCP Server** - Model Context Protocol server for AI assistant integration
  - 🌳 **AST-Based Symbol Index** - Tree-sitter powered parsing with k-gram indexing
  - 8 tool functions: search, find_def, find_refs, callers, callees, open_at, refresh, symbols
  - All responses include file anchors (file:line:col) and code previews
  - Optional authentication via CODE_INDEX_AUTH_TOKEN environment variable
  - Concurrent request handling (50+ simultaneous queries)
  - Graceful shutdown with cleanup
  - Auto-reload symbol index after refresh operations
- **Symbol Index:**
  - In-memory symbol index for O(1) exact matching
  - K-gram indexing for prefix, substring, and fuzzy search
  - Full AST metadata: signatures, call graphs, line ranges
  - Supports functions, classes, interfaces, types, enums, constants, components
  - Automatic population from persisted AST files on server start
- **Commands:**
  - `serve` - Start MCP server on stdio transport
- **Integration:**
  - `.mcp.json` configuration file support
  - Claude Code tool picker integration
  - VSCode-compatible file anchors
  - Auto-updates `.gitignore` during init
- **Performance:**
  - Symbol lookup <10ms (exact match)
  - Search <500ms for <100k files
  - Symbol index load ~100ms for 1000 files
  - Prepared statement caching for optimal performance
  - WAL mode for concurrent reads

### 3.0.0 (Hybrid Search Release)
- **New Features:**
  - 🧠 **Hybrid Search** - Combines BM25 lexical + vector semantic search with RRF fusion
  - Configurable ranking weights (α, β, γ) via CLI flags or config file
  - Path diversification (MMR-style) for better result distribution
  - Advanced tie-breaking using symbol type, path priority, and language matching
  - Performance monitoring with JSON lines logging
  - Hot-reloadable configuration file (`.codeindex/ranking-config.json`)
- **Commands:**
  - `metrics` - View aggregated search performance statistics
- **Search Options:**
  - `--hybrid` - Enable hybrid search mode
  - `--alpha/--beta/--gamma` - Adjust fusion weights
  - `--lexical-only/--vector-only` - Use single search component
  - `--no-diversification` - Disable path diversification
  - `--explain` - Show detailed score breakdown
  - `--config` - Use custom ranking configuration
- **Performance:**
  - <300ms p95 latency for hybrid search on medium repos (10k-50k files)
  - Parallel candidate retrieval for optimal performance
  - Early termination and prepared statements
- **Observability:**
  - Performance metrics logged to `.codeindex/logs/search-performance.jsonl`
  - SLA violation tracking and warnings
  - Fallback mode detection and reporting

### 2.0.0
- **New Features:**
  - File watcher with real-time index updates
  - Debounced change detection (500ms default)
  - Git hooks support (post-merge, post-checkout, post-rewrite)
  - Enhanced diagnostics command with auto-fix
  - Performance benchmarking utilities
  - Telemetry collection (respects privacy)
- **Commands:**
  - `watch` - Real-time file system monitoring
  - `hooks` - Git hook management
  - `diagnose` - Comprehensive system diagnostics
- **Improvements:**
  - Better memory management for large projects
  - Dependency-aware file processing
  - Improved error handling with retry logic
  - Health checks for watcher and database

### 1.0.0
- Initial release
- Core commands: init, index, search, refresh, doctor, uninstall
- SQLite with FTS5 for fast full-text search
- Incremental refresh capability
- Health diagnostics with auto-fix
- JSON output for scripting

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/squirrelogic/code-index/issues)
- Documentation: [Full documentation](https://docs.squirrelogic.com/code-index)