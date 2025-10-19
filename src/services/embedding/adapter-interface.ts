/**
 * Embedding Adapter Interface
 *
 * Core adapter interface for embedding generation supporting both local (ONNX)
 * and hosted (API) models. Based on research.md lines 66-159 and 249-287.
 */

import { Result } from 'neverthrow';

// ============================================================================
// Error Hierarchy
// ============================================================================

/**
 * Base error class for all adapter-related errors
 */
export abstract class AdapterError extends Error {
	abstract readonly code: string;
	abstract readonly retryable: boolean;
	readonly timestamp: Date = new Date();

	constructor(message: string, public override cause?: Error) {
		super(message);
		this.name = this.constructor.name;
		// Ensure prototype chain is correct for instanceof checks
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/**
 * Adapter initialization failed (non-retryable)
 */
export class AdapterInitializationError extends AdapterError {
	readonly code = 'ADAPTER_INIT_FAILED';
	readonly retryable = false;
}

/**
 * Network error during adapter operation (retryable)
 */
export class AdapterNetworkError extends AdapterError {
	readonly code = 'ADAPTER_NETWORK_ERROR';
	readonly retryable = true;
}

/**
 * Operation timeout (retryable)
 */
export class AdapterTimeoutError extends AdapterError {
	readonly code = 'ADAPTER_TIMEOUT';
	readonly retryable = true;
}

/**
 * Validation error (non-retryable)
 */
export class AdapterValidationError extends AdapterError {
	readonly code = 'ADAPTER_VALIDATION_ERROR';
	readonly retryable = false;
}

/**
 * Rate limit exceeded (retryable with backoff)
 */
export class AdapterRateLimitError extends AdapterError {
	readonly code = 'ADAPTER_RATE_LIMIT';
	readonly retryable = true;

	constructor(message: string, public retryAfterMs?: number) {
		super(message);
	}
}

// ============================================================================
// Adapter Interface Types
// ============================================================================

/**
 * Adapter capability flags
 */
export interface AdapterCapabilities {
	/** Supports batch processing */
	batching: boolean;

	/** Requires network connectivity */
	requiresNetwork: boolean;

	/** Supports concurrent requests */
	concurrent: boolean;

	/** Maximum batch size (null = no limit) */
	maxBatchSize: number | null;
}

/**
 * Embedding progress information
 */
export interface EmbedProgress {
	/** Number of items processed so far */
	processed: number;

	/** Total number of items to process */
	total: number;

	/** Processing rate in items/second */
	rate: number;

	/** Estimated time remaining in milliseconds */
	estimatedMs: number;
}

/**
 * Embedding options for processing
 */
export interface EmbedOptions {
	/** Batch size for processing (adapter may override) */
	batchSize?: number;

	/** Timeout in milliseconds */
	timeout?: number;

	/** Enable progress reporting */
	progressCallback?: (progress: EmbedProgress) => void;
}

/**
 * Metadata for a single embedding
 */
export interface EmbeddingMetadata {
	/** Input text that was embedded */
	inputText: string;

	/** Index in the batch */
	index: number;

	/** Number of tokens processed */
	tokenCount: number;

	/** Model identifier */
	modelId?: string;

	/** Any additional adapter-specific metadata */
	[key: string]: unknown;
}

/**
 * Batch processing statistics
 */
export interface BatchStats {
	/** Total number of texts processed */
	totalTexts: number;

	/** Total processing duration in milliseconds */
	durationMs: number;

	/** Total tokens processed */
	tokensProcessed: number;

	/** Processing rate in texts/second */
	throughput?: number;
}

/**
 * Result of embedding a batch of texts
 */
export interface EmbeddingBatch {
	/** Generated embedding vectors (array of float arrays) */
	vectors: number[][];

	/** Metadata for each embedding */
	metadata: EmbeddingMetadata[];

	/** Processing statistics */
	stats: BatchStats;
}

/**
 * Health status of an adapter
 */
export interface HealthStatus {
	/** Whether adapter is available and ready */
	available: boolean;

	/** Latency in milliseconds (if checked) */
	latencyMs?: number;

	/** Status message (optional) */
	message?: string;
}

// ============================================================================
// Core Adapter Interface
// ============================================================================

/**
 * Core adapter interface for embedding generation
 *
 * Supports both local (ONNX) and hosted (API) models through a unified interface.
 * All operations use Result types for type-safe error handling.
 */
export interface IEmbeddingAdapter {
	/** Unique identifier for this adapter (e.g., "onnx:all-MiniLM-L6-v2") */
	readonly id: string;

	/** Display name for CLI/UI (e.g., "Local: all-MiniLM-L6-v2") */
	readonly name: string;

	/** Expected vector dimensions for validation */
	readonly dimensions: number;

	/** Model version for metadata tracking */
	readonly version: string;

	/** Adapter capabilities flags */
	readonly capabilities: AdapterCapabilities;

	/**
	 * Initialize adapter resources (load model, validate credentials)
	 *
	 * Called once during adapter registration. Should load models into memory,
	 * validate configuration, and prepare for embedding operations.
	 *
	 * @returns Result<void> on success, or AdapterError on failure
	 */
	initialize(): Promise<Result<void, AdapterError>>;

	/**
	 * Generate embeddings for a batch of text inputs
	 *
	 * @param texts - Array of text chunks to embed
	 * @param options - Optional parameters (batch size, timeout, progress callback)
	 * @returns Result with embedding batch or error
	 */
	embed(
		texts: string[],
		options?: EmbedOptions
	): Promise<Result<EmbeddingBatch, AdapterError>>;

	/**
	 * Cleanup adapter resources (unload model, close connections)
	 *
	 * Called during shutdown or adapter hot-swap. Should release all resources
	 * and ensure graceful cleanup.
	 */
	dispose(): Promise<void>;

	/**
	 * Health check for adapter availability
	 *
	 * Verifies that the adapter is ready to process requests.
	 *
	 * @returns Result with health status or error
	 */
	healthCheck(): Promise<Result<HealthStatus, AdapterError>>;
}
