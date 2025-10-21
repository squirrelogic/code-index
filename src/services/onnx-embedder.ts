/**
 * ONNX Embedder Service
 *
 * Provides dense vector embeddings using gte-small.onnx via ONNX Runtime.
 * Designed for local, offline operation with minimal dependencies.
 */

// Import ONNX Runtime using dynamic import for CommonJS compatibility
import { promises as fs } from 'fs';
import path from 'path';
import type { InferenceSession } from 'onnxruntime-common';

/**
 * Simple tokenizer for BERT-style models
 * This is a basic implementation - for production, consider using a proper tokenizer
 */
class SimpleTokenizer {
  private vocab: Map<string, number>;
  private maxLength: number;

  constructor(maxLength: number = 512) {
    this.maxLength = maxLength;
    this.vocab = new Map();

    // Initialize with basic tokens
    this.vocab.set('[PAD]', 0);
    this.vocab.set('[UNK]', 1);
    this.vocab.set('[CLS]', 2);
    this.vocab.set('[SEP]', 3);
  }

  /**
   * Tokenize text into input IDs
   * Basic implementation: converts to lowercase and splits on whitespace/punctuation
   */
  encode(text: string): {
    inputIds: number[];
    attentionMask: number[];
  } {
    // Normalize text
    const normalized = text.toLowerCase().trim();

    // Simple word-level tokenization
    const words = normalized.split(/[\s\p{P}]+/u).filter(w => w.length > 0);

    // Add [CLS] at start and [SEP] at end
    const tokens = ['[CLS]', ...words.slice(0, this.maxLength - 2), '[SEP]'];

    // Convert to IDs (use character codes as simple hash)
    const inputIds = tokens.map(token => {
      if (this.vocab.has(token)) {
        return this.vocab.get(token)!;
      }
      // Simple hash for unknown tokens
      let hash = 0;
      for (let i = 0; i < token.length; i++) {
        hash = ((hash << 5) - hash) + token.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit integer
      }
      return Math.abs(hash) % 30000 + 4; // Offset by special tokens
    });

    // Pad to max length
    const attentionMask = new Array(inputIds.length).fill(1);
    while (inputIds.length < this.maxLength) {
      inputIds.push(0); // [PAD]
      attentionMask.push(0);
    }

    return {
      inputIds: inputIds.slice(0, this.maxLength),
      attentionMask: attentionMask.slice(0, this.maxLength),
    };
  }
}

/**
 * ONNX-based embedder for gte-small model
 */
export class OnnxEmbedder {
  private session: InferenceSession | null = null;
  private tokenizer: SimpleTokenizer;
  private modelPath: string;
  private ort: any; // Dynamically loaded ONNX Runtime

  /** Embedding dimension (gte-small = 384) */
  public readonly dim: number = 384;

  /** Maximum sequence length */
  public readonly maxLength: number = 512;

  constructor(modelPath: string) {
    this.modelPath = modelPath;
    this.tokenizer = new SimpleTokenizer(this.maxLength);
  }

  /**
   * Initialize the ONNX session
   * Must be called before embedding
   */
  async init(): Promise<void> {
    try {
      // Dynamically import ONNX Runtime (CommonJS package)
      const ortModule = await import('onnxruntime-node');

      // Access the default export which contains InferenceSession and Tensor
      this.ort = ortModule.default;

      // Check if model file exists
      await fs.access(this.modelPath);

      // Create ONNX Runtime session
      this.session = await this.ort.InferenceSession.create(this.modelPath, {
        executionProviders: ['cpu'], // Use CPU for maximum compatibility
        graphOptimizationLevel: 'all',
      });

      console.log(`ONNX model loaded: ${path.basename(this.modelPath)}`);
    } catch (error) {
      throw new Error(`Failed to load ONNX model from ${this.modelPath}: ${error}`);
    }
  }

