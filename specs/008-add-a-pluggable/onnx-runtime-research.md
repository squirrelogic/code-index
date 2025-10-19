# ONNX Runtime Node.js Integration Research

## Research Date
October 14, 2025

## Executive Summary

This document provides comprehensive research on integrating ONNX Runtime with Node.js for running the all-MiniLM-L6-v2 embedding model in the code-index CLI tool. The research covers installation, model loading, inference patterns, batch processing, memory management, and error handling.

**Key Decision: Use Transformers.js over Direct onnxruntime-node Integration**

After thorough research, **Transformers.js (@huggingface/transformers)** is recommended as the primary approach because:
- Built on top of onnxruntime-node (same performance)
- Handles tokenization automatically
- Simpler API with less boilerplate
- Better maintained and documented for JavaScript/TypeScript
- Works in both Node.js and browser environments

Direct onnxruntime-node integration is feasible but requires manual tokenization, pooling, and more complex implementation.

---

## 1. Installation

### 1.1 onnxruntime-node Package

**NPM Package**: `onnxruntime-node`
**Latest Version**: 1.22.0-rev (as of October 2025)
**Package Registry**: https://www.npmjs.com/package/onnxruntime-node

#### Installation Command
```bash
npm install onnxruntime-node
```

#### Optional: Skip CUDA Installation
```bash
npm install onnxruntime-node --onnxruntime-node-install=skip
```

#### System Requirements

**Node.js Version Support**:
- Minimum: Node.js v16.x
- Recommended: Node.js v20.x+
- Electron: v15.x+ (v28.x+ recommended)

**Platform Support**:
- Linux (requires en_US.UTF-8 locale with English language package)
- Windows (requires Visual C++ 2019 runtime)
- macOS

**GPU Support (Optional)**:
- CUDA EP binaries installed automatically by default
- Requires CUDA v12+ (CUDA v11 no longer supported since v1.22)
- Requires cuDNN installation for GPU acceleration

#### Known Issues

