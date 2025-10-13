import { EventEmitter } from 'events';
import * as chokidar from 'chokidar';
import * as path from 'path';
import * as fs from 'fs';
import {
  FileChangeEvent,
  FileChangeType,
  createFileChangeEvent
} from '../../models/FileChangeEvent.js';
import { WatcherConfig } from '../../models/WatcherConfig.js';
import { DebounceManager } from './DebounceManager.js';
import { IgnorePatterns } from './IgnorePatterns.js';
import { getCanonicalPath } from '../../lib/FileSystemUtils.js';
import { WatcherLogger } from '../../cli/utils/WatcherLogger.js';

/**
 * File system watcher service using chokidar
 */
export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null;
  private config: WatcherConfig;
  private debounceManager: DebounceManager;
  private ignorePatterns: IgnorePatterns;
  private logger: WatcherLogger;
  private projectRoot: string;
  private isWatching: boolean;
  private fileCount: number;
  private startTime: number;

  constructor(
    projectRoot: string,
    config: WatcherConfig,
    logger?: WatcherLogger
  ) {
    super();
    this.projectRoot = path.resolve(projectRoot);
    this.config = config;
    this.logger = logger || new WatcherLogger(projectRoot);
    this.watcher = null;
    this.isWatching = false;
    this.fileCount = 0;
    this.startTime = 0;

    // Initialize services
    this.ignorePatterns = new IgnorePatterns(config.ignorePatterns);
    this.debounceManager = new DebounceManager({
      maxDurationMs: config.debounceDelay,
      minBatchSize: 1
    });

    // Set up debounce manager event handlers
    this.setupDebounceHandlers();
  }

  /**
   * Sets up debounce manager event handlers
   */
  private setupDebounceHandlers(): void {
    this.debounceManager.on('batch', (events: FileChangeEvent[]) => {
      this.emit('batch', events);
      this.logger.logBatch(events.length);
    });
  }

  /**
   * Starts watching the file system
   */
  async start(): Promise<void> {
    if (this.isWatching) {
      throw new Error('Watcher is already running');
    }

    this.startTime = Date.now();
    this.fileCount = 0;

    // Configure chokidar options
    const chokidarOptions: chokidar.WatchOptions = {
      persistent: true,
      ignoreInitial: true, // Don't emit events for existing files on startup
      followSymlinks: this.config.followSymlinks,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      },
      ignored: (filePath: string) => {
        // Convert absolute path to relative for pattern matching
        const relativePath = path.relative(this.projectRoot, filePath);
        if (!relativePath || relativePath.startsWith('..')) {
          return false; // Don't ignore files outside project root
        }
        return this.ignorePatterns.shouldIgnore(relativePath);
      },
      depth: this.config.depth,
      usePolling: false,
      interval: 100,
      binaryInterval: 300,
      alwaysStat: true // Need stats for file size and type detection
    };

    // Create and configure watcher
    this.watcher = chokidar.watch(this.projectRoot, chokidarOptions);

    // Set up event handlers
    this.setupWatcherHandlers();

    // Wait for initial scan to complete
    return new Promise((resolve, reject) => {
      if (!this.watcher) {
        reject(new Error('Watcher initialization failed'));
        return;
      }

      this.watcher.once('ready', () => {
        this.isWatching = true;
        this.logger.logStart(this.fileCount);
        this.emit('ready', this.fileCount);
        resolve();
      });

      this.watcher.once('error', (error) => {
        this.logger.logError('Watcher initialization failed', error);
        reject(error);
      });
    });
  }

  /**
   * Sets up watcher event handlers
   */
  private setupWatcherHandlers(): void {
    if (!this.watcher) {
      return;
    }

    // File added
    this.watcher.on('add', async (filePath: string, stats?: fs.Stats) => {
      await this.handleFileEvent(FileChangeType.CREATE, filePath, stats);
    });

    // File changed
    this.watcher.on('change', async (filePath: string, stats?: fs.Stats) => {
      await this.handleFileEvent(FileChangeType.MODIFY, filePath, stats);
    });

    // File removed
    this.watcher.on('unlink', async (filePath: string) => {
      await this.handleFileEvent(FileChangeType.DELETE, filePath);
    });

    // Directory added
    this.watcher.on('addDir', async (dirPath: string, stats?: fs.Stats) => {
      await this.handleDirectoryEvent(FileChangeType.CREATE, dirPath, stats);
    });

    // Directory removed
    this.watcher.on('unlinkDir', async (dirPath: string) => {
      await this.handleDirectoryEvent(FileChangeType.DELETE, dirPath);
    });

    // Error handling
    this.watcher.on('error', (error: Error) => {
      this.logger.logError('Watcher error', error);
      this.emit('error', error);
    });

    // Track initial files
    this.watcher.on('add', () => {
      if (!this.isWatching) {
        this.fileCount++;
      }
    });
  }

  /**
   * Handles a file event
   * @param type Type of change
   * @param filePath Absolute file path
   * @param stats Optional file stats
   */
  private async handleFileEvent(
    type: FileChangeType,
    filePath: string,
    stats?: fs.Stats
  ): Promise<void> {
    try {
      // Skip if not watching yet (during initial scan)
      if (!this.isWatching) {
        return;
      }

      // Get relative path
      const relativePath = path.relative(this.projectRoot, filePath);

      // Double-check ignore patterns (belt and suspenders)
      if (this.ignorePatterns.shouldIgnore(relativePath)) {
        return;
      }

      // Get canonical path
      let canonicalPath: string;
      if (type === FileChangeType.DELETE) {
        // Can't resolve canonical path for deleted files
        canonicalPath = filePath;
      } else {
        canonicalPath = await getCanonicalPath(filePath);
      }

      // Create event
      const event = createFileChangeEvent(
        type,
        relativePath,
        canonicalPath,
        {
          size: stats?.size,
          isDirectory: false,
          isSymlink: stats?.isSymbolicLink() || false
        }
      );

      // Add to debounce manager
      this.debounceManager.addEvent(event);

      // Emit individual event for real-time monitoring
      this.emit('change', event);

    } catch (error) {
      this.logger.logError(`Error handling file event for ${filePath}`, error as Error);
    }
  }

  /**
   * Handles a directory event
   * @param type Type of change
   * @param dirPath Absolute directory path
   * @param stats Optional directory stats
   */
  private async handleDirectoryEvent(
    type: FileChangeType,
    dirPath: string,
    stats?: fs.Stats
  ): Promise<void> {
    try {
      // Skip if not watching yet
      if (!this.isWatching) {
        return;
      }

      // Get relative path
      const relativePath = path.relative(this.projectRoot, dirPath);

      // Check ignore patterns
      if (this.ignorePatterns.shouldIgnore(relativePath)) {
        return;
      }

      // Get canonical path
      let canonicalPath: string;
      if (type === FileChangeType.DELETE) {
        canonicalPath = dirPath;
      } else {
        canonicalPath = await getCanonicalPath(dirPath);
      }

      // Create event
      const event = createFileChangeEvent(
        type,
        relativePath,
        canonicalPath,
        {
          isDirectory: true,
          isSymlink: stats?.isSymbolicLink() || false
        }
      );

      // Add to debounce manager
      this.debounceManager.addEvent(event);

      // Emit individual event
      this.emit('change', event);

    } catch (error) {
      this.logger.logError(`Error handling directory event for ${dirPath}`, error as Error);
    }
  }

  /**
   * Stops watching the file system
   */
  async stop(): Promise<void> {
    if (!this.isWatching) {
      return;
    }

    this.isWatching = false;

    // Flush any pending events
    this.debounceManager.stop();

    // Close the watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    const duration = Date.now() - this.startTime;
    this.logger.logStop(duration);
    this.emit('stop');
  }

  /**
   * Forces processing of pending events
   */
  flush(): void {
    this.debounceManager.flush();
  }

  /**
   * Gets watcher statistics
   * @returns Watcher statistics
   */
  getStatistics(): WatcherStatistics {
    const debounceStats = this.debounceManager.getStatistics();
    const ignoreStats = this.ignorePatterns.getCacheStatistics();

    return {
      isWatching: this.isWatching,
      uptime: this.isWatching ? Date.now() - this.startTime : 0,
      filesWatched: this.fileCount,
      eventsReceived: debounceStats.eventsReceived,
      eventsProcessed: debounceStats.eventsProcessed,
      batchesProcessed: debounceStats.batchesProcessed,
      averageBatchSize: debounceStats.averageBatchSize,
      compressionRatio: debounceStats.averageCompressionRatio,
      ignoreCacheHitRate: ignoreStats.hitRate,
      pendingEvents: this.debounceManager.getPendingEventCount()
    };
  }

  /**
   * Updates the watcher configuration
   * @param config New configuration options
   */
  updateConfiguration(config: Partial<WatcherConfig>): void {
    // Update config
    this.config = { ...this.config, ...config };

    // Update debounce delay if changed
    if (config.debounceDelay !== undefined) {
      this.debounceManager.updateConfig({
        maxDurationMs: config.debounceDelay
      });
    }

    // Update ignore patterns if changed
    if (config.ignorePatterns !== undefined) {
      this.ignorePatterns.importPatterns(
        [...IgnorePatterns.prototype.getPatterns.call(this.ignorePatterns), ...config.ignorePatterns],
        false
      );
    }
  }

  /**
   * Adds ignore patterns
   * @param patterns Patterns to add
   */
  addIgnorePatterns(patterns: string[]): void {
    this.ignorePatterns.addPatterns(patterns);
  }

  /**
   * Removes an ignore pattern
   * @param pattern Pattern to remove
   * @returns True if pattern was removed
   */
  removeIgnorePattern(pattern: string): boolean {
    return this.ignorePatterns.removePattern(pattern);
  }

  /**
   * Gets current ignore patterns
   * @returns Array of patterns
   */
  getIgnorePatterns(): string[] {
    return this.ignorePatterns.getPatterns();
  }

  /**
   * Tests if a path would be ignored
   * @param filePath Path to test
   * @returns True if path would be ignored
   */
  wouldIgnore(filePath: string): boolean {
    const relativePath = path.relative(this.projectRoot, filePath);
    return this.ignorePatterns.shouldIgnore(relativePath);
  }

  /**
   * Gets the project root being watched
   * @returns Project root path
   */
  getProjectRoot(): string {
    return this.projectRoot;
  }

  /**
   * Checks if the watcher is currently running
   * @returns True if watching
   */
  isRunning(): boolean {
    return this.isWatching;
  }
}

/**
 * Statistics for the file watcher
 */
export interface WatcherStatistics {
  isWatching: boolean;
  uptime: number;
  filesWatched: number;
  eventsReceived: number;
  eventsProcessed: number;
  batchesProcessed: number;
  averageBatchSize: number;
  compressionRatio: number;
  ignoreCacheHitRate: number;
  pendingEvents: number;
}

/**
 * Creates a new FileWatcher instance
 * @param projectRoot Project root directory
 * @param config Watcher configuration
 * @param logger Optional logger
 * @returns New FileWatcher instance
 */
export function createFileWatcher(
  projectRoot: string,
  config: WatcherConfig,
  logger?: WatcherLogger
): FileWatcher {
  return new FileWatcher(projectRoot, config, logger);
}