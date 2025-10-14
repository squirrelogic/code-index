import { pipeline, env } from '@xenova/transformers';
import type { EmbeddingProfile } from '../../models/EmbeddingProfile.js';
import type { EmbeddingModel } from '../../models/EmbeddingModel.js';
import ora from 'ora';

/**
 * ModelLoader service - Singleton lazy loading for embedding models
 *
 * This service implements the singleton pattern to ensure models are:
 * - Loaded only once per process (lazy initialization)
 * - Downloaded from Hugging Face Hub with local caching
 * - Displayed with progress feedback during loading
 * - Reused across multiple embedding operations
 *
 * Features:
 * - Lazy loading (models loaded on first use)
 * - Local caching in .codeindex/models/
 * - Progress callbacks via ora spinner
 * - Model version tracking
 * - Reset capability for profile changes
 */
export class ModelLoader {
  private static instance: ModelLoader;
  private loadedModel: EmbeddingModel | null = null;
  private currentProfile: EmbeddingProfile | null = null;
  private loadPromise: Promise<EmbeddingModel> | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the ModelLoader singleton instance
   */
  static getInstance(): ModelLoader {
    if (!ModelLoader.instance) {
      ModelLoader.instance = new ModelLoader();
    }
    return ModelLoader.instance;
  }

  /**
   * Load an embedding model based on the profile configuration
   *
   * Uses singleton lazy loading:
   * - If model already loaded and matches profile: return cached model
   * - If model loading in progress: wait for existing load
   * - Otherwise: start new load operation
   *
   * @param profile Embedding profile configuration
   * @param showProgress Show loading progress (default: true)
   * @returns Loaded embedding model
   */
  async load(profile: EmbeddingProfile, showProgress: boolean = true): Promise<EmbeddingModel> {
    // Check if we already have this model loaded
    if (this.loadedModel && this.isSameModel(profile, this.currentProfile!)) {
      return this.loadedModel;
    }

    // If a load is in progress, wait for it
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // Start new load operation
    this.loadPromise = this.loadModel(profile, showProgress);

    try {
      const model = await this.loadPromise;
      this.loadedModel = model;
      this.currentProfile = profile;
      return model;
    } finally {
      this.loadPromise = null;
    }
  }

