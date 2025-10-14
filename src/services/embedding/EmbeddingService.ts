import { HardwareDetector } from '../hardware/HardwareDetector.js';
import { ProfileManager } from './ProfileManager.js';
import { ModelLoader } from './ModelLoader.js';
import { EmbeddingCache } from '../cache/EmbeddingCache.js';
import { FallbackChain } from './FallbackChain.js';
import type { HardwareCapabilities } from '../../models/HardwareCapabilities.js';
import type { EmbeddingProfile } from '../../models/EmbeddingProfile.js';
import type { EmbeddingConfig } from '../../models/EmbeddingConfig.js';
import type { FallbackEvent } from '../../models/FallbackEvent.js';
import crypto from 'crypto';
import CircuitBreaker from 'opossum';
import { Logger } from '../../cli/utils/logger.js';
import v8 from 'v8';

// Create logger instance
const logger = new Logger(process.cwd());

export interface EmbedOptions {
  batchSize?: number;
  showProgress?: boolean;
  useCache?: boolean;
  profile?: EmbeddingProfile;
}

export interface EmbedResult {
  filePath: string;
  contentHash: string;
  embedding: number[];
  fromCache: boolean;
  dimensions: number;
}

export interface BatchEmbedResult {
  results: EmbedResult[];
  summary: {
    total: number;
    cached: number;
    generated: number;
    failed: number;
    duration: number;
    throughput: number;
  };
}

/**
 * EmbeddingService - Main orchestration service for embedding generation
 *
 * This service coordinates all embedding operations:
 * - Hardware detection and capability evaluation
 * - Profile selection and management
 * - Model loading and caching
 * - Batch processing with memory management
 * - Cache operations (read/write/invalidate)
 * - Progress tracking and reporting
 *
 * The service implements streaming architecture for processing large file sets
 * while maintaining bounded memory usage.
 */
export class EmbeddingService {
  private hardwareDetector: HardwareDetector;
  private profileManager: ProfileManager;
  private modelLoader: ModelLoader;
  private embeddingCache: EmbeddingCache;
  private fallbackChain: FallbackChain | null = null;
  private circuitBreaker: CircuitBreaker | null = null;

  private currentProfile: EmbeddingProfile | null = null;
  private hardwareCapabilities: HardwareCapabilities | null = null;
  private memoryPressureThreshold: number = 0.8; // 80% of heap limit

  constructor(cacheDbPath: string = '.codeindex/cache/embeddings.db') {
    this.hardwareDetector = new HardwareDetector();
    this.profileManager = new ProfileManager();
    this.modelLoader = ModelLoader.getInstance();
    this.embeddingCache = new EmbeddingCache(cacheDbPath);
  }

  /**
   * Initialize the embedding service
   *
   * Performs:
   * - Hardware detection
   * - Profile selection (or loading from config)
   * - Cache initialization
   *
   * @param config Optional existing configuration to use
   */
  async initialize(config?: EmbeddingConfig): Promise<void> {
    // Detect hardware capabilities
    this.hardwareCapabilities = await this.hardwareDetector.detect();

    // Select or load profile
    if (config?.profile) {
      // Use existing profile from config
      this.currentProfile = this.profileManager.getProfile(
        config.profile.name,
        this.hardwareCapabilities
      );

      if (!this.currentProfile) {
        throw new Error(`Profile not found: ${config.profile.name}`);
      }
    } else {
      // Auto-select profile based on hardware
      this.currentProfile = this.profileManager.selectProfile(this.hardwareCapabilities);
    }

    // Initialize cache
    await this.embeddingCache.initialize();

    // Initialize fallback chain
    this.fallbackChain = new FallbackChain(this.currentProfile);
    await this.fallbackChain.initialize();

    // Initialize circuit breaker
    this.initializeCircuitBreaker();
  }

  /**
   * Initialize circuit breaker for embedding operations
   */
  private initializeCircuitBreaker(): void {
    const breakerOptions = {
      timeout: 30000, // 30s timeout for embedding operations
      errorThresholdPercentage: 50, // Open after 50% failure rate
      resetTimeout: 60000, // Try again after 1 minute
      rollingCountTimeout: 10000, // 10s rolling window
      rollingCountBuckets: 10,
      name: 'embedding-service'
    };

    this.circuitBreaker = new CircuitBreaker(
      async (texts: string[], profile: EmbeddingProfile) => {
        return this.generateEmbeddingsWithFallback(texts, profile);
      },
      breakerOptions
    );

    // Fallback to cache when circuit is open
    this.circuitBreaker.fallback(async (texts: string[], profile: EmbeddingProfile) => {
      logger.warn('Circuit breaker open - attempting cache-only mode');

      const results: number[][] = [];
      for (const text of texts) {
        const contentHash = this.hashContent(text);
        const cached = this.embeddingCache.get(
          contentHash,
          profile.model,
          profile.modelVersion,
          profile.dimensions
        );

        if (cached) {
          results.push(Array.from(cached));
        } else {
          throw new Error('No cached embedding available and circuit breaker is open');
        }
      }

      return results;
    });

    this.circuitBreaker.on('open', () => {
      logger.error('Circuit breaker opened - embedding service experiencing failures');
    });

    this.circuitBreaker.on('halfOpen', () => {
      logger.info('Circuit breaker half-open - testing service recovery');
    });

    this.circuitBreaker.on('close', () => {
      logger.info('Circuit breaker closed - service recovered');
    });
  }

