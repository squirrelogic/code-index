/**
 * PyTorch Backend Stub (T077)
 *
 * This module provides a stub implementation for the PyTorch backend.
 * PyTorch support is planned for future releases.
 *
 * Current status: NOT IMPLEMENTED
 */

import type { Device, Quantization } from '../../../models/EmbeddingProfile.js';

export interface PyTorchBackendConfig {
  modelId: string;
  modelVersion: string;
  device: Device;
  quantization: Quantization;
  cacheDir: string;
  progressCallback?: (progress: any) => void;
}

/**
 * PyTorch Backend (Future Implementation)
 *
 * This backend will support:
 * - PyTorch model loading
 * - GPU acceleration via CUDA
 * - Dynamic quantization
 * - Batch inference
 *
 * @throws Error - Always throws as PyTorch is not yet implemented
 */
export class PyTorchBackend {
  private config: PyTorchBackendConfig;

  constructor(config: PyTorchBackendConfig) {
    this.config = config;
  }

  /**
   * Initialize PyTorch backend
   * @throws Error - PyTorch backend not implemented
   */
  async initialize(): Promise<void> {
    throw new Error(
      'PyTorch backend is not yet implemented. Please use ONNX backend instead. ' +
      'Set backend to "onnx" in your configuration.'
    );
  }

  /**
   * Generate embeddings (not implemented)
   * @throws Error - PyTorch backend not implemented
   */
  async embed(_texts: string[], _options?: any): Promise<number[][]> {
    throw new Error('PyTorch backend is not yet implemented');
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
    return false;
  }

  /**
   * Reset the backend
   */
  reset(): void {
    // No-op for stub
  }

  /**
   * Validate PyTorch availability
   */
  static async validate(): Promise<{ available: boolean; reason?: string }> {
    return {
      available: false,
      reason: 'PyTorch backend not implemented. Use ONNX backend instead.'
    };
  }
}
