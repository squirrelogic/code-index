import path from 'path';
import { ensureDirectory } from '../../lib/FileSystemUtils.js';

/**
 * Log level enumeration
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: any;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Logger for watcher operations
 */
export class WatcherLogger {
  private readonly logFile: string;
  private readonly component: string;
  private minLevel: LogLevel;
  private writeStream: any = null;

  constructor(
    component: string = 'watcher',
    logDir: string = '.codeindex/logs',
    minLevel: LogLevel = LogLevel.INFO
  ) {
    this.component = component;
    this.logFile = path.join(logDir, 'watcher.jsonl');
    this.minLevel = minLevel;
  }

  /**
   * Initializes the logger and ensures log directory exists
   */
  async initialize(): Promise<void> {
    const logDir = path.dirname(this.logFile);
    await ensureDirectory(logDir);

    // Open write stream in append mode
    const { createWriteStream } = await import('fs');
    this.writeStream = createWriteStream(this.logFile, {
      flags: 'a',
      encoding: 'utf-8'
    });
  }

  /**
   * Closes the logger
   */
  async close(): Promise<void> {
    if (this.writeStream) {
      return new Promise((resolve) => {
        this.writeStream.end(() => resolve());
      });
    }
  }

  /**
   * Logs a debug message
   */
  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Logs an info message
   */
  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Logs a warning message
   */
  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Logs an error message
   */
  error(message: string, error?: Error, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      component: this.component,
      message,
      data
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    this.writeLog(entry);
  }

  /**
   * Logs a message at the specified level
   */
  private log(level: LogLevel, message: string, data?: any): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      data
    };

    this.writeLog(entry);
  }

  /**
   * Writes a log entry to file and console
   */
  private writeLog(entry: LogEntry): void {
    // Write to file if stream is available
    if (this.writeStream) {
      this.writeStream.write(JSON.stringify(entry) + '\n');
    }

    // Also log to console in development
    if (process.env.NODE_ENV !== 'production' || entry.level === LogLevel.ERROR) {
      this.logToConsole(entry);
    }
  }

  /**
   * Logs to console with appropriate formatting
   */
  private logToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const prefix = `[${timestamp}] [${entry.component}]`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(`${prefix} DEBUG:`, entry.message, entry.data || '');
        break;
      case LogLevel.INFO:
        console.info(`${prefix} INFO:`, entry.message, entry.data || '');
        break;
      case LogLevel.WARN:
        console.warn(`${prefix} WARN:`, entry.message, entry.data || '');
        break;
      case LogLevel.ERROR:
        console.error(`${prefix} ERROR:`, entry.message, entry.error || entry.data || '');
        break;
    }
  }

  /**
   * Checks if a message should be logged based on level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const minIndex = levels.indexOf(this.minLevel);
    const levelIndex = levels.indexOf(level);
    return levelIndex >= minIndex;
  }

  /**
   * Sets the minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Creates a child logger with a new component name
   */
  createChild(component: string): WatcherLogger {
    const child = new WatcherLogger(
      `${this.component}:${component}`,
      path.dirname(this.logFile),
      this.minLevel
    );
    child.writeStream = this.writeStream;
    return child;
  }

  /**
   * Logs performance metrics
   */
  logMetrics(metrics: Record<string, any>): void {
    this.info('Performance metrics', metrics);
  }

  /**
   * Logs a batch processing start
   */
  logBatchStart(batchSize: number, priority: number): void {
    this.info('Starting batch processing', {
      batchSize,
      priority,
      timestamp: Date.now()
    });
  }

  /**
   * Logs a batch processing completion
   */
  logBatchComplete(
    batchSize: number,
    processed: number,
    failed: number,
    duration: number
  ): void {
    this.info('Batch processing complete', {
      batchSize,
      processed,
      failed,
      duration,
      throughput: processed / (duration / 1000),
      timestamp: Date.now()
    });
  }

  /**
   * Logs file change event
   */
  logFileChange(
    type: string,
    path: string,
    details?: any
  ): void {
    this.debug(`File ${type}`, {
      type,
      path,
      ...details
    });
  }

  /**
   * Logs memory warning
   */
  logMemoryWarning(currentMB: number, thresholdMB: number): void {
    this.warn('Memory threshold exceeded', {
      current: currentMB,
      threshold: thresholdMB,
      percentage: (currentMB / thresholdMB * 100).toFixed(2)
    });
  }

  /**
   * Logs retry attempt
   */
  logRetry(
    operation: string,
    attempt: number,
    maxAttempts: number,
    nextDelay: number
  ): void {
    this.info('Retrying operation', {
      operation,
      attempt,
      maxAttempts,
      nextDelay,
      timestamp: Date.now()
    });
  }
}

/**
 * Global logger instance
 */
export const watcherLogger = new WatcherLogger();