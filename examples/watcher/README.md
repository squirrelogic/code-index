# File Watcher Configuration Examples

This directory contains example configurations for different use cases of the code-index file watcher.

## Available Configurations

### 1. basic-config.json
**Use case**: Small to medium projects (< 10,000 files)

Default configuration with balanced settings for most projects.

**Features**:
- 500ms debounce delay
- 100 files per batch
- Standard ignore patterns

**Usage**:
```bash
code-index watch --config examples/watcher/basic-config.json
```

---

### 2. large-project-config.json
**Use case**: Large projects (100k+ files)

Optimized for performance with aggressive filtering and batching.

**Features**:
- 1000ms debounce delay for better batching
- 200 files per batch for higher throughput
- Limited to specific file extensions
- Max depth of 5 levels
- Excludes test directories and minified files

**Usage**:
```bash
code-index watch --config examples/watcher/large-project-config.json
```

**Recommended for**:
- Monorepos
- Projects with extensive node_modules
- Projects with many generated files

---

### 3. network-drive-config.json
**Use case**: Projects on network drives or slow filesystems

Uses polling instead of native file events for reliability.

**Features**:
- 2000ms debounce delay to reduce network traffic
- Polling mode enabled (5 second intervals)
- Smaller batch sizes to avoid timeouts
- Higher stability thresholds for slow writes

**Usage**:
```bash
code-index watch --config examples/watcher/network-drive-config.json
```

**When to use**:
- Network-mounted drives (NFS, SMB, etc.)
- Docker volumes on some systems
- Slow external drives
- VirtualBox shared folders

---

### 4. development-config.json
**Use case**: Active development with fast feedback

Optimized for quick response during development.

**Features**:
- 300ms debounce delay for faster feedback
- Only watches JS/TS files
- Excludes test files to reduce noise
- Lower stability threshold for immediate updates

**Usage**:
```bash
code-index watch --config examples/watcher/development-config.json
```

**Ideal for**:
- Active coding sessions
- Frontend development
- When you want immediate index updates

---

## Configuration Options Reference

### Core Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `debounceDelay` | number | 500 | Milliseconds to wait before processing changes |
| `batchSize` | number | 100 | Maximum files to process in one batch |
| `maxQueueSize` | number | 10000 | Maximum events to queue before backpressure |

### Filtering Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ignorePatterns` | string[] | See below | Glob patterns to exclude |
| `extensions` | string[] | all | File extensions to watch (e.g., ["js", "ts"]) |
| `maxDepth` | number | unlimited | Maximum directory depth to watch |

### Watch Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `followSymlinks` | boolean | true | Follow symbolic links |
| `usePolling` | boolean | false | Use polling instead of native events |
| `interval` | number | 100 | Polling interval in ms (if polling enabled) |
| `awaitWriteFinish.stabilityThreshold` | number | 200 | Ms to wait for file write completion |

### Performance Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `memoryThresholdMb` | number | 400 | Memory usage warning threshold |
| `backpressureEnabled` | boolean | true | Pause watcher when queue is full |

## Default Ignore Patterns

All configurations include these default patterns:

```json
[
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/.codeindex/**",
  "**/*.log"
]
```

## Custom Configuration

To create your own configuration, copy one of these examples and modify it:

```bash
# Copy base configuration
cp examples/watcher/basic-config.json .codeindex/watcher-config.json

# Edit to your needs
vim .codeindex/watcher-config.json

# Use your custom configuration
code-index watch --config .codeindex/watcher-config.json
```

## Performance Tuning

### For Better Throughput
- Increase `batchSize` (e.g., 200-500)
- Increase `debounceDelay` (e.g., 1000-2000ms)
- Limit `extensions` to only needed types
- Add more `ignorePatterns`

### For Lower Memory Usage
- Decrease `maxQueueSize` (e.g., 1000-5000)
- Add aggressive `ignorePatterns`
- Set `maxDepth` limit
- Limit `extensions`
- Set `followSymlinks: false`

### For Faster Feedback
- Decrease `debounceDelay` (e.g., 200-300ms)
- Decrease `awaitWriteFinish.stabilityThreshold` (e.g., 100ms)
- Keep `batchSize` moderate (100)

## Troubleshooting

### High Memory Usage
```json
{
  "memoryThresholdMb": 300,
  "maxQueueSize": 5000,
  "maxDepth": 4,
  "extensions": ["js", "ts", "py"]
}
```

### Watcher Not Detecting Changes
```json
{
  "usePolling": true,
  "interval": 1000,
  "followSymlinks": true
}
```

### Too Many Events
```json
{
  "debounceDelay": 2000,
  "ignorePatterns": [
    "**/*.min.js",
    "**/coverage/**",
    "**/test/**"
  ]
}
```

## Integration Examples

### npm Scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "watch:dev": "code-index watch --config examples/watcher/development-config.json",
    "watch:prod": "code-index watch --config examples/watcher/large-project-config.json"
  }
}
```

### VS Code Tasks

Add to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start Code Watcher",
      "type": "shell",
      "command": "code-index watch --config examples/watcher/development-config.json",
      "isBackground": true,
      "problemMatcher": []
    }
  ]
}
```

## Further Reading

- [Main Documentation](../../README.md)
- [Quick Start Guide](../../specs/003-implement-a-watcher/quickstart.md)
- [Technical Research](../../specs/003-implement-a-watcher/research.md)
