/**
 * Configuration Management
 *
 * Centralized configuration management with environment variable support.
 * Based on research.md lines 545-716
 */

import { config as loadEnv } from 'dotenv';
import { Result, ok, err } from './result-types.js';

// ============================================================================
// Configuration Interfaces
// ============================================================================

/**
 * Base configuration for all adapters
 */
export interface AdapterConfig {
	/** Adapter type identifier */
	type: 'onnx' | 'openai' | 'anthropic' | 'custom';

	/** Optional custom name override */
	name?: string;

	/** Enable debug logging */
	debug?: boolean;
}

/**
 * Configuration for ONNX local adapters
 */
export interface OnnxAdapterConfig extends AdapterConfig {
	type: 'onnx';

	/** Path to ONNX model file (relative to project root) */
	modelPath: string;

	/** Number of worker threads (default: CPU cores - 1) */
	threads?: number;

	/** Maximum memory usage in MB */
	maxMemoryMb?: number;

	/** Enable GPU acceleration if available */
	useGpu?: boolean;
}

/**
 * Configuration for hosted API adapters
 */
export interface HostedAdapterConfig extends AdapterConfig {
	type: 'openai' | 'anthropic' | 'custom';

	/** API endpoint URL */
	endpoint: string;

	/** API key (loaded from environment) */
	apiKey: string;

	/** Organization ID (optional) */
	organizationId?: string;

	/** Rate limit: requests per minute */
	rateLimit?: number;

	/** Request timeout in milliseconds */
	timeoutMs?: number;

	/** HTTP headers to include in requests */
	headers?: Record<string, string>;
}

// ============================================================================
// Configuration Error
// ============================================================================

/**
 * Configuration error
 */
export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConfigError';
		Object.setPrototypeOf(this, ConfigError.prototype);
	}
}

// ============================================================================
// Configuration Manager
// ============================================================================

/**
 * Configuration Manager
 *
 * Manages configuration loading from environment variables and .env files.
 * Provides type-safe access to adapter configurations with validation.
 */
export class ConfigurationManager {
	constructor(private envPath?: string) {}

	/**
	 * Load environment variables from .env file
	 *
	 * @returns Result indicating success or failure
	 */
	loadEnv(): Result<void, ConfigError> {
		try {
			const result = loadEnv({ path: this.envPath });

			if (result.error) {
				// .env file not found is not an error (optional)
				if (process.env.NODE_ENV !== 'production') {
					console.warn(`  ⚠️  .env file not found (this is optional)`);
				}
			}

			return ok(undefined);
		} catch (error) {
			return err(
				new ConfigError(
					`Failed to load .env file: ${error instanceof Error ? error.message : 'Unknown error'}`
				)
			);
		}
	}

	/**
	 * Get configuration for a specific adapter
	 *
	 * Reads configuration from environment variables with prefix EMBED_<ADAPTER>_
	 *
	 * @param adapterId - Adapter identifier (e.g., "default", "openai")
	 * @returns Result with adapter configuration or error
	 */
	getAdapterConfig(
		adapterId: string
	): Result<AdapterConfig, ConfigError> {
		const type = this.getEnvVar(`EMBED_${adapterId.toUpperCase()}_TYPE`);

		if (!type) {
			// If no type specified, assume default ONNX adapter
			if (adapterId === 'default') {
				return this.getDefaultOnnxConfig();
			}

			return err(
				new ConfigError(
					`Missing adapter type: EMBED_${adapterId.toUpperCase()}_TYPE not set. ` +
						`Valid types: onnx, openai, anthropic, custom`
				)
			);
		}

		switch (type) {
			case 'onnx':
				return this.getOnnxConfig(adapterId);
			case 'openai':
			case 'anthropic':
			case 'custom':
				return this.getHostedConfig(adapterId, type);
			default:
				return err(
					new ConfigError(
						`Unknown adapter type "${type}" for adapter "${adapterId}". ` +
							`Valid types: onnx, openai, anthropic, custom`
					)
				);
		}
	}

	/**
	 * Get default ONNX configuration
	 */
	private getDefaultOnnxConfig(): Result<OnnxAdapterConfig, ConfigError> {
		return ok({
			type: 'onnx',
			modelPath: '.codeindex/models/all-MiniLM-L6-v2.onnx',
			threads: 4,
			debug: false,
		});
	}

