/**
 * Hash Tracker Service
 *
 * Tracks chunk hash changes to determine when re-embedding is needed.
 * Based on data-model.md lines 275-290
 */

import Database from 'better-sqlite3';
import { Result, ok, err } from '../lib/result-types.js';

/**
 * Hash comparison result
 */
export interface HashComparisonResult {
	/** Chunk identifier */
	chunk_id: string;

	/** Hash stored in embedding */
	embedded_hash: string;

	/** Current hash from chunks table */
	current_hash: string;

	/** Whether re-embedding is needed */
	needs_reembedding: boolean;
}

/**
 * Hash tracker error
 */
export class HashTrackerError extends Error {
	constructor(message: string, public override cause?: Error) {
		super(message);
		this.name = 'HashTrackerError';
		Object.setPrototypeOf(this, HashTrackerError.prototype);
	}
}

/**
 * Hash Tracker Service
 *
 * Provides hash comparison logic to determine which chunks need re-embedding.
 */
export class HashTrackerService {
	constructor(private db: Database.Database) {}

	/**
	 * Check if a chunk needs re-embedding based on hash comparison
	 *
	 * @param chunkId - Chunk identifier
	 * @param modelId - Model identifier
	 * @returns Result with boolean indicating if re-embedding needed
	 */
	needsReembedding(
		chunkId: string,
		modelId: string
	): Result<boolean, HashTrackerError> {
		try {
			const result = this.db
				.prepare(
					`
				SELECT
					ve.chunk_id,
					ve.chunk_hash AS embedded_hash,
					c.id AS current_hash
				FROM vec_embeddings ve
				INNER JOIN chunks c ON ve.chunk_id = c.id
				WHERE ve.chunk_id = ? AND ve.model_id = ?
			`
				)
				.get(chunkId, modelId) as HashComparisonResult | undefined;

			if (!result) {
				// No embedding exists for this chunk
				return ok(true);
			}

			// Compare hashes
			const needsUpdate = result.embedded_hash !== result.current_hash;
			return ok(needsUpdate);
		} catch (error) {
			return err(
				new HashTrackerError(
					`Failed to check hash: ${error instanceof Error ? error.message : 'Unknown error'}`,
					error instanceof Error ? error : undefined
				)
			);
		}
	}

	/**
	 * Get all chunks that need re-embedding for a specific model
	 *
	 * Compares chunk hashes between vec_embeddings and chunks tables.
	 *
	 * @param modelId - Model identifier
	 * @returns Result with array of chunk IDs that need re-embedding
	 */
	getChunksNeedingReembedding(
		modelId: string
	): Result<string[], HashTrackerError> {
		try {
			const results = this.db
				.prepare(
					`
				SELECT ve.chunk_id
				FROM vec_embeddings ve
				INNER JOIN chunks c ON ve.chunk_id = c.id
				WHERE ve.model_id = ?
				  AND ve.chunk_hash != c.id
			`
				)
				.all(modelId) as Array<{ chunk_id: string }>;

			return ok(results.map((r) => r.chunk_id));
		} catch (error) {
			return err(
				new HashTrackerError(
					`Failed to get chunks needing re-embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
					error instanceof Error ? error : undefined
				)
			);
		}
	}

	/**
	 * Get all chunks that don't have embeddings yet
	 *
	 * @param modelId - Model identifier
	 * @returns Result with array of chunk IDs without embeddings
	 */
	getChunksWithoutEmbeddings(
		modelId: string
	): Result<string[], HashTrackerError> {
		try {
			const results = this.db
				.prepare(
					`
				SELECT c.id as chunk_id
				FROM chunks c
				LEFT JOIN vec_embeddings ve
					ON c.id = ve.chunk_id AND ve.model_id = ?
				WHERE ve.chunk_id IS NULL
				  AND c.deleted_at IS NULL
			`
				)
				.all(modelId) as Array<{ chunk_id: string }>;

			return ok(results.map((r) => r.chunk_id));
		} catch (error) {
			return err(
				new HashTrackerError(
					`Failed to get chunks without embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
					error instanceof Error ? error : undefined
				)
			);
		}
	}

	/**
	 * Get all chunks that need processing (new + changed)
	 *
	 * Combines chunks without embeddings and chunks with changed hashes.
	 *
	 * @param modelId - Model identifier
	 * @returns Result with array of unique chunk IDs
	 */
	getAllChunksToProcess(
		modelId: string
	): Result<string[], HashTrackerError> {
		const withoutEmbeddingsResult = this.getChunksWithoutEmbeddings(modelId);
		if (withoutEmbeddingsResult.isErr()) {
			return withoutEmbeddingsResult;
		}

		const needingReembeddingResult =
			this.getChunksNeedingReembedding(modelId);
		if (needingReembeddingResult.isErr()) {
			return needingReembeddingResult;
		}

		// Combine and deduplicate
		const allChunks = new Set([
			...withoutEmbeddingsResult.value,
			...needingReembeddingResult.value,
		]);

		return ok(Array.from(allChunks));
	}

	/**
	 * Get statistics about embedding status
	 *
	 * @param modelId - Model identifier
	 * @returns Result with statistics
	 */
	getEmbeddingStatus(modelId: string): Result<
		{
			totalChunks: number;
			withEmbeddings: number;
			withoutEmbeddings: number;
			needingUpdate: number;
			upToDate: number;
		},
		HashTrackerError
	> {
		try {
			// Total active chunks
			const totalResult = this.db
				.prepare(
					'SELECT COUNT(*) as count FROM chunks WHERE deleted_at IS NULL'
				)
				.get() as { count: number };

			// Chunks with embeddings
			const withEmbeddingsResult = this.db
				.prepare(
					`
				SELECT COUNT(DISTINCT ve.chunk_id) as count
				FROM vec_embeddings ve
				INNER JOIN chunks c ON ve.chunk_id = c.id
				WHERE ve.model_id = ? AND c.deleted_at IS NULL
			`
				)
				.get(modelId) as { count: number };

			// Chunks needing update
			const needingUpdateResult = this.db
				.prepare(
					`
				SELECT COUNT(*) as count
				FROM vec_embeddings ve
				INNER JOIN chunks c ON ve.chunk_id = c.id
				WHERE ve.model_id = ?
				  AND ve.chunk_hash != c.id
				  AND c.deleted_at IS NULL
			`
				)
				.get(modelId) as { count: number };

			const totalChunks = totalResult.count;
			const withEmbeddings = withEmbeddingsResult.count;
			const needingUpdate = needingUpdateResult.count;
			const withoutEmbeddings = totalChunks - withEmbeddings;
			const upToDate = withEmbeddings - needingUpdate;

			return ok({
				totalChunks,
				withEmbeddings,
				withoutEmbeddings,
				needingUpdate,
				upToDate,
			});
		} catch (error) {
			return err(
				new HashTrackerError(
					`Failed to get embedding status: ${error instanceof Error ? error.message : 'Unknown error'}`,
					error instanceof Error ? error : undefined
				)
			);
		}
	}
}