  /**
   * Generate embeddings for a batch of texts
   * @param texts Array of text strings to embed
   * @returns Array of Float32Array embeddings
   */
  async embed(texts: string[]): Promise<Float32Array[]> {
    if (!this.session) {
      throw new Error('OnnxEmbedder not initialized. Call init() first.');
    }

    if (texts.length === 0) {
      return [];
    }

    // Tokenize all texts
    const tokenized = texts.map(text => this.tokenizer.encode(text));

    // Create batched input tensors
    const batchSize = texts.length;
    const inputIds = new Array(batchSize * this.maxLength);
    const attentionMask = new Array(batchSize * this.maxLength);
    const tokenTypeIds = new Array(batchSize * this.maxLength);

    for (let i = 0; i < batchSize; i++) {
      const tok = tokenized[i];
      if (!tok) continue;

      for (let j = 0; j < this.maxLength; j++) {
        inputIds[i * this.maxLength + j] = tok.inputIds[j] || 0;
        attentionMask[i * this.maxLength + j] = tok.attentionMask[j] || 0;
        tokenTypeIds[i * this.maxLength + j] = 0; // All zeros for single-sentence inputs
      }
    }

    // Create ONNX tensors
    const inputIdsTensor = new this.ort.Tensor('int64', new BigInt64Array(inputIds.map(BigInt)), [batchSize, this.maxLength]);
    const attentionMaskTensor = new this.ort.Tensor('int64', new BigInt64Array(attentionMask.map(BigInt)), [batchSize, this.maxLength]);
    const tokenTypeIdsTensor = new this.ort.Tensor('int64', new BigInt64Array(tokenTypeIds.map(BigInt)), [batchSize, this.maxLength]);

    // Run inference
    const feeds = {
      input_ids: inputIdsTensor,
      attention_mask: attentionMaskTensor,
      token_type_ids: tokenTypeIdsTensor,
    };

    const results = await this.session.run(feeds);

    // Extract embeddings from output
    // Most BERT-style models output as 'last_hidden_state' or 'pooler_output'
    const outputKeys = Object.keys(results);
    if (outputKeys.length === 0) {
      throw new Error('No output from ONNX model');
    }

    const output = results[outputKeys[0]!];
    if (!output) {
      throw new Error('Invalid ONNX model output');
    }

    const embeddings: Float32Array[] = [];

    // Handle different output formats
    if (output.dims.length === 3) {
      // Shape: [batch_size, sequence_length, hidden_dim]
      // Use [CLS] token embedding (first token)
      const data = output.data as Float32Array;
      for (let i = 0; i < batchSize; i++) {
        const start = i * this.maxLength * this.dim;
        const embedding = new Float32Array(this.dim);
        for (let j = 0; j < this.dim; j++) {
          const value = data[start + j];
          embedding[j] = value !== undefined ? value : 0;
        }
        // Normalize to unit vector
        embeddings.push(this.normalize(embedding));
      }
    } else if (output.dims.length === 2) {
      // Shape: [batch_size, hidden_dim]
      // Already pooled
      const data = output.data as Float32Array;
      for (let i = 0; i < batchSize; i++) {
        const start = i * this.dim;
        const embedding = new Float32Array(this.dim);
        for (let j = 0; j < this.dim; j++) {
          const value = data[start + j];
          embedding[j] = value !== undefined ? value : 0;
        }
        embeddings.push(this.normalize(embedding));
      }
    } else {
      throw new Error(`Unexpected output shape: ${output.dims}`);
    }

    return embeddings;
  }

  /**
   * Normalize embedding to unit vector (L2 norm = 1)
   */
  private normalize(embedding: Float32Array): Float32Array {
    let sumSquares = 0;
    for (let i = 0; i < embedding.length; i++) {
      const val = embedding[i];
      if (val !== undefined) {
        sumSquares += val * val;
      }
    }
    const norm = Math.sqrt(sumSquares);

    if (norm > 0) {
      const normalized = new Float32Array(embedding.length);
      for (let i = 0; i < embedding.length; i++) {
        const val = embedding[i];
        if (val !== undefined) {
          normalized[i] = val / norm;
        }
      }
      return normalized;
    }

    return embedding;
  }

  /**
   * Compute cosine similarity between two embeddings
   * Assumes embeddings are already normalized
   */
  cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Embedding dimensions must match');
    }

    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      const aVal = a[i];
      const bVal = b[i];
      if (aVal !== undefined && bVal !== undefined) {
        dotProduct += aVal * bVal;
      }
    }

    return dotProduct;
  }

  /**
   * Dispose of the ONNX session
   */
  async dispose(): Promise<void> {
    if (this.session) {
      // ONNX Runtime Node doesn't have a release method, just set to null
      this.session = null;
    }
  }
}

/**
 * Download gte-small.onnx model from Hugging Face
 * @param targetPath Path to save the model
 */
export async function downloadGteSmallModel(targetPath: string): Promise<void> {
  const modelUrl = 'https://huggingface.co/Xenova/gte-small/resolve/main/onnx/model.onnx';

  try {
    // Create directory if it doesn't exist
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    // Download the model
    console.log(`Downloading gte-small.onnx from Hugging Face...`);
    const response = await fetch(modelUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Write to file
    const buffer = await response.arrayBuffer();
    await fs.writeFile(targetPath, Buffer.from(buffer));

    console.log(`Model downloaded successfully: ${targetPath}`);
    console.log(`Size: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
  } catch (error) {
    throw new Error(`Failed to download gte-small model: ${error}`);
  }
}
