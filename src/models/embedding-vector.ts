/**
 * Embedding Vector Model
 *
 * Represents a generated embedding vector with associated metadata.
 * Based on data-model.md lines 15-42
 */

/**
 * Embedding Vector entity
 *
 * Represents a generated embedding vector with associated metadata
 */
export interface EmbeddingVector {
	/** Unique identifier (rowid from vec_embeddings virtual table) */
	id: number;

	/** Reference to the code chunk (FK to chunks table) */
	chunk_id: string;

	/** Embedding vector (384 dimensions for all-MiniLM-L6-v2) */
	vector: Float32Array;

	/** Model identifier (e.g., "all-MiniLM-L6-v2") */
	model_id: string;

	/** Model version for tracking */
	model_version: string;

	/** Vector dimensions for validation */
	dimensions: number;

	/** ISO 8601 timestamp */
	created_at: string;

	/** Hash of chunk content for change detection */
	chunk_hash: string;
}

/**
 * State transitions for embedding vectors
 */
export type EmbeddingState = 'created' | 'active' | 'stale' | 'deleted';

/**
 * Embedding vector creation input
 */
export interface CreateEmbeddingInput {
	chunk_id: string;
	vector: Float32Array;
	model_id: string;
	model_version: string;
	dimensions: number;
	chunk_hash: string;
}

/**
 * Embedding vector query result
 */
export interface EmbeddingQueryResult {
	chunk_id: string;
	model_id: string;
	chunk_hash: string;
	distance: number;
	similarity: number;
}
