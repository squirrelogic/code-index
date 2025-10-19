# Quickstart: Embedding Layer for Semantic Code Search

**Feature**: Pluggable Embedding Layer
**Version**: 1.0.0
**Estimated Reading Time**: 5 minutes

---

## What Are Code Embeddings?

Code embeddings transform your code into numerical vectors that capture semantic meaning. This enables powerful features like:

- **Semantic Search**: Find code by meaning, not just keywords
- **Similar Code Discovery**: Locate related functions across your codebase
- **Code Understanding**: Power AI tools that understand your code context

**Example**: Searching for "parse JSON" might find functions named `deserializeObject()` or `readJsonData()` even without those exact keywords.

---

## Quick Start Guide

### 1. Initialize Your Project

If you haven't already:

```bash
code-index init
code-index index
```

### 2. Generate Embeddings

Generate embeddings for all indexed code chunks:

```bash
code-index embed
```

**Output**:
```
Embedding codebase chunks...

Model: all-MiniLM-L6-v2 (384 dimensions)
Strategy: Incremental (hash-based change detection)

Analyzing chunks...
  Total chunks: 1,234
  Needs embedding: 1,234

Generating embeddings...
[██████████████████████████████] 100% (1,234/1,234)

Summary:
  Embedded: 1,234 chunks
  Duration: 45.2s
  Throughput: 27.3 chunks/sec

✓ Embedding complete
```

**That's it!** Your code is now ready for semantic search.

---

## Common Use Cases

### Preview Changes (Dry-Run)

See what would be embedded without modifying the database:

```bash
code-index embed --dry-run
```

**Output**:
```
Dry-run mode: No changes will be made

Analysis:
  Total chunks: 1,234
  Would embed: 84 chunks
  Would skip: 1,150 chunks (no changes)

Run without --dry-run to perform embedding.
```

### Incremental Updates

After modifying code, re-run embed to update only changed chunks:

```bash
# Modify some files
code-index index      # Update file index
code-index embed      # Only re-embeds changed chunks
```

**Smart Updates**: Only chunks with modified content are re-embedded (10x faster for small changes).

### Force Full Re-Embedding

Regenerate all embeddings from scratch:

```bash
code-index embed --force
```

**When to use**:
- Testing different embedding models
- After upgrading the embedding library
- Troubleshooting embedding quality issues

---

## Configuration

### Default Model

The default embedding model is **all-MiniLM-L6-v2**:
- 384-dimensional vectors
- Balanced quality and speed
- Works completely offline
- ~100MB memory usage

### Using Different Models

Override the default model:

```bash
code-index embed --model <model-name>
```

**Available models**:
- `all-MiniLM-L6-v2` (default, fast, local)
- `openai-text-embedding-3-small` (hosted, requires API key)
- *(Additional models can be configured)*

**Note**: Switching models with different dimensions requires re-embedding all chunks.

### Performance Tuning

Adjust batch size for your hardware:

```bash
# Larger batches = faster but more memory
code-index embed --batch-size 32

# Smaller batches = slower but less memory
code-index embed --batch-size 8
```

**Default**: 16 (balanced for most systems)

---

## How Embeddings Work

### 1. Code Chunking

Your code is divided into semantic units (chunks):
- Functions
- Classes
- Methods
- Logical blocks

### 2. Vector Generation

Each chunk is converted to a 384-dimensional vector using a machine learning model:

```
function parseJSON(data: string) { ... }
        ↓
[0.12, -0.34, 0.56, ..., 0.89]  // 384 numbers
```

### 3. Storage

Vectors are stored in SQLite with the `sqlite-vec` extension:
- Fast similarity search
- Completely local (no external dependencies)
- Efficient incremental updates

### 4. Change Detection

Chunk hashes track content changes:
- Hash matches → Skip (already embedded)
- Hash differs → Re-embed

**Benefit**: Embedding 1,000 files takes ~30s, but updating 50 changed files takes only ~2s.

---

## Understanding Output

### Progress Indicators

```
Generating embeddings...
[██████████████████████████████] 100% (1,234/1,234)
```

- **Progress bar**: Visual completion indicator
- **Percentage**: Current progress
- **Count**: Processed / Total chunks

### Statistics

```
Summary:
  Embedded: 1,234 chunks        # Newly generated embeddings
  Skipped: 0 chunks             # Unchanged (hash match)
  Deleted: 0 chunks             # Removed (source deleted)
  Duration: 45.2s               # Total time
  Throughput: 27.3 chunks/sec   # Processing speed
```

**Performance expectations**:
- Local models: 50-150 chunks/second (depends on CPU)
- Hosted models: Variable (depends on API rate limits)

---

## Hosted Models (Optional)

### Using OpenAI Embeddings

1. **Set API Key**:
   ```bash
   export EMBED_OPENAI_API_KEY=sk-...
   ```

2. **Configure Endpoint** (create `.env` file):
   ```
   EMBED_OPENAI_TYPE=openai
   EMBED_OPENAI_ENDPOINT=https://api.openai.com/v1/embeddings
   EMBED_OPENAI_API_KEY=sk-...
   ```

