/**
 * Index Store Service
 *
 * Manages persistence of sparse and dense vector indexes.
 * Stores vectors in optimized binary formats for fast loading.
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Metadata for the vector index
 */
export interface IndexMetadata {
  /** Embedding dimension (gte-small = 384) */
  dim: number;
  /** Number of features in sparse vectors (262144) */
  numFeatures: number;
  /** Number of indexed items */
  numItems: number;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Sparse vector index in CSR format
 */
export interface SparseIndex {
  values: Float32Array;
  colIndices: Uint32Array;
  rowPointers: Uint32Array;
}

/**
 * Dense vector index
 */
export interface DenseIndex {
  vectors: Float32Array; // Row-major: [item0_dim0, item0_dim1, ..., item1_dim0, ...]
}

/**
 * Service for persisting vector indexes
 */
export class IndexStoreService {
  private vectorsDir: string;
  private sparseFile: string;
  private denseFile: string;
  private idsFile: string;
  private metaFile: string;

  constructor(codeIndexDir: string) {
    this.vectorsDir = path.join(codeIndexDir, 'vectors');
    this.sparseFile = path.join(this.vectorsDir, 'sparse.csr');
    this.denseFile = path.join(this.vectorsDir, 'dense.f32');
    this.idsFile = path.join(this.vectorsDir, 'ids.json');
    this.metaFile = path.join(this.vectorsDir, 'meta.json');
  }

  /**
   * Initialize the vectors directory
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.vectorsDir, { recursive: true });
  }

  /**
   * Save sparse index in CSR format
   */
  async saveSparse(sparse: SparseIndex): Promise<void> {
    // Create a buffer with the CSR data
    // Format: [valuesLength(4), colIndicesLength(4), rowPointersLength(4), values..., colIndices..., rowPointers...]
    const totalSize =
      12 + // 3 length headers (4 bytes each)
      sparse.values.byteLength +
      sparse.colIndices.byteLength +
      sparse.rowPointers.byteLength;

    const buffer = Buffer.alloc(totalSize);
    let offset = 0;

    // Write lengths
    buffer.writeUInt32LE(sparse.values.length, offset);
    offset += 4;
    buffer.writeUInt32LE(sparse.colIndices.length, offset);
    offset += 4;
    buffer.writeUInt32LE(sparse.rowPointers.length, offset);
    offset += 4;

    // Write arrays
    Buffer.from(sparse.values.buffer).copy(buffer, offset);
    offset += sparse.values.byteLength;
    Buffer.from(sparse.colIndices.buffer).copy(buffer, offset);
    offset += sparse.colIndices.byteLength;
    Buffer.from(sparse.rowPointers.buffer).copy(buffer, offset);

    await fs.writeFile(this.sparseFile, buffer);
  }

  /**
   * Load sparse index from CSR format
   */
  async loadSparse(): Promise<SparseIndex | null> {
    try {
      const buffer = await fs.readFile(this.sparseFile);
      let offset = 0;

      // Read lengths
      const valuesLength = buffer.readUInt32LE(offset);
      offset += 4;
      const colIndicesLength = buffer.readUInt32LE(offset);
      offset += 4;
      const rowPointersLength = buffer.readUInt32LE(offset);
      offset += 4;

      // Read arrays
      const values = new Float32Array(
        buffer.buffer,
        buffer.byteOffset + offset,
        valuesLength
      );
      offset += values.byteLength;

      const colIndices = new Uint32Array(
        buffer.buffer,
        buffer.byteOffset + offset,
        colIndicesLength
      );
      offset += colIndices.byteLength;

      const rowPointers = new Uint32Array(
        buffer.buffer,
        buffer.byteOffset + offset,
        rowPointersLength
      );

      return {
        values: new Float32Array(values), // Copy to avoid sharing buffer
        colIndices: new Uint32Array(colIndices),
        rowPointers: new Uint32Array(rowPointers),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Save dense index (row-major Float32Array)
   */
  async saveDense(dense: DenseIndex): Promise<void> {
    const buffer = Buffer.from(dense.vectors.buffer);
    await fs.writeFile(this.denseFile, buffer);
  }

  /**
   * Load dense index
   */
  async loadDense(): Promise<DenseIndex | null> {
    try {
      const buffer = await fs.readFile(this.denseFile);
      const vectors = new Float32Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength / 4
      );

      return {
        vectors: new Float32Array(vectors), // Copy to avoid sharing buffer
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Save file path IDs mapping
   * Array is aligned with vector row indices
   */
  async saveIds(ids: string[]): Promise<void> {
    const json = JSON.stringify(ids, null, 2);
    await fs.writeFile(this.idsFile, json, 'utf-8');
  }

  /**
   * Load file path IDs mapping
   */
  async loadIds(): Promise<string[] | null> {
    try {
      const json = await fs.readFile(this.idsFile, 'utf-8');
      return JSON.parse(json);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Save index metadata
   */
  async saveMeta(meta: IndexMetadata): Promise<void> {
    const json = JSON.stringify(meta, null, 2);
    await fs.writeFile(this.metaFile, json, 'utf-8');
  }

  /**
   * Load index metadata
   */
  async loadMeta(): Promise<IndexMetadata | null> {
    try {
      const json = await fs.readFile(this.metaFile, 'utf-8');
      return JSON.parse(json);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if index exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.sparseFile);
      await fs.access(this.denseFile);
      await fs.access(this.idsFile);
      await fs.access(this.metaFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear all index files
   */
  async clear(): Promise<void> {
    const files = [this.sparseFile, this.denseFile, this.idsFile, this.metaFile];
    await Promise.all(
      files.map(file =>
        fs.unlink(file).catch(error => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
        })
      )
    );
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    sparseSizeBytes: number;
    denseSizeBytes: number;
    idsSizeBytes: number;
    metaSizeBytes: number;
    totalSizeBytes: number;
  }> {
    const stats = {
      sparseSizeBytes: 0,
      denseSizeBytes: 0,
      idsSizeBytes: 0,
      metaSizeBytes: 0,
      totalSizeBytes: 0,
    };

    try {
      const sparseStats = await fs.stat(this.sparseFile);
      stats.sparseSizeBytes = sparseStats.size;
    } catch {
      // File doesn't exist
    }

    try {
      const denseStats = await fs.stat(this.denseFile);
      stats.denseSizeBytes = denseStats.size;
    } catch {
      // File doesn't exist
    }

    try {
      const idsStats = await fs.stat(this.idsFile);
      stats.idsSizeBytes = idsStats.size;
    } catch {
      // File doesn't exist
    }

    try {
      const metaStats = await fs.stat(this.metaFile);
      stats.metaSizeBytes = metaStats.size;
    } catch {
      // File doesn't exist
    }

    stats.totalSizeBytes =
      stats.sparseSizeBytes +
      stats.denseSizeBytes +
      stats.idsSizeBytes +
      stats.metaSizeBytes;

    return stats;
  }
}
