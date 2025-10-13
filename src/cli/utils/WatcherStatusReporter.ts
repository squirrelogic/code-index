import { EventEmitter } from 'events';
import { OutputFormatter } from './output.js';
import { FileChangeEvent, FileChangeType } from '../../models/FileChangeEvent.js';
import { BatchProcessingResult } from '../../services/watcher/BatchProcessor.js';
import { WatcherStatistics } from '../../services/watcher/FileWatcher.js';

/**
 * Configuration for status reporter
 */
export interface StatusReporterConfig {
  /**
   * Whether to show individual file changes
   */
  showFileChanges: boolean;

  /**
   * Whether to show batch processing details
   */
  showBatchDetails: boolean;

  /**
   * Whether to show periodic statistics
   */
  showStatistics: boolean;

  /**
   * Interval for statistics display (ms)
   */
  statisticsInterval: number;

  /**
   * Maximum number of errors to display
   */
  maxErrorsToShow: number;
}

/**
 * Default configuration
 */
export const DEFAULT_REPORTER_CONFIG: StatusReporterConfig = {
  showFileChanges: false,
  showBatchDetails: true,
  showStatistics: true,
  statisticsInterval: 30000,
  maxErrorsToShow: 5
};

/**
 * Reports watcher status and progress
 */
export class WatcherStatusReporter extends EventEmitter {
  private config: StatusReporterConfig;
  private output: OutputFormatter;
  private currentBatch: FileChangeEvent[] | null;
  private totalFilesProcessed: number;
  private totalErrors: number;
  private recentErrors: Array<{ path: string; error: string; timestamp: number }>;
  private statisticsTimer: NodeJS.Timeout | null;

  constructor(
    output: OutputFormatter,
    config?: Partial<StatusReporterConfig>
  ) {
    super();
    this.output = output;
    this.config = { ...DEFAULT_REPORTER_CONFIG, ...config };
    this.currentBatch = null;
    this.totalFilesProcessed = 0;
    this.totalErrors = 0;
    this.recentErrors = [];
    this.statisticsTimer = null;
  }

  /**
   * Reports an individual file change
   * @param event File change event
   */
  reportFileChange(event: FileChangeEvent): void {
    if (!this.config.showFileChanges) {
      return;
    }

    const icon = this.getChangeTypeIcon(event.type);
    const message = `${icon} ${event.path}`;

    switch (event.type) {
      case FileChangeType.CREATE:
        this.output.success(message);
        break;
      case FileChangeType.MODIFY:
        this.output.info(message);
        break;
      case FileChangeType.DELETE:
        this.output.warning(message);
        break;
      case FileChangeType.RENAME:
        this.output.info(`${icon} ${event.oldPath} → ${event.path}`);
        break;
    }
  }

  /**
   * Reports the start of batch processing
   * @param batch Array of events being processed
   */
  reportBatchStart(batch: FileChangeEvent[]): void {
    this.currentBatch = batch;

    if (this.config.showBatchDetails) {
      this.output.info(`\n📦 Processing batch of ${batch.length} changes...`);
      this.displayBatchSummary(batch);
    }
  }

  /**
   * Reports batch processing progress
   * @param processed Number of events processed so far
   */
  reportBatchProgress(processed: number): void {
    if (!this.currentBatch || !this.config.showBatchDetails) {
      return;
    }

    const total = this.currentBatch.length;
    const percentage = Math.round((processed / total) * 100);
    const progressBar = this.createProgressBar(percentage);

    // Use carriage return to update the same line
    process.stdout.write(`\r  Progress: ${progressBar} ${processed}/${total} (${percentage}%)`);
  }

