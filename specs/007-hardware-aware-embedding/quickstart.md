# Hardware-Aware Embedding Quick Start

**Feature**: Hardware-Aware Embedding Selection
**Version**: 1.0.0
**Last Updated**: 2025-01-13

## Overview

The code-index CLI now intelligently detects your hardware and automatically configures optimal embedding generation settings. Whether you have a powerful NVIDIA GPU, Apple Silicon with Metal support, or just a CPU, the tool adapts to provide the best performance for your setup.

### Key Benefits

- **🚀 Automatic optimization** - No manual configuration needed
- **💾 Smart caching** - Embeddings are cached to avoid regeneration
- **🔄 Graceful fallbacks** - Automatically adjusts if resources are constrained
- **⚙️ Fully customizable** - Override defaults for your specific needs
- **📊 Transparent diagnostics** - Understand exactly what's happening

---

## Quick Start

### 1. First Time Setup

When you run code-index for the first time, it automatically detects your hardware:

```bash
# Initialize project (detects hardware automatically)
code-index init

# Output:
# ✓ Hardware detected: NVIDIA GeForce RTX 3090 (24GB)
# ✓ Selected profile: performance (optimized for your GPU)
# ✓ Configuration saved to .codeindex/config.json
```

That's it! The tool has:
- Detected your NVIDIA GPU
- Selected the "performance" profile (GPU-optimized)
- Configured optimal settings (model, batch size, quantization)

### 2. Generate Embeddings

Now embed your indexed files:

```bash
code-index embed

# Output:
# ✓ Model loaded: Xenova/instructor-large (768 dimensions)
# [████████████████████] 100% | 1000/1000 files | Mem: 420MB
# ✓ Embeddings generated in 15.2s (65.8 files/sec)
```

### 3. Check System Status

Verify everything is configured correctly:

```bash
code-index doctor

# Output:
# Hardware:
#   GPU: NVIDIA GeForce RTX 3090 (24GB)
#   CPU: Intel i9-10900K (20 cores)
#
# Configuration:
#   Profile: performance
#   Model: Xenova/instructor-large (768d)
#   Device: cuda
#   Quantization: fp16
#
# ✓ System configuration optimal
```

---

## Hardware Profiles

The system automatically selects one of three profiles based on your hardware:

### Light Profile (CPU-only)

**Selected when:** No GPU detected or low RAM (<8GB)

```
Model: Xenova/all-MiniLM-L6-v2
Dimensions: 384
Quantization: int8
Batch Size: 16
Expected Speed: ~50 files/sec
Memory Usage: ~150MB
```

**Best for:** Laptops, CI/CD environments, minimal installations

### Balanced Profile (Mid-range)

**Selected when:** Apple Silicon or mid-range GPU detected

```
Model: Xenova/all-mpnet-base-v2
Dimensions: 768
Quantization: fp16 (GPU) or int8 (CPU)
Batch Size: 32
Expected Speed: ~33 files/sec
Memory Usage: ~400MB
```

**Best for:** Developer workstations, general-purpose use

### Performance Profile (High-end)

**Selected when:** NVIDIA RTX 2000+ series (compute capability ≥7.5)

```
Model: Xenova/instructor-large
Dimensions: 768
Quantization: fp16
Batch Size: 64
Expected Speed: ~100 files/sec
Memory Usage: ~800MB
```

**Best for:** High-performance workstations, dedicated indexing

---

## Customizing Configuration

### Change Profile

Switch between preset profiles:

```bash
# Switch to light profile (faster, less accurate)
code-index config set embedding.profile light

# Switch to performance profile (slower, more accurate)
code-index config set embedding.profile performance
```

**Note:** Changing profiles with different dimensions invalidates the cache.

### Change Model

Use a different embedding model:

```bash
# Use a smaller model
code-index config set embedding.model Xenova/all-MiniLM-L6-v2

# Use a specific version
code-index config set embedding.model Xenova/all-mpnet-base-v2 --version v1.0.0

# Use a local model
code-index config set embedding.model /path/to/local/model
```

**Warning:** Changing models with different dimensions (e.g., 384d → 768d) will invalidate your embedding cache.

### Adjust Batch Size

Control how many embeddings are processed simultaneously:

```bash
# Smaller batch (less memory, slower)
code-index config set embedding.batchSize 16

# Larger batch (more memory, faster)
code-index config set embedding.batchSize 128
```

**Recommended values:**
- CPU: 8-32
- Apple Silicon (MPS): 16-64
- NVIDIA GPU (CUDA): 32-256

The system will automatically reduce batch size if it encounters out-of-memory errors.

### Change Quantization

Adjust the precision/speed trade-off:

```bash
# Fastest, lowest memory (CPU-optimized)
code-index config set embedding.quantization int8

# Balanced (GPU-recommended)
code-index config set embedding.quantization fp16

# Highest quality (slowest)
code-index config set embedding.quantization fp32
```

### Set Cache Directory

