import { EventEmitter } from 'events';
import {
  FileChangeEvent,
  FileChangeType,
  ProcessingStatus
} from '../../models/FileChangeEvent.js';
import { IncrementalIndexer } from '../indexer/IncrementalIndexerAdapter.js';
import { WatcherLogger } from '../../cli/utils/WatcherLogger.js';
import { RetryManager } from '../../lib/RetryManager.js';

/**
 * Configuration for batch processor
 */
export interface BatchProcessorConfig {
  /**
   * Maximum number of files to process in a single batch
   */
  maxBatchSize: number;

  /**
   * Whether to prioritize user files over dependencies
   */
  prioritizeUserFiles: boolean;

  /**
   * Maximum number of retry attempts
   */
  maxRetries: number;

  /**
   * Initial retry delay in milliseconds
   */
  retryDelay: number;
}

/**
 * Default batch processor configuration
 */
export const DEFAULT_BATCH_CONFIG: BatchProcessorConfig = {
  maxBatchSize: 100,
  prioritizeUserFiles: true,
  maxRetries: 3,
  retryDelay: 1000
};

/**
 * Processes batches of file change events
 */
export class BatchProcessor extends EventEmitter {
  private indexer: IncrementalIndexer;
  private config: BatchProcessorConfig;
  private logger: WatcherLogger;
  private retryManager: RetryManager;
  private isProcessing: boolean;
  private processedCount: number;
  private failedCount: number;
  private skippedCount: number;

  constructor(
    indexer: IncrementalIndexer,
    config?: Partial<BatchProcessorConfig>,
    logger?: WatcherLogger
  ) {
    super();
    this.indexer = indexer;
    this.config = { ...DEFAULT_BATCH_CONFIG, ...config };
    this.logger = logger || new WatcherLogger('.');
    this.retryManager = new RetryManager({
      maxAttempts: this.config.maxRetries,
      initialDelay: this.config.retryDelay
    });
    this.isProcessing = false;
    this.processedCount = 0;
    this.failedCount = 0;
    this.skippedCount = 0;
  }

  /**
   * Processes a batch of file change events
   * @param events Events to process
   * @returns Processing results
   */
  async processBatch(events: FileChangeEvent[]): Promise<BatchProcessingResult> {
    if (this.isProcessing) {
      throw new Error('Batch processing already in progress');
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      // Sort and prioritize events
      const sortedEvents = this.prioritizeEvents(events);

      // Split into sub-batches if needed
      const batches = this.splitIntoBatches(sortedEvents);

      // Process each sub-batch
      const results: ProcessingResult[] = [];
      for (const batch of batches) {
        const batchResults = await this.processSingleBatch(batch);
        results.push(...batchResults);
      }

      // Update statistics
      this.updateStatistics(results);

      // Calculate summary
      const duration = Date.now() - startTime;
      const summary: BatchProcessingResult = {
        totalEvents: events.length,
        processed: results.filter(r => r.status === ProcessingStatus.COMPLETED).length,
        failed: results.filter(r => r.status === ProcessingStatus.FAILED).length,
        skipped: results.filter(r => r.status === ProcessingStatus.SKIPPED).length,
        duration,
        results
      };

      // Log summary
      this.logger.logBatchComplete(summary);

      // Emit completion event
      this.emit('batchComplete', summary);

      return summary;

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Processes a single batch of events
   * @param events Events to process
   * @returns Array of processing results
   */
  private async processSingleBatch(events: FileChangeEvent[]): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];

    // Group events by type for efficient processing
    const grouped = this.groupEventsByType(events);

    // Process deletions first
    if (grouped.delete.length > 0) {
      const deleteResults = await this.processDeletes(grouped.delete);
      results.push(...deleteResults);
    }

    // Process renames
    if (grouped.rename.length > 0) {
      const renameResults = await this.processRenames(grouped.rename);
      results.push(...renameResults);
    }

    // Process creates
    if (grouped.create.length > 0) {
      const createResults = await this.processCreates(grouped.create);
      results.push(...createResults);
    }

    // Process modifications
    if (grouped.modify.length > 0) {
      const modifyResults = await this.processModifies(grouped.modify);
      results.push(...modifyResults);
    }

    return results;
  }