  /**
   * Reports batch processing completion
   * @param result Batch processing result
   */
  reportBatchComplete(result: BatchProcessingResult): void {
    this.currentBatch = null;
    this.totalFilesProcessed += result.processed;
    this.totalErrors += result.failed;

    // Clear progress line
    if (this.config.showBatchDetails) {
      process.stdout.write('\r\x1b[K'); // Clear line
    }

    // Update recent errors
    for (const item of result.results) {
      if (item.error) {
        this.recentErrors.push({
          path: item.event.path,
          error: item.error.message,
          timestamp: Date.now()
        });
      }
    }

    // Keep only recent errors
    if (this.recentErrors.length > this.config.maxErrorsToShow * 2) {
      this.recentErrors = this.recentErrors.slice(-this.config.maxErrorsToShow);
    }

    if (this.config.showBatchDetails) {
      this.displayBatchResult(result);
    }
  }

  /**
   * Reports an error during processing
   * @param error Error that occurred
   * @param context Optional context about the error
   */
  reportError(error: Error, context?: string): void {
    const message = context ? `${context}: ${error.message}` : error.message;
    this.output.error(`❌ ${message}`);
    this.totalErrors++;
  }

  /**
   * Reports a retry attempt
   * @param path File path being retried
   * @param attempt Current attempt number
   * @param maxAttempts Maximum attempts
   */
  reportRetry(path: string, attempt: number, maxAttempts: number): void {
    if (this.config.showBatchDetails) {
      this.output.warning(`🔄 Retry ${attempt}/${maxAttempts}: ${path}`);
    }
  }

  /**
   * Displays watcher statistics
   * @param stats Watcher statistics
   */
  displayStatistics(stats: WatcherStatistics): void {
    if (!this.config.showStatistics) {
      return;
    }

    const lines = [
      '',
      '📊 Watcher Statistics',
      '═══════════════════════════════════════',
      `  Status:            ${stats.isWatching ? '🟢 Watching' : '🔴 Stopped'}`,
      `  Uptime:            ${this.formatDuration(stats.uptime)}`,
      `  Files watched:     ${stats.filesWatched.toLocaleString()}`,
      `  Events received:   ${stats.eventsReceived.toLocaleString()}`,
      `  Events processed:  ${stats.eventsProcessed.toLocaleString()}`,
      `  Batches:          ${stats.batchesProcessed.toLocaleString()}`,
      `  Avg batch size:   ${stats.averageBatchSize.toFixed(1)}`,
      `  Compression:      ${(stats.compressionRatio * 100).toFixed(1)}%`,
      `  Pending:          ${stats.pendingEvents.toLocaleString()}`,
      `  Cache hit rate:   ${(stats.ignoreCacheHitRate * 100).toFixed(1)}%`,
      '',
      `  Total processed:  ${this.totalFilesProcessed.toLocaleString()}`,
      `  Total errors:     ${this.totalErrors.toLocaleString()}`,
      `  Memory usage:     ${this.getMemoryUsage()} MB`,
      '═══════════════════════════════════════',
      ''
    ];

    for (const line of lines) {
      this.output.info(line);
    }

    // Display recent errors if any
    if (this.recentErrors.length > 0) {
      this.displayRecentErrors();
    }
  }

  /**
   * Starts periodic statistics display
   * @param getStats Function to get current statistics
   */
  startStatisticsTimer(getStats: () => WatcherStatistics): void {
    if (!this.config.showStatistics) {
      return;
    }

    this.statisticsTimer = setInterval(() => {
      const stats = getStats();
      this.displayStatistics(stats);
    }, this.config.statisticsInterval);
  }

  /**
   * Stops periodic statistics display
   */
  stopStatisticsTimer(): void {
    if (this.statisticsTimer) {
      clearInterval(this.statisticsTimer);
      this.statisticsTimer = null;
    }
  }

