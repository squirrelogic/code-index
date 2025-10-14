# Data Model: Hardware-Aware Embedding Selection

**Feature**: 007-hardware-aware-embedding
**Date**: 2025-01-13
**Status**: Draft

## Overview

This document defines the data entities, relationships, and storage schemas for the hardware-aware embedding selection feature.

---

## Entity Definitions

### 1. Hardware Capabilities

Represents the detected hardware configuration of the system.

**Attributes**:
- `cpuCores`: number - Number of available CPU cores
- `totalRAM`: number - Total system RAM in bytes
- `freeRAM`: number - Currently available RAM in bytes
- `platform`: string - Operating system (darwin, linux, win32)
- `arch`: string - CPU architecture (x64, arm64)
- `cpuModel`: string - CPU model name
- `gpu`: GPUInfo | null - GPU information if available
- `detectedAt`: Date - When hardware was detected
- `onnxProviders`: string[] - Available ONNX Runtime execution providers

**Relationships**:
- Used to select default `EmbeddingProfile`
- Determines available `Backend` options

**Validation**:
- `cpuCores` must be > 0
- `totalRAM` must be > 0
- `platform` must be one of: darwin, linux, win32
- `arch` must be one of: x64, arm64

**Source**: Detected by `HardwareDetector` service

---

### 2. GPU Info

Represents GPU hardware details when available.

**Attributes**:
- `vendor`: string - GPU vendor (NVIDIA, AMD, Apple, Intel)
- `name`: string - GPU model name
- `memory`: number - GPU memory in bytes
- `driverVersion`: string | null - Driver version (NVIDIA/AMD)
- `computeCapability`: number | null - NVIDIA compute capability (e.g., 8.6)
- `metalVersion`: string | null - Metal version for Apple Silicon

**Relationships**:
- Part of `HardwareCapabilities`
- Determines available `ExecutionProvider` options

**Validation**:
- `vendor` must be one of: NVIDIA, AMD, Apple, Intel, Unknown
- `memory` must be > 0 if specified
- `computeCapability` required for NVIDIA GPUs ≥6.0

**Source**: Detected via nvidia-smi, system_profiler, or rocm-smi

---

### 3. Embedding Profile

Represents a complete configuration set for embedding generation.

**Attributes**:
- `name`: string - Profile name (light, balanced, performance, or custom name)
- `model`: string - Hugging Face model ID or local path
- `modelVersion`: string - Model version/commit hash (default: "main")
- `backend`: Backend - Execution backend (onnx or pytorch)
- `device`: Device - Target device (cpu, mps, cuda)
- `quantization`: Quantization - Quantization level (int8, int4, fp16, fp32)
- `batchSize`: number - Batch size for processing
- `dimensions`: number - Embedding vector dimensions
- `cacheDir`: string - Cache directory path

**Preset Profiles**:

```typescript
const PRESET_PROFILES = {
  light: {
    name: 'light',
    model: 'Xenova/all-MiniLM-L6-v2',
    modelVersion: 'main',
    backend: 'onnx',
    device: 'cpu',
    quantization: 'int8',
    batchSize: 16,
    dimensions: 384,
    cacheDir: '.codeindex/cache'
  },
  balanced: {
    name: 'balanced',
    model: 'Xenova/all-mpnet-base-v2',
    modelVersion: 'main',
    backend: 'onnx',
    device: 'auto',  // Selected based on hardware
    quantization: 'auto',  // int8 for CPU, fp16 for GPU
    batchSize: 32,
    dimensions: 768,
    cacheDir: '.codeindex/cache'
  },
  performance: {
    name: 'performance',
    model: 'Xenova/instructor-large',
    modelVersion: 'main',
    backend: 'onnx',
    device: 'auto',  // Prefers GPU
    quantization: 'fp16',
    batchSize: 64,
    dimensions: 768,
    cacheDir: '.codeindex/cache'
  }
};
```

**Relationships**:
- Selected by `ProfileManager` based on `HardwareCapabilities`
- Persisted in `EmbeddingConfig`
- Determines which `EmbeddingModel` to load

