import { DatabaseService } from '../database.js';
import { WatcherConfig } from '../../models/WatcherConfig.js';
import { DatabaseError } from '../../lib/errors/WatcherErrors.js';

/**
 * Watcher state information
 */
export interface WatcherStateInfo {
  isWatching: boolean;
  startedAt?: number;
  stoppedAt?: number;
  eventsProcessed: number;
  eventsFailed: number;
  eventsSkipped: number;
  lastEventAt?: number;
  memoryUsageMB?: number;
  lastMemoryCheckAt?: number;
  config?: WatcherConfig;
}

/**
 * Manages watcher state persistence to database
 */
export class WatcherState {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Gets the current watcher state
   * @returns Current state or null if not initialized
   */
  getState(): WatcherStateInfo | null {
    try {
      const row = this.db.prepare(
        'SELECT * FROM watcher_state WHERE id = 1'
      ).get();

      if (!row) {
        return null;
      }

      return this.rowToState(row);
    } catch (error) {
      throw new DatabaseError('get watcher state', error as Error);
    }
  }

  /**
   * Updates the watcher state
   * @param updates Partial state updates
   */
  updateState(updates: Partial<WatcherStateInfo>): void {
    try {
      const current = this.getState() || this.getDefaultState();
      const newState = { ...current, ...updates };

      const configJson = newState.config ? JSON.stringify(newState.config) : null;

      this.db.prepare(`
        INSERT OR REPLACE INTO watcher_state (
          id, is_watching, started_at, stopped_at,
          events_processed, events_failed, events_skipped,
          last_event_at, memory_usage_mb, last_memory_check_at,
          config_json, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newState.isWatching ? 1 : 0,
        newState.startedAt || null,
        newState.stoppedAt || null,
        newState.eventsProcessed,
        newState.eventsFailed,
        newState.eventsSkipped,
        newState.lastEventAt || null,
        newState.memoryUsageMB || null,
        newState.lastMemoryCheckAt || null,
        configJson,
        Math.floor(Date.now() / 1000)
      );
    } catch (error) {
      throw new DatabaseError('update watcher state', error as Error);
    }
  }

  /**
   * Starts watching and updates state
   * @param config Watcher configuration
   */
  startWatching(config: WatcherConfig): void {
    this.updateState({
      isWatching: true,
      startedAt: Date.now(),
      stoppedAt: undefined,
      config
    });
  }

  /**
   * Stops watching and updates state
   */
  stopWatching(): void {
    this.updateState({
      isWatching: false,
      stoppedAt: Date.now()
    });
  }

  /**
   * Increments event counters
   * @param processed Number of events processed
   * @param failed Number of events failed
   * @param skipped Number of events skipped
   */
  incrementEventCounters(
    processed: number = 0,
    failed: number = 0,
    skipped: number = 0
  ): void {
    const current = this.getState() || this.getDefaultState();

    this.updateState({
      eventsProcessed: current.eventsProcessed + processed,
      eventsFailed: current.eventsFailed + failed,
      eventsSkipped: current.eventsSkipped + skipped,
      lastEventAt: Date.now()
    });
  }

  /**
   * Updates memory usage information
   * @param memoryUsageMB Current memory usage in MB
   */
  updateMemoryUsage(memoryUsageMB: number): void {
    this.updateState({
      memoryUsageMB,
      lastMemoryCheckAt: Date.now()
    });
  }

  /**
   * Resets event counters
   */
  resetCounters(): void {
    this.updateState({
      eventsProcessed: 0,
      eventsFailed: 0,
      eventsSkipped: 0
    });
  }

  /**
   * Gets watching duration in milliseconds
   * @returns Duration or 0 if not watching
   */
  getWatchingDuration(): number {
    const state = this.getState();
    if (!state || !state.isWatching || !state.startedAt) {
      return 0;
    }

    return Date.now() - state.startedAt;
  }

  /**
   * Gets event processing statistics
   * @returns Processing statistics
   */
  getStatistics(): {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    successRate: number;
    throughput: number;
  } {
    const state = this.getState() || this.getDefaultState();
    const total = state.eventsProcessed + state.eventsFailed + state.eventsSkipped;
    const duration = this.getWatchingDuration();

    return {
      total,
      successful: state.eventsProcessed,
      failed: state.eventsFailed,
      skipped: state.eventsSkipped,
      successRate: total > 0 ? (state.eventsProcessed / total) * 100 : 0,
      throughput: duration > 0 ? (total / (duration / 1000)) : 0
    };
  }

  /**
   * Converts database row to state object
   */
  private rowToState(row: any): WatcherStateInfo {
    return {
      isWatching: Boolean(row.is_watching),
      startedAt: row.started_at || undefined,
      stoppedAt: row.stopped_at || undefined,
      eventsProcessed: row.events_processed || 0,
      eventsFailed: row.events_failed || 0,
      eventsSkipped: row.events_skipped || 0,
      lastEventAt: row.last_event_at || undefined,
      memoryUsageMB: row.memory_usage_mb || undefined,
      lastMemoryCheckAt: row.last_memory_check_at || undefined,
      config: row.config_json ? JSON.parse(row.config_json) : undefined
    };
  }

  /**
   * Gets default state
   */
  private getDefaultState(): WatcherStateInfo {
    return {
      isWatching: false,
      eventsProcessed: 0,
      eventsFailed: 0,
      eventsSkipped: 0
    };
  }

  /**
   * Creates a summary of the current state
   * @returns Human-readable state summary
   */
  getSummary(): string {
    const state = this.getState();
    if (!state) {
      return 'Watcher not initialized';
    }

    if (!state.isWatching) {
      return `Watcher stopped${state.stoppedAt ? ` at ${new Date(state.stoppedAt).toLocaleString()}` : ''}`;
    }

    const stats = this.getStatistics();
    const duration = this.getWatchingDuration();
    const durationStr = this.formatDuration(duration);

    return [
      `Watching for ${durationStr}`,
      `Events: ${stats.total} total (${stats.successful} processed, ${stats.failed} failed, ${stats.skipped} skipped)`,
      `Success rate: ${stats.successRate.toFixed(1)}%`,
      `Throughput: ${stats.throughput.toFixed(1)} events/sec`,
      state.memoryUsageMB ? `Memory: ${state.memoryUsageMB.toFixed(1)}MB` : ''
    ].filter(Boolean).join('\n');
  }

  /**
   * Formats duration in human-readable format
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}