import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { WatcherConfig } from '../../models/WatcherConfig.js';
import { FileWatcher } from '../../services/watcher/FileWatcher.js';
import { BatchProcessor, BatchProcessingResult } from '../../services/watcher/BatchProcessor.js';
import { IncrementalIndexer } from '../../services/indexer/IncrementalIndexer.js';
import { DatabaseService as Database } from '../../services/database.js';
import { WatcherLogger } from '../utils/WatcherLogger.js';
import { OutputFormatter } from '../utils/output.js';
import { FileChangeEvent } from '../../models/FileChangeEvent.js';

/**
 * Creates the watch command
 * @returns Commander command
 */
export function createWatchCommand(): Command {
  return new Command('watch')
    .description('Monitor file changes and automatically update index')
    .option('-d, --delay <ms>', 'Debounce delay in milliseconds', '500')
    .option('-b, --batch-size <size>', 'Maximum batch size', '100')
    .option('-i, --ignore <patterns...>', 'Additional ignore patterns')
    .option('--no-follow-symlinks', 'Do not follow symbolic links')
    .option('--max-depth <depth>', 'Maximum directory depth to watch')
    .option('--stats-interval <ms>', 'Statistics display interval', '30000')
    .option('-v, --verbose', 'Enable verbose logging')
    .option('--dry-run', 'Monitor changes without updating index')
    .action(async (options) => {
      await executeWatchCommand(options);
    });
}

/**
 * Command options interface
 */
interface WatchCommandOptions {
  delay: string;
  batchSize: string;
  ignore?: string[];
  followSymlinks: boolean;
  maxDepth?: string;
  statsInterval: string;
  verbose?: boolean;
  dryRun?: boolean;
}

/**
 * Executes the watch command
 * @param options Command options
 */
