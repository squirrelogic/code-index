/**
 * ONNX Embedding Adapter
 *
 * Local embedding adapter using ONNX Runtime for model inference.
 * Implements the IEmbeddingAdapter interface for all-MiniLM-L6-v2 model.
 */

import * as ort from 'onnxruntime-node';
import { Result, ok, err } from '../../lib/result-types.js';
import {
	IEmbeddingAdapter,
	AdapterError,
	AdapterInitializationError,
	AdapterCapabilities,
	EmbedOptions,
	EmbeddingBatch,
	HealthStatus,
} from './adapter-interface.js';
import { OnnxAdapterConfig } from '../../lib/env-config.js';
import * as fs from 'fs';

/**
 * ONNX Embedding Adapter
 *
 * Uses ONNX Runtime to run embedding models locally.
 * Default model: all-MiniLM-L6-v2 (384 dimensions)
 */
export class OnnxEmbeddingAdapter implements IEmbeddingAdapter {
	readonly id: string;
	readonly name: string;
	readonly dimensions: number;
	readonly version: string;
	readonly capabilities: AdapterCapabilities;

	private session: ort.InferenceSession | null = null;
	private tokenizer: SimpleTokenizer;

	constructor(
		private config: OnnxAdapterConfig,
		modelId: string = 'all-MiniLM-L6-v2',
		dimensions: number = 384,
		version: string = '1.0'
	) {
		this.id = `onnx:${modelId}`;
		this.name = config.name || `Local: ${modelId}`;
		this.dimensions = dimensions;
		this.version = version;
		this.capabilities = {
			batching: true,
			requiresNetwork: false,
			concurrent: false, // ONNX Runtime is not thread-safe by default
			maxBatchSize: 32,
		};
		this.tokenizer = new SimpleTokenizer();
	}

	/**
	 * Initialize the ONNX adapter
	 *
	 * Loads the ONNX model into memory and prepares for inference.
	 */
	async initialize(): Promise<Result<void, AdapterError>> {
		try {
			// Check if model file exists
			if (!fs.existsSync(this.config.modelPath)) {
				return err(
					new AdapterInitializationError(
						`Model file not found at ${this.config.modelPath}. ` +
							`Please download the model or run 'code-index doctor' to diagnose.`
					)
				);
			}

			// Configure ONNX Runtime session options
			const sessionOptions: ort.InferenceSession.SessionOptions = {
				graphOptimizationLevel: 'all',
				executionProviders: this.config.useGpu
					? ['cuda', 'cpu']
					: ['cpu'],
				intraOpNumThreads: this.config.threads || 4,
			};

			// Load the model
			this.session = await ort.InferenceSession.create(
				this.config.modelPath,
				sessionOptions
			);

			if (process.env.NODE_ENV !== 'test') {
				console.log(`  ✓ ONNX model loaded: ${this.name}`);
				console.log(`    Dimensions: ${this.dimensions}`);
				console.log(`    Threads: ${sessionOptions.intraOpNumThreads}`);
			}

			return ok(undefined);
		} catch (error) {
			return err(
				new AdapterInitializationError(
					`Failed to initialize ONNX adapter: ${error instanceof Error ? error.message : 'Unknown error'}`,
					error instanceof Error ? error : undefined
				)
			);
		}
	}

