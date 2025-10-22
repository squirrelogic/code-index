/**
 * Hybrid Index Service
 *
 * Combines sparse (n-gram) and dense (gte-small.onnx) vectors for hybrid search.
 * Implements the core search logic with configurable weighting.
 */

import type { ASTDoc } from '../models/ASTDoc.js';
import { astToText, ngramSparse, sparseCosine, toCSR, fromCSR, type SparseVector, DEFAULT_NGRAM_CONFIG } from './sparse-vector.js';
import { OnnxEmbedder } from './onnx-embedder.js';
import { IndexStoreService, type IndexMetadata } from './index-store.js';

/**
 * Configuration for hybrid search
 */
export interface HybridConfig {
  /** Weight for dense similarity (0-1) */
  denseWeight: number;
  /** Weight for sparse similarity (0-1) */
  sparseWeight: number;
  /** N-gram configuration */
  ngram: {
    minGram: number;
    maxGram: number;
    numFeatures: number;
  };
}

/**
 * Default hybrid configuration (matching spec)
 */
export const DEFAULT_HYBRID_CONFIG: HybridConfig = {
  denseWeight: 0.6,
  sparseWeight: 0.4,
  ngram: DEFAULT_NGRAM_CONFIG,
};

/**
 * Search result with hybrid scores
 */
export interface HybridSearchResult {
  filePath: string;
  score: number;
  denseScore: number;
  sparseScore: number;
}

/**
 * Pending item for batch processing
 */
interface PendingItem {
  filePath: string;
  text: string;
  sparseVector: SparseVector;
}

/**
 * Hybrid Index - combines sparse + dense vectors
 */
export class HybridIndex {
  private config: HybridConfig;
  private embedder: OnnxEmbedder;
  private store: IndexStoreService;

  // In-memory index data
  private filePaths: string[] = [];
  private sparseVectors: SparseVector[] = [];
  private denseVectors: Float32Array[] = [];

  // Pending items for batch processing
  private pendingItems: PendingItem[] = [];
  private batchSize: number = 100;

  constructor(
    embedder: OnnxEmbedder,
    store: IndexStoreService,
    config: HybridConfig = DEFAULT_HYBRID_CONFIG
  ) {
    this.embedder = embedder;
    this.store = store;
    this.config = config;
  }

  /**
   * Add a file to the index (queues for batch processing)
   * @param filePath Path to the file
   * @param astDoc ASTDoc representation
   */
  async add(filePath: string, astDoc: ASTDoc): Promise<void> {
    // Convert AST to text
    const text = astToText(astDoc);

    // Generate sparse vector immediately
    const sparseVector = ngramSparse(text, this.config.ngram);

    // Queue for dense embedding
    this.pendingItems.push({ filePath, text, sparseVector });

    // Batch process if threshold reached
    if (this.pendingItems.length >= this.batchSize) {
      await this.processPending();
    }
  }

  /**
   * Process pending items in batch
   */
  async processPending(): Promise<void> {
    if (this.pendingItems.length === 0) {
      return;
    }

    // Extract texts for batch embedding
    const texts = this.pendingItems.map(item => item.text);

    // Generate dense embeddings
    const embeddings = await this.embedder.embed(texts);

    // Add to in-memory index
    for (let i = 0; i < this.pendingItems.length; i++) {
      const item = this.pendingItems[i];
      const embedding = embeddings[i];

      if (!item || !embedding) continue;

      this.filePaths.push(item.filePath);
      this.sparseVectors.push(item.sparseVector);
      this.denseVectors.push(embedding);
    }

    // Clear pending queue
    this.pendingItems = [];
  }

  /**
   * Rebuild index (process any pending items and save to disk)
   */
  async rebuild(): Promise<void> {
    // Process any remaining pending items
    await this.processPending();

    // Convert sparse vectors to CSR format
    const csr = toCSR(this.sparseVectors);

    // Convert dense vectors to row-major Float32Array
    const dim = this.embedder.dim;
    const denseArray = new Float32Array(this.denseVectors.length * dim);
    for (let i = 0; i < this.denseVectors.length; i++) {
      const vector = this.denseVectors[i];
      if (!vector) continue;
      denseArray.set(vector, i * dim);
    }

    // Save to disk
    await this.store.saveSparse(csr);
    await this.store.saveDense({ vectors: denseArray });
    await this.store.saveIds(this.filePaths);

    const meta: IndexMetadata = {
      dim,
      numFeatures: this.config.ngram.numFeatures,
      numItems: this.filePaths.length,
      updatedAt: new Date().toISOString(),
    };
    await this.store.saveMeta(meta);
  }