Change where embeddings are cached:

```bash
code-index config set embedding.cacheDir /path/to/cache
```

---

## Common Workflows

### Workflow 1: Regenerate All Embeddings

Force rebuild of entire cache (useful after model changes):

```bash
code-index embed --rebuild
```

### Workflow 2: Embed Specific Files

Generate embeddings for specific files only:

```bash
code-index embed --files src/main.ts src/utils.ts
```

### Workflow 3: Override Profile Temporarily

Use a different profile without changing config:

```bash
# Use light profile for this run only
code-index embed --profile light
```

### Workflow 4: Diagnose Issues

Check system health and configuration:

```bash
# Human-readable output
code-index doctor

# Machine-readable output
code-index doctor --json
```

### Workflow 5: Get JSON Output

Useful for scripts and automation:

```bash
code-index embed --json
```

**Output:**
```json
{
  "success": true,
  "summary": {
    "total": 1000,
    "cached": 850,
    "generated": 150,
    "failed": 0,
    "duration": 15.2,
    "throughput": 65.8
  },
  "hardware": {
    "device": "cuda",
    "gpu": "NVIDIA GeForce RTX 3090"
  },
  "model": {
    "id": "Xenova/all-mpnet-base-v2",
    "dimensions": 768
  }
}
```

---

## Troubleshooting

### Problem: CUDA out of memory

**Symptoms:**
```
⚠ CUDA out of memory (batch size 64)
→ Fallback: Reducing batch size to 32
```

**Solution:** The system handles this automatically by reducing batch size. If you want to avoid the fallback:

```bash
# Manually set smaller batch size
code-index config set embedding.batchSize 32
```

### Problem: Model download failed

**Symptoms:**
```
✗ Error: Failed to download model Xenova/all-mpnet-base-v2
  Network error: ENOTFOUND
```

**Solutions:**
1. Check internet connection
2. Wait and retry (system will retry 3 times with exponential backoff)
3. Download model manually and use local path:

```bash
# Download model to local directory first
# Then configure to use local path
code-index config set embedding.model /path/to/downloaded/model
```

### Problem: GPU detected but not used

**Symptoms:**
```
Hardware:
  GPU: NVIDIA GeForce GTX 1060
  Device: cpu  # Should be cuda
```

**Causes:**
- CUDA drivers not installed
- CUDA version incompatible
- GPU compute capability too old (<6.0)

**Solution:**
1. Check CUDA installation: `nvidia-smi`
2. Install/update CUDA drivers
3. If GPU is too old, use CPU:

```bash
code-index config set embedding.profile light
```

### Problem: Embeddings seem incorrect

**Symptoms:** Search results are poor quality

**Solutions:**

1. **Check cache staleness:**
```bash
# Rebuild cache from scratch
code-index embed --rebuild
```

2. **Verify model configuration:**
```bash
code-index doctor
# Check model dimensions match between config and cache
```

3. **Try different model:**
```bash
# Use higher-quality model
code-index config set embedding.model Xenova/all-mpnet-base-v2
code-index embed --rebuild
```

### Problem: Slow embedding generation

**Symptoms:** Taking >1 minute per 100 files

**Solutions:**

1. **Increase batch size** (if memory available):
```bash
code-index config set embedding.batchSize 64
```

2. **Check hardware utilization:**
```bash
# On NVIDIA GPU
nvidia-smi

# Check if GPU is being used
# GPU utilization should be >70% during embedding
```

3. **Switch to lighter model** (if quality is acceptable):
```bash
code-index config set embedding.profile light
```

### Problem: High memory usage

**Symptoms:** System swapping/freezing during embedding

**Solutions:**

1. **Reduce batch size:**
```bash
code-index config set embedding.batchSize 8
```

2. **Switch to lighter model:**
```bash
code-index config set embedding.model Xenova/all-MiniLM-L6-v2
```

3. **Use more aggressive quantization:**
```bash
code-index config set embedding.quantization int8
```

---

## Understanding Fallbacks

The system implements an automatic fallback chain to maintain availability:

### Fallback Chain

1. **Reduce Batch Size** (÷2, minimum 1)
   - **Trigger:** Out of memory error
   - **Impact:** 2x slower, same quality
   - **Logged:** ⚠ Warning

2. **Switch Device** (GPU → CPU/MPS)
   - **Trigger:** CUDA unavailable, GPU error
   - **Impact:** 5-10x slower, same quality
   - **Logged:** ⚠ Warning

3. **Switch to Smaller Model**
   - **Trigger:** Model load failure, persistent OOM
   - **Impact:** Lower quality, faster
   - **Logged:** ⚠ Warning + cache invalidation

4. **Switch Quantization** (→ int8)
   - **Trigger:** Memory constraints
   - **Impact:** Slightly lower quality, 2x faster
   - **Logged:** ⚠ Warning

### Example Fallback