  /**
   * Displays batch summary
   * @param batch Array of events in the batch
   */
  private displayBatchSummary(batch: FileChangeEvent[]): void {
    const summary = this.summarizeEventTypes(batch);

    const parts: string[] = [];
    if ((summary.create ?? 0) > 0) parts.push(`${summary.create} creates`);
    if ((summary.modify ?? 0) > 0) parts.push(`${summary.modify} modifications`);
    if ((summary.delete ?? 0) > 0) parts.push(`${summary.delete} deletions`);
    if ((summary.rename ?? 0) > 0) parts.push(`${summary.rename} renames`);

    if (parts.length > 0) {
      this.output.info(`  Types: ${parts.join(', ')}`);
    }
  }

  /**
   * Displays batch processing result
   * @param result Batch processing result
   */
  private displayBatchResult(result: BatchProcessingResult): void {
    const successRate = result.totalEvents > 0
      ? ((result.processed / result.totalEvents) * 100).toFixed(1)
      : '0';

    const icon = result.failed === 0 ? '✅' : result.failed < result.processed ? '⚠️' : '❌';

    this.output.info(
      `${icon} Batch complete: ${result.processed}/${result.totalEvents} processed (${successRate}%) in ${result.duration}ms`
    );

    if (result.failed > 0) {
      this.output.warning(`  ⚠️ Failed: ${result.failed} files`);
    }

    if (result.skipped > 0) {
      this.output.info(`  ⏭️ Skipped: ${result.skipped} files`);
    }
  }

  /**
   * Displays recent errors
   */
  private displayRecentErrors(): void {
    this.output.warning('\n🔴 Recent Errors:');

    const errorsToShow = this.recentErrors.slice(-this.config.maxErrorsToShow);
    for (const error of errorsToShow) {
      const age = Date.now() - error.timestamp;
      const ageStr = this.formatDuration(age);
      this.output.error(`  ${error.path}: ${error.error} (${ageStr} ago)`);
    }

    if (this.recentErrors.length > this.config.maxErrorsToShow) {
      this.output.info(`  ... and ${this.recentErrors.length - this.config.maxErrorsToShow} more`);
    }
  }

  /**
   * Summarizes event types in a batch
   * @param events Array of events
   * @returns Summary counts by type
   */
  private summarizeEventTypes(events: FileChangeEvent[]): Record<string, number> {
    const summary: Record<string, number> = {
      create: 0,
      modify: 0,
      delete: 0,
      rename: 0
    };

    for (const event of events) {
      summary[event.type] = (summary[event.type] || 0) + 1;
    }

    return summary;
  }

  /**
   * Gets icon for change type
   * @param type File change type
   * @returns Icon string
   */
  private getChangeTypeIcon(type: FileChangeType): string {
    switch (type) {
      case FileChangeType.CREATE:
        return '➕';
      case FileChangeType.MODIFY:
        return '📝';
      case FileChangeType.DELETE:
        return '🗑️';
      case FileChangeType.RENAME:
        return '🔄';
      default:
        return '❓';
    }
  }

  /**
   * Creates a progress bar
   * @param percentage Percentage complete (0-100)
   * @returns Progress bar string
   */
  private createProgressBar(percentage: number): string {
    const width = 20;
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;

    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Formats duration in milliseconds
   * @param ms Duration in milliseconds
   * @returns Formatted string
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Gets current memory usage
   * @returns Memory usage in MB
   */
  private getMemoryUsage(): string {
    const usage = process.memoryUsage();
    return (usage.heapUsed / 1024 / 1024).toFixed(1);
  }

  /**
   * Clears the reporter state
   */
  clear(): void {
    this.currentBatch = null;
    this.totalFilesProcessed = 0;
    this.totalErrors = 0;
    this.recentErrors = [];
    this.stopStatisticsTimer();
  }
}

/**
 * Creates a new WatcherStatusReporter instance
 * @param output Output formatter
 * @param config Optional configuration
 * @returns New WatcherStatusReporter
 */
export function createWatcherStatusReporter(
  output: OutputFormatter,
  config?: Partial<StatusReporterConfig>
): WatcherStatusReporter {
  return new WatcherStatusReporter(output, config);
}