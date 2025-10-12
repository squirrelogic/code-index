# Code-Index CLI

A fast, offline TypeScript/Node.js CLI tool for local code indexing and search using SQLite.

## Features

- 🚀 **Fast Indexing** - Process 1,000+ files per second
- 🔍 **Instant Search** - Full-text and regex search with <100ms response time
- 💾 **Offline First** - All data stored locally in SQLite
- 🔄 **Incremental Updates** - Refresh only changed files
- 🏥 **Self-Diagnostic** - Built-in health checks with auto-fix capabilities
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
- `.codeindex/` - Database and logs directory
- `.claude/` - Configuration directory for Claude integration
- `.mcp.json` - Model Context Protocol configuration

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

- JavaScript/TypeScript (`.js`, `.jsx`, `.ts`, `.tsx`)
- Python (`.py`)
- Java (`.java`)
- C/C++ (`.c`, `.cpp`, `.h`, `.hpp`)
- Go (`.go`)
- Rust (`.rs`)
- And 40+ more languages

## Performance

- **Indexing Speed**: 1,000+ files/second
- **Search Response**: <100ms for codebases under 100k files
- **Memory Usage**: <500MB for 1M lines of code
- **Database Size**: ~10% of indexed code size

## Data Storage

All data is stored locally in your project:

```
.codeindex/
├── index.db       # SQLite database with FTS5
└── logs/         # JSON lines log files
    └── *.jsonl
```

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

## Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT © [Squirrel Logic]

## Changelog

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