/**
 * Vector Storage Service
 *
 * Manages embedding vector storage using sqlite-vec extension.
 * Based on data-model.md lines 224-315
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { CreateEmbeddingInput, EmbeddingQueryResult } from '../models/embedding-vector.js';
import { Result, ok, err } from '../lib/result-types.js';

/**
 * Vector storage error
 */
export class VectorStorageError extends Error {
	constructor(message: string, public override cause?: Error) {
		super(message);
		this.name = 'VectorStorageError';
		Object.setPrototypeOf(this, VectorStorageError.prototype);
	}
}

/**
 * Vector Storage Service
 *
 * Provides operations for storing and querying embedding vectors using sqlite-vec.
 */
export class VectorStorageService {
	private vecTableInitialized = false;

	constructor(private db: Database.Database) {
		// Load sqlite-vec extension
		this.loadExtension();
	}

	/**
	 * Load sqlite-vec extension
	 */
	private loadExtension(): void {
		try {
			sqliteVec.load(this.db);

			// Verify extension loaded
			const result = this.db
				.prepare('SELECT vec_version() as vec_version')
				.get() as { vec_version: string };

			if (process.env.NODE_ENV !== 'test') {
				console.log(`  ✓ sqlite-vec loaded (version ${result.vec_version})`);
			}
		} catch (error) {
			throw new VectorStorageError(
				`Failed to load sqlite-vec extension: ${error instanceof Error ? error.message : 'Unknown error'}`,
				error instanceof Error ? error : undefined
			);
		}
	}

	/**
	 * Initialize vec_embeddings virtual table
	 *
	 * Must be called after sqlite-vec extension is loaded.
	 * Creates the virtual table for storing 384-dimensional vectors.
	 */
	initializeVectorTable(): Result<void, VectorStorageError> {
		if (this.vecTableInitialized) {
			return ok(undefined);
		}

		try {
			// Create virtual table using vec0
			this.db.exec(`
				CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
					embedding FLOAT[384],
					chunk_id TEXT PARTITION KEY,
					model_id TEXT,
					+chunk_hash TEXT,
					+created_at TEXT,
					+model_version TEXT
				);
			`);

			// Create indexes
			this.db.exec(`
				CREATE INDEX IF NOT EXISTS idx_vec_embeddings_chunk_id
				ON vec_embeddings(chunk_id);

				CREATE INDEX IF NOT EXISTS idx_vec_embeddings_model_id
				ON vec_embeddings(model_id);
			`);

			this.vecTableInitialized = true;
			return ok(undefined);
		} catch (error) {
			return err(
				new VectorStorageError(
					`Failed to initialize vec_embeddings table: ${error instanceof Error ? error.message : 'Unknown error'}`,
					error instanceof Error ? error : undefined
				)
			);
		}
	}

