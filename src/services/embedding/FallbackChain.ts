import type { EmbeddingProfile } from '../../models/EmbeddingProfile.js';
import type { FallbackEvent, FallbackAction } from '../../models/FallbackEvent.js';
import { Logger } from '../../cli/utils/logger.js';
import { FallbackLogger } from './FallbackLogger.js';

// Create logger instance
const logger = new Logger(process.cwd());

/**
 * Manages graceful fallback chain for embedding generation failures.
 *
 * Fallback order:
 * 1. Reduce batch size (÷2, minimum 1)
 * 2. Switch device (GPU → CPU/MPS)
 * 3. Switch to lighter model
 * 4. Switch to more aggressive quantization
 */
export class FallbackChain {
  private fallbackHistory: FallbackEvent[] = [];
  private currentProfile: EmbeddingProfile;
  private fallbackAttempts: number = 0;
  private readonly maxFallbackAttempts: number = 10;
  private fallbackLogger: FallbackLogger;

  // Minimum values before giving up
  private readonly MIN_BATCH_SIZE = 1;
  private readonly FALLBACK_MODELS = [
    'Xenova/all-mpnet-base-v2',  // Balanced
    'Xenova/all-MiniLM-L6-v2',   // Light
    'Xenova/paraphrase-MiniLM-L3-v2' // Tiny fallback
  ];

  constructor(profile: EmbeddingProfile, logFilePath?: string) {
    this.currentProfile = { ...profile };
    this.fallbackLogger = new FallbackLogger(logFilePath);
  }

  /**
   * Initialize the fallback chain (creates log directory)
   */
  async initialize(): Promise<void> {
    await this.fallbackLogger.initialize();
  }

  /**
   * Apply next fallback in chain based on error type
   */
  async applyFallback(
    error: Error,
    profile: EmbeddingProfile
  ): Promise<{ profile: EmbeddingProfile; event: FallbackEvent | null }> {
    this.fallbackAttempts++;

    if (this.fallbackAttempts > this.maxFallbackAttempts) {
      logger.error('Maximum fallback attempts reached');
      throw new Error('All fallback options exhausted', { cause: error });
    }

    // Determine fallback action based on error
    const action = this.determineAction(error, profile);
    if (!action) {
      throw new Error('No suitable fallback available', { cause: error });
    }

    logger.warn(`Applying fallback: ${action} (attempt ${this.fallbackAttempts})`);

    // Apply the fallback
    const result = await this.executeFallback(action, profile, error);

    if (result.event) {
      this.fallbackHistory.push(result.event);
    }

    return result;
  }

  /**
   * Determine which fallback action to take based on error
   */
  private determineAction(error: Error, profile: EmbeddingProfile): FallbackAction | null {
    const errorMessage = error.message.toLowerCase();

    // OOM errors → reduce batch size first
    if (errorMessage.includes('out of memory') || errorMessage.includes('oom')) {
      if (profile.batchSize > this.MIN_BATCH_SIZE) {
        return 'reduce_batch';
      }
      // If batch size already at minimum, try device switch
      if (profile.device !== 'cpu') {
        return 'switch_device';
      }
    }

    // GPU/CUDA errors → switch device
    if (
      errorMessage.includes('cuda') ||
      errorMessage.includes('gpu') ||
      errorMessage.includes('metal') ||
      errorMessage.includes('mps')
    ) {
      if (profile.device !== 'cpu') {
        return 'switch_device';
      }
    }

    // Model loading errors → try lighter model
    if (
      errorMessage.includes('model') &&
      (errorMessage.includes('load') || errorMessage.includes('download'))
    ) {
      const currentModelIndex = this.FALLBACK_MODELS.indexOf(profile.model);
      if (currentModelIndex < this.FALLBACK_MODELS.length - 1) {
        return 'switch_model';
      }
    }

    // Generic errors → try reducing batch size or switching quantization
    if (profile.batchSize > this.MIN_BATCH_SIZE) {
      return 'reduce_batch';
    }

    if (profile.quantization !== 'int8') {
      return 'switch_quantization';
    }

    return null;
  }