  /**
   * Generate embeddings for multiple texts
   *
   * Features:
   * - Batch processing with configurable batch size
   * - Cache lookup before generation
   * - Streaming architecture for memory efficiency
   * - Progress callbacks
   * - Error handling with partial results
   *
   * @param texts Array of texts to embed
   * @param options Embedding options
   * @returns Batch embedding results
   */
  async embedTexts(
    texts: string[],
    options: EmbedOptions = {}
  ): Promise<BatchEmbedResult> {
    if (!this.currentProfile) {
      throw new Error('Service not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    const profile = options.profile || this.currentProfile;
    const batchSize = options.batchSize || profile.batchSize;
    const useCache = options.useCache !== false; // Default true

    const results: EmbedResult[] = [];
    let cachedCount = 0;
    let generatedCount = 0;
    let failedCount = 0;

    // Process texts in batches
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, Math.min(i + batchSize, texts.length));

      try {
        // Check cache for each text in batch
        const batchResults = await this.processBatch(batch, profile, useCache);

        for (const result of batchResults) {
          results.push(result);
          if (result.fromCache) {
            cachedCount++;
          } else {
            generatedCount++;
          }
        }
      } catch (error) {
        // Mark batch as failed
        failedCount += batch.length;
        console.error(`Failed to process batch ${i}-${i + batch.length}:`, error);
      }
    }

    const duration = (Date.now() - startTime) / 1000;
    const throughput = results.length / duration;

    return {
      results,
      summary: {
        total: texts.length,
        cached: cachedCount,
        generated: generatedCount,
        failed: failedCount,
        duration,
        throughput
      }
    };
  }

