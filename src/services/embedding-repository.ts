/**
 * EmbeddingRepository Service
 *
 * Provides data access methods for embeddings with encoding/decoding
 * and brute-force similarity search.
 */

import type Database from 'better-sqlite3';
import type { Embedding, SimilarityResult } from '../models/database-schema.js';
import {
	encodeEmbedding,
	decodeEmbedding,
	cosineSimilarity,
	isValidEmbedding,
	EMBEDDING_DIMENSIONS,
} from '../lib/embedding-utils.js';

/**
 * Repository class for managing embeddings in the database
 */
export class EmbeddingRepository {
	private insertStmt: Database.Statement;
	private getStmt: Database.Statement;
	private getAllStmt: Database.Statement;
	private deleteByChunkStmt: Database.Statement;

	constructor(db: Database.Database) {
		// Prepare all statements once for performance
		this.insertStmt = db.prepare(`
			INSERT INTO embeddings (chunk_id, embedding, model, created_at)
			VALUES (?, ?, ?, ?)
		`);

		this.getStmt = db.prepare(`
			SELECT * FROM embeddings
			WHERE chunk_id = ?
		`);

		this.getAllStmt = db.prepare(`
			SELECT chunk_id, embedding FROM embeddings
		`);

		this.deleteByChunkStmt = db.prepare(`
			DELETE FROM embeddings
			WHERE chunk_id = ?
		`);
	}

	/**
	 * Store an embedding vector for a chunk
	 *
	 * @param chunkId - Chunk identifier
	 * @param embedding - 384-dimensional embedding vector
	 * @param model - Embedding model identifier (e.g., 'all-MiniLM-L6-v2')
	 * @throws Error if embedding is not 384-dimensional
	 */
	insert(chunkId: string, embedding: number[], model: string): void {
		// Validate embedding dimensions
		if (!isValidEmbedding(embedding)) {
			throw new Error(
				`Invalid embedding: must be ${EMBEDDING_DIMENSIONS}-dimensional with finite values`
			);
		}

		// Encode as Buffer for BLOB storage
		const buffer = encodeEmbedding(embedding);

		// Store with current timestamp
		const created_at = Math.floor(Date.now() / 1000);
		this.insertStmt.run(chunkId, buffer, model, created_at);
	}

	/**
	 * Retrieve an embedding vector for a chunk
	 *
	 * @param chunkId - Chunk identifier
	 * @returns Float32Array with 384 dimensions, or null if not found
	 */
	get(chunkId: string): Float32Array | null {
		const result = this.getStmt.get(chunkId) as Embedding | undefined;
		if (!result) {
			return null;
		}

		return decodeEmbedding(result.embedding);
	}

	/**
	 * Retrieve all embeddings for similarity search
	 *
	 * Note: This loads all embeddings into memory. For large datasets (>100k),
	 * consider implementing approximate nearest neighbor (ANN) search.
	 *
	 * @returns Array of chunk IDs with their embeddings
	 */
	getAll(): Array<{ chunkId: string; embedding: Float32Array }> {
		const results = this.getAllStmt.all() as Array<{
			chunk_id: string;
			embedding: Buffer;
		}>;

		return results.map((row) => ({
			chunkId: row.chunk_id,
			embedding: decodeEmbedding(row.embedding),
		}));
	}

	/**
	 * Delete an embedding when its chunk is deleted
	 *
	 * Note: This is usually handled automatically via ON DELETE CASCADE,
	 * but this method is provided for manual cleanup if needed.
	 *
	 * @param chunkId - Chunk identifier
	 */
	deleteByChunk(chunkId: string): void {
		this.deleteByChunkStmt.run(chunkId);
	}

	/**
	 * Find similar chunks using brute-force cosine similarity search
	 *
	 * Algorithm:
	 * 1. Load all embeddings from database
	 * 2. Compute cosine similarity between query and each embedding
	 * 3. Filter by minimum similarity threshold
	 * 4. Sort by similarity (descending)
	 * 5. Return top K results
	 *
	 * Performance: O(n) where n = number of embeddings
	 * Expected: 100-200ms for 100k embeddings
	 *
	 * @param queryEmbedding - Query vector (384 dimensions)
	 * @param topK - Number of results to return (default: 10)
	 * @param minSimilarity - Minimum similarity threshold (default: 0.5)
	 * @returns Array of similarity results sorted by score (descending)
	 */
	findSimilar(
		queryEmbedding: number[],
		topK: number = 10,
		minSimilarity: number = 0.5
	): SimilarityResult[] {
		// Validate query embedding
		if (!isValidEmbedding(queryEmbedding)) {
			throw new Error(
				`Invalid query embedding: must be ${EMBEDDING_DIMENSIONS}-dimensional with finite values`
			);
		}

		const start = performance.now();

		// Load all embeddings
		const allEmbeddings = this.getAll();

		// Compute similarities
		const similarities: SimilarityResult[] = [];
		for (const { chunkId, embedding } of allEmbeddings) {
			const similarity = cosineSimilarity(queryEmbedding, embedding);

			// Filter by minimum threshold
			if (similarity >= minSimilarity) {
				similarities.push({ chunk_id: chunkId, similarity });
			}
		}

		// Sort by similarity (descending)
		similarities.sort((a, b) => b.similarity - a.similarity);

		// Return top K results
		const results = similarities.slice(0, topK);

		const duration = performance.now() - start;

		// Log performance metrics
		console.log(
			`[SIMILARITY SEARCH] Searched ${allEmbeddings.length} embeddings in ${Math.round(duration)}ms, found ${results.length} results`
		);

		return results;
	}
}