**Validation**:
- `name` must be non-empty string
- `model` must be valid Hugging Face ID or local path
- `batchSize` must be in range [1, 256]
- `dimensions` must be > 0
- `cacheDir` must be valid directory path
- `device` must be supported by detected hardware
- `quantization` must be supported by backend + device combination

**State Transitions**:
- Profile can be switched via CLI command
- Profile auto-degrades through fallback chain on errors
- Switching profiles with different dimensions invalidates cache

---

### 4. Embedding Config

Represents the persisted configuration state.

**Attributes**:
- `version`: string - Config schema version (e.g., "1.0.0")
- `profile`: EmbeddingProfile - Active profile configuration
- `hardwareCapabilities`: HardwareCapabilities - Last detected hardware
- `fallbackHistory`: FallbackEvent[] - History of fallback actions
- `createdAt`: Date - When config was created
- `updatedAt`: Date - When config was last modified

**Relationships**:
- Persisted in `.codeindex/config.json`
- Loaded by `ConfigManager` service
- Updated by CLI commands and fallback chain

**Validation**:
- `version` must match current schema version or be upgradeable
- `profile` must be valid EmbeddingProfile
- `hardwareCapabilities` updated on each `doctor` command

**Storage**: JSON file at `.codeindex/config.json`

---

### 5. Embedding Model

Represents a loaded embedding model instance.

**Attributes**:
- `modelId`: string - Hugging Face model ID
- `modelVersion`: string - Commit hash or tag
- `backend`: Backend - ONNX or PyTorch
- `device`: Device - CPU, MPS, or CUDA
- `quantization`: Quantization - Quantization level
- `dimensions`: number - Output embedding dimensions
- `loadedAt`: Date - When model was loaded
- `modelPath`: string - Local file system path to model
- `pipeline`: unknown - Transformers.js pipeline instance (opaque)

**Relationships**:
- Managed by `ModelLoader` service
- Singleton instance per process
- References `EmbeddingProfile` for configuration

**Validation**:
- `modelId` must be valid and accessible
- `dimensions` must match profile configuration
- `device` must be available on current hardware
- `pipeline` must be successfully initialized

**Lifecycle**:
- Lazy loaded on first embed operation
- Cached in memory for reuse
- Reset when profile changes
- Fallback creates new instance with degraded config

---

### 6. Embedding Cache Entry

Represents a cached embedding vector in the database.

**Attributes**:
- `id`: integer - Primary key (auto-increment)
- `contentHash`: string - SHA-256 hash of source content
- `modelId`: string - Model used to generate embedding
- `modelVersion`: string - Model version/commit hash
- `dimensions`: number - Embedding vector dimensions
- `embedding`: Buffer - Binary blob of float32 array
- `createdAt`: Date - When embedding was generated
- `lastAccessedAt`: Date - Last cache hit timestamp

**Relationships**:
- Stored in `.codeindex/cache/embeddings.db` SQLite database
- Indexed by (`contentHash`, `modelId`, `modelVersion`, `dimensions`)
- Invalidated when model dimensions change

**Validation**:
- `contentHash` must be 64-character hex string (SHA-256)
- `modelId` must be non-empty
- `dimensions` must match current profile dimensions
- `embedding` must be valid binary blob of length `dimensions * 4` bytes

**Indexing**:
```sql
CREATE INDEX idx_lookup ON embeddings (contentHash, modelId, modelVersion, dimensions);
CREATE INDEX idx_accessed ON embeddings (lastAccessedAt);  -- For cache eviction
```

---

### 7. Fallback Event

Represents a single fallback action taken by the system.

**Attributes**:
- `timestamp`: Date - When fallback occurred
- `level`: string - Event level (warn, error)
- `action`: FallbackAction - Type of fallback action
- `from`: Partial<EmbeddingProfile> - Configuration before fallback
- `to`: Partial<EmbeddingProfile> - Configuration after fallback
- `reason`: string - Why fallback was triggered
- `success`: boolean - Whether fallback resolved the issue

**Fallback Actions**:
- `reduce_batch` - Reduce batch size by 50%
- `switch_device` - Switch from GPU to CPU/MPS
- `switch_model` - Switch to smaller/lighter model
- `switch_quantization` - Switch to int8 quantization

