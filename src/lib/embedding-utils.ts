/**
 * Embedding Utilities
 *
 * Provides utilities for encoding/decoding vector embeddings and computing
 * cosine similarity for semantic search.
 */

/**
 * Expected embedding dimensions (384-dimensional vectors)
 */
export const EMBEDDING_DIMENSIONS = 384;

/**
 * Expected BLOB size in bytes (384 floats × 4 bytes per float)
 */
export const EMBEDDING_BLOB_SIZE = 1536;

/**
 * Encode a Float32 array as a Buffer for storage in SQLite BLOB
 *
 * @param vector - 384-dimensional embedding vector
 * @returns Buffer containing little-endian float32 values
 * @throws Error if vector is not 384-dimensional
 *
 * @example
 * ```typescript
 * const embedding = new Array(384).fill(0).map(() => Math.random());
 * const buffer = encodeEmbedding(embedding);
 * // buffer.length === 1536 (384 floats × 4 bytes)
 * ```
 */
export function encodeEmbedding(vector: number[]): Buffer {
	if (vector.length !== EMBEDDING_DIMENSIONS) {
		throw new Error(
			`Embedding must be ${EMBEDDING_DIMENSIONS}-dimensional (got ${vector.length})`
		);
	}

	const buffer = Buffer.allocUnsafe(EMBEDDING_BLOB_SIZE);

	for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
		buffer.writeFloatLE(vector[i] ?? 0, i * 4);
	}

	return buffer;
}

/**
 * Decode a Buffer from SQLite BLOB into a Float32Array
 *
 * @param blob - Buffer containing little-endian float32 values
 * @returns Float32Array with 384 dimensions
 * @throws Error if blob is not 1536 bytes
 *
 * @example
 * ```typescript
 * const buffer = db.prepare('SELECT embedding FROM embeddings WHERE chunk_id = ?')
 *   .get(chunkId).embedding;
 * const vector = decodeEmbedding(buffer);
 * // vector.length === 384
 * ```
 */
export function decodeEmbedding(blob: Buffer): Float32Array {
	if (blob.length !== EMBEDDING_BLOB_SIZE) {
		throw new Error(
			`Invalid embedding size: expected ${EMBEDDING_BLOB_SIZE} bytes, got ${blob.length}`
		);
	}

	return new Float32Array(blob.buffer, blob.byteOffset, EMBEDDING_DIMENSIONS);
}

/**
 * Compute cosine similarity between two vectors
 *
 * Cosine similarity measures the cosine of the angle between two vectors.
 * Range: [-1, 1], where:
 * - 1.0 = identical direction (most similar)
 * - 0.0 = orthogonal (no similarity)
 * - -1.0 = opposite direction (least similar)
 *
 * For normalized embeddings (common in ML models), cosine similarity
 * is equivalent to dot product.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity score (0-1 for normalized vectors)
 * @throws Error if vectors have different dimensions
 *
 * @example
 * ```typescript
 * const embedding1 = decodeEmbedding(buffer1);
 * const embedding2 = decodeEmbedding(buffer2);
 * const similarity = cosineSimilarity(embedding1, embedding2);
 * // similarity: 0.0 - 1.0 (higher = more similar)
 * ```
 */
export function cosineSimilarity(
	a: Float32Array | number[],
	b: Float32Array | number[]
): number {
	if (a.length !== b.length) {
		throw new Error(
			`Vectors must have the same dimensions (got ${a.length} and ${b.length})`
		);
	}

	let dotProduct = 0;
	let magnitudeA = 0;
	let magnitudeB = 0;

	for (let i = 0; i < a.length; i++) {
		const aVal = a[i] ?? 0;
		const bVal = b[i] ?? 0;
		dotProduct += aVal * bVal;
		magnitudeA += aVal * aVal;
		magnitudeB += bVal * bVal;
	}

	const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);

	// Handle zero vectors (avoid division by zero)
	if (magnitude === 0) {
		return 0;
	}

	return dotProduct / magnitude;
}

/**
 * Validate that an embedding has the correct dimensions and is normalized
 *
 * @param vector - Embedding vector to validate
 * @returns true if valid, false otherwise
 */
export function isValidEmbedding(vector: number[] | Float32Array): boolean {
	// Check dimensions
	if (vector.length !== EMBEDDING_DIMENSIONS) {
		return false;
	}

	// Check for NaN or Infinity values
	for (let i = 0; i < vector.length; i++) {
		const val = vector[i];
		if (val === undefined || !isFinite(val)) {
			return false;
		}
	}

	return true;
}

/**
 * Normalize a vector to unit length (L2 normalization)
 *
 * This is useful when embeddings from different models need to be compared,
 * as it ensures cosine similarity equals dot product.
 *
 * @param vector - Vector to normalize
 * @returns Normalized vector with unit length
 */
export function normalizeVector(vector: number[]): number[] {
	let magnitude = 0;
	for (let i = 0; i < vector.length; i++) {
		const val = vector[i] ?? 0;
		magnitude += val * val;
	}

	magnitude = Math.sqrt(magnitude);

	// Handle zero vector
	if (magnitude === 0) {
		return vector;
	}

	return vector.map((v) => v / magnitude);
}
