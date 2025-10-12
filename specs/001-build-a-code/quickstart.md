# Quick Start Guide: Code-Index CLI

Get up and running with code-index in under 2 minutes!

## Installation

```bash
npm install -g @squirrelogic/code-index
```

Or install locally in your project:

```bash
npm install --save-dev @squirrelogic/code-index
```

## Basic Usage

### 1. Initialize code-index in your project

Navigate to your project root and run:

```bash
code-index init
```

This creates:
- `.codeindex/` - Contains SQLite database and logs
- `.claude/` - Settings and hooks configuration
- `.mcp.json` - Model Context Protocol configuration

### 2. Index your codebase

```bash
code-index index
```

This scans all files in your project (respecting .gitignore) and creates a searchable index.

### 3. Search your code

```bash
# Simple text search
code-index search "TODO"

# Search for function definitions
code-index search "function handleRequest"

# Use regex patterns
code-index search --regex "import.*from.*react"

# Case-sensitive search
code-index search --case-sensitive "MyClassName"
```

### 4. Keep your index updated

```bash
# Refresh only changed files (fast)
code-index refresh

# Or re-index everything
code-index index
```

## Common Commands

| Command | Description | Example |
|---------|-------------|---------|
| `init` | Initialize code-index | `code-index init` |
| `index` | Index all project files | `code-index index` |
| `search <query>` | Search indexed code | `code-index search "login"` |
| `refresh` | Update changed files | `code-index refresh` |
| `doctor` | Check system health | `code-index doctor` |
| `uninstall` | Remove code-index | `code-index uninstall` |

## Command Options

### Global Options
- `--help` - Show help for any command
- `--version` - Display version information
- `--json` - Output results as JSON

### Search Options
- `--regex` or `-r` - Treat query as regex pattern
- `--case-sensitive` or `-c` - Case-sensitive search
- `--limit <n>` - Limit number of results (default: 50)

### Examples

```bash
# Get help for a specific command
code-index search --help

# Output search results as JSON for scripting
code-index search "API" --json

# Force re-initialization
code-index init --force

# Automatically fix issues found by doctor
code-index doctor --fix

# Skip confirmation when uninstalling
code-index uninstall --yes
```

## Output Formats

### Human-Readable (default)

```bash
$ code-index search "parseConfig"
src/config.ts:24: function parseConfig(path: string): Config {
src/config.ts:45:   const parsed = parseConfig(configPath);
tests/config.test.ts:12: describe('parseConfig', () => {

Found 3 matches in 2 files
```

### JSON Format

```bash
$ code-index search "parseConfig" --json
{
  "query": "parseConfig",
  "queryType": "text",
  "matches": [
    {
      "file": "src/config.ts",
      "line": 24,
      "column": 10,
      "match": "function parseConfig(path: string): Config {",
      "score": 100
    }
  ],
  "fileCount": 2,
  "totalMatches": 3
}
```

## Performance Tips

1. **First-time indexing**: The initial index may take a few seconds for large projects
2. **Use refresh**: After the initial index, use `refresh` for quick updates
3. **Gitignore patterns**: Ensure your .gitignore is configured to skip node_modules, build artifacts, etc.
4. **Binary files**: Binary files are automatically detected and skipped

## Troubleshooting

### Command not found
If `code-index` is not found after installation:
```bash
# Check npm global bin path
npm bin -g

# Add to PATH if needed
export PATH="$PATH:$(npm bin -g)"
```

### Permission errors
```bash
# Fix permissions on Unix-like systems
sudo npm install -g @squirrelogic/code-index
```

### Database issues
```bash
# Run doctor to diagnose
code-index doctor

# Auto-fix if possible
code-index doctor --fix

# Or reinitialize as last resort
code-index init --force
```

### Index not updating
```bash
# Check what doctor says
code-index doctor

# Force full re-index
code-index index
```

## Integration with Development Workflow

### Git Hooks
Add to `.git/hooks/post-commit`:
```bash
#!/bin/sh
code-index refresh
```

### NPM Scripts
Add to `package.json`:
```json
{
  "scripts": {
    "index": "code-index index",
    "search": "code-index search",
    "postinstall": "code-index init"
  }
}
```

### VS Code Task
Add to `.vscode/tasks.json`:
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Index Code",
      "type": "shell",
      "command": "code-index index",
      "problemMatcher": []
    }
  ]
}
```

## Advanced Usage

### Custom Ignore Patterns
Edit `.codeindex/config.json` to add custom patterns:
```json
{
  "ignorePatterns": [
    "*.min.js",
    "coverage/**",
    "*.log"
  ]
}
```

### Scripting with JSON Output
```bash
# Find all TODOs and save to file
code-index search "TODO" --json > todos.json

# Count files containing a pattern
code-index search "import React" --json | jq '.fileCount'

# Extract just file paths
code-index search "deprecated" --json | jq -r '.matches[].file' | sort -u
```

## What's Next?

- Run `code-index --help` to see all available commands
- Check `code-index doctor` regularly to ensure optimal performance
- Use `code-index refresh` after making changes to keep index current

## Need Help?

- Run `code-index <command> --help` for detailed command help
- Check the project repository for issues and documentation
- Use `code-index doctor` to diagnose common problems