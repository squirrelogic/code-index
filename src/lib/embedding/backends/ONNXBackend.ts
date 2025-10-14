/**
 * ONNX Backend Implementation (T076)
 *
 * This module provides the ONNX Runtime backend for embedding generation.
 * It handles:
 * - ONNX Runtime initialization with execution providers
 * - Quantization configuration (int8, int4, fp16, fp32)
 * - Device selection (CPU, CUDA, CoreML/MPS)
 * - Model loading and inference
 */

import type { Pipeline } from '@xenova/transformers';
import type { Device, Quantization } from '../../../models/EmbeddingProfile.js';

export interface ONNXBackendConfig {
  modelId: string;
  modelVersion: string;
  device: Device;
  quantization: Quantization;
  cacheDir: string;
  progressCallback?: (progress: any) => void;
}

export interface ONNXExecutionProvider {
  name: string;
  available: boolean;
  priority: number;
}

/**
 * ONNX Backend for Transformers.js
 */
export class ONNXBackend {
  private config: ONNXBackendConfig;
  private pipeline: Pipeline | null = null;

  constructor(config: ONNXBackendConfig) {
    this.config = config;
  }

  /**
   * Initialize ONNX Runtime with appropriate execution providers
   */
  async initialize(): Promise<void> {
    const { pipeline, env } = await import('@xenova/transformers');

    // Configure cache directory
    env.cacheDir = this.config.cacheDir;
    env.allowLocalModels = true;

    // Configure execution providers based on device
    // Note: providers list is for future ONNX Runtime configuration
    // Currently Transformers.js handles provider selection automatically
    this.getExecutionProviders();

    // Configure quantization
    const quantized = this.shouldUseQuantization();

    // Load the pipeline
    // Note: Transformers.js pipeline returns FeatureExtractionPipeline which is compatible with Pipeline
    this.pipeline = await pipeline(
      'feature-extraction',
      this.config.modelId,
      {
        revision: this.config.modelVersion,
        quantized,
        progress_callback: this.config.progressCallback,
        // Note: device configuration is not directly supported by Transformers.js
        // The library automatically selects optimal device based on availability
      }
    ) as any; // Type assertion needed due to Transformers.js type limitations
  }

  /**
   * Generate embeddings for input texts
   * @param texts Array of input texts
   * @param options Inference options
   */
  async embed(texts: string[], options?: { pooling?: string; normalize?: boolean }): Promise<number[][]> {
    if (!this.pipeline) {
      throw new Error('ONNX Backend not initialized. Call initialize() first.');
    }

    const result = await this.pipeline(texts, {
      pooling: options?.pooling || 'mean',
      normalize: options?.normalize !== false, // Default to true
    });

    // Convert result to number[][] format
    if (Array.isArray(result)) {
      return result.map((r: any) => Array.from(r.data));
    }

    // Single result
    return [Array.from(result.data)];
  }

  /**
   * Get available execution providers based on device
   */
  private getExecutionProviders(): ONNXExecutionProvider[] {
    const providers: ONNXExecutionProvider[] = [
      { name: 'CPUExecutionProvider', available: true, priority: 0 }
    ];

    switch (this.config.device) {
      case 'cuda':
        providers.unshift({
          name: 'CUDAExecutionProvider',
          available: true,
          priority: 10
        });
        break;

      case 'mps':
        // On Apple Silicon, use CoreML execution provider
        providers.unshift({
          name: 'CoreMLExecutionProvider',
          available: true,
          priority: 10
        });
        break;

      case 'cpu':
      default:
        // CPU only - already added
        break;
    }

    return providers.filter(p => p.available).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Determine if quantization should be used
   */
  private shouldUseQuantization(): boolean {
    const quant = this.config.quantization;

    // For ONNX, quantization is enabled for int8, int4
    // fp16 and fp32 use the default model precision
    return quant === 'int8' || quant === 'int4';
  }

  /**
   * Get model info
   */
  getModelInfo(): { modelId: string; device: Device; quantization: Quantization } {
    return {
      modelId: this.config.modelId,
      device: this.config.device,
      quantization: this.config.quantization
    };
  }

  /**
   * Check if backend is initialized
   */
  isInitialized(): boolean {
    return this.pipeline !== null;
  }

  /**
   * Reset the pipeline (for fallback scenarios)
   */
  reset(): void {
    this.pipeline = null;
  }

  /**
   * Validate ONNX Runtime availability
   */
  static async validate(): Promise<{ available: boolean; version?: string; providers: string[] }> {
    try {
      const { env } = await import('@xenova/transformers');

      // Check available execution providers
      const providers: string[] = ['CPUExecutionProvider'];

      // TODO: Add logic to detect CUDA, CoreML providers when transformers.js exposes this
      // For now, we assume they're available if the device is configured

      return {
        available: true,
        version: env.version || 'unknown',
        providers
      };
    } catch (error) {
      return {
        available: false,
        providers: []
      };
    }
  }
}