	/**
	 * Get ONNX adapter configuration
	 */
	private getOnnxConfig(
		adapterId: string
	): Result<OnnxAdapterConfig, ConfigError> {
		const prefix = `EMBED_${adapterId.toUpperCase()}`;
		const modelPath = this.getEnvVar(`${prefix}_MODEL_PATH`);

		if (!modelPath) {
			return err(
				new ConfigError(
					`Missing required config: ${prefix}_MODEL_PATH`
				)
			);
		}

		return ok({
			type: 'onnx',
			modelPath,
			threads: this.getEnvNumber(`${prefix}_THREADS`),
			maxMemoryMb: this.getEnvNumber(`${prefix}_MAX_MEMORY_MB`),
			useGpu: this.getEnvBoolean(`${prefix}_USE_GPU`),
			debug: this.getEnvBoolean(`${prefix}_DEBUG`),
		});
	}

	/**
	 * Get hosted adapter configuration
	 */
	private getHostedConfig(
		adapterId: string,
		type: 'openai' | 'anthropic' | 'custom'
	): Result<HostedAdapterConfig, ConfigError> {
		const prefix = `EMBED_${adapterId.toUpperCase()}`;
		const apiKey = this.getEnvVar(`${prefix}_API_KEY`);

		if (!apiKey) {
			return err(
				new ConfigError(
					`Missing required config: ${prefix}_API_KEY. ` +
						`Set this environment variable or add it to your .env file.`
				)
			);
		}

		const endpoint = this.getEnvVar(`${prefix}_ENDPOINT`);
		if (!endpoint) {
			return err(
				new ConfigError(
					`Missing required config: ${prefix}_ENDPOINT`
				)
			);
		}

		return ok({
			type,
			endpoint,
			apiKey,
			organizationId: this.getEnvVar(`${prefix}_ORG_ID`),
			rateLimit: this.getEnvNumber(`${prefix}_RATE_LIMIT`),
			timeoutMs: this.getEnvNumber(`${prefix}_TIMEOUT_MS`),
			debug: this.getEnvBoolean(`${prefix}_DEBUG`),
		});
	}

	/**
	 * Get environment variable
	 */
	private getEnvVar(key: string): string | undefined {
		return process.env[key];
	}

	/**
	 * Get environment variable as number
	 */
	private getEnvNumber(key: string): number | undefined {
		const value = process.env[key];
		if (!value) return undefined;
		const num = parseInt(value, 10);
		return isNaN(num) ? undefined : num;
	}

	/**
	 * Get environment variable as boolean
	 */
	private getEnvBoolean(key: string): boolean | undefined {
		const value = process.env[key];
		if (!value) return undefined;
		return value.toLowerCase() === 'true' || value === '1';
	}

	/**
	 * Validate API key format (basic check)
	 *
	 * @param apiKey - API key to validate
	 * @returns true if format looks valid
	 */
	validateApiKey(apiKey: string): boolean {
		// Basic validation: not empty, minimum length
		return apiKey.length >= 20;
	}

	/**
	 * Mask API key for safe logging (show only last 4 characters)
	 *
	 * @param apiKey - API key to mask
	 * @returns Masked key string
	 */
	maskApiKey(apiKey: string): string {
		if (apiKey.length <= 4) {
			return '****';
		}
		return '****' + apiKey.slice(-4);
	}
}

/**
 * Create a configuration manager instance
 *
 * @param envPath - Optional path to .env file
 * @returns Configuration manager
 */
export function createConfigManager(envPath?: string): ConfigurationManager {
	return new ConfigurationManager(envPath);
}

/**
 * Global configuration manager instance
 */
let globalConfigManager: ConfigurationManager | null = null;

/**
 * Get or create the global configuration manager
 *
 * @returns Global configuration manager
 */
export function getConfigManager(): ConfigurationManager {
	if (!globalConfigManager) {
		globalConfigManager = new ConfigurationManager();
		// Try to load .env file (non-fatal if missing)
		globalConfigManager.loadEnv();
	}
	return globalConfigManager;
}
