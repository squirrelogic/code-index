# Quick Start: File Watcher and Git Hooks

Get started with automatic code index updates using the file watcher and Git hooks features.

## Installation

Ensure you have the latest version of code-index installed:

```bash
npm install -g @squirrelogic/code-index
```

## Basic Usage

### 1. Start the File Watcher

Watch your project for changes and automatically update the index:

```bash
# Start watching the current directory
code-index watch

# Watch with custom settings
code-index watch --delay 1000 --batch-size 50 --verbose
```

The watcher will:
- Monitor all files in your project
- Ignore `node_modules/`, `dist/`, `build/`, `.git/`, and `.codeindex/` by default
- Batch changes together after a 500ms delay
- Update the index incrementally

**Stop the watcher** with `Ctrl+C`.

### 2. Refresh Changed Files

Update the index for files that have changed:

```bash
# Refresh all changed files since last index
code-index refresh

# Refresh files changed in last commit
code-index refresh --changed

# Refresh files changed between commits
code-index refresh --git-range main..HEAD
```

### 3. Install Git Hooks

Set up automatic indexing after Git operations:

```bash
# Install all hooks (recommended)
code-index hooks install

# Install specific hooks
code-index hooks install --hooks post-merge,post-checkout

# Check hook status
code-index hooks status

# Remove hooks
code-index hooks uninstall
```

## Common Scenarios

### Development Workflow

Start the watcher when you begin coding:

```bash
# Terminal 1: Start your dev server
npm run dev

# Terminal 2: Start the file watcher
code-index watch --verbose
```

The watcher will automatically update the index as you save files.

### After Pulling Changes

When you pull changes from teammates:

```bash
git pull

# If hooks are installed, indexing happens automatically
# Otherwise, manually refresh:
code-index refresh --changed
```

### Switching Branches

```bash
git checkout feature-branch

# With hooks: automatic reindexing
# Without hooks:
code-index refresh --git-range main..HEAD
```

### Large File Changes

When making changes that affect many files (e.g., refactoring):

```bash
# Watch with longer delay for better batching
code-index watch --delay 2000 --batch-size 200

# Or manually refresh after changes
code-index refresh --force
```

## Configuration

### Ignore Patterns

Add custom ignore patterns:

```bash
# Ignore specific patterns
code-index watch --ignore "*.tmp" --ignore "temp/*" --ignore "*.log"

# Watch only specific extensions
code-index watch --extensions js,ts,jsx,tsx,py
```

### Performance Tuning

For large projects (100k+ files):

```bash
# Limit watching depth
code-index watch --max-depth 5

# Watch only source files
code-index watch --extensions js,ts,py,go,java

# Increase batch size for better throughput
code-index watch --batch-size 500
```

### Memory Management

If you encounter memory issues:

```bash
# Add more ignore patterns to reduce watched files
code-index watch \
  --ignore "coverage/*" \
  --ignore "*.min.js" \
  --ignore "vendor/*" \
  --max-depth 4
```

## Git Hooks Details

### What Each Hook Does

- **post-merge**: Runs after `git merge` or `git pull`
- **post-checkout**: Runs after `git checkout` or `git switch`
- **post-rewrite**: Runs after `git rebase` or `git commit --amend`

### Hook Behavior

All hooks are:
- **Non-blocking**: Won't slow down Git operations
- **Silent**: Log to `.codeindex/logs/git-hook.log`
- **Safe**: Won't break if code-index isn't available
- **Fast**: 5-second timeout to prevent hanging

### Manual Hook Installation

If you prefer manual control, add to `.git/hooks/post-merge`:

```bash
#!/bin/sh
# Refresh index after merge
(
  code-index refresh --git-range "$1..HEAD" &
) 2>/dev/null
exit 0
```

Make it executable:

```bash
chmod +x .git/hooks/post-merge
```

## Troubleshooting

### Watcher Not Detecting Changes

1. Check ignore patterns:
   ```bash
   code-index watch --verbose  # Shows ignored files
   ```