```bash
code-index embed

# Output:
# ✓ Hardware detected: NVIDIA GeForce RTX 3090
# ✓ Model loaded: Xenova/instructor-large
# ⠋ Generating embeddings (batch size 128)...
# ⚠ CUDA out of memory (batch size 128)
# → Fallback: Reducing batch size to 64
# ✓ Continued successfully
# [████████████████████] 100% | 1000/1000 files
# ✓ Completed with 1 fallback (see logs for details)
```

**Fallback Log** (`.codeindex/logs/embedding.jsonl`):
```json
{"timestamp":"2025-01-13T10:30:00.000Z","level":"warn","action":"reduce_batch","from":{"batchSize":128},"to":{"batchSize":64},"reason":"CUDA out of memory","success":true}
```

---

## Best Practices

### 1. Let Auto-Detection Work

Trust the automatic hardware detection and profile selection. It's optimized for 95% of use cases.

```bash
# ✓ Good: Let system auto-configure
code-index init

# ✗ Avoid: Manual configuration unless needed
code-index config set embedding.profile performance  # Only if auto-selection is wrong
```

### 2. Use Cache Effectively

Don't rebuild embeddings unnecessarily:

```bash
# ✓ Good: Normal operation uses cache
code-index embed

# ✗ Avoid: Rebuilding without reason wastes time
code-index embed --rebuild  # Only when necessary
```

### 3. Monitor with Doctor

Regularly check system health:

```bash
# Weekly or after hardware/config changes
code-index doctor
```

### 4. Start Conservative

Begin with recommended settings and only optimize if needed:

```bash
# ✓ Good: Start with defaults
code-index embed

# ✓ If slow, incrementally increase batch size
code-index config set embedding.batchSize 64

# ✗ Avoid: Maxing out immediately
code-index config set embedding.batchSize 256  # May cause OOM
```

### 5. Understand Dimension Changes

Changing models with different dimensions invalidates cache:

```bash
# ⚠ This will invalidate cache (384d → 768d)
code-index config set embedding.model Xenova/all-mpnet-base-v2

# You'll need to rebuild
code-index embed --rebuild
```

---

## Configuration Reference

### Default Locations

- **Config:** `.codeindex/config.json`
- **Cache:** `.codeindex/cache/embeddings.db`
- **Models:** `.codeindex/models/`
- **Logs:** `.codeindex/logs/embedding.jsonl`

### Example Configuration

```json
{
  "version": "1.0.0",
  "profile": {
    "name": "balanced",
    "model": "Xenova/all-mpnet-base-v2",
    "modelVersion": "main",
    "backend": "onnx",
    "device": "mps",
    "quantization": "fp16",
    "batchSize": 32,
    "dimensions": 768,
    "cacheDir": ".codeindex/cache"
  },
  "hardwareCapabilities": {
    "cpuCores": 10,
    "totalRAM": 34359738368,
    "gpu": {
      "vendor": "Apple",
      "name": "Apple M1 Pro",
      "memory": 17179869184
    }
  }
}
```

---

## Performance Expectations

### By Hardware Type

| Hardware | Profile | Throughput | Memory | Quality |
|----------|---------|------------|--------|---------|
| CPU-only | Light | ~50 files/sec | ~150MB | Good (84%) |
| Apple M1/M2 | Balanced | ~33 files/sec | ~400MB | Excellent (87%) |
| NVIDIA RTX 30+ | Performance | ~100 files/sec | ~800MB | Best (89%) |

**Quality:** Accuracy on STSb semantic similarity benchmark

### By Codebase Size

| Files | First Run | Subsequent (cached) | Cache Size |
|-------|-----------|---------------------|------------|
| 100 | 2-5 sec | <1 sec | ~300 KB |
| 1,000 | 15-30 sec | <5 sec | ~3 MB |
| 10,000 | 2-5 min | <30 sec | ~30 MB |
| 100,000 | 20-50 min | <5 min | ~300 MB |

**Note:** Times assume balanced profile on mid-range hardware. Performance profile on GPU can be 3-5x faster.

---

## Next Steps

- **Search Integration:** Use embeddings for semantic code search
- **Custom Profiles:** Create specialized profiles for your workflow
- **CI/CD Integration:** Automate embedding generation in your pipeline
- **Monitoring:** Set up alerts for embedding failures

---

## Getting Help

### Commands

```bash
# General help
code-index --help

# Command-specific help
code-index embed --help
code-index config --help
code-index doctor --help
```

### Documentation

- [Feature Specification](./spec.md) - Detailed requirements
- [Data Model](./data-model.md) - Entity definitions
- [CLI Contracts](./contracts/cli-commands.yaml) - Complete API reference

### Support

- **Issues:** [GitHub Issues](https://github.com/squirrelogic/code-index/issues)
- **Discussions:** [GitHub Discussions](https://github.com/squirrelogic/code-index/discussions)

---

**Last Updated:** 2025-01-13
**Feature Version:** 1.0.0
**Min CLI Version:** TBD
