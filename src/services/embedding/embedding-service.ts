/**
 * Embedding Service
 *
 * Orchestrates embedding generation process including adapter management,
 * batch processing, and database operations.
 * Based on research.md lines 1519-1583
 */

import Database from 'better-sqlite3';
import { Result, ok, err } from '../../lib/result-types.js';
import { IEmbeddingAdapter, AdapterError } from './adapter-interface.js';
import { VectorStorageService } from '../vector-storage.js';
import { HashTrackerService } from '../hash-tracker.js';
import { Chunk } from '../../models/database-schema.js';

/**
 * Embedding service error
 */
export class EmbeddingServiceError extends Error {
	constructor(message: string, public override cause?: Error) {
		super(message);
		this.name = 'EmbeddingServiceError';
		Object.setPrototypeOf(this, EmbeddingServiceError.prototype);
	}
}

/**
 * Embedding operation result
 */
export interface EmbeddingOperationResult {
	/** Number of chunks successfully embedded */
	embedded: number;

	/** Number of chunks skipped (no changes) */
	skipped: number;

	/** Number of embeddings deleted (orphaned) */
	deleted: number;

	/** Total duration in milliseconds */
	durationMs: number;

	/** Processing throughput in chunks/second */
	throughput: number;

	/** Any errors encountered */
	errors: string[];
}

/**
 * Embedding options
 */
export interface EmbeddingServiceOptions {
	/** Model ID to use (defaults to default model) */
	modelId?: string;

	/** Batch size for processing */
	batchSize?: number;

	/** Force re-embed all chunks */
	force?: boolean;

	/** Dry-run mode (don't modify database) */
	dryRun?: boolean;

	/** Progress callback */
	onProgress?: (progress: {
		processed: number;
		total: number;
		currentChunk: string;
	}) => void;
}

/**
 * Embedding Service
 *
 * Orchestrates the embedding generation process.
 */
export class EmbeddingService {
	private vectorStorage: VectorStorageService;
	private hashTracker: HashTrackerService;

	constructor(private db: Database.Database) {
		this.vectorStorage = new VectorStorageService(db);
		this.hashTracker = new HashTrackerService(db);

		// Initialize vector table
		const initResult = this.vectorStorage.initializeVectorTable();
		if (initResult.isErr()) {
			throw new EmbeddingServiceError(
				`Failed to initialize vector table: ${initResult.error.message}`,
				initResult.error
			);
		}
	}

	/**
	 * Initialize the embedding service with an adapter
	 */
	async initialize(adapter: IEmbeddingAdapter): Promise<Result<void, AdapterError>> {
		return adapter.initialize();
	}