  /**
   * Processes deletion events
   * @param events Deletion events
   * @returns Processing results
   */
  private async processDeletes(events: FileChangeEvent[]): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];

    for (const event of events) {
      try {
        await this.retryManager.execute(async () => {
          await this.indexer.removeFile(event.canonicalPath);
        });

        results.push({
          event,
          status: ProcessingStatus.COMPLETED,
          error: undefined
        });

      } catch (error) {
        results.push({
          event,
          status: ProcessingStatus.FAILED,
          error: error as Error
        });
        this.logger.logError(`Failed to process delete for ${event.path}`, error as Error);
      }
    }

    return results;
  }

  /**
   * Processes rename events
   * @param events Rename events
   * @returns Processing results
   */
  private async processRenames(events: FileChangeEvent[]): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];

    for (const event of events) {
      try {
        if (!event.oldCanonicalPath) {
          throw new Error('Rename event missing oldCanonicalPath');
        }

        await this.retryManager.execute(async () => {
          await this.indexer.renameFile(
            event.oldCanonicalPath,
            event.canonicalPath,
            event.path
          );
        });

        results.push({
          event,
          status: ProcessingStatus.COMPLETED,
          error: undefined
        });

      } catch (error) {
        results.push({
          event,
          status: ProcessingStatus.FAILED,
          error: error as Error
        });
        this.logger.logError(`Failed to process rename for ${event.path}`, error as Error);
      }
    }

    return results;
  }

  /**
   * Processes create events
   * @param events Create events
   * @returns Processing results
   */
  private async processCreates(events: FileChangeEvent[]): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];

    // Batch add for efficiency
    const paths = events.map(e => e.canonicalPath);

    try {
      await this.retryManager.execute(async () => {
        await this.indexer.addFiles(paths);
      });

      // All succeeded
      for (const event of events) {
        results.push({
          event,
          status: ProcessingStatus.COMPLETED,
          error: undefined
        });
      }

    } catch (error) {
      // Try individual processing on batch failure
      for (const event of events) {
        try {
          await this.retryManager.execute(async () => {
            await this.indexer.addFile(event.canonicalPath);
          });

          results.push({
            event,
            status: ProcessingStatus.COMPLETED,
            error: undefined
          });

        } catch (individualError) {
          results.push({
            event,
            status: ProcessingStatus.FAILED,
            error: individualError as Error
          });
          this.logger.logError(`Failed to process create for ${event.path}`, individualError as Error);
        }
      }
    }

    return results;
  }

  /**
   * Processes modify events
   * @param events Modify events
   * @returns Processing results
   */
  private async processModifies(events: FileChangeEvent[]): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];

    // Batch update for efficiency
    const paths = events.map(e => e.canonicalPath);

    try {
      await this.retryManager.execute(async () => {
        await this.indexer.updateFiles(paths);
      });

      // All succeeded
      for (const event of events) {
        results.push({
          event,
          status: ProcessingStatus.COMPLETED,
          error: undefined
        });
      }

    } catch (error) {
      // Try individual processing on batch failure
      for (const event of events) {
        try {
          await this.retryManager.execute(async () => {
            await this.indexer.updateFile(event.canonicalPath);
          });

          results.push({
            event,
            status: ProcessingStatus.COMPLETED,
            error: undefined
          });

        } catch (individualError) {
          results.push({
            event,
            status: ProcessingStatus.FAILED,
            error: individualError as Error
          });
          this.logger.logError(`Failed to process modify for ${event.path}`, individualError as Error);
        }
      }
    }

    return results;
  }

  /**
   * Prioritizes events for processing
   * @param events Events to prioritize
   * @returns Sorted events
   */
  private prioritizeEvents(events: FileChangeEvent[]): FileChangeEvent[] {
    if (!this.config.prioritizeUserFiles) {
      return events;
    }

    return events.sort((a, b) => {
      // Prioritize user files over dependencies
      const aIsUserFile = !this.isNodeModule(a.path) && !this.isDependency(a.path);
      const bIsUserFile = !this.isNodeModule(b.path) && !this.isDependency(b.path);

      if (aIsUserFile && !bIsUserFile) return -1;
      if (!aIsUserFile && bIsUserFile) return 1;

      // Then by type priority (delete, rename, create, modify)
      const typePriority: Record<FileChangeType, number> = {
        [FileChangeType.DELETE]: 1,
        [FileChangeType.RENAME]: 2,
        [FileChangeType.CREATE]: 3,
        [FileChangeType.MODIFY]: 4
      };

      const aPriority = typePriority[a.type] || 5;
      const bPriority = typePriority[b.type] || 5;

      return aPriority - bPriority;
    });
  }

  /**
   * Checks if a path is in node_modules
   * @param filePath File path to check
   * @returns True if in node_modules
   */
  private isNodeModule(filePath: string): boolean {
    return filePath.includes('node_modules');
  }

  /**
   * Checks if a path is likely a dependency
   * @param filePath File path to check
   * @returns True if likely a dependency
   */
  private isDependency(filePath: string): boolean {
    const dependencyPatterns = [
      'node_modules',
      'vendor',
      'packages',
      'bower_components',
      '.pnpm',
      '.yarn'
    ];

    return dependencyPatterns.some(pattern => filePath.includes(pattern));
  }

  /**
   * Splits events into manageable batches
   * @param events Events to split
   * @returns Array of batches
   */
  private splitIntoBatches(events: FileChangeEvent[]): FileChangeEvent[][] {
    const batches: FileChangeEvent[][] = [];
    const batchSize = this.config.maxBatchSize;

    for (let i = 0; i < events.length; i += batchSize) {
      batches.push(events.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Groups events by type
   * @param events Events to group
   * @returns Grouped events
   */
  private groupEventsByType(events: FileChangeEvent[]): GroupedEvents {
    const grouped: GroupedEvents = {
      create: [],
      modify: [],
      delete: [],
      rename: []
    };

    for (const event of events) {
      switch (event.type) {
        case FileChangeType.CREATE:
          grouped.create.push(event);
          break;
        case FileChangeType.MODIFY:
          grouped.modify.push(event);
          break;
        case FileChangeType.DELETE:
          grouped.delete.push(event);
          break;
        case FileChangeType.RENAME:
          grouped.rename.push(event);
          break;
      }
    }

    return grouped;
  }

  /**
   * Updates running statistics
   * @param results Processing results
   */
  private updateStatistics(results: ProcessingResult[]): void {
    for (const result of results) {
      switch (result.status) {
        case ProcessingStatus.COMPLETED:
          this.processedCount++;
          break;
        case ProcessingStatus.FAILED:
          this.failedCount++;
          break;
        case ProcessingStatus.SKIPPED:
          this.skippedCount++;
          break;
      }
    }
  }

  /**
   * Gets batch processor statistics
   * @returns Statistics
   */
  getStatistics(): BatchProcessorStatistics {
    return {
      processed: this.processedCount,
      failed: this.failedCount,
      skipped: this.skippedCount,
      isProcessing: this.isProcessing
    };
  }

  /**
   * Resets statistics
   */
  resetStatistics(): void {
    this.processedCount = 0;
    this.failedCount = 0;
    this.skippedCount = 0;
  }
}

/**
 * Result of processing a single event
 */
export interface ProcessingResult {
  event: FileChangeEvent;
  status: ProcessingStatus;
  error?: Error;
}

/**
 * Result of processing a batch
 */
export interface BatchProcessingResult {
  totalEvents: number;
  processed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: ProcessingResult[];
}

/**
 * Events grouped by type
 */
interface GroupedEvents {
  create: FileChangeEvent[];
  modify: FileChangeEvent[];
  delete: FileChangeEvent[];
  rename: FileChangeEvent[];
}

/**
 * Batch processor statistics
 */
export interface BatchProcessorStatistics {
  processed: number;
  failed: number;
  skipped: number;
  isProcessing: boolean;
}

/**
 * Creates a new BatchProcessor instance
 * @param indexer Incremental indexer
 * @param config Optional configuration
 * @param logger Optional logger
 * @returns New BatchProcessor
 */
export function createBatchProcessor(
  indexer: IncrementalIndexer,
  config?: Partial<BatchProcessorConfig>,
  logger?: WatcherLogger
): BatchProcessor {
  return new BatchProcessor(indexer, config, logger);
}