  /**
   * Generate embeddings for files (T080: with streaming architecture)
   *
   * Uses bounded memory pool and streaming writes to handle large file sets (1000+ files)
   * without exhausting memory.
   *
   * @param filePaths Array of file paths to embed
   * @param options Embedding options
   * @returns Batch embedding results with file paths
   */
  async embedFiles(
    filePaths: string[],
    options: EmbedOptions = {}
  ): Promise<BatchEmbedResult> {
    const fs = await import('fs/promises');
    const pLimit = (await import('p-limit')).default;

    if (!this.currentProfile) {
      throw new Error('Service not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    const profile = options.profile || this.currentProfile;
    const batchSize = options.batchSize || profile.batchSize;
    // Note: useCache is handled inline in the embedTexts() call, no need to store it

    // T080: Use p-limit for concurrency control (max 4 concurrent file reads)
    const limit = pLimit(4);

    const results: EmbedResult[] = [];
    let cachedCount = 0;
    let generatedCount = 0;
    let failedCount = 0;
    let processedCount = 0;

    // T080: Process files in streaming batches to maintain bounded memory
    const maxMemoryBatchSize = 100; // Process 100 files at a time

    for (let i = 0; i < filePaths.length; i += maxMemoryBatchSize) {
      const batchPaths = filePaths.slice(i, Math.min(i + maxMemoryBatchSize, filePaths.length));

      // Read files concurrently with limit
      const fileReadPromises = batchPaths.map((filePath, index) =>
        limit(async () => {
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            return { filePath, content, index: i + index };
          } catch (error) {
            logger.error(`Failed to read file ${filePath}:`, error);
            failedCount++;
            return { filePath, content: '', index: i + index };
          }
        })
      );

      const fileData = await Promise.all(fileReadPromises);

      // Extract contents for embedding
      const contents = fileData.map(f => f.content);

      // Generate embeddings for this batch
      try {
        const batchResults = await this.embedTexts(contents, {
          ...options,
          batchSize
        });

        // Merge results with file paths
        for (let j = 0; j < batchResults.results.length; j++) {
          const result = batchResults.results[j];
          const fileInfo = fileData[j];

          if (result && fileInfo) {
            result.filePath = fileInfo.filePath;
            results.push(result);

            if (result.fromCache) {
              cachedCount++;
            } else {
              generatedCount++;
            }
          }
        }

        processedCount += batchResults.results.length;

        // T080: Trigger GC hint every 100 files to prevent memory buildup
        if (processedCount % 100 === 0 && global.gc) {
          global.gc();

          const memoryUsage = this.getMemoryPressure();
          logger.debug(`Processed ${processedCount}/${filePaths.length} files. Memory: ${(memoryUsage * 100).toFixed(1)}%`);
        }

      } catch (error) {
        logger.error(`Failed to process file batch ${i}-${i + batchPaths.length}:`, error);
        failedCount += batchPaths.length;
      }

      // Check memory pressure and adjust if needed
      const memoryPressure = this.getMemoryPressure();
      if (memoryPressure > this.memoryPressureThreshold) {
        logger.warn(`High memory pressure detected: ${(memoryPressure * 100).toFixed(1)}%. Pausing to allow GC...`);
        // Allow GC to run
        await new Promise(resolve => setTimeout(resolve, 100));
        if (global.gc) {
          global.gc();
        }
      }
    }

    const duration = (Date.now() - startTime) / 1000;
    const throughput = results.length / duration;

    return {
      results,
      summary: {
        total: filePaths.length,
        cached: cachedCount,
        generated: generatedCount,
        failed: failedCount,
        duration,
        throughput
      }
    };
  }

  /**
   * Generate embeddings with fallback support
   *
   * @param texts Texts to embed
   * @param profile Current profile
   * @returns Generated embeddings
   */
  private async generateEmbeddingsWithFallback(
    texts: string[],
    profile: EmbeddingProfile
  ): Promise<number[][]> {
    let currentProfile = { ...profile };
    let attemptCount = 0;
    const maxAttempts = 3;

    while (attemptCount < maxAttempts) {
      try {
        // Check memory pressure before attempting
        const memoryPressure = this.getMemoryPressure();
        if (memoryPressure > this.memoryPressureThreshold) {
          logger.warn(`High memory pressure (${(memoryPressure * 100).toFixed(1)}%) - reducing batch size`);
          currentProfile.batchSize = Math.max(
            Math.floor(currentProfile.batchSize / 2),
            1
          );
        }

        // Ensure model is loaded
        await this.modelLoader.load(currentProfile, false);

        // Generate embeddings
        const embeddings = await this.modelLoader.embed(texts, {
          pooling: 'mean',
          normalize: true
        });

        // Reset fallback chain on success
        if (this.fallbackChain) {
          this.fallbackChain.reset();
        }

        return embeddings;

      } catch (error) {
        attemptCount++;
        logger.error(`Embedding generation failed (attempt ${attemptCount}/${maxAttempts}):`, error);

        // Apply fallback
        if (this.fallbackChain && attemptCount < maxAttempts) {
          const fallbackResult = await this.fallbackChain.applyFallback(
            error as Error,
            currentProfile
          );

          currentProfile = fallbackResult.profile;

          // Update current profile if fallback succeeded
          if (fallbackResult.event && fallbackResult.event.success) {
            this.currentProfile = currentProfile;

            // Reset model loader if device or model changed
            if (
              fallbackResult.event.action === 'switch_device' ||
              fallbackResult.event.action === 'switch_model'
            ) {
              this.modelLoader.reset();
            }

            logger.info('Fallback applied successfully - retrying with new configuration');
            continue;
          }
        }

        // No more fallbacks or all attempts exhausted
        throw error;
      }
    }

    throw new Error(`Failed to generate embeddings after ${maxAttempts} attempts`);
  }

  /**
   * Get current memory pressure (0-1 scale)
   *
   * @returns Memory pressure ratio
   */
  private getMemoryPressure(): number {
    const heapStats = v8.getHeapStatistics();
    return heapStats.used_heap_size / heapStats.heap_size_limit;
  }

  /**
   * Process a single batch of texts (T079: with length sorting optimization)
   *
   * @param texts Batch of texts
   * @param profile Profile to use
   * @param useCache Whether to use cache
   * @returns Array of embedding results
   */
  private async processBatch(
    texts: string[],
    profile: EmbeddingProfile,
    useCache: boolean
  ): Promise<EmbedResult[]> {
    const results: EmbedResult[] = [];
    const textsToEmbed: string[] = [];
    const textsToEmbedIndices: number[] = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (!text) continue;

      const contentHash = this.hashContent(text);

      if (useCache) {
        const cached = this.embeddingCache.get(
          contentHash,
          profile.model,
          profile.modelVersion,
          profile.dimensions
        );

        if (cached) {
          // Cache hit - convert Float32Array to regular array
          const embeddingArray = Array.from(cached);

          results[i] = {
            filePath: '',
            contentHash,
            embedding: embeddingArray,
            fromCache: true,
            dimensions: profile.dimensions
          };
          continue;
        }
      }

      // Cache miss - need to generate
      textsToEmbed.push(text);
      textsToEmbedIndices.push(i);
    }

    // Generate embeddings for cache misses
    if (textsToEmbed.length > 0) {
      // T079: Sort by length to minimize padding overhead
      const sortedData = this.sortTextsByLength(textsToEmbed, textsToEmbedIndices);

      // Use circuit breaker for generation
      let embeddings: number[][];

      if (this.circuitBreaker) {
        embeddings = await this.circuitBreaker.fire(sortedData.texts, profile) as number[][];
      } else {
        // Fallback to direct generation if circuit breaker not initialized
        embeddings = await this.generateEmbeddingsWithFallback(sortedData.texts, profile);
      }

      // T079: Restore original order and store results
      for (let i = 0; i < sortedData.texts.length; i++) {
        const text = sortedData.texts[i];
        const embedding = embeddings[i];
        const originalIndex = sortedData.originalIndices[i];

        if (!text || !embedding || originalIndex === undefined) continue;

        const contentHash = this.hashContent(text);

        // Save to cache
        if (useCache) {
          // Convert array to Float32Array
          const embeddingFloat32 = new Float32Array(embedding);

          this.embeddingCache.set(
            contentHash,
            profile.model,
            profile.modelVersion,
            profile.dimensions,
            embeddingFloat32
          );
        }

        results[originalIndex] = {
          filePath: '',
          contentHash,
          embedding,
          fromCache: false,
          dimensions: profile.dimensions
        };
      }
    }

    return results;
  }