	/**
	 * Generate embeddings for all chunks
	 */
	async embed(
		adapter: IEmbeddingAdapter,
		options: EmbeddingServiceOptions = {}
	): Promise<Result<EmbeddingOperationResult, EmbeddingServiceError>> {
		const startTime = Date.now();
		const errors: string[] = [];
		let embedded = 0;
		let skipped = 0;
		let deleted = 0;

		try {
			// Get model configuration
			const modelId = adapter.id;

			// Determine which chunks need processing
			const chunksToProcess = options.force
				? await this.getAllChunks()
				: await this.getChunksToProcess(modelId);

			if (chunksToProcess.isErr()) {
				return err(
					new EmbeddingServiceError(
						`Failed to get chunks: ${chunksToProcess.error.message}`,
						chunksToProcess.error
					)
				);
			}

			const chunks = chunksToProcess.value;
			const totalChunks = chunks.length;

			if (totalChunks === 0) {
				return ok({
					embedded: 0,
					skipped: 0,
					deleted: 0,
					durationMs: Date.now() - startTime,
					throughput: 0,
					errors: [],
				});
			}

			// Dry-run: just report what would happen
			if (options.dryRun) {
				const durationMs = Date.now() - startTime;
				return ok({
					embedded: totalChunks,
					skipped: 0,
					deleted: 0,
					durationMs,
					throughput: totalChunks / (durationMs / 1000),
					errors: [],
				});
			}

			// Process chunks in batches
			const batchSize = options.batchSize || 16;

			for (let i = 0; i < chunks.length; i += batchSize) {
				const batch = chunks.slice(i, i + batchSize);
				const texts = batch.map((c) => c.content);

				// Generate embeddings
				const result = await adapter.embed(texts);

				if (result.isErr()) {
					const errorMsg = `Batch ${i / batchSize + 1} failed: ${result.error.message}`;
					errors.push(errorMsg);
					continue;
				}

				const { vectors } = result.value;

				// Store embeddings
				for (let j = 0; j < batch.length; j++) {
					const chunk = batch[j];
					const vector = vectors[j];

					if (!chunk || !vector) continue;

					// Delete existing embedding for this chunk
					this.vectorStorage.deleteEmbeddingsByChunk(chunk.id);

					// Insert new embedding
					const insertResult = this.vectorStorage.insertEmbedding({
						chunk_id: chunk.id,
						vector: new Float32Array(vector),
						model_id: modelId,
						model_version: adapter.version,
						dimensions: adapter.dimensions,
						chunk_hash: chunk.id, // chunk.id is already a hash
					});

					if (insertResult.isOk()) {
						embedded++;
					} else {
						errors.push(
							`Failed to store embedding for chunk ${chunk.id}: ${insertResult.error.message}`
						);
					}
				}

				// Report progress
				if (options.onProgress) {
					options.onProgress({
						processed: Math.min(i + batchSize, chunks.length),
						total: chunks.length,
						currentChunk: batch[0]?.id || '',
					});
				}
			}

			// Cleanup orphaned embeddings
			const cleanupResult = this.vectorStorage.cleanupOrphanedEmbeddings();
			if (cleanupResult.isOk()) {
				deleted = cleanupResult.value;
			}

			const durationMs = Date.now() - startTime;
			const throughput = embedded / (durationMs / 1000);

			return ok({
				embedded,
				skipped,
				deleted,
				durationMs,
				throughput,
				errors,
			});
		} catch (error) {
			return err(
				new EmbeddingServiceError(
					`Embedding operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
					error instanceof Error ? error : undefined
				)
			);
		}
	}

	/**
	 * Get all active chunks
	 */
	private async getAllChunks(): Promise<Result<Chunk[], EmbeddingServiceError>> {
		try {
			const chunks = this.db
				.prepare(
					`
				SELECT * FROM chunks
				WHERE deleted_at IS NULL
				ORDER BY created_at ASC
			`
				)
				.all() as Chunk[];

			return ok(chunks);
		} catch (error) {
			return err(
				new EmbeddingServiceError(
					`Failed to fetch chunks: ${error instanceof Error ? error.message : 'Unknown error'}`,
					error instanceof Error ? error : undefined
				)
			);
		}
	}

	/**
	 * Get chunks that need processing (new or changed)
	 */
	private async getChunksToProcess(
		modelId: string
	): Promise<Result<Chunk[], EmbeddingServiceError>> {
		const chunkIdsResult = this.hashTracker.getAllChunksToProcess(modelId);

		if (chunkIdsResult.isErr()) {
			return err(
				new EmbeddingServiceError(
					`Failed to determine chunks to process: ${chunkIdsResult.error.message}`,
					chunkIdsResult.error
				)
			);
		}

		const chunkIds = chunkIdsResult.value;

		if (chunkIds.length === 0) {
			return ok([]);
		}

		try {
			const placeholders = chunkIds.map(() => '?').join(',');
			const chunks = this.db
				.prepare(
					`
				SELECT * FROM chunks
				WHERE id IN (${placeholders})
				  AND deleted_at IS NULL
				ORDER BY created_at ASC
			`
				)
				.all(...chunkIds) as Chunk[];

			return ok(chunks);
		} catch (error) {
			return err(
				new EmbeddingServiceError(
					`Failed to fetch chunks to process: ${error instanceof Error ? error.message : 'Unknown error'}`,
					error instanceof Error ? error : undefined
				)
			);
		}
	}

	/**
	 * Get embedding statistics
	 */
	getStatistics(modelId: string): Result<
		{
			totalChunks: number;
			withEmbeddings: number;
			withoutEmbeddings: number;
			needingUpdate: number;
			upToDate: number;
		},
		EmbeddingServiceError
	> {
		const result = this.hashTracker.getEmbeddingStatus(modelId);

		if (result.isErr()) {
			return err(
				new EmbeddingServiceError(
					`Failed to get statistics: ${result.error.message}`,
					result.error
				)
			);
		}

		return ok(result.value);
	}
}