**Relationships**:
- Logged to `.codeindex/logs/embedding.jsonl`
- Stored in `EmbeddingConfig.fallbackHistory` (last 10 events)
- Used for diagnostics in `doctor` command

**Validation**:
- `action` must be valid FallbackAction
- `success` must be boolean
- `reason` must be non-empty string

**JSON Format**:
```json
{
  "timestamp": "2025-01-13T10:30:00.000Z",
  "level": "warn",
  "action": "reduce_batch",
  "from": { "batchSize": 64 },
  "to": { "batchSize": 32 },
  "reason": "CUDA out of memory",
  "success": true
}
```

---

## Type Definitions

### Enumerations

```typescript
enum Backend {
  ONNX = 'onnx',
  PYTORCH = 'pytorch'
}

enum Device {
  CPU = 'cpu',
  MPS = 'mps',      // Apple Silicon
  CUDA = 'cuda',    // NVIDIA GPU
  AUTO = 'auto'     // Select based on hardware
}

enum Quantization {
  INT8 = 'int8',
  INT4 = 'int4',
  FP16 = 'fp16',
  FP32 = 'fp32',
  AUTO = 'auto'     // Select based on device
}

enum FallbackAction {
  REDUCE_BATCH = 'reduce_batch',
  SWITCH_DEVICE = 'switch_device',
  SWITCH_MODEL = 'switch_model',
  SWITCH_QUANTIZATION = 'switch_quantization'
}

enum ExecutionProvider {
  CPU = 'CPUExecutionProvider',
  CUDA = 'CUDAExecutionProvider',
  COREML = 'CoreMLExecutionProvider',
  DIRECTML = 'DirectMLExecutionProvider'
}
```

---

## Storage Schemas

### 1. Configuration File (.codeindex/config.json)

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
    "freeRAM": 8589934592,
    "platform": "darwin",
    "arch": "arm64",
    "cpuModel": "Apple M1 Pro",
    "gpu": {
      "vendor": "Apple",
      "name": "Apple M1 Pro",
      "memory": 17179869184,
      "metalVersion": "3.0"
    },
    "detectedAt": "2025-01-13T10:00:00.000Z",
    "onnxProviders": ["CoreMLExecutionProvider", "CPUExecutionProvider"]
  },
  "fallbackHistory": [],
  "createdAt": "2025-01-13T10:00:00.000Z",
  "updatedAt": "2025-01-13T10:00:00.000Z"
}
```

### 2. Embedding Cache Database (.codeindex/cache/embeddings.db)

**SQLite Schema**:

```sql
CREATE TABLE IF NOT EXISTS embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contentHash TEXT NOT NULL,           -- SHA-256 of content
  modelId TEXT NOT NULL,               -- e.g., 'Xenova/all-MiniLM-L6-v2'
  modelVersion TEXT NOT NULL,          -- e.g., 'main' or commit hash
  dimensions INTEGER NOT NULL,         -- e.g., 384, 768
  embedding BLOB NOT NULL,             -- float32 array as binary
  createdAt INTEGER NOT NULL,          -- Unix timestamp
  lastAccessedAt INTEGER NOT NULL,     -- Unix timestamp

  UNIQUE(contentHash, modelId, modelVersion, dimensions)
);

CREATE INDEX IF NOT EXISTS idx_lookup
  ON embeddings (contentHash, modelId, modelVersion, dimensions);

CREATE INDEX IF NOT EXISTS idx_accessed
  ON embeddings (lastAccessedAt);  -- For LRU cache eviction

CREATE INDEX IF NOT EXISTS idx_model
  ON embeddings (modelId, dimensions);  -- For model-based invalidation
```

**Binary Encoding**:
- Embeddings stored as `float32` (4 bytes per dimension)
- 384-dim vector = 1,536 bytes
- 768-dim vector = 3,072 bytes

**Example Query**:
```sql
SELECT embedding FROM embeddings
WHERE contentHash = ?
  AND modelId = ?
  AND modelVersion = ?
  AND dimensions = ?
