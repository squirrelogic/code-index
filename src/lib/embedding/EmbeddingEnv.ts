/**
 * Transformers.js Environment Configuration
 *
 * Configures caching, offline behavior, and model paths for @xenova/transformers.
 */

import { env } from '@xenova/transformers';
import { promises as fs } from 'fs';

export class EmbeddingEnv {
  private static initialized = false;

  /**
   * Initializes Transformers.js environment
   * @param cacheDir - Directory for model cache (default: .codeindex/models)
   * @param allowRemote - Whether to allow remote model downloads (default: true)
   */
  static async initialize(cacheDir: string = '.codeindex/models', allowRemote: boolean = true): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure cache directory exists
      await fs.mkdir(cacheDir, { recursive: true });

      // Configure cache directory
      env.cacheDir = cacheDir;

      // Configure model paths
      env.localModelPath = cacheDir;

      // Allow local models
      env.allowLocalModels = true;

      // Configure remote model access
      env.allowRemoteModels = allowRemote;

      // Disable WASM threads in environments that don't support it
      // (can be overridden if needed)
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        // Running in Node.js - WASM threads should work
        env.backends.onnx.wasm.numThreads = -1; // Use all available threads
      }

      this.initialized = true;
    } catch (error: any) {
      throw new Error(`Failed to initialize embedding environment: ${error.message}`);
    }
  }

  /**
   * Configures for offline operation
   * Prevents any network requests for model downloads
   */
  static configureOffline(): void {
    env.allowRemoteModels = false;
  }

  /**
   * Configures for online operation
   * Allows downloading models from Hugging Face
   */
  static configureOnline(): void {
    env.allowRemoteModels = true;
  }

  /**
   * Gets current cache directory
   */
  static getCacheDir(): string {
    return env.cacheDir;
  }

  /**
   * Checks if environment is initialized
   */
  static isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Resets initialization state (useful for testing)
   */
  static reset(): void {
    this.initialized = false;
  }
}