  /**
   * Sort texts by length to minimize padding (T079)
   *
   * Sorting texts by length improves batch processing efficiency by 10-20%
   * because similar-length texts require less padding.
   *
   * @param texts Array of texts
   * @param indices Corresponding indices
   * @returns Sorted texts and indices
   */
  private sortTextsByLength(
    texts: string[],
    indices: number[]
  ): { texts: string[]; originalIndices: number[] } {
    // Create indexed pairs
    const indexed = texts.map((text, i) => ({
      text,
      originalIndex: indices[i],
      length: text.length
    }));

    // Sort by length (ascending - shortest first)
    indexed.sort((a, b) => a.length - b.length);

    // Extract sorted arrays
    return {
      texts: indexed.map(item => item.text),
      originalIndices: indexed.map(item => item.originalIndex!).filter((idx): idx is number => idx !== undefined)
    };
  }

  /**
   * Calculate SHA-256 hash of content for cache lookup
   *
   * @param content Text content
   * @returns SHA-256 hash (hex string)
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get current hardware capabilities
   *
   * @returns Hardware capabilities or null if not detected
   */
  getHardwareCapabilities(): HardwareCapabilities | null {
    return this.hardwareCapabilities;
  }

  /**
   * Get current profile
   *
   * @returns Current embedding profile or null if not initialized
   */
  getCurrentProfile(): EmbeddingProfile | null {
    return this.currentProfile;
  }

  /**
   * Switch to a different profile
   *
   * @param profileName Profile name
   */
  async switchProfile(profileName: string): Promise<void> {
    if (!this.hardwareCapabilities) {
      throw new Error('Hardware capabilities not detected. Call initialize() first.');
    }

    const newProfile = this.profileManager.getProfile(profileName, this.hardwareCapabilities);
    if (!newProfile) {
      throw new Error(`Profile not found: ${profileName}`);
    }

    // Check for dimension change
    if (this.currentProfile &&
        this.profileManager.hasDimensionChange(this.currentProfile, newProfile)) {
      console.warn('Dimension change detected - cache will need to be invalidated');
    }

    this.currentProfile = newProfile;

    // Reset model loader to force reload with new profile
    this.modelLoader.reset();
  }

  /**
   * Clear all cached embeddings
   */
  async clearCache(): Promise<void> {
    await this.embeddingCache.clear();
  }

  /**
   * Invalidate cache entries for a specific model dimension
   *
   * @param dimensions Dimension to invalidate
   */
  async invalidateCacheByDimension(dimensions: number): Promise<void> {
    await this.embeddingCache.invalidateByDimensions(dimensions);
  }

  /**
   * Get cache statistics
   *
   * @returns Cache stats
   */
  async getCacheStats(): Promise<{
    totalEntries: number;
    totalSize: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  }> {
    return this.embeddingCache.getStats();
  }

  /**
   * Get fallback history
   *
   * @returns Array of fallback events
   */
  getFallbackHistory(): FallbackEvent[] {
    return this.fallbackChain?.getFallbackHistory() || [];
  }

  /**
   * Check if any fallbacks have been applied
   *
   * @returns True if fallbacks have been applied
   */
  hasFallbacks(): boolean {
    return this.fallbackChain?.hasFallbacks() || false;
  }

  /**
   * Close the embedding service and cleanup resources
   */
  async close(): Promise<void> {
    await this.embeddingCache.close();
  }
}
