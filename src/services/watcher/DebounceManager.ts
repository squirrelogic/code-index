import { EventEmitter } from 'events';
import {
  FileChangeEvent,
  FileChangeType
} from '../../models/FileChangeEvent.js';
import {
  DebounceBuffer,
  BufferStatistics,
  FlushConfig,
  DEFAULT_FLUSH_CONFIG,
  shouldFlushBuffer
} from '../../models/DebounceBuffer.js';

/**
 * Manages debouncing and coalescing of file change events
 */
export class DebounceManager extends EventEmitter {
  private buffer: DebounceBuffer;
  private flushConfig: FlushConfig;
  private flushTimer: NodeJS.Timeout | null;
  private isProcessing: boolean;
  private stats: DebounceStats;

  constructor(config?: Partial<FlushConfig>) {
    super();
    this.buffer = new DebounceBuffer();
    this.flushConfig = {
      ...DEFAULT_FLUSH_CONFIG,
      ...config
    };
    this.flushTimer = null;
    this.isProcessing = false;
    this.stats = {
      eventsReceived: 0,
      eventsProcessed: 0,
      batchesProcessed: 0,
      averageBatchSize: 0,
      averageCompressionRatio: 0
    };
  }

  /**
   * Adds an event to the debounce buffer
   * @param event File change event to process
   */
  addEvent(event: FileChangeEvent): void {
    // Add to buffer
    const isAtMax = this.buffer.add(event);
    this.stats.eventsReceived++;

    // Force flush if buffer is at max size
    if (isAtMax) {
      this.flush();
      return;
    }

    // Reset or start the flush timer
    this.resetFlushTimer();
  }

  /**
   * Adds multiple events to the debounce buffer
   * @param events Array of file change events
   */
  addEvents(events: FileChangeEvent[]): void {
    for (const event of events) {
      this.addEvent(event);
    }
  }

  /**
   * Forces immediate processing of buffered events
   */
  flush(): void {
    // Clear any pending timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Skip if already processing or buffer is empty
    if (this.isProcessing || this.buffer.isEmpty()) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get statistics before processing
      const stats = this.buffer.getStatistics();

      // Get coalesced events in dependency order
      const events = this.getEventsInDependencyOrder();

      if (events.length > 0) {
        // Update statistics
        this.updateStatistics(stats);

        // Emit batch for processing
        this.emit('batch', events, stats);

        // Clear the buffer
        this.buffer.clear();
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Gets events sorted in dependency order for processing
   * @returns Array of events in processing order
   */
  private getEventsInDependencyOrder(): FileChangeEvent[] {
    const events = this.buffer.getCoalescedEvents();

    // Sort by:
    // 1. Deletes first (clean up old)
    // 2. Creates second (add new)
    // 3. Modifies last (update existing)
    // 4. Within each type, sort by path depth (parents first)
    return events.sort((a, b) => {
      // Priority by type
      const typePriority = this.getTypePriority(a.type) - this.getTypePriority(b.type);
      if (typePriority !== 0) {
        return typePriority;
      }

      // Then by path depth (fewer segments first)
      const depthA = a.path.split('/').length;
      const depthB = b.path.split('/').length;
      if (depthA !== depthB) {
        return depthA - depthB;
      }

      // Finally by path alphabetically
      return (a as any).path.localeCompare((b as any).path);
    });
  }

  /**
   * Gets processing priority for a file change type
   * @param type File change type
   * @returns Priority value (lower = higher priority)
   */
  private getTypePriority(type: FileChangeType): number {
    switch (type) {
      case FileChangeType.DELETE:
        return 1;
      case FileChangeType.RENAME:
        return 2;
      case FileChangeType.CREATE:
        return 3;
      case FileChangeType.MODIFY:
        return 4;
      default:
        return 5;
    }
  }

  /**
   * Resets the flush timer
   */
  private resetFlushTimer(): void {
    // Clear existing timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    // Set new timer
    this.flushTimer = setTimeout(() => {
      const stats = this.buffer.getStatistics();
      if (shouldFlushBuffer(stats, this.flushConfig)) {
        this.flush();
      } else {
        // Reset timer if we still have events but haven't met flush criteria
        if (!this.buffer.isEmpty()) {
          this.resetFlushTimer();
        }
      }
    }, Math.min(100, this.flushConfig.maxDurationMs / 5)); // Check every 100ms or 1/5 of max duration
  }

  /**
   * Updates running statistics
   * @param batchStats Statistics for the current batch
   */
  private updateStatistics(batchStats: BufferStatistics): void {
    this.stats.eventsProcessed += batchStats.coalescedEvents;
    this.stats.batchesProcessed++;

    // Update running averages
    const totalBatches = this.stats.batchesProcessed;
    this.stats.averageBatchSize =
      (this.stats.averageBatchSize * (totalBatches - 1) + batchStats.coalescedEvents) / totalBatches;
    this.stats.averageCompressionRatio =
      (this.stats.averageCompressionRatio * (totalBatches - 1) + batchStats.compressionRatio) / totalBatches;
  }

  /**
   * Gets debounce manager statistics
   * @returns Current statistics
   */
  getStatistics(): DebounceStats {
    return { ...this.stats };
  }

  /**
   * Resets statistics
   */
  resetStatistics(): void {
    this.stats = {
      eventsReceived: 0,
      eventsProcessed: 0,
      batchesProcessed: 0,
      averageBatchSize: 0,
      averageCompressionRatio: 0
    };
  }

  /**
   * Updates the flush configuration
   * @param config New flush configuration
   */
  updateConfig(config: Partial<FlushConfig>): void {
    this.flushConfig = {
      ...this.flushConfig,
      ...config
    };
  }

  /**
   * Gets the current flush configuration
   * @returns Current flush configuration
   */
  getConfig(): FlushConfig {
    return { ...this.flushConfig };
  }

  /**
   * Stops the debounce manager and clears any pending events
   */
  stop(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Process any remaining events
    if (!this.buffer.isEmpty()) {
      this.flush();
    }

    // Clear the buffer
    this.buffer.clear();

    // Remove all listeners
    this.removeAllListeners();
  }

  /**
   * Gets the current buffer statistics
   * @returns Buffer statistics
   */
  getBufferStatistics(): BufferStatistics {
    return this.buffer.getStatistics();
  }

  /**
   * Checks if the manager is currently processing a batch
   * @returns True if processing
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }

  /**
   * Gets the number of events currently in the buffer
   * @returns Event count
   */
  getPendingEventCount(): number {
    return this.buffer.getTotalEventCount();
  }
}

/**
 * Statistics for the debounce manager
 */
export interface DebounceStats {
  /**
   * Total number of events received
   */
  eventsReceived: number;

  /**
   * Total number of events processed (after coalescing)
   */
  eventsProcessed: number;

  /**
   * Number of batches processed
   */
  batchesProcessed: number;

  /**
   * Average number of events per batch
   */
  averageBatchSize: number;

  /**
   * Average compression ratio (0-1)
   */
  averageCompressionRatio: number;
}

/**
 * Creates a new DebounceManager instance
 * @param config Optional flush configuration
 * @returns New DebounceManager
 */
export function createDebounceManager(config?: Partial<FlushConfig>): DebounceManager {
  return new DebounceManager(config);
}