  /**
   * Execute a specific fallback action
   */
  private async executeFallback(
    action: FallbackAction,
    profile: EmbeddingProfile,
    error: Error
  ): Promise<{ profile: EmbeddingProfile; event: FallbackEvent }> {
    const from = { ...profile };
    const to = { ...profile };
    let success = false;
    let reason = error.message;

    try {
      switch (action) {
        case 'reduce_batch':
          to.batchSize = Math.max(
            Math.floor(profile.batchSize / 2),
            this.MIN_BATCH_SIZE
          );
          logger.info(`Reducing batch size: ${from.batchSize} → ${to.batchSize}`);
          success = true;
          break;

        case 'switch_device':
          // CUDA/MPS → CPU
          if (profile.device === 'cuda' || profile.device === 'mps') {
            to.device = 'cpu';
            // When switching to CPU, use int8 quantization for better performance
            to.quantization = 'int8';
            logger.info(`Switching device: ${from.device} → ${to.device} (with int8 quantization)`);
            success = true;
          }
          break;

        case 'switch_model':
          const currentIndex = this.FALLBACK_MODELS.indexOf(profile.model);
          if (currentIndex < this.FALLBACK_MODELS.length - 1) {
            const nextModel = this.FALLBACK_MODELS[currentIndex + 1];
            if (nextModel) {
              to.model = nextModel;
              // Update dimensions based on model
              const newDimensions = this.getModelDimensions(to.model);
              if (newDimensions !== undefined) {
                to.dimensions = newDimensions;
              }
              logger.warn(`Switching to lighter model: ${from.model} → ${to.model}`);
              logger.warn('⚠️  Dimension change detected - cache will be invalidated');
              success = true;
            }
          }
          break;

        case 'switch_quantization':
          // Switch to more aggressive quantization
          if (profile.quantization === 'fp32') {
            to.quantization = 'fp16';
          } else if (profile.quantization === 'fp16') {
            to.quantization = 'int8';
          } else if (profile.quantization === 'int4') {
            to.quantization = 'int8'; // int8 is more stable than int4
          }
          logger.info(`Switching quantization: ${from.quantization} → ${to.quantization}`);
          success = true;
          break;
      }

      this.currentProfile = to;

      const event: FallbackEvent = {
        timestamp: new Date(),
        level: 'warn',
        action,
        from: this.profileDiff(from),
        to: this.profileDiff(to),
        reason,
        success
      };

      // Log to file
      await this.fallbackLogger.logFallback(event);

      return { profile: to, event };

    } catch (fallbackError) {
      const errorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      logger.error(`Fallback action ${action} failed:`, fallbackError);

      const event: FallbackEvent = {
        timestamp: new Date(),
        level: 'error',
        action,
        from: this.profileDiff(from),
        to: this.profileDiff(to),
        reason: `${reason} | Fallback failed: ${errorMessage}`,
        success: false
      };

      // Log to file
      await this.fallbackLogger.logFallback(event);

      return { profile: from, event };
    }
  }

  /**
   * Get model dimensions based on model ID
   */
  private getModelDimensions(modelId: string): number {
    if (modelId.includes('MiniLM-L3')) return 384;
    if (modelId.includes('MiniLM-L6')) return 384;
    if (modelId.includes('mpnet')) return 768;
    if (modelId.includes('instructor')) return 768;
    return 768; // Default
  }

  /**
   * Extract only changed fields for logging
   */
  private profileDiff(profile: EmbeddingProfile): Partial<EmbeddingProfile> {
    return {
      model: profile.model,
      device: profile.device,
      quantization: profile.quantization,
      batchSize: profile.batchSize,
      dimensions: profile.dimensions
    };
  }

  /**
   * Get fallback history for diagnostics
   */
  getFallbackHistory(): FallbackEvent[] {
    return [...this.fallbackHistory];
  }

  /**
   * Get last N fallback events
   */
  getRecentFallbacks(limit: number = 10): FallbackEvent[] {
    return this.fallbackHistory.slice(-limit);
  }

  /**
   * Check if any fallbacks have been applied
   */
  hasFallbacks(): boolean {
    return this.fallbackHistory.length > 0;
  }

  /**
   * Reset fallback state
   */
  reset(): void {
    this.fallbackAttempts = 0;
    // Keep history for diagnostics
  }

  /**
   * Get current profile after fallbacks
   */
  getCurrentProfile(): EmbeddingProfile {
    return { ...this.currentProfile };
  }

  /**
   * Get fallback logger instance
   */
  getFallbackLogger(): FallbackLogger {
    return this.fallbackLogger;
  }
}