2. Verify file permissions:
   ```bash
   ls -la src/  # Check read permissions
   ```

3. For network drives, use polling:
   ```bash
   # Watcher will auto-detect and switch to polling mode
   ```

### High Memory Usage

1. Add more ignore patterns
2. Reduce max depth
3. Filter by extensions
4. Check for symbolic link loops

### Git Hooks Not Working

1. Verify installation:
   ```bash
   code-index hooks status
   ```

2. Check hook files exist:
   ```bash
   ls -la .git/hooks/
   ```

3. View hook logs:
   ```bash
   tail -f .codeindex/logs/git-hook.log
   ```

### Performance Issues

1. Increase debounce delay:
   ```bash
   code-index watch --delay 2000
   ```

2. Reduce batch size for memory:
   ```bash
   code-index watch --batch-size 50
   ```

3. Check system resources:
   ```bash
   # In another terminal
   top | grep code-index
   ```

## Best Practices

### For Small Projects (<1000 files)

```bash
# Use default settings
code-index watch
```

### For Medium Projects (1000-10000 files)

```bash
# Optimize for your workflow
code-index watch \
  --delay 750 \
  --batch-size 100 \
  --extensions js,ts,jsx,tsx
```

### For Large Projects (10000+ files)

```bash
# Aggressive optimization
code-index watch \
  --delay 1000 \
  --batch-size 200 \
  --max-depth 5 \
  --extensions js,ts,py \
  --ignore "test/*" \
  --ignore "docs/*"
```

### CI/CD Integration

```bash
# Fast feedback for CI
code-index refresh --changed

# Or use in package.json scripts
{
  "scripts": {
    "postinstall": "code-index refresh",
    "precommit": "code-index refresh --changed"
  }
}
```

## Output Formats

### Human-Readable (Default)

```
Starting file watcher...
[10:30:45] Detected 3 changes
[10:30:45] Processing batch...
[10:30:46] ✓ Indexed 3 files in 0.8s
```

### JSON Output

```bash
code-index watch --json
```

```json
{
  "event": "batch_processed",
  "timestamp": 1704893445000,
  "files": ["src/index.ts", "src/utils.ts"],
  "duration": 0.8,
  "success": true
}
```

### Quiet Mode

```bash
# Only show errors
code-index watch --quiet
```

## Advanced Features

### Dry Run Mode

See what would be indexed without making changes:

```bash
code-index refresh --changed --dry-run
```

### Force Reindex

Reindex files even if they haven't changed:

```bash
code-index refresh --force
```

### Custom Git Ranges

Index specific commit ranges:

```bash
# Last 5 commits
code-index refresh --git-range HEAD~5..HEAD

# Between tags
code-index refresh --git-range v1.0.0..v2.0.0

# Since yesterday
code-index refresh --git-range "@{yesterday}..HEAD"
```

## Integration Examples

### VS Code Task

Add to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start Code Watcher",
      "type": "shell",
      "command": "code-index watch --verbose",
      "isBackground": true,
      "problemMatcher": []
    }
  ]
}
```

### npm Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "dev": "concurrently \"npm run start\" \"code-index watch\"",
    "postpull": "code-index refresh --changed",
    "index:watch": "code-index watch",
    "index:refresh": "code-index refresh"
  }
}
```

### Shell Aliases

Add to your shell config:

```bash
# ~/.bashrc or ~/.zshrc
alias ciw="code-index watch --verbose"
alias cir="code-index refresh --changed"
alias cih="code-index hooks install"
```

## Next Steps

1. **Install Git hooks** for seamless integration:
   ```bash
   code-index hooks install
   ```

2. **Start watching** during development:
   ```bash
   code-index watch
   ```

3. **Configure ignore patterns** for your project:
   ```bash
   code-index watch --ignore "vendor/*" --ignore "*.generated.js"
   ```

4. **Monitor performance** and adjust settings as needed

For more details, see the full documentation or run:

```bash
code-index watch --help
code-index refresh --help
code-index hooks --help
```