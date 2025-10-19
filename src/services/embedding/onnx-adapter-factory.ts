/**
 * ONNX Adapter Factory
 *
 * Factory for creating ONNX embedding adapter instances.
 */

import { Result, ok, err } from '../../lib/result-types.js';
import { IAdapterFactory } from './model-registry.js';
import { IEmbeddingAdapter, AdapterError, AdapterInitializationError } from './adapter-interface.js';
import { AdapterConfig, OnnxAdapterConfig, ConfigError } from '../../lib/env-config.js';
import { OnnxEmbeddingAdapter } from './onnx-adapter.js';
import * as fs from 'fs';

/**
 * ONNX Adapter Factory
 *
 * Creates and validates ONNX embedding adapter instances.
 */
export class OnnxAdapterFactory implements IAdapterFactory {
	readonly id = 'onnx';
	readonly name = 'ONNX Local Embedding Adapter';
	readonly supportedConfigTypes = ['onnx'];

	/**
	 * Create an ONNX adapter instance from configuration
	 */
	create(config: AdapterConfig): Result<IEmbeddingAdapter, AdapterError> {
		// Validate config type
		if (config.type !== 'onnx') {
			return err(
				new AdapterInitializationError(
					`Invalid config type "${config.type}" for ONNX factory. Expected "onnx".`
				)
			);
		}

		const onnxConfig = config as OnnxAdapterConfig;

		// Create adapter instance
		const adapter = new OnnxEmbeddingAdapter(
			onnxConfig,
			'all-MiniLM-L6-v2',
			384,
			'1.0'
		);

		return ok(adapter);
	}

	/**
	 * Validate configuration before creation
	 */
	validateConfig(config: AdapterConfig): Result<void, ConfigError> {
		// Check type
		if (config.type !== 'onnx') {
			return err(
				new ConfigError(
					`Invalid config type "${config.type}". Expected "onnx".`
				)
			);
		}

		const onnxConfig = config as OnnxAdapterConfig;

		// Validate required fields
		if (!onnxConfig.modelPath) {
			return err(
				new ConfigError('Missing required field: modelPath')
			);
		}

		// Check if model file exists
		if (!fs.existsSync(onnxConfig.modelPath)) {
			return err(
				new ConfigError(
					`Model file not found at ${onnxConfig.modelPath}. ` +
						`Please download the model first.`
				)
			);
		}

		// Validate optional fields
		if (onnxConfig.threads !== undefined) {
			if (onnxConfig.threads < 1 || onnxConfig.threads > 32) {
				return err(
					new ConfigError(
						`Invalid threads value: ${onnxConfig.threads}. Must be between 1 and 32.`
					)
				);
			}
		}

		if (onnxConfig.maxMemoryMb !== undefined) {
			if (onnxConfig.maxMemoryMb < 100 || onnxConfig.maxMemoryMb > 4096) {
				return err(
					new ConfigError(
						`Invalid maxMemoryMb value: ${onnxConfig.maxMemoryMb}. Must be between 100 and 4096.`
					)
				);
			}
		}

		return ok(undefined);
	}
}