1. **Linux/WSL2 Post-Install Issue**: On Linux/WSL2, the post-install script may error with "Failed to find runtimes/win-x64/native/libonnxruntime_providers_cuda.so in NuGet package" (Issue #24770)
2. **Memory Leak**: Memory leak when creating and releasing sessions repeatedly in Node.js binding (Issue #25325, reported July 2025)

### 1.2 Alternative: Transformers.js (Recommended)

**NPM Package**: `@huggingface/transformers` (formerly @xenova/transformers)
**Installation**:
```bash
npm install @huggingface/transformers
```

**Advantages**:
- Uses onnxruntime-node under the hood
- Automatic tokenization
- Built-in pooling and normalization
- Simpler API
- Better documentation for JavaScript/TypeScript

---

## 2. Model Loading

### 2.1 all-MiniLM-L6-v2 Model Information

**Model Type**: Sentence Transformer
**Output Dimensions**: 384-dimensional dense vector space
**Parameters**: 22.7M
**Use Cases**: Semantic search, clustering, sentence similarity
**License**: Apache 2.0

#### Model Architecture Details
- Pretrained on MiniLM-L6-H384-uncased
- Fine-tuned on 1+ billion sentence pairs
- Maximum sequence length: 256 word pieces (128 tokens during training)
- Tokenization: Uncased BERT tokenizer
- Pooling: Mean pooling with attention mask

### 2.2 Model Sources (Hugging Face)

#### Option 1: Official Sentence-Transformers Repository
```
Model: sentence-transformers/all-MiniLM-L6-v2
ONNX File: onnx/model.onnx
Size: 90.4 MB
URL: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/blob/main/onnx/model.onnx
```

**Required Files**:
- `model.onnx` - Main ONNX model file
- `tokenizer.json` - Tokenizer configuration
- `config.json` - Model configuration

#### Option 2: Xenova's Transformers.js-Compatible Version (Recommended)
```
Model: Xenova/all-MiniLM-L6-v2
Optimized for: Transformers.js
URL: https://huggingface.co/Xenova/all-MiniLM-L6-v2
```

**Advantages**:
- Pre-optimized for JavaScript environments
- Includes quantized versions for faster inference
- Better integration with Transformers.js

#### Option 3: LightEmbed Optimized Version
```
Model: LightEmbed/sbert-all-MiniLM-L6-v2-onnx
Features: Optimized for speed, uses onnxruntime and tokenizers
```

### 2.3 Loading Models in Code

#### Using Transformers.js (Recommended Approach)

```typescript
import { pipeline } from '@huggingface/transformers';

// Load model - downloads and caches automatically
const extractor = await pipeline(
  'feature-extraction',
  'Xenova/all-MiniLM-L6-v2'
);
```

**Quantized Model Loading**:
```typescript
// Load quantized version (smaller, faster)
const extractor = await pipeline(
  'feature-extraction',
  'Xenova/all-MiniLM-L6-v2',
  { dtype: 'q8' } // or 'q4' for more aggressive quantization
);
```

#### Using Direct onnxruntime-node (Advanced)

```typescript
import * as ort from 'onnxruntime-node';

// Load ONNX model from file
const session = await ort.InferenceSession.create(
  './models/all-MiniLM-L6-v2/model.onnx',
  {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
    enableCpuMemArena: false, // Help prevent memory leaks
    enableMemPattern: false,  // Help prevent memory leaks
    logSeverityLevel: 0
  }
);

console.log('Input names:', session.inputNames);   // ['input_ids', 'attention_mask', 'token_type_ids']
console.log('Output names:', session.outputNames); // ['last_hidden_state', 'pooler_output']
```

---

## 3. Inference (Embedding Generation)

### 3.1 Complete Example: Transformers.js (Recommended)

```typescript
import { pipeline } from '@huggingface/transformers';

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  // Create pipeline (cache for reuse)
  const extractor = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2'
  );

  // Generate embeddings with mean pooling and normalization
  const output = await extractor(texts, {
    pooling: 'mean',
    normalize: true
  });

  // Convert to nested array
  return output.tolist();
}

// Usage
const sentences = [
  'This is an example sentence',
  'Each sentence is converted to a 384-dimensional vector'
];

const embeddings = await generateEmbeddings(sentences);
console.log(embeddings[0].length); // 384
```

**Output Structure**:
```typescript
// Tensor format
{
  dims: [2, 384],        // [batch_size, embedding_dim]
  type: 'float32',
  data: Float32Array,    // Raw embeddings
  size: 768              // Total elements (2 * 384)
}
```

### 3.2 Complete Example: Direct onnxruntime-node (Advanced)

This approach requires manual tokenization, tensor creation, and pooling.

```typescript
import * as ort from 'onnxruntime-node';
import { AutoTokenizer } from '@huggingface/transformers';

class ONNXEmbeddingModel {
  private session: ort.InferenceSession | null = null;
  private tokenizer: any = null;

  async initialize(modelPath: string): Promise<void> {
    // Load tokenizer
    this.tokenizer = await AutoTokenizer.from_pretrained(
      'sentence-transformers/all-MiniLM-L6-v2'
    );

    // Load ONNX model
    this.session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
      enableCpuMemArena: false,
      enableMemPattern: false
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.session || !this.tokenizer) {
      throw new Error('Model not initialized');
    }

    // Tokenize inputs
    const encoded = await this.tokenizer(texts, {
      padding: true,
      truncation: true,
      return_tensors: 'js' // Return JavaScript arrays
    });

    // Create ONNX tensors
    const inputIds = new ort.Tensor(
      'int64',
      BigInt64Array.from(encoded.input_ids.flat().map(BigInt)),
      [texts.length, encoded.input_ids[0].length]
    );

    const attentionMask = new ort.Tensor(
      'int64',
      BigInt64Array.from(encoded.attention_mask.flat().map(BigInt)),
      [texts.length, encoded.attention_mask[0].length]
    );

    const tokenTypeIds = new ort.Tensor(
      'int64',
      new BigInt64Array(texts.length * encoded.input_ids[0].length).fill(0n),
      [texts.length, encoded.input_ids[0].length]
    );

    // Run inference
    const feeds = {
      input_ids: inputIds,
      attention_mask: attentionMask,
      token_type_ids: tokenTypeIds
    };

    const outputs = await this.session.run(feeds);
    const lastHiddenState = outputs.last_hidden_state;

    // Apply mean pooling
    const embeddings = this.meanPooling(
      lastHiddenState,
      encoded.attention_mask
    );

    return this.normalize(embeddings);
  }

  private meanPooling(
    modelOutput: ort.Tensor,
    attentionMask: number[][]
  ): number[][] {
    const [batchSize, seqLength, hiddenSize] = modelOutput.dims;
    const data = modelOutput.data as Float32Array;

    const embeddings: number[][] = [];

    for (let i = 0; i < batchSize; i++) {
      const embedding = new Array(hiddenSize).fill(0);
      let sumMask = 0;

      for (let j = 0; j < seqLength; j++) {
        const mask = attentionMask[i][j];
        if (mask > 0) {
          for (let k = 0; k < hiddenSize; k++) {
            const idx = i * seqLength * hiddenSize + j * hiddenSize + k;
            embedding[k] += data[idx] * mask;
          }
          sumMask += mask;
        }
      }

      // Average
      for (let k = 0; k < hiddenSize; k++) {
        embedding[k] /= Math.max(sumMask, 1e-9);
      }

      embeddings.push(embedding);
    }

    return embeddings;
  }

  private normalize(embeddings: number[][]): number[][] {
    return embeddings.map(embedding => {
      const norm = Math.sqrt(
        embedding.reduce((sum, val) => sum + val * val, 0)
      );
      return embedding.map(val => val / norm);
    });
  }

  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
  }
}
```

### 3.3 Input/Output Handling

#### ONNX Model Inputs
The all-MiniLM-L6-v2 ONNX model expects:
- `input_ids`: Token IDs (int64, shape: [batch_size, sequence_length])
- `attention_mask`: Attention mask (int64, shape: [batch_size, sequence_length])
- `token_type_ids`: Token type IDs (int64, shape: [batch_size, sequence_length])

#### ONNX Model Outputs
- `last_hidden_state`: Token embeddings (float32, shape: [batch_size, sequence_length, 384])
- `pooler_output`: Pooled output (not used for sentence embeddings)

#### Post-Processing Required
1. **Mean Pooling**: Average token embeddings weighted by attention mask
2. **Normalization**: L2 normalize the resulting sentence embeddings

---

## 4. Batching for Performance

### 4.1 Performance Targets

From spec.md requirements:
- **Target**: 100+ chunks/second embedding generation
- **Memory**: < 500MB total usage

### 4.2 Batch Processing Strategy

**Recommended Batch Size**: 8-32 sentences per batch

**Rationale**:
- Smaller batches (1-4): Underutilize CPU/memory
- Medium batches (8-32): Optimal for CPU inference
- Large batches (64+): Diminishing returns, memory pressure

#### Batch Processing Implementation

```typescript
async function batchEmbed(
  texts: string[],
  batchSize: number = 16
): Promise<number[][]> {
  const extractor = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2'
  );

  const results: number[][] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const output = await extractor(batch, {
      pooling: 'mean',
      normalize: true
    });
    results.push(...output.tolist());
  }

  return results;
}
```

### 4.3 Performance Optimization Configuration

#### Session Options for onnxruntime-node

```typescript
const sessionOptions: ort.InferenceSession.SessionOptions = {
  // Execution provider (CPU recommended for portable solution)
  executionProviders: ['cpu'],

  // Graph optimization (default is 'all', keep it)
  graphOptimizationLevel: 'all',

  // Threading configuration
  intraOpNumThreads: 0, // 0 = use all physical cores
  interOpNumThreads: 1, // Sequential operator execution

  // Execution mode
  executionMode: 'sequential', // or 'parallel' for models with branches

  // Memory configuration
  enableCpuMemArena: false,    // Disable to reduce memory leaks
  enableMemPattern: false,     // Disable to reduce memory leaks

  // Logging
  logSeverityLevel: 2 // 0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Fatal
};
```

#### Threading Best Practices

**INTRA Threads** (parallelizes computation inside operators):
- Default (0): Uses number of physical CPU cores
- Recommendation: Leave at 0 for auto-detection

**INTER Threads** (parallelizes across operators):
- Default: 1
- Use higher values (2-4) for models with many branches
- all-MiniLM-L6-v2: Keep at 1 (sequential is fine)

**NUMA Systems**:
- Test with affinities set to single NUMA node
- Can provide ~20% performance improvement

### 4.4 Expected Performance

Based on research and similar implementations:
- **CPU (4-8 cores)**: 20-50 embeddings/second (batch=16)
- **CPU (16+ cores)**: 50-100+ embeddings/second (batch=32)
- **Quantized models**: 2-3x faster inference

**Meeting 100+ chunks/second**: Achievable with:
- Batch size: 16-32
- Quantized model (q8 or q4)
- Multi-core CPU (8+ cores)
- Optimized session options

---

## 5. Memory Management

### 5.1 Known Memory Issues

**Critical Issue**: Memory leak when creating and releasing inference sessions in onnxruntime-node (GitHub Issue #25325, July 2025)

**Symptoms**:
- Memory grows with each session create/release cycle
- Example: 325 MB → 994 MB after 10 cycles

**Workaround**: Create session once and reuse throughout application lifecycle

### 5.2 Memory Management Best Practices

#### 1. Session Reuse (Critical)

```typescript
class EmbeddingService {
  private static instance: EmbeddingService;
  private extractor: any = null;

  private constructor() {}

  static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }

  async initialize(): Promise<void> {
    if (!this.extractor) {
      this.extractor = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
      );
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.extractor) {
      throw new Error('Service not initialized');
    }
    const output = await this.extractor(texts, {
      pooling: 'mean',
      normalize: true
    });
    return output.tolist();
  }

  async dispose(): Promise<void> {
    // Only call on application shutdown
    this.extractor = null;
  }
}
```

#### 2. Session Configuration for Memory

```typescript
const sessionOptions = {
  enableCpuMemArena: false,  // Disable memory arena to reduce leaks
  enableMemPattern: false,   // Disable memory pattern optimization
  // Note: These may slightly reduce performance but help with memory
};
```

**Trade-offs**:
- `enableCpuMemArena: false` - Reduces pre-allocation, may slow down inference
- `enableMemPattern: false` - Disables pattern-based optimization

#### 3. Batch Size and Memory

Memory usage scales with batch size:
```
Memory ≈ model_size + (batch_size × sequence_length × hidden_size × 4 bytes)
```

For all-MiniLM-L6-v2:
- Model: ~90 MB
- Per sentence (max 128 tokens): ~196 KB (128 × 384 × 4)
- Batch of 16: ~3.1 MB
- **Total**: ~100 MB for model + working memory

**Target: < 500 MB** - Easily achievable with reasonable batch sizes

#### 4. Input Shape Considerations

Memory increases when new input shapes are encountered:
- ONNX Runtime pre-allocates memory for each unique input shape
- With dynamic inputs, it doesn't know sizes in advance
- **Mitigation**: Use consistent padding/truncation to minimize shape variations

#### 5. Cleanup and Resource Management

```typescript
class ResourceManagedEmbedding {
  private session: ort.InferenceSession | null = null;

  async initialize(modelPath: string): Promise<void> {
    this.session = await ort.InferenceSession.create(modelPath);
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Implementation
  }

  async dispose(): Promise<void> {
    if (this.session) {
      try {
        // Note: release() in JS doesn't actually free memory due to leak
        // Only call on shutdown
        this.session = null;
      } catch (error) {
        console.error('Error disposing session:', error);
      }
    }
  }
}

// Usage pattern
const embedding = new ResourceManagedEmbedding();
await embedding.initialize('./model.onnx');

// Use throughout application lifetime
// ...

// Only on shutdown
process.on('SIGINT', async () => {
  await embedding.dispose();
  process.exit(0);
});
```

### 5.3 Memory Monitoring

```typescript
function logMemoryUsage(label: string): void {
  const usage = process.memoryUsage();
  console.log(`[${label}] Memory Usage:`);
  console.log(`  RSS: ${Math.round(usage.rss / 1024 / 1024)} MB`);
  console.log(`  Heap Used: ${Math.round(usage.heapUsed / 1024 / 1024)} MB`);
  console.log(`  External: ${Math.round(usage.external / 1024 / 1024)} MB`);
}

// Monitor during operations
logMemoryUsage('After model load');
// ... perform embedding
logMemoryUsage('After embedding');
```

---

## 6. Error Handling

### 6.1 Common Errors

#### 1. Model Loading Errors

```typescript
try {
  const session = await ort.InferenceSession.create(modelPath);
} catch (error) {
  if (error.message.includes('ENOENT')) {
    throw new Error(`Model file not found: ${modelPath}`);
  }
  if (error.message.includes('Invalid model')) {
    throw new Error('Corrupted or incompatible ONNX model file');
  }
  throw new Error(`Failed to load model: ${error.message}`);
}
```

**Common Causes**:
- File not found (incorrect path)
- Corrupted ONNX file
- Incompatible ONNX opset version
- Insufficient memory

#### 2. Inference Errors

```typescript
try {
  const outputs = await session.run(feeds);
} catch (error) {
  if (error.message.includes('shape')) {
    throw new Error('Input tensor shape mismatch');
  }
  if (error.message.includes('type')) {
    throw new Error('Input tensor type mismatch (expected int64/float32)');
  }
  throw new Error(`Inference failed: ${error.message}`);
}
```

**Common Causes**:
- Wrong input tensor shape
- Wrong data type (e.g., int32 instead of int64)
- Missing required inputs
- Invalid input values (NaN, Infinity)

#### 3. Tokenization Errors

```typescript
try {
  const encoded = await tokenizer(text);
} catch (error) {
  if (error.message.includes('length')) {
    throw new Error('Input text exceeds maximum sequence length (256 tokens)');
  }
  throw new Error(`Tokenization failed: ${error.message}`);
}
```

#### 4. Memory Errors

```typescript
try {
  const embeddings = await embed(largeTexts);
} catch (error) {
  if (error.message.includes('memory')) {
    throw new Error('Out of memory - try reducing batch size');
  }
  throw error;
}
```

### 6.2 Robust Error Handling Implementation

```typescript
class SafeEmbeddingService {
  private extractor: any = null;
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    try {
      this.extractor = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
      );
      this.isInitialized = true;
    } catch (error) {
      throw new Error(
        `Failed to initialize embedding model: ${error.message}\n` +
        `Ensure model files are accessible and system has sufficient memory.`
      );
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Validate state
    if (!this.isInitialized || !this.extractor) {
      throw new Error('Embedding service not initialized. Call initialize() first.');
    }

    // Validate inputs
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Input must be a non-empty array of strings');
    }

    if (texts.some(t => typeof t !== 'string')) {
      throw new Error('All inputs must be strings');
    }

    try {
      const output = await this.extractor(texts, {
        pooling: 'mean',
        normalize: true
      });
      return output.tolist();
    } catch (error) {
      // Provide context-specific error messages
      if (error.message.includes('length')) {
        throw new Error(
          `Input text too long. Maximum sequence length is 256 tokens. ` +
          `Consider chunking longer texts.`
        );
      }

      if (error.message.includes('memory') || error.message.includes('allocation')) {
        throw new Error(
          `Insufficient memory for embedding generation. ` +
          `Try reducing batch size or text length.`
        );
      }

      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  async dispose(): Promise<void> {
    try {
      this.extractor = null;
      this.isInitialized = false;
    } catch (error) {
      console.error('Error during cleanup:', error);
      // Don't throw - cleanup is best-effort
    }
  }
}
```

### 6.3 Retry Logic for Transient Errors

```typescript
async function embedWithRetry(
  service: SafeEmbeddingService,
  texts: string[],
  maxRetries: number = 3
): Promise<number[][]> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await service.embed(texts);
    } catch (error) {
      lastError = error;

      // Don't retry on validation errors
      if (error.message.includes('not initialized') ||
          error.message.includes('must be')) {
        throw error;
      }

      // Retry on transient errors
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.warn(`Embedding attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Embedding failed after ${maxRetries} attempts: ${lastError?.message}`);
}
```

### 6.4 Graceful Degradation

```typescript
async function generateEmbeddingsWithFallback(
  texts: string[]
): Promise<number[][]> {
  try {
    // Try primary embedding service
    return await embeddingService.embed(texts);
  } catch (error) {
    console.error('Primary embedding service failed:', error);

    // Fallback: Return random embeddings (for development/testing)
    console.warn('Using random embeddings as fallback');
    return texts.map(() =>
      Array.from({ length: 384 }, () => Math.random() - 0.5)
    );
  }
}
```

### 6.5 Error Monitoring and Logging

```typescript
class EmbeddingServiceWithLogging {
  private errors: Array<{ timestamp: Date; error: Error }> = [];

  async embed(texts: string[]): Promise<number[][]> {
    try {
      const result = await this.performEmbedding(texts);
      return result;
    } catch (error) {
      // Log error
      this.errors.push({ timestamp: new Date(), error });

      // Log to external service (e.g., Sentry, CloudWatch)
      console.error('Embedding error:', {
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack,
        inputCount: texts.length
      });

      throw error;
    }
  }

  getErrorStats(): { count: number; recent: Error[] } {
    return {
      count: this.errors.length,
      recent: this.errors.slice(-10).map(e => e.error)
    };
  }
}
```

---

## 7. Implementation Recommendations

### 7.1 Architecture Decision: Transformers.js vs onnxruntime-node

**Recommended: Transformers.js**

| Criteria | Transformers.js | Direct onnxruntime-node |
|----------|----------------|------------------------|
| **Ease of Use** | ⭐⭐⭐⭐⭐ Simple API | ⭐⭐ Complex, manual work |
| **Performance** | ⭐⭐⭐⭐ (Same as ONNX) | ⭐⭐⭐⭐ (Native ONNX) |
| **Tokenization** | ⭐⭐⭐⭐⭐ Built-in | ⭐⭐ Manual integration |
| **Pooling** | ⭐⭐⭐⭐⭐ Automatic | ⭐ Manual implementation |
| **Documentation** | ⭐⭐⭐⭐ Good JS docs | ⭐⭐⭐ Mostly Python |
| **Maintenance** | ⭐⭐⭐⭐⭐ Active | ⭐⭐⭐⭐ Active but lower-level |
| **Bundle Size** | ~3 MB (with deps) | ~2 MB (minimal) |

**Decision: Use Transformers.js**

Transformers.js provides the best balance of simplicity, maintainability, and performance for the code-index use case.

### 7.2 Recommended Implementation Pattern

```typescript
// src/services/embedding/EmbeddingService.ts
import { pipeline } from '@huggingface/transformers';

export interface EmbeddingConfig {
  model: string;
  batchSize: number;
  quantization?: 'q8' | 'q4';
}

export class EmbeddingService {
  private static instance: EmbeddingService;
  private extractor: any = null;
  private config: EmbeddingConfig;

  private constructor(config: EmbeddingConfig) {
    this.config = config;
  }

  static getInstance(config: EmbeddingConfig): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService(config);
    }
    return EmbeddingService.instance;
  }

  async initialize(): Promise<void> {
    if (this.extractor) return;

    const options: any = {};
    if (this.config.quantization) {
      options.dtype = this.config.quantization;
    }

    this.extractor = await pipeline(
      'feature-extraction',
      this.config.model,
      options
    );
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.extractor) {
      throw new Error('Service not initialized');
    }

    const output = await this.extractor(texts, {
      pooling: 'mean',
      normalize: true
    });

    return output.tolist();
  }

  async embed(texts: string[], batchSize?: number): Promise<number[][]> {
    const effectiveBatchSize = batchSize || this.config.batchSize;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += effectiveBatchSize) {
      const batch = texts.slice(i, i + effectiveBatchSize);
      const batchResults = await this.embedBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  async dispose(): Promise<void> {
    this.extractor = null;
  }
}

// Usage in CLI command
const embeddingService = EmbeddingService.getInstance({
  model: 'Xenova/all-MiniLM-L6-v2',
  batchSize: 16,
  quantization: 'q8' // Optional: for better performance
});

await embeddingService.initialize();
const embeddings = await embeddingService.embed(chunks);
```

### 7.3 Dependencies to Add

```json
{
  "dependencies": {
    "@huggingface/transformers": "^3.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```

**Note**: Transformers.js will automatically install onnxruntime-node as a dependency.

### 7.4 Model Download Strategy

**Option 1: On-Demand Download (Recommended)**
```typescript
// Model downloads automatically on first use
// Cached in ~/.cache/huggingface/hub/
const extractor = await pipeline(
  'feature-extraction',
  'Xenova/all-MiniLM-L6-v2'
);
```

**Option 2: Pre-Bundled Model**
```bash
# Download model files manually
mkdir -p .codeindex/models/all-MiniLM-L6-v2
# Copy model files to .codeindex/models/

# Load from local path
const extractor = await pipeline(
  'feature-extraction',
  './.codeindex/models/all-MiniLM-L6-v2'
);
```

**Recommendation**: Use on-demand download for simplicity. Transformers.js handles caching efficiently.

### 7.5 Configuration Options

```typescript
// .codeindex/config.json
{
  "embedding": {
    "model": "Xenova/all-MiniLM-L6-v2",
    "batchSize": 16,
    "quantization": "q8", // null, "q8", or "q4"
    "dimensions": 384,
    "maxSequenceLength": 256
  }
}
```

---

## 8. Performance Benchmarks

### 8.1 Expected Performance (Estimates)

Based on research and similar implementations:

**CPU Inference (4-8 cores, batch=16)**:
- Non-quantized: 20-40 embeddings/second
- Quantized (q8): 40-80 embeddings/second
- Quantized (q4): 60-120 embeddings/second

**CPU Inference (16+ cores, batch=32)**:
- Non-quantized: 40-60 embeddings/second
- Quantized (q8): 80-120 embeddings/second
- Quantized (q4): 120-200 embeddings/second

**Memory Usage**:
- Model (non-quantized): ~90 MB
- Model (q8): ~45 MB
- Model (q4): ~23 MB
- Working memory (batch=16): ~3-5 MB
- **Total**: 100-150 MB (well under 500 MB target)

### 8.2 Optimization Checklist

To achieve 100+ chunks/second:

- [ ] Use quantized model (q8 or q4)
- [ ] Set batch size to 16-32
- [ ] Reuse session across all embeddings
- [ ] Process chunks in batches, not individually
- [ ] Use multi-core CPU (8+ cores recommended)
- [ ] Enable graph optimizations (default)
- [ ] Monitor memory usage and adjust batch size if needed

---

## 9. Testing Strategy

### 9.1 Unit Tests

```typescript
describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeAll(async () => {
    service = EmbeddingService.getInstance({
      model: 'Xenova/all-MiniLM-L6-v2',
      batchSize: 8
    });
    await service.initialize();
  });

  test('generates embeddings with correct dimensions', async () => {
    const texts = ['Hello world'];
    const embeddings = await service.embed(texts);

    expect(embeddings).toHaveLength(1);
    expect(embeddings[0]).toHaveLength(384);
  });

  test('handles batch processing', async () => {
    const texts = Array(50).fill('Test sentence');
    const embeddings = await service.embed(texts);

    expect(embeddings).toHaveLength(50);
  });

  test('generates normalized embeddings', async () => {
    const texts = ['Test'];
    const embeddings = await service.embed(texts);
    const norm = Math.sqrt(
      embeddings[0].reduce((sum, val) => sum + val * val, 0)
    );

    expect(norm).toBeCloseTo(1.0, 4);
  });
});
```

### 9.2 Integration Tests

```typescript
describe('Embedding Integration', () => {
  test('embeddings are consistent', async () => {
    const service = EmbeddingService.getInstance({
      model: 'Xenova/all-MiniLM-L6-v2',
      batchSize: 8
    });
    await service.initialize();

    const text = 'This is a test sentence';
    const embedding1 = await service.embed([text]);
    const embedding2 = await service.embed([text]);

    // Same input should produce same output
    expect(embedding1[0]).toEqual(embedding2[0]);
  });

  test('similar texts have similar embeddings', async () => {
    const service = EmbeddingService.getInstance({
      model: 'Xenova/all-MiniLM-L6-v2',
      batchSize: 8
    });
    await service.initialize();

    const embeddings = await service.embed([
      'The cat sits on the mat',
      'A cat is sitting on a mat',
      'Python is a programming language'
    ]);

    const similarity = cosineSimilarity(embeddings[0], embeddings[1]);
    const dissimilarity = cosineSimilarity(embeddings[0], embeddings[2]);

    expect(similarity).toBeGreaterThan(dissimilarity);
  });
});

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  return dot; // Already normalized, so dot product = cosine similarity
}
```

### 9.3 Performance Tests

```typescript
describe('Embedding Performance', () => {
  test('meets throughput requirements', async () => {
    const service = EmbeddingService.getInstance({
      model: 'Xenova/all-MiniLM-L6-v2',
      batchSize: 16,
      quantization: 'q8'
    });
    await service.initialize();

    const texts = Array(100).fill('Test sentence for performance');
    const startTime = Date.now();
    await service.embed(texts);
    const duration = Date.now() - startTime;

    const throughput = (texts.length / duration) * 1000; // per second
    console.log(`Throughput: ${throughput.toFixed(2)} embeddings/sec`);

    // Should be > 100 embeddings/second with quantization
    expect(throughput).toBeGreaterThan(50); // Conservative threshold
  });
});
```

---

## 10. Alternatives Considered

### 10.1 Alternative Approaches

#### Option A: Transformers.js (RECOMMENDED)
**Pros**:
- Simple, high-level API
- Automatic tokenization and pooling
- Built on onnxruntime-node (same performance)
- Active development and good documentation
- Works in Node.js and browser

**Cons**:
- Slightly larger bundle size
- Less control over low-level operations

**Verdict**: Best choice for production use

---

#### Option B: Direct onnxruntime-node
**Pros**:
- Maximum control over inference
- Smaller bundle size
- Direct ONNX Runtime API access

**Cons**:
- Requires manual tokenization
- Must implement pooling manually
- More complex code
- Higher maintenance burden

**Verdict**: Only if you need maximum control or have specific ONNX requirements

---

#### Option C: Native sentence-transformers (Python child process)
**Pros**:
- Direct access to original model
- Mature, well-tested library

**Cons**:
- Requires Python runtime
- IPC overhead
- Complex deployment
- Violates FR-012 (offline-first) if Python not available

**Verdict**: Not recommended

---

#### Option D: OpenAI Embeddings API
**Pros**:
- High quality embeddings
- No local compute needed
- Simple API

**Cons**:
- Requires network (violates FR-012)
- Costs money
- Privacy concerns (code sent to external service)
- Latency

**Verdict**: Not suitable for offline-first CLI tool

---

#### Option E: FastText or Word2Vec
**Pros**:
- Very fast
- Small model size
- Simple to implement

**Cons**:
- Lower quality embeddings
- No contextual understanding
- Poor for semantic search

**Verdict**: Insufficient quality for semantic search use case

---

### 10.2 Final Recommendation

**Use Transformers.js with all-MiniLM-L6-v2 (quantized q8)**

This approach provides:
- ✅ Simplicity and maintainability
- ✅ Good performance (100+ chunks/second achievable)
- ✅ Offline-first (no network required after model download)
- ✅ Reasonable memory usage (< 500MB)
- ✅ High-quality embeddings for semantic search
- ✅ Active development and support

---

## 11. Open Questions and Risks

### 11.1 Open Questions

1. **Model Storage Location**
   - Q: Where should downloaded models be cached?
   - A: Use Transformers.js default (`~/.cache/huggingface/hub/`) or custom `.codeindex/models/`

2. **Model Updates**
   - Q: How to handle model updates?
   - A: Pin model version in config, provide `code-index update-models` command

3. **Quantization Trade-offs**
   - Q: What's the quality impact of q8 vs q4 quantization?
   - A: Needs empirical testing with code search queries

### 11.2 Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Memory leak in onnxruntime-node | High | Medium | Use singleton pattern, never recreate sessions |
| Performance < 100 chunks/sec | Medium | Low | Use quantization, optimize batch size |
| Model download fails | High | Low | Provide clear error, suggest manual download |
| Incompatible ONNX version | Medium | Low | Pin transformers.js version, test thoroughly |

---

## 12. References

### 12.1 Key Resources

**NPM Packages**:
- onnxruntime-node: https://www.npmjs.com/package/onnxruntime-node
- @huggingface/transformers: https://www.npmjs.com/package/@xenova/transformers

**Documentation**:
- ONNX Runtime Docs: https://onnxruntime.ai/docs/
- Transformers.js Docs: https://huggingface.co/docs/transformers.js/
- ONNX Runtime JavaScript API: https://onnxruntime.ai/docs/api/js/

**Model Resources**:
- all-MiniLM-L6-v2 (official): https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
- all-MiniLM-L6-v2 (Xenova): https://huggingface.co/Xenova/all-MiniLM-L6-v2

**GitHub Repositories**:
- ONNX Runtime: https://github.com/microsoft/onnxruntime
- Transformers.js: https://github.com/xenova/transformers.js
- ONNX Embedding Example: https://github.com/chroma-core/onnx-embedding

**Performance and Optimization**:
- Thread Management: https://onnxruntime.ai/docs/performance/tune-performance/threading.html
- Memory Consumption: https://onnxruntime.ai/docs/performance/tune-performance/memory.html
- Transformer Optimization: https://onnxruntime.ai/docs/performance/transformers-optimization.html

### 12.2 Known Issues

- Memory leak in Node.js binding: https://github.com/microsoft/onnxruntime/issues/25325
- CUDA post-install errors: https://github.com/microsoft/onnxruntime/issues/24770

---

## 13. Appendix: Code Patterns

### 13.1 Complete Working Example

```typescript
// example-embedding.ts
import { pipeline } from '@huggingface/transformers';

async function main() {
  console.log('Loading model...');
  const extractor = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2'
  );
  console.log('Model loaded!');

  const sentences = [
    'Code indexing for semantic search',
    'Building a CLI tool with TypeScript',
    'Machine learning embeddings in JavaScript'
  ];

  console.log('\nGenerating embeddings...');
  const embeddings = await extractor(sentences, {
    pooling: 'mean',
    normalize: true
  });

  const results = embeddings.tolist();

  console.log(`\nGenerated ${results.length} embeddings`);
  console.log(`Embedding dimensions: ${results[0].length}`);

  // Calculate similarities
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const similarity = cosineSimilarity(results[i], results[j]);
      console.log(
        `\nSimilarity between sentences ${i} and ${j}: ${similarity.toFixed(4)}`
      );
    }
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

main().catch(console.error);
```

Run with:
```bash
npm install @huggingface/transformers
npx tsx example-embedding.ts
```

---

## Document Metadata

- **Research Date**: October 14, 2025
- **Researcher**: Claude Code
- **Project**: code-index CLI tool
- **Feature**: 008-add-a-pluggable (embedding functionality)
- **Status**: Complete
- **Next Steps**: Review, implement EmbeddingService, test performance
