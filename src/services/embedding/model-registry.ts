/**
 * Model Registry and Factory
 *
 * Manages adapter factories and provides adapter instantiation.
 * Based on research.md lines 1239-1583
 */

import { Result, ok, err } from '../../lib/result-types.js';
import { IEmbeddingAdapter, AdapterError, AdapterInitializationError } from './adapter-interface.js';
import { AdapterConfig, ConfigError } from '../../lib/env-config.js';

// ============================================================================
// Adapter Factory Interface
// ============================================================================

/**
 * Adapter Factory Interface
 *
 * Factories create and validate adapter instances from configuration.
 */
export interface IAdapterFactory {
	/** Unique identifier for this factory (e.g., "onnx", "openai") */
	readonly id: string;

	/** Human-readable name */
	readonly name: string;

	/** Supported configuration types */
	readonly supportedConfigTypes: string[];

	/**
	 * Create an adapter instance from configuration
	 *
	 * @param config - Adapter configuration
	 * @returns Result with adapter instance or error
	 */
	create(config: AdapterConfig): Result<IEmbeddingAdapter, AdapterError>;

	/**
	 * Validate configuration before creation
	 *
	 * @param config - Adapter configuration to validate
	 * @returns Result indicating validity
	 */
	validateConfig(config: AdapterConfig): Result<void, ConfigError>;
}

// ============================================================================
// Registry Error
// ============================================================================

/**
 * Registry error
 */
export class RegistryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RegistryError';
		Object.setPrototypeOf(this, RegistryError.prototype);
	}
}

// ============================================================================
// Adapter Registry
// ============================================================================

/**
 * Factory information for listing
 */
export interface FactoryInfo {
	id: string;
	name: string;
	supportedConfigTypes: string[];
}

/**
 * Adapter Registry
 *
 * Central registry for managing adapter factories and instances.
 * Provides factory registration, adapter creation, and lifecycle management.
 */
export class AdapterRegistry {
	private factories = new Map<string, IAdapterFactory>();
	private instances = new Map<string, IEmbeddingAdapter>();

	/**
	 * Register a new adapter factory
	 *
	 * @param factory - Factory to register
	 * @returns Result indicating success or error
	 */
	register(factory: IAdapterFactory): Result<void, RegistryError> {
		if (this.factories.has(factory.id)) {
			return err(
				new RegistryError(
					`Adapter factory "${factory.id}" is already registered`
				)
			);
		}

		this.factories.set(factory.id, factory);
		return ok(undefined);
	}

	/**
	 * Unregister an adapter factory
	 *
	 * Also disposes and removes any instances created by this factory.
	 *
	 * @param factoryId - Factory identifier to unregister
	 */
	async unregister(factoryId: string): Promise<void> {
		this.factories.delete(factoryId);

		// Clean up any instances created by this factory
		const instancesToRemove: string[] = [];

		for (const [instanceId, adapter] of this.instances.entries()) {
			if (adapter.id.startsWith(factoryId)) {
				await adapter.dispose();
				instancesToRemove.push(instanceId);
			}
		}

		for (const instanceId of instancesToRemove) {
			this.instances.delete(instanceId);
		}
	}

	/**
	 * Get or create an adapter instance
	 *
	 * If an instance with the same ID already exists, returns the cached instance.
	 * Otherwise creates a new instance using the appropriate factory.
	 *
	 * @param factoryId - Factory identifier
	 * @param config - Adapter configuration
	 * @param instanceId - Optional custom instance ID
	 * @returns Result with adapter instance or error
	 */
	getOrCreateAdapter(
		factoryId: string,
		config: AdapterConfig,
		instanceId?: string
	): Result<IEmbeddingAdapter, AdapterError> {
		const cacheKey = instanceId || `${factoryId}:default`;

		// Return existing instance if available
		const existing = this.instances.get(cacheKey);
		if (existing) {
			return ok(existing);
		}

		// Find factory
		const factory = this.factories.get(factoryId);
		if (!factory) {
			return err(
				new AdapterInitializationError(
					`No adapter factory registered for "${factoryId}". ` +
						`Available factories: ${Array.from(this.factories.keys()).join(', ')}`
				)
			);
		}

		// Validate configuration
		const validation = factory.validateConfig(config);
		if (validation.isErr()) {
			return err(
				new AdapterInitializationError(
					`Invalid configuration for factory "${factoryId}": ${validation.error.message}`
				)
			);
		}

		// Create new instance
		const result = factory.create(config);
		if (result.isErr()) {
			return result;
		}

		// Cache instance
		const adapter = result.value;
		this.instances.set(cacheKey, adapter);

		return ok(adapter);
	}

	/**
	 * Get an existing adapter instance
	 *
	 * @param instanceId - Instance identifier
	 * @returns Adapter instance or undefined
	 */
	getInstance(instanceId: string): IEmbeddingAdapter | undefined {
		return this.instances.get(instanceId);
	}

	/**
	 * Check if a factory is registered
	 *
	 * @param factoryId - Factory identifier
	 * @returns true if factory exists
	 */
	hasFactory(factoryId: string): boolean {
		return this.factories.has(factoryId);
	}

	/**
	 * List all registered factories
	 *
	 * @returns Array of factory information
	 */
	listFactories(): FactoryInfo[] {
		return Array.from(this.factories.values()).map((factory) => ({
			id: factory.id,
			name: factory.name,
			supportedConfigTypes: factory.supportedConfigTypes,
		}));
	}

	/**
	 * List all active adapter instances
	 *
	 * @returns Array of adapter IDs
	 */
	listInstances(): string[] {
		return Array.from(this.instances.keys());
	}

	/**
	 * Dispose a specific adapter instance
	 *
	 * @param instanceId - Instance identifier
	 */
	async disposeInstance(instanceId: string): Promise<void> {
		const adapter = this.instances.get(instanceId);
		if (adapter) {
			await adapter.dispose();
			this.instances.delete(instanceId);
		}
	}

	/**
	 * Dispose all adapter instances
	 */
	async disposeAll(): Promise<void> {
		const disposals = Array.from(this.instances.values()).map((adapter) =>
			adapter.dispose()
		);
		await Promise.all(disposals);
		this.instances.clear();
	}

	/**
	 * Get registry statistics
	 *
	 * @returns Statistics about registered factories and instances
	 */
	getStats(): {
		totalFactories: number;
		totalInstances: number;
		factories: string[];
		instances: string[];
	} {
		return {
			totalFactories: this.factories.size,
			totalInstances: this.instances.size,
			factories: Array.from(this.factories.keys()),
			instances: Array.from(this.instances.keys()),
		};
	}
}

// ============================================================================
// Global Registry Instance
// ============================================================================

/**
 * Global adapter registry instance
 */
let globalRegistry: AdapterRegistry | null = null;

/**
 * Get or create the global adapter registry
 *
 * @returns Global adapter registry
 */
export function getAdapterRegistry(): AdapterRegistry {
	if (!globalRegistry) {
		globalRegistry = new AdapterRegistry();
	}
	return globalRegistry;
}

/**
 * Create a new adapter registry instance
 *
 * Useful for testing or isolated contexts.
 *
 * @returns New adapter registry
 */
export function createAdapterRegistry(): AdapterRegistry {
	return new AdapterRegistry();
}