	/**
	 * Generate embeddings for a batch of texts
	 */
	async embed(
		texts: string[],
		options?: EmbedOptions
	): Promise<Result<EmbeddingBatch, AdapterError>> {
		if (!this.session) {
			return err(
				new AdapterInitializationError(
					'Adapter not initialized. Call initialize() first.'
				)
			);
		}

		const startTime = Date.now();
		const vectors: number[][] = [];
		const batchSize = options?.batchSize || 16;

		try {
			// Process texts in batches
			for (let i = 0; i < texts.length; i += batchSize) {
				const batch = texts.slice(i, i + batchSize);
				const batchVectors = await this.processBatch(batch);

				vectors.push(...batchVectors);

				// Report progress
				if (options?.progressCallback) {
					const processed = Math.min(i + batchSize, texts.length);
					const rate =
						processed / ((Date.now() - startTime) / 1000);
					const remaining = texts.length - processed;
					const estimatedMs = remaining / rate * 1000;

					options.progressCallback({
						processed,
						total: texts.length,
						rate,
						estimatedMs,
					});
				}
			}

			const durationMs = Date.now() - startTime;
			const throughput = texts.length / (durationMs / 1000);

			return ok({
				vectors,
				metadata: texts.map((text, index) => ({
					inputText: text,
					index,
					tokenCount: this.tokenizer.tokenize(text).length,
					modelId: this.id,
				})),
				stats: {
					totalTexts: texts.length,
					durationMs,
					tokensProcessed: texts.reduce(
						(sum, text) => sum + this.tokenizer.tokenize(text).length,
						0
					),
					throughput,
				},
			});
		} catch (error) {
			return err(
				new AdapterInitializationError(
					`Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
					error instanceof Error ? error : undefined
				)
			);
		}
	}

	/**
	 * Process a batch of texts through the ONNX model
	 */
	private async processBatch(texts: string[]): Promise<number[][]> {
		if (!this.session) {
			throw new Error('Session not initialized');
		}

		// Tokenize texts
		const tokenizedBatch = texts.map((text) =>
			this.tokenizer.tokenize(text)
		);

		// For simplicity, process each text individually
		// In production, implement proper batch processing with padding
		const results: number[][] = [];

		for (const tokens of tokenizedBatch) {
			const embedding = await this.runInference(tokens);
			results.push(embedding);
		}

		return results;
	}

	/**
	 * Run inference on tokenized input
	 */
	private async runInference(tokens: number[]): Promise<number[]> {
		if (!this.session) {
			throw new Error('Session not initialized');
		}

		// Create input tensor
		// Note: This is a simplified implementation
		// Real implementation would need proper attention masks and token type IDs
		const inputIds = new ort.Tensor(
			'int64',
			BigInt64Array.from(tokens.map((t) => BigInt(t))),
			[1, tokens.length]
		);

		// Run inference
		const feeds = { input_ids: inputIds };
		const results = await this.session.run(feeds);

		// Extract embeddings from output
		// The output is typically the last hidden state, we take the mean
		const outputKey = Object.keys(results)[0];
		if (!outputKey) {
			throw new Error('No output from model');
		}

		const output = results[outputKey];
		if (!output) {
			throw new Error('No output tensor found');
		}

		const data = output.data as Float32Array;

		// Mean pooling (simplified - take first 384 values)
		// In production, implement proper mean pooling over sequence length
		return Array.from(data.slice(0, this.dimensions));
	}

	/**
	 * Cleanup adapter resources
	 */
	async dispose(): Promise<void> {
		if (this.session) {
			// ONNX Runtime handles cleanup internally
			this.session = null;
		}
	}

	/**
	 * Health check for adapter
	 */
	async healthCheck(): Promise<Result<HealthStatus, AdapterError>> {
		const startTime = Date.now();

		if (!this.session) {
			return ok({
				available: false,
				message: 'Adapter not initialized',
			});
		}

		try {
			// Test inference with a simple input
			const testTokens = [101, 2023, 2003, 1037, 3231, 102]; // "this is a test"
			await this.runInference(testTokens);

			const latencyMs = Date.now() - startTime;

			return ok({
				available: true,
				latencyMs,
				message: 'Adapter is healthy',
			});
		} catch (error) {
			return ok({
				available: false,
				message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			});
		}
	}
}

/**
 * Simple Tokenizer
 *
 * Placeholder implementation for tokenization.
 * In production, use a proper tokenizer like @xenova/transformers
 */
class SimpleTokenizer {
	/**
	 * Tokenize text into token IDs
	 *
	 * This is a very simplified implementation.
	 * Production code should use a proper BERT tokenizer.
	 */
	tokenize(text: string): number[] {
		// Simplified: just convert to char codes and normalize
		// Real implementation would use WordPiece tokenization
		const normalized = text.toLowerCase().trim();
		const tokens = [101]; // [CLS] token

		for (let i = 0; i < Math.min(normalized.length, 510); i++) {
			tokens.push(normalized.charCodeAt(i) % 30000);
		}

		tokens.push(102); // [SEP] token

		return tokens;
	}
}