  /**
   * Load index from disk
   */
  async load(): Promise<boolean> {
    const exists = await this.store.exists();
    if (!exists) {
      return false;
    }

    // Load metadata
    const meta = await this.store.loadMeta();
    if (!meta) {
      return false;
    }

    // Load IDs
    const ids = await this.store.loadIds();
    if (!ids) {
      return false;
    }
    this.filePaths = ids;

    // Load sparse vectors
    const csr = await this.store.loadSparse();
    if (!csr) {
      return false;
    }
    this.sparseVectors = fromCSR(csr);

    // Load dense vectors
    const dense = await this.store.loadDense();
    if (!dense) {
      return false;
    }

    // Convert row-major array back to individual vectors
    const dim = meta.dim;
    this.denseVectors = [];
    for (let i = 0; i < meta.numItems; i++) {
      const start = i * dim;
      const vector = dense.vectors.slice(start, start + dim);
      this.denseVectors.push(vector);
    }

    return true;
  }

  /**
   * Search the index using hybrid scoring
   * @param query Search query string
   * @param options Search options
   * @returns Sorted array of search results
   */
  async search(
    query: string,
    options: {
      limit?: number;
      denseWeight?: number;
      sparseWeight?: number;
    } = {}
  ): Promise<HybridSearchResult[]> {
    const limit = options.limit ?? 10;
    const denseWeight = options.denseWeight ?? this.config.denseWeight;
    const sparseWeight = options.sparseWeight ?? this.config.sparseWeight;

    // Generate query vectors
    const queryText = query.toLowerCase();
    const querySparse = ngramSparse(queryText, this.config.ngram);
    const queryDenseResults = await this.embedder.embed([queryText]);
    const queryDense = queryDenseResults[0];

    if (!queryDense) {
      throw new Error('Failed to generate query embedding');
    }

    // Compute scores for all items
    const results: HybridSearchResult[] = [];

    for (let i = 0; i < this.filePaths.length; i++) {
      const filePath = this.filePaths[i];
      const sparseVec = this.sparseVectors[i];
      const denseVec = this.denseVectors[i];

      // Skip if any component is missing
      if (!filePath || !sparseVec || !denseVec) continue;

      // Sparse cosine similarity
      const sparseScore = sparseCosine(querySparse, sparseVec);

      // Dense cosine similarity
      const denseScore = this.computeDenseSimilarity(queryDense, denseVec);

      // Hybrid score
      const score = denseWeight * denseScore + sparseWeight * sparseScore;

      results.push({
        filePath,
        score,
        denseScore,
        sparseScore,
      });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Return top N
    return results.slice(0, limit);
  }

  /**
   * Remove a file from the index
   * @param filePath Path to the file
   */
  async remove(filePath: string): Promise<void> {
    const index = this.filePaths.indexOf(filePath);
    if (index === -1) {
      return;
    }

    this.filePaths.splice(index, 1);
    this.sparseVectors.splice(index, 1);
    this.denseVectors.splice(index, 1);
  }

  /**
   * Clear the entire index
   */
  async clear(): Promise<void> {
    this.filePaths = [];
    this.sparseVectors = [];
    this.denseVectors = [];
    this.pendingItems = [];
    await this.store.clear();
  }

  /**
   * Get index statistics
   */
  getStats(): {
    numFiles: number;
    numPending: number;
    memoryUsage: number;
  } {
    const memoryUsage =
      this.filePaths.reduce((sum, p) => sum + p.length, 0) * 2 + // strings (approx 2 bytes per char)
      this.sparseVectors.reduce((sum, v) => sum + v.features.size * 8, 0) + // sparse features
      this.denseVectors.length * this.embedder.dim * 4; // dense vectors (4 bytes per float)

    return {
      numFiles: this.filePaths.length,
      numPending: this.pendingItems.length,
      memoryUsage,
    };
  }

  /**
   * Set batch size for processing
   */
  setBatchSize(size: number): void {
    this.batchSize = size;
  }

  /**
   * Helper to compute dense similarity (wraps embedder method for type safety)
   * TypeScript can't narrow array element types after guards, so we handle undefined here
   */
  private computeDenseSimilarity(a: Float32Array, b: Float32Array | undefined): number {
    // This should never happen due to guard in caller, but TypeScript requires it
    if (!b) return 0;
    return this.embedder.cosineSimilarity(a, b);
  }
}
