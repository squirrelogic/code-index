import { FileChangeEvent, mergeFileChangeEvents } from './FileChangeEvent.js';

/**
 * Maximum number of events to buffer before forcing processing
 */
export const MAX_BUFFER_SIZE = 10000;

/**
 * Buffer for accumulating file change events with coalescing
 */
export class DebounceBuffer {
  /**
   * Map of canonical path to events for efficient coalescing
   */
  private buffer: Map<string, FileChangeEvent[]>;

  /**
   * Total number of events in buffer (before coalescing)
   */
  private totalEvents: number;


  /**
   * Timestamp when buffer first received an event after clearing
   */
  private firstEventTime: number;

  constructor() {
    this.buffer = new Map();
    this.totalEvents = 0;
    this.firstEventTime = 0;
  }

  /**
   * Adds an event to the buffer
   * @param event Event to add
   * @returns True if buffer is at max size after adding
   */
  add(event: FileChangeEvent): boolean {
    const key = event.canonicalPath;

    // Track first event time for batch duration calculation
    if (this.totalEvents === 0) {
      this.firstEventTime = Date.now();
    }

    // Add event to buffer
    if (!this.buffer.has(key)) {
      this.buffer.set(key, []);
    }
    this.buffer.get(key)!.push(event);
    this.totalEvents++;

    // Check if buffer is at max size
    return this.totalEvents >= MAX_BUFFER_SIZE;
  }

  /**
   * Gets all coalesced events from the buffer
   * @returns Array of merged events
   */
  getCoalescedEvents(): FileChangeEvent[] {
    const coalesced: FileChangeEvent[] = [];

    for (const [, events] of this.buffer) {
      const merged = mergeFileChangeEvents(events);
      if (merged) {
        coalesced.push(merged);
      }
    }

    return coalesced;
  }

  /**
   * Clears the buffer
   */
  clear(): void {
    this.buffer.clear();
    this.totalEvents = 0;
    this.firstEventTime = 0;
  }

  /**
   * Gets the number of unique paths in the buffer
   * @returns Number of unique paths
   */
  getUniquePathCount(): number {
    return this.buffer.size;
  }

  /**
   * Gets the total number of events in the buffer
   * @returns Total event count (before coalescing)
   */
  getTotalEventCount(): number {
    return this.totalEvents;
  }

  /**
   * Checks if the buffer is empty
   * @returns True if buffer has no events
   */
  isEmpty(): boolean {
    return this.totalEvents === 0;
  }

  /**
   * Checks if the buffer is at max size
   * @returns True if buffer is at or above max size
   */
  isAtMaxSize(): boolean {
    return this.totalEvents >= MAX_BUFFER_SIZE;
  }

  /**
   * Gets the duration in milliseconds since the first event was added
   * @returns Duration in milliseconds, or 0 if buffer is empty
   */
  getDurationSinceFirstEvent(): number {
    if (this.firstEventTime === 0) {
      return 0;
    }
    return Date.now() - this.firstEventTime;
  }

  /**
   * Gets statistics about the buffer
   * @returns Buffer statistics
   */
  getStatistics(): BufferStatistics {
    const coalesced = this.getCoalescedEvents();

    return {
      totalEvents: this.totalEvents,
      uniquePaths: this.buffer.size,
      coalescedEvents: coalesced.length,
      compressionRatio: this.totalEvents > 0
        ? ((this.totalEvents - coalesced.length) / this.totalEvents)
        : 0,
      durationMs: this.getDurationSinceFirstEvent(),
      isAtMaxSize: this.isAtMaxSize()
    };
  }

  /**
   * Removes events for a specific path
   * @param canonicalPath Path to remove events for
   * @returns Number of events removed
   */
  removeEventsForPath(canonicalPath: string): number {
    const events = this.buffer.get(canonicalPath);
    if (!events) {
      return 0;
    }

    const count = events.length;
    this.buffer.delete(canonicalPath);
    this.totalEvents -= count;
    return count;
  }

  /**
   * Gets events for a specific path without removing them
   * @param canonicalPath Path to get events for
   * @returns Array of events for the path
   */
  getEventsForPath(canonicalPath: string): FileChangeEvent[] {
    return this.buffer.get(canonicalPath) || [];
  }

  /**
   * Checks if buffer has events for a specific path
   * @param canonicalPath Path to check
   * @returns True if buffer has events for the path
   */
  hasEventsForPath(canonicalPath: string): boolean {
    return this.buffer.has(canonicalPath);
  }
}

/**
 * Statistics about the buffer state
 */
export interface BufferStatistics {
  /**
   * Total number of events in buffer (before coalescing)
   */
  totalEvents: number;

  /**
   * Number of unique file paths
   */
  uniquePaths: number;

  /**
   * Number of events after coalescing
   */
  coalescedEvents: number;

  /**
   * Ratio of events eliminated by coalescing (0-1)
   */
  compressionRatio: number;

  /**
   * Duration in milliseconds since first event
   */
  durationMs: number;

  /**
   * Whether buffer is at max size
   */
  isAtMaxSize: boolean;
}

/**
 * Creates a new DebounceBuffer instance
 * @returns New DebounceBuffer
 */
export function createDebounceBuffer(): DebounceBuffer {
  return new DebounceBuffer();
}

/**
 * Determines if a buffer should be flushed based on its statistics
 * @param stats Buffer statistics
 * @param config Flush configuration
 * @returns True if buffer should be flushed
 */
export function shouldFlushBuffer(
  stats: BufferStatistics,
  config: FlushConfig
): boolean {
  // Flush if at max size
  if (stats.isAtMaxSize) {
    return true;
  }

  // Flush if duration exceeded
  if (stats.durationMs >= config.maxDurationMs) {
    return true;
  }

  // Flush if enough events accumulated (after coalescing)
  if (stats.coalescedEvents >= config.minBatchSize) {
    return true;
  }

  return false;
}

/**
 * Configuration for buffer flushing
 */
export interface FlushConfig {
  /**
   * Maximum duration to hold events in buffer (milliseconds)
   */
  maxDurationMs: number;

  /**
   * Minimum number of coalesced events to trigger flush
   */
  minBatchSize: number;
}

/**
 * Default flush configuration
 */
export const DEFAULT_FLUSH_CONFIG: FlushConfig = {
  maxDurationMs: 500, // 500ms default debounce
  minBatchSize: 1 // Flush even single events after timeout
};