3. **Run Embedding**:
   ```bash
   code-index embed --model openai-text-embedding-3-small
   ```

**Advantages**:
- Higher quality embeddings
- No local compute needed
- Latest models

**Trade-offs**:
- Requires network connectivity
- Costs money (API usage)
- Code sent to external service

### Custom Adapters

Organizations can integrate proprietary embedding services. See [Custom Adapter Development Guide] for details.

---

## Troubleshooting

### "Model file not found"

**Error**:
```
Error: Model file not found at .codeindex/models/all-MiniLM-L6-v2.onnx
```

**Solution**:
```bash
code-index download-model all-MiniLM-L6-v2
# or
code-index doctor  # Diagnoses and fixes issues
```

### "No chunks found"

**Error**:
```
Error: No chunks found. Run 'code-index index' first.
```

**Solution**:
```bash
code-index index  # Index your codebase first
code-index embed  # Then generate embeddings
```

### Slow Performance

**Issue**: Embedding takes longer than expected

**Solutions**:
1. **Increase batch size**: `code-index embed --batch-size 32`
2. **Use quantized model**: Faster inference with minimal quality loss
3. **Check system resources**: Ensure sufficient CPU and memory
4. **Use incremental updates**: Only embed changed chunks

### Out of Memory

**Error**:
```
Error: Insufficient memory for embedding generation
```

**Solutions**:
1. **Reduce batch size**: `code-index embed --batch-size 8`
2. **Close other applications**: Free up system memory
3. **Use quantized model**: Reduces memory footprint

---

## Best Practices

### 1. Embed After Indexing

Always run in this order:
```bash
code-index index  # First
code-index embed  # Second
```

### 2. Use Incremental Updates

For daily development:
```bash
# After making changes
code-index index && code-index embed
```

**Why**: 10x faster than full re-indexing

### 3. Preview with Dry-Run

Before expensive operations:
```bash
code-index embed --dry-run  # Check impact
code-index embed            # Execute if okay
```

### 4. Monitor Performance

Use `--verbose` to track throughput:
```bash
code-index embed --verbose
```

Look for:
- **Throughput**: Should be 50-150 chunks/sec for local models
- **Memory usage**: Should stay under 500MB
- **Duration**: Proportional to codebase size

### 5. Automate Updates

Add to your CI/CD or git hooks:
```bash
#!/bin/bash
# .git/hooks/post-commit
code-index index
code-index embed --quiet
```

---

## Advanced Topics

### JSON Output for Scripting

```bash
code-index embed --json | jq '.stats'
```

**Output**:
```json
{
  "embedded": 84,
  "skipped": 1150,
  "duration_ms": 12345,
  "throughput_per_sec": 6.8
}
```

**Use cases**:
- CI/CD integration
- Performance monitoring
- Automated reporting

### Model Switching

When changing models with different dimensions:

```bash
# Automatic cleanup and re-embed
code-index embed --model new-model-name
```

**Warning**: This deletes all existing embeddings and re-embeds everything (slow for large codebases).

### Batch Processing

For very large codebases (100k+ files):

```bash
# Split into smaller batches
code-index embed --batch-size 32 --verbose
```

Monitor memory usage and adjust batch size if needed.

---

## FAQ

### Q: How long does embedding take?

**A**: Depends on codebase size and hardware:
- **1,000 chunks**: ~10-20 seconds
- **10,000 chunks**: ~2-3 minutes
- **100,000 chunks**: ~15-30 minutes

Incremental updates are 10x faster (only changed chunks).

### Q: How much disk space do embeddings use?

**A**: Approximately 1.7 KB per chunk:
- **1,000 chunks**: ~1.7 MB
- **10,000 chunks**: ~17 MB
- **100,000 chunks**: ~170 MB

### Q: Can I use multiple models?

**A**: Not simultaneously. Each run uses one model. Switching models requires re-embedding all chunks.

### Q: Do embeddings work offline?

**A**: Yes! The default local model (all-MiniLM-L6-v2) works completely offline after initial download.

### Q: Are embeddings secure?

**A**: Yes:
- Stored locally in `.codeindex/index.db`
- Never transmitted externally (unless using hosted models)
- No telemetry or data collection

### Q: How do I update the embedding model?

**A**: Models are versioned. To update:
```bash
code-index download-model all-MiniLM-L6-v2@latest
code-index embed --force  # Re-embed with new version
```

---

## Next Steps

- **Use embeddings for search**: `code-index search --semantic "find authentication logic"`
- **Explore similar code**: `code-index similar <file>:<line>`
- **Configure custom models**: See [Model Configuration Guide]
- **Integrate with AI tools**: See [AI Integration Guide]

---

## Getting Help

- **Documentation**: `code-index embed --help`
- **Diagnostics**: `code-index doctor`
- **Issues**: https://github.com/your-org/code-index/issues
- **Community**: https://discord.gg/code-index

---

## Document Metadata

- **Version**: 1.0.0
- **Feature**: 008-add-a-pluggable
- **Last Updated**: 2025-10-14
- **Target Audience**: Developers using code-index CLI
