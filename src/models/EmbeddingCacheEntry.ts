/**
 * Embedding Cache Entry Model
 *
 * Represents a cached embedding vector in the database.
 */

export interface EmbeddingCacheEntry {
  /** Primary key (auto-increment) */
  id: number;

  /** SHA-256 hash of source content */
  contentHash: string;

  /** Model used to generate embedding */
  modelId: string;

  /** Model version/commit hash */
  modelVersion: string;

  /** Embedding vector dimensions */
  dimensions: number;

  /** Binary blob of float32 array */
  embedding: Buffer;

  /** When embedding was generated */
  createdAt: Date;

  /** Last cache hit timestamp */
  lastAccessedAt: Date;
}

/**
 * Validates cache entry structure
 */
export function validateEmbeddingCacheEntry(
  entry: Partial<EmbeddingCacheEntry>
): entry is EmbeddingCacheEntry {
  return (
    typeof entry.id === 'number' &&
    entry.id > 0 &&
    typeof entry.contentHash === 'string' &&
    entry.contentHash.length === 64 && // SHA-256 hex string
    typeof entry.modelId === 'string' &&
    entry.modelId.length > 0 &&
    typeof entry.modelVersion === 'string' &&
    typeof entry.dimensions === 'number' &&
    entry.dimensions > 0 &&
    Buffer.isBuffer(entry.embedding) &&
    entry.embedding.length === entry.dimensions * 4 && // float32 = 4 bytes per dimension
    entry.createdAt instanceof Date &&
    entry.lastAccessedAt instanceof Date
  );
}

/**
 * Encodes float32 array to Buffer for storage
 */
export function encodeEmbedding(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer);
}

/**
 * Decodes Buffer to Float32Array
 */
export function decodeEmbedding(buffer: Buffer): Float32Array {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}