async function executeWatchCommand(options: WatchCommandOptions): Promise<void> {
  const output = new OutputFormatter();
  const projectRoot = process.cwd();

  try {
    // Check if project is initialized
    const dbPath = path.join(projectRoot, '.codeindex', 'index.db');
    if (!fs.existsSync(dbPath)) {
      output.error('Project not initialized. Run "code-index init" first.');
      process.exit(1);
    }

    // Parse and validate options
    const config: WatcherConfig = {
      debounceDelay: parseInt(options.delay, 10) || 500,
      batchSize: parseInt(options.batchSize, 10) || 100,
      ignorePatterns: options.ignore || [],
      followSymlinks: options.followSymlinks,
      depth: options.maxDepth ? parseInt(options.maxDepth, 10) : -1,
      memoryThreshold: 400,
      memoryCheckInterval: 30,
      maxQueueSize: 10000,
      retryAttempts: 3,
      retryDelay: 1000,
      useGitignore: true,
      watchHidden: false,
      verbose: options.verbose || false
    };

    // Validate configuration
    if (config.debounceDelay < 100 || config.debounceDelay > 10000) {
      output.error('Debounce delay must be between 100 and 10000 ms');
      process.exit(1);
    }

    if (config.batchSize < 1 || config.batchSize > 1000) {
      output.error('Batch size must be between 1 and 1000');
      process.exit(1);
    }

    // Initialize services
    const logger = new WatcherLogger(projectRoot, options.verbose ? 'verbose' : undefined);
    const database = new Database(dbPath);
    const indexer = new IncrementalIndexer(database, projectRoot);
    const batchProcessor = new BatchProcessor(
      indexer,
      {
        maxBatchSize: config.batchSize,
        prioritizeUserFiles: true,
        maxRetries: 3,
        retryDelay: 1000
      },
      logger
    );

    // Create file watcher
    const watcher = new FileWatcher(projectRoot, config, logger);

    // Set up event handlers
    setupWatcherEventHandlers(
      watcher,
      batchProcessor,
      output,
      options
    );

    // Set up graceful shutdown
    setupGracefulShutdown(watcher, database, output);

    // Set up statistics display
    if (options.verbose) {
      setupStatisticsDisplay(
        watcher,
        batchProcessor,
        output,
        parseInt(options.statsInterval, 10) || 30000
      );
    }

    // Start watching
    output.info('Starting file watcher...');
    output.info(`Project root: ${projectRoot}`);
    output.info(`Debounce delay: ${config.debounceDelay}ms`);
    output.info(`Batch size: ${config.batchSize}`);
    if (config.ignorePatterns.length > 0) {
      output.info(`Custom ignore patterns: ${config.ignorePatterns.join(', ')}`);
    }
    if (options.dryRun) {
      output.warning('DRY RUN MODE - Changes will not be indexed');
    }

    await watcher.start();

    output.success('File watcher started. Press Ctrl+C to stop.');

    // Keep process alive
    process.stdin.resume();

  } catch (error) {
    output.error(`Failed to start watcher: ${(error as Error).message}`);
    if (options.verbose && error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Sets up watcher event handlers
 */
function setupWatcherEventHandlers(
  watcher: FileWatcher,
  batchProcessor: BatchProcessor,
  output: OutputFormatter,
  options: WatchCommandOptions
): void {
  // Handle individual changes (for real-time display)
  if (options.verbose) {
    watcher.on('change', (event: FileChangeEvent) => {
      output.info(`[${event.type}] ${event.path}`);
    });
  }

  // Handle batches
  watcher.on('batch', async (events: FileChangeEvent[]) => {
    output.info(`Processing batch of ${events.length} changes...`);

    if (options.dryRun) {
      // In dry-run mode, just display what would be done
      output.info('DRY RUN - Would process:');
      for (const event of events.slice(0, 10)) {
        output.info(`  [${event.type}] ${event.path}`);
      }
      if (events.length > 10) {
        output.info(`  ... and ${events.length - 10} more`);
      }
      return;
    }

    // Process the batch
    try {
      const result = await batchProcessor.processBatch(events);
      displayBatchResult(result, output, options.verbose);
    } catch (error) {
      output.error(`Batch processing failed: ${(error as Error).message}`);
    }
  });

  // Handle errors
  watcher.on('error', (error: Error) => {
    output.error(`Watcher error: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
  });

  // Handle ready event
  watcher.on('ready', (fileCount: number) => {
    output.success(`Watching ${fileCount} files for changes`);
  });
}

/**
 * Displays batch processing result
 */
function displayBatchResult(
  result: BatchProcessingResult,
  output: OutputFormatter,
  verbose?: boolean
): void {
  const successRate = result.totalEvents > 0
    ? ((result.processed / result.totalEvents) * 100).toFixed(1)
    : '0';

  output.success(
    `Batch complete: ${result.processed}/${result.totalEvents} processed (${successRate}%) in ${result.duration}ms`
  );

  if (result.failed > 0) {
    output.warning(`Failed: ${result.failed} files`);
    if (verbose) {
      const failed = result.results.filter((r: any) => r.error);
      for (const item of failed.slice(0, 5)) {
        output.error(`  ${item.event.path}: ${item.error?.message}`);
      }
      if (failed.length > 5) {
        output.error(`  ... and ${failed.length - 5} more failures`);
      }
    }
  }

  if (result.skipped > 0) {
    output.info(`Skipped: ${result.skipped} files`);
  }
}

/**
 * Sets up graceful shutdown handling
 */
function setupGracefulShutdown(
  watcher: FileWatcher,
  database: Database,
  output: OutputFormatter
): void {
  let shutdownInProgress = false;

  const shutdown = async (signal: string) => {
    if (shutdownInProgress) {
      return;
    }
    shutdownInProgress = true;

    output.info(`\nReceived ${signal}, shutting down gracefully...`);

    try {
      // Stop the watcher
      await watcher.stop();
      output.info('Watcher stopped');

      // Close database
      database.close();
      output.info('Database closed');

      output.success('Shutdown complete');
      process.exit(0);
    } catch (error) {
      output.error(`Error during shutdown: ${(error as Error).message}`);
      process.exit(1);
    }
  };

  // Handle various shutdown signals
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    output.error(`Uncaught exception: ${error.message}`);
    console.error(error.stack);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    output.error(`Unhandled rejection at: ${promise}, reason: ${reason}`);
    shutdown('unhandledRejection');
  });
}

/**
 * Sets up periodic statistics display
 */
function setupStatisticsDisplay(
  watcher: FileWatcher,
  batchProcessor: BatchProcessor,
  output: OutputFormatter,
  interval: number
): void {
  const displayStats = () => {
    const watcherStats = watcher.getStatistics();
    const processorStats = batchProcessor.getStatistics();

    output.info('\n=== Watcher Statistics ===');
    output.info(`Status: ${watcherStats.isWatching ? 'Watching' : 'Stopped'}`);
    output.info(`Uptime: ${formatDuration(watcherStats.uptime)}`);
    output.info(`Files watched: ${watcherStats.filesWatched}`);
    output.info(`Events received: ${watcherStats.eventsReceived}`);
    output.info(`Events processed: ${watcherStats.eventsProcessed}`);
    output.info(`Batches: ${watcherStats.batchesProcessed}`);
    output.info(`Average batch size: ${watcherStats.averageBatchSize.toFixed(1)}`);
    output.info(`Compression ratio: ${(watcherStats.compressionRatio * 100).toFixed(1)}%`);
    output.info(`Pending events: ${watcherStats.pendingEvents}`);

    output.info('\n=== Processor Statistics ===');
    output.info(`Processed: ${processorStats.processed}`);
    output.info(`Failed: ${processorStats.failed}`);
    output.info(`Skipped: ${processorStats.skipped}`);
    output.info(`Currently processing: ${processorStats.isProcessing ? 'Yes' : 'No'}`);

    // Memory usage
    const memUsage = process.memoryUsage();
    const memMB = (memUsage.heapUsed / 1024 / 1024).toFixed(1);
    output.info(`\nMemory usage: ${memMB} MB`);
    output.info('========================\n');
  };

  // Display stats periodically
  const statsInterval = setInterval(displayStats, interval);

  // Clear interval on shutdown
  process.on('exit', () => {
    clearInterval(statsInterval);
  });
}

/**
 * Formats a duration in milliseconds to a human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}