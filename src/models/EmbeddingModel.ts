/**
 * Embedding Model Instance
 *
 * Represents a loaded embedding model instance.
 */

import { Backend, Device, Quantization } from './EmbeddingProfile.js';

export interface EmbeddingModel {
  /** Hugging Face model ID */
  modelId: string;

  /** Commit hash or tag */
  modelVersion: string;

  /** ONNX or PyTorch */
  backend: Backend;

  /** CPU, MPS, or CUDA */
  device: Device;

  /** Quantization level */
  quantization: Quantization;

  /** Output embedding dimensions */
  dimensions: number;

  /** When model was loaded */
  loadedAt: Date;

  /** Local file system path to model */
  modelPath: string;

  /** Transformers.js pipeline instance (opaque) */
  pipeline: any;
}

/**
 * Validates embedding model structure
 */
export function validateEmbeddingModel(
  model: Partial<EmbeddingModel>
): model is EmbeddingModel {
  return (
    typeof model.modelId === 'string' &&
    model.modelId.length > 0 &&
    typeof model.modelVersion === 'string' &&
    typeof model.backend === 'string' &&
    typeof model.device === 'string' &&
    typeof model.quantization === 'string' &&
    typeof model.dimensions === 'number' &&
    model.dimensions > 0 &&
    model.loadedAt instanceof Date &&
    typeof model.modelPath === 'string' &&
    model.pipeline !== null &&
    model.pipeline !== undefined
  );
}