  /**
   * Internal method to load the embedding model with retry logic
   *
   * @param profile Embedding profile
   * @param showProgress Show progress spinner
   * @returns Loaded embedding model
   */
  private async loadModel(
    profile: EmbeddingProfile,
    showProgress: boolean
  ): Promise<EmbeddingModel> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second base delay

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.attemptModelLoad(profile, showProgress, attempt, maxRetries);
      } catch (error) {
        lastError = error as Error;

        // Check if this is a retryable error
        const isRetryable = this.isRetryableError(error as Error);

        if (!isRetryable || attempt >= maxRetries) {
          throw error;
        }

        // Calculate exponential backoff delay
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.warn(
          `Model load failed (attempt ${attempt}/${maxRetries}): ${lastError.message}`
        );
        console.warn(`Retrying in ${delay / 1000}s...`);

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Should not reach here, but TypeScript needs this
    throw lastError || new Error('Model loading failed after retries');
  }

  /**
   * Attempt to load model (single try)
   */
  private async attemptModelLoad(
    profile: EmbeddingProfile,
    showProgress: boolean,
    attempt: number,
    maxAttempts: number
  ): Promise<EmbeddingModel> {
    // Configure Transformers.js environment
    this.configureEnvironment(profile);

    const retryText = attempt > 1 ? ` (attempt ${attempt}/${maxAttempts})` : '';
    const spinner = showProgress
      ? ora({
          text: `Loading model ${profile.model}...${retryText}`,
          color: 'cyan'
        }).start()
      : null;

    try {
      const startTime = Date.now();

      // Create progress callback
      const progressCallback = showProgress && spinner
        ? (progress: any) => {
            if (progress.status === 'progress' && progress.progress !== undefined) {
              const percent = Math.round(progress.progress * 100);
              spinner.text = `Loading model ${profile.model}... ${percent}%${retryText}`;
            } else if (progress.status === 'ready') {
              spinner.text = `Model ${profile.model} loaded`;
            }
          }
        : undefined;

      // Load the embedding pipeline
      const pipelineInstance = await pipeline('feature-extraction', profile.model, {
        progress_callback: progressCallback,
        quantized: this.shouldQuantize(profile.quantization),
        revision: profile.modelVersion,
        // Device will be configured by the backend
      });

      const loadTime = Date.now() - startTime;
      spinner?.succeed(`Model ${profile.model} loaded successfully (${(loadTime / 1000).toFixed(1)}s)`);

      // Create embedding model instance
      const embeddingModel: EmbeddingModel = {
        modelId: profile.model,
        modelVersion: profile.modelVersion,
        backend: profile.backend,
        device: profile.device,
        quantization: profile.quantization,
        dimensions: profile.dimensions,
        loadedAt: new Date(),
        modelPath: this.getModelPath(profile.model),
        pipeline: pipelineInstance
      };

      return embeddingModel;
    } catch (error) {
      spinner?.fail(`Failed to load model ${profile.model}${retryText}`);
      throw error;
    }
  }

  /**
   * Check if an error is retryable (network errors)
   *
   * @param error Error to check
   * @returns True if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const errorName = (error as any).code || '';

    // Network errors that are retryable
    const retryableCodes = [
      'ENOTFOUND',    // DNS lookup failed
      'ECONNRESET',   // Connection reset
      'ETIMEDOUT',    // Connection timeout
      'ECONNREFUSED', // Connection refused
      'EHOSTUNREACH', // Host unreachable
      'ENETUNREACH',  // Network unreachable
      'EAI_AGAIN'     // DNS temporary failure
    ];

    // Check error code
    if (retryableCodes.includes(errorName)) {
      return true;
    }

    // Check error message for network-related keywords
    const networkKeywords = [
      'network',
      'timeout',
      'connection',
      'fetch',
      'download',
      'enotfound',
      'econnreset'
    ];

    return networkKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Configure Transformers.js environment based on profile
   *
   * Sets:
   * - Cache directory (.codeindex/models/)
   * - Local model preferences
   * - Offline behavior
   *
   * @param profile Embedding profile
   */
  private configureEnvironment(profile: EmbeddingProfile): void {
    // Set cache directory for models
    env.cacheDir = './.codeindex/models';

    // Allow local models for offline operation
    env.allowLocalModels = true;

    // Allow remote model downloads (needed for first-time setup)
    env.allowRemoteModels = true;

    // Set custom ONNX options if needed
    if (profile.backend === 'onnx') {
      // Future: Configure ONNX Runtime execution providers
    }
  }

  /**
   * Determine if quantization should be enabled based on quantization level
   *
   * @param quantization Quantization level from profile
   * @returns True if model should use quantized version
   */
  private shouldQuantize(quantization: string): boolean {
    // Use quantized models for int8 and int4
    return quantization === 'int8' || quantization === 'int4';
  }

  /**
   * Get the local path where the model is cached
   *
   * @param modelId Hugging Face model ID
   * @returns Local cache path
   */
  private getModelPath(modelId: string): string {
    // Transformers.js cache structure: models--{org}--{name}
    const safeName = modelId.replace('/', '--');
    return `.codeindex/models/models--${safeName}`;
  }

  /**
   * Check if two profiles reference the same model
   *
   * Two profiles are considered the same model if:
   * - modelId matches
   * - modelVersion matches
   * - device matches (affects model loading)
   * - quantization matches (affects model variant)
   *
   * @param profile1 First profile
   * @param profile2 Second profile
   * @returns True if profiles use the same model
   */
  private isSameModel(profile1: EmbeddingProfile, profile2: EmbeddingProfile): boolean {
    return (
      profile1.model === profile2.model &&
      profile1.modelVersion === profile2.modelVersion &&
      profile1.device === profile2.device &&
      profile1.quantization === profile2.quantization
    );
  }

  /**
   * Reset the model loader, clearing cached model
   *
   * Use this when:
   * - Profile changes require model reload
   * - Freeing memory is needed
   * - Recovering from errors
   */
  reset(): void {
    this.loadedModel = null;
    this.currentProfile = null;
    this.loadPromise = null;
  }

  /**
   * Get the currently loaded model (if any)
   *
   * @returns Loaded model or null
   */
  getLoadedModel(): EmbeddingModel | null {
    return this.loadedModel;
  }

  /**
   * Check if a model is currently loaded
   *
   * @returns True if a model is loaded
   */
  isLoaded(): boolean {
    return this.loadedModel !== null;
  }

  /**
   * Check if a specific profile's model is currently loaded
   *
   * @param profile Profile to check
   * @returns True if this profile's model is loaded
   */
  isProfileLoaded(profile: EmbeddingProfile): boolean {
    return this.loadedModel !== null && this.isSameModel(profile, this.currentProfile!);
  }

  /**
   * Generate embeddings using the loaded model
   *
   * @param texts Array of texts to embed
   * @param options Embedding options
   * @returns Array of embeddings (one per text)
   */
  async embed(
    texts: string[],
    options: {
      pooling?: 'mean' | 'cls';
      normalize?: boolean;
    } = {}
  ): Promise<number[][]> {
    if (!this.loadedModel) {
      throw new Error('No model loaded. Call load() first.');
    }

    const { pooling = 'mean', normalize = true } = options;

    // Use the pipeline to generate embeddings
    const result = await (this.loadedModel.pipeline as any)(texts, {
      pooling,
      normalize
    });

    // Extract embeddings from result
    // Transformers.js returns a tensor-like object, we need to convert to arrays
    const embeddings: number[][] = [];

    if (Array.isArray(result)) {
      // Multiple texts
      for (const item of result) {
        embeddings.push(Array.from(item.data));
      }
    } else {
      // Single text
      embeddings.push(Array.from(result.data));
    }

    return embeddings;
  }

  /**
   * Preload a model in the background
   *
   * Useful for prewarming the cache during initialization
   *
   * @param profile Profile to preload
   * @returns Promise that resolves when model is loaded
   */
  async preload(profile: EmbeddingProfile): Promise<void> {
    await this.load(profile, false);
  }

  /**
   * Check if a model is cached locally
   *
   * @param modelId Hugging Face model ID
   * @returns True if model exists in local cache
   */
  async isModelCached(modelId: string): Promise<boolean> {
    const path = this.getModelPath(modelId);

    try {
      const fs = await import('fs/promises');
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the size of a cached model
   *
   * @param modelId Hugging Face model ID
   * @returns Size in bytes, or null if not cached
   */
  async getModelSize(modelId: string): Promise<number | null> {
    const path = this.getModelPath(modelId);

    try {
      const fs = await import('fs/promises');
      const stats = await fs.stat(path);
      return stats.size;
    } catch {
      return null;
    }
  }
}