	/**
	 * Insert an embedding vector
	 *
	 * @param input - Embedding vector creation input
	 * @returns Result with rowid or error
	 */
	insertEmbedding(
		input: CreateEmbeddingInput
	): Result<number, VectorStorageError> {
		try {
			// Validate dimensions
			if (input.vector.length !== input.dimensions) {
				return err(
					new VectorStorageError(
						`Vector dimension mismatch: expected ${input.dimensions}, got ${input.vector.length}`
					)
				);
			}

			const stmt = this.db.prepare(`
				INSERT INTO vec_embeddings (
					embedding,
					chunk_id,
					model_id,
					chunk_hash,
					created_at,
					model_version
				) VALUES (?, ?, ?, ?, datetime('now'), ?)
			`);

			const info = stmt.run(
				input.vector.buffer,
				input.chunk_id,
				input.model_id,
				input.chunk_hash,
				input.model_version
			);

			return ok(Number(info.lastInsertRowid));
		} catch (error) {
			return err(
				new VectorStorageError(
					`Failed to insert embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
					error instanceof Error ? error : undefined
				)
			);
		}
	}

	/**
	 * Find similar code chunks using cosine similarity
	 *
	 * @param queryVector - Query vector to search for
	 * @param modelId - Model identifier to filter by
	 * @param topK - Number of results to return
	 * @returns Result with array of query results or error
	 */
	findSimilar(
		queryVector: Float32Array,
		modelId: string,
		topK: number = 10
	): Result<EmbeddingQueryResult[], VectorStorageError> {
		try {
			const stmt = this.db.prepare(`
				SELECT
					chunk_id,
					model_id,
					chunk_hash,
					vec_distance_cosine(embedding, ?) AS distance,
					(1 - vec_distance_cosine(embedding, ?)) AS similarity
				FROM vec_embeddings
				WHERE model_id = ?
				ORDER BY distance ASC
				LIMIT ?
			`);

			const results = stmt.all(
				queryVector.buffer,
				queryVector.buffer,
				modelId,
				topK
			) as EmbeddingQueryResult[];

			return ok(results);
		} catch (error) {
			return err(
				new VectorStorageError(
					`Failed to query similar vectors: ${error instanceof Error ? error.message : 'Unknown error'}`,
					error instanceof Error ? error : undefined
				)
			);
		}
	}

	/**
	 * Delete embeddings for a specific chunk
	 *
	 * @param chunkId - Chunk identifier
	 * @returns Result with number of deleted rows or error
	 */
	deleteEmbeddingsByChunk(
		chunkId: string
	): Result<number, VectorStorageError> {
		try {
			const stmt = this.db.prepare(`
				DELETE FROM vec_embeddings
				WHERE chunk_id = ?
			`);

			const info = stmt.run(chunkId);
			return ok(info.changes);
		} catch (error) {
			return err(
				new VectorStorageError(
					`Failed to delete embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
					error instanceof Error ? error : undefined
				)
			);
		}
	}

	/**
	 * Delete all embeddings for a specific model
	 *
	 * Used when switching models with different dimensions.
	 *
	 * @param modelId - Model identifier
	 * @returns Result with number of deleted rows or error
	 */
	deleteEmbeddingsByModel(
		modelId: string
	): Result<number, VectorStorageError> {
		try {
			const stmt = this.db.prepare(`
				DELETE FROM vec_embeddings
				WHERE model_id = ?
			`);

			const info = stmt.run(modelId);
			return ok(info.changes);
		} catch (error) {
			return err(
				new VectorStorageError(
					`Failed to delete model embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
					error instanceof Error ? error : undefined
				)
			);
		}
	}

	/**
	 * Clean up orphaned embeddings (chunks no longer exist)
	 *
	 * @returns Result with number of deleted rows or error
	 */
	cleanupOrphanedEmbeddings(): Result<number, VectorStorageError> {
		try {
			const stmt = this.db.prepare(`
				DELETE FROM vec_embeddings
				WHERE chunk_id NOT IN (SELECT id FROM chunks)
			`);

			const info = stmt.run();
			return ok(info.changes);
		} catch (error) {
			return err(
				new VectorStorageError(
					`Failed to cleanup orphaned embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
					error instanceof Error ? error : undefined
				)
			);
		}
	}

	/**
	 * Get embedding statistics
	 *
	 * @returns Result with statistics or error
	 */
	getStatistics(): Result<
		{
			totalEmbeddings: number;
			embeddingsByModel: Record<string, number>;
		},
		VectorStorageError
	> {
		try {
			// Get total count
			const totalResult = this.db
				.prepare('SELECT COUNT(*) as count FROM vec_embeddings')
				.get() as { count: number };

			// Get count by model
			const byModelResults = this.db
				.prepare(
					'SELECT model_id, COUNT(*) as count FROM vec_embeddings GROUP BY model_id'
				)
				.all() as Array<{ model_id: string; count: number }>;

			const embeddingsByModel: Record<string, number> = {};
			for (const row of byModelResults) {
				embeddingsByModel[row.model_id] = row.count;
			}

			return ok({
				totalEmbeddings: totalResult.count,
				embeddingsByModel,
			});
		} catch (error) {
			return err(
				new VectorStorageError(
					`Failed to get statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
					error instanceof Error ? error : undefined
				)
			);
		}
	}
}