LIMIT 1;
```

### 3. Fallback Log (.codeindex/logs/embedding.jsonl)

**JSON Lines Format** (one event per line):

```jsonl
{"timestamp":"2025-01-13T10:30:00.000Z","level":"warn","action":"reduce_batch","from":{"batchSize":64},"to":{"batchSize":32},"reason":"CUDA out of memory","success":true}
{"timestamp":"2025-01-13T10:31:00.000Z","level":"error","action":"switch_device","from":{"device":"cuda"},"to":{"device":"cpu"},"reason":"CUDA device not available","success":true}
```

---

## Relationships Diagram

```
┌─────────────────────┐
│ HardwareCapabilities│
│  - cpuCores         │
│  - totalRAM         │
│  - gpu: GPUInfo?    │
└──────────┬──────────┘
           │ determines
           ↓
┌─────────────────────┐
│  EmbeddingProfile   │
│  - model            │
│  - device           │
│  - quantization     │
│  - batchSize        │
└──────────┬──────────┘
           │ configures
           ↓
┌─────────────────────┐         ┌─────────────────────┐
│  EmbeddingModel     │────────→│  EmbeddingConfig    │
│  - pipeline         │ saved   │  - profile          │
│  - dimensions       │  in     │  - hardware         │
└──────────┬──────────┘         │  - fallbackHistory  │
           │ generates           └─────────────────────┘
           ↓                              ↑ persists
┌─────────────────────┐                  │
│ EmbeddingCacheEntry │──────────────────┘
│  - contentHash      │
│  - embedding (blob) │
│  - dimensions       │
└─────────────────────┘
```

---

## Cache Invalidation Rules

### Automatic Invalidation

**Trigger**: Model dimension change
```typescript
if (newProfile.dimensions !== currentProfile.dimensions) {
  logger.warn(`Dimension change detected: ${currentProfile.dimensions} → ${newProfile.dimensions}`);
  logger.warn('Invalidating entire embedding cache');
  await db.exec('DELETE FROM embeddings WHERE dimensions = ?', currentProfile.dimensions);
}
```

**Trigger**: Model change (different model ID)
```typescript
if (newProfile.model !== currentProfile.model) {
  logger.info(`Model changed: ${currentProfile.model} → ${newProfile.model}`);
  // Keep cache, embeddings remain valid for different model
}
```

### Manual Invalidation

**Command**: `code-index embed --rebuild`
- Deletes all entries from cache
- Regenerates embeddings for all indexed files
- Useful after configuration changes

### Selective Invalidation

**By content**: Remove specific file
```sql
DELETE FROM embeddings WHERE contentHash = ?;
```

**By model**: Remove all embeddings for a specific model
```sql
DELETE FROM embeddings WHERE modelId = ? AND dimensions = ?;
```

---

## Memory Estimates

| Entity | In-Memory Size | Persistent Size |
|--------|---------------|-----------------|
| HardwareCapabilities | ~1 KB | N/A (ephemeral) |
| GPUInfo | ~500 B | N/A |
| EmbeddingProfile | ~500 B | ~1 KB JSON |
| EmbeddingConfig | ~2 KB | ~3 KB JSON |
| EmbeddingModel | 50-500 MB | 50-500 MB |
| EmbeddingCacheEntry | 1.5-3 KB | 1.5-3 KB + overhead |
| FallbackEvent | ~500 B | ~200 B JSON |

**Total for 1000 files** (balanced profile, 768-dim):
- Cache DB: ~3 MB
- Model in memory: ~200 MB
- Working memory: ~400 MB (with batching)
- Total: ~600 MB

---

## Validation Rules Summary

1. **Hardware detection results must be cached** for 5 minutes to avoid repeated detection overhead
2. **Batch size must be ≥1** and ≤256, with fallback reducing by 50% each step
3. **Device must be supported** by detected hardware and ONNX Runtime providers
4. **Model dimensions must match** between profile configuration and loaded model
5. **Cache entries invalid** if dimensions don't match current profile
6. **Quantization must be compatible** with backend (int8/int4 for ONNX, fp16/fp32 for both)
7. **Profile names must be unique** within user-defined custom profiles
8. **Content hashes must be SHA-256** (64 hex characters)
9. **Model versions must be valid** Git references (commit/tag/branch)
10. **Fallback chains must eventually succeed** or report terminal failure

---

## Change History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-13 | Initial data model definition |

---

*End of Data Model Document*
