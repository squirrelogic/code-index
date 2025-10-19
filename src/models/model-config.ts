/**
 * Model Configuration Model
 *
 * Represents configuration for a specific embedding model.
 * Based on data-model.md lines 48-67
 */

/**
 * Adapter type enumeration
 */
export type AdapterType = 'onnx' | 'openai' | 'anthropic' | 'custom';

/**
 * Model Configuration entity
 *
 * Represents configuration for a specific embedding model
 */
export interface ModelConfiguration {
	/** Unique model identifier (e.g., "all-MiniLM-L6-v2") */
	id: string;

	/** Display name */
	name: string;

	/** Adapter type */
	adapter_type: AdapterType;

	/** Expected vector dimensions */
	dimensions: number;

	/** Model version */
	version: string;

	/** Boolean flag for default model (0 or 1) */
	is_default: number;

	/** JSON blob for adapter-specific configuration */
	config_json: string | null;

	/** ISO 8601 timestamp */
	created_at: string;

	/** Last usage timestamp */
	last_used_at: string | null;
}

/**
 * Model configuration creation input
 */
export interface CreateModelConfigInput {
	id: string;
	name: string;
	adapter_type: AdapterType;
	dimensions: number;
	version: string;
	is_default?: number;
	config_json?: string;
}

/**
 * Model configuration update input
 */
export interface UpdateModelConfigInput {
	name?: string;
	version?: string;
	is_default?: number;
	config_json?: string;
	last_used_at?: string;
}

/**
 * Adapter configuration interface (parsed from config_json)
 */
export interface AdapterConfiguration {
	/** Model file path for local adapters */
	modelPath?: string;

	/** Number of threads for processing */
	threads?: number;

	/** API endpoint for hosted adapters */
	endpoint?: string;

	/** API key reference (should be in environment variables, not stored here) */
	apiKeyEnvVar?: string;

	/** Organization ID for hosted services */
	organizationId?: string;

	/** Rate limit in requests per minute */
	rateLimit?: number;

	/** Request timeout in milliseconds */
	timeoutMs?: number;

	/** Enable GPU acceleration */
	useGpu?: boolean;

	/** Maximum memory usage in MB */
	maxMemoryMb?: number;
}
