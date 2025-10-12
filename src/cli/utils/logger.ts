import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * JSON Lines logger for code-index
 */
export class Logger {
  private readonly logDir: string;
  private readonly logFile: string;
  private readonly enableConsole: boolean;

  constructor(projectRoot: string, enableConsole: boolean = false) {
    this.logDir = join(projectRoot, '.codeindex', 'logs');
    this.enableConsole = enableConsole;

    // Create logs directory if it doesn't exist
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }

    // Create log file with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    this.logFile = join(this.logDir, `code-index-${timestamp}.jsonl`);
  }

  /**
   * Logs a debug message
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Logs an info message
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Logs a warning message
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Logs an error message
   */
  error(message: string, error?: Error | any, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      message,
      context
    };

    if (error) {
      entry.error = {
        name: error.name || 'Error',
        message: error.message || String(error),
        stack: error.stack
      };
    }

    this.writeLog(entry);
  }

  /**
   * Generic log method
   */
  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    };

    this.writeLog(entry);
  }

  /**
   * Writes log entry to file
   */
  private writeLog(entry: LogEntry): void {
    // Write to file as JSON Lines
    try {
      appendFileSync(this.logFile, JSON.stringify(entry) + '\n');
    } catch (error) {
      console.error('Failed to write log:', error);
    }

    // Optionally write to console
    if (this.enableConsole) {
      this.writeToConsole(entry);
    }
  }

  /**
   * Writes log entry to console
   */
  private writeToConsole(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level}]`;
    const message = `${prefix} ${entry.message}`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(message, entry.context || '');
        break;
      case LogLevel.INFO:
        console.info(message, entry.context || '');
        break;
      case LogLevel.WARN:
        console.warn(message, entry.context || '');
        break;
      case LogLevel.ERROR:
        console.error(message, entry.error || entry.context || '');
        break;
    }
  }

  /**
   * Logs command execution
   */
  logCommand(command: string, args: Record<string, any>, startTime: number): void {
    const duration = Date.now() - startTime;
    this.info(`Command executed: ${command}`, {
      command,
      args,
      duration_ms: duration
    });
  }

  /**
   * Logs indexing progress
   */
  logIndexProgress(filesProcessed: number, totalFiles: number, rate: number): void {
    this.info('Indexing progress', {
      files_processed: filesProcessed,
      total_files: totalFiles,
      progress_percent: Math.round((filesProcessed / totalFiles) * 100),
      files_per_second: Math.round(rate)
    });
  }

  /**
   * Logs search query
   */
  logSearch(query: string, resultsCount: number, searchTime: number): void {
    this.info('Search performed', {
      query,
      results_count: resultsCount,
      search_time_ms: searchTime
    });
  }

  /**
   * Logs database operation
   */
  logDatabase(operation: string, details: Record<string, any>): void {
    this.debug(`Database operation: ${operation}`, details);
  }

  /**
   * Logs file processing
   */
  logFileOperation(action: string, path: string, details?: Record<string, any>): void {
    this.debug(`File ${action}: ${path}`, {
      action,
      path,
      ...details
    });
  }

  /**
   * Gets log file path
   */
  getLogFile(): string {
    return this.logFile;
  }

  /**
   * Gets all log files
   */
  static getLogFiles(projectRoot: string): string[] {
    const logDir = join(projectRoot, '.codeindex', 'logs');
    if (!existsSync(logDir)) return [];

    const { readdirSync } = require('fs');
    return readdirSync(logDir)
      .filter((file: string) => file.endsWith('.jsonl'))
      .map((file: string) => join(logDir, file));
  }

  /**
   * Cleans old log files (keeps last 7 days)
   */
  static cleanOldLogs(projectRoot: string, daysToKeep: number = 7): void {
    const logFiles = Logger.getLogFiles(projectRoot);
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    for (const file of logFiles) {
      const { statSync, unlinkSync } = require('fs');
      try {
        const stats = statSync(file);
        if (stats.mtime.getTime() < cutoffTime) {
          unlinkSync(file);
        }
      } catch (error) {
        console.error(`Failed to clean log file ${file}:`, error);
      }
    }
  }
}