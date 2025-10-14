/**
 * Embedding Profile Model
 *
 * Represents a complete configuration set for embedding generation.
 */

export type Backend = 'onnx' | 'pytorch';
export type Device = 'cpu' | 'mps' | 'cuda' | 'auto';
export type Quantization = 'int8' | 'int4' | 'fp16' | 'fp32' | 'auto';

export interface EmbeddingProfile {
  /** Profile name (light, balanced, performance, or custom name) */
  name: string;

  /** Hugging Face model ID or local path */
  model: string;

  /** Model version/commit hash (default: "main") */
  modelVersion: string;

  /** Execution backend (onnx or pytorch) */
  backend: Backend;

  /** Target device (cpu, mps, cuda, auto) */
  device: Device;

  /** Quantization level (int8, int4, fp16, fp32, auto) */
  quantization: Quantization;

  /** Batch size for processing */
  batchSize: number;

  /** Embedding vector dimensions */
  dimensions: number;

  /** Cache directory path */
  cacheDir: string;
}

/**
 * Preset embedding profiles optimized for different hardware
 */
export const PRESET_PROFILES: Record<'light' | 'balanced' | 'performance', EmbeddingProfile> = {
  light: {
    name: 'light',
    model: 'Xenova/all-MiniLM-L6-v2',
    modelVersion: 'main',
    backend: 'onnx',
    device: 'cpu',
    quantization: 'int8',
    batchSize: 16,
    dimensions: 384,
    cacheDir: '.codeindex/cache'
  },
  balanced: {
    name: 'balanced',
    model: 'Xenova/all-mpnet-base-v2',
    modelVersion: 'main',
    backend: 'onnx',
    device: 'auto', // Selected based on hardware
    quantization: 'auto', // int8 for CPU, fp16 for GPU
    batchSize: 32,
    dimensions: 768,
    cacheDir: '.codeindex/cache'
  },
  performance: {
    name: 'performance',
    model: 'Xenova/instructor-large',
    modelVersion: 'main',
    backend: 'onnx',
    device: 'auto', // Prefers GPU
    quantization: 'fp16',
    batchSize: 64,
    dimensions: 768,
    cacheDir: '.codeindex/cache'
  }
};

/**
 * Validates embedding profile structure
 */
export function validateEmbeddingProfile(
  profile: Partial<EmbeddingProfile>
): profile is EmbeddingProfile {
  const validBackends: Backend[] = ['onnx', 'pytorch'];
  const validDevices: Device[] = ['cpu', 'mps', 'cuda', 'auto'];
  const validQuantizations: Quantization[] = ['int8', 'int4', 'fp16', 'fp32', 'auto'];

  return (
    typeof profile.name === 'string' &&
    profile.name.length > 0 &&
    typeof profile.model === 'string' &&
    profile.model.length > 0 &&
    typeof profile.modelVersion === 'string' &&
    typeof profile.backend === 'string' &&
    validBackends.includes(profile.backend as Backend) &&
    typeof profile.device === 'string' &&
    validDevices.includes(profile.device as Device) &&
    typeof profile.quantization === 'string' &&
    validQuantizations.includes(profile.quantization as Quantization) &&
    typeof profile.batchSize === 'number' &&
    profile.batchSize >= 1 &&
    profile.batchSize <= 256 &&
    typeof profile.dimensions === 'number' &&
    profile.dimensions > 0 &&
    typeof profile.cacheDir === 'string' &&
    profile.cacheDir.length > 0
  );
}
