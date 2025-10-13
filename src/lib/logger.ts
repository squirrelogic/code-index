/**
 * Structured Logging Module
 *
 * Provides structured logging for database operations, errors, and slow queries
 * using JSON Lines (.jsonl) format for easy parsing and analysis.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Base log entry structure
 */
interface BaseLogEntry {
	timestamp: string;
	level: LogLevel;
	type: string;
}

/**
 * Database error log entry
 */
export interface DatabaseErrorLog extends BaseLogEntry {
	type: 'database_error';
	level: 'error' | 'fatal';
	operation: string;
	table?: string;
	error_code: string;
	error_message: string;
	parameters?: any[];
	stack_trace?: string;
	context?: Record<string, any>;
}

/**
 * Slow query log entry
 */
export interface SlowQueryLog extends BaseLogEntry {
	type: 'slow_query';
	level: 'warn';
	operation: string;
	query?: string;
	parameters?: any[];
	duration_ms: number;
	result_count?: number;
	threshold_ms: number;
	context?: Record<string, any>;
}

/**
 * General log entry
 */
export interface GeneralLog extends BaseLogEntry {
	message: string;
	context?: Record<string, any>;
}

/**
 * Union type for all log entries
 */
export type LogEntry = DatabaseErrorLog | SlowQueryLog | GeneralLog;

/**
 * Logger configuration
 */
export interface LoggerConfig {
	/** Directory for log files (default: .codeindex/logs) */
	logDir?: string;
	/** Enable console output (default: true for warn/error/fatal) */
	console?: boolean;
	/** Minimum log level for console output (default: warn) */
	consoleLevel?: LogLevel;
}

/**
 * Structured logger for database operations
 */
export class Logger {
	private logDir: string;
	private consoleEnabled: boolean;
	private consoleLevel: LogLevel;

	constructor(config: LoggerConfig = {}) {
		this.logDir = config.logDir ?? '.codeindex/logs';
		this.consoleEnabled = config.console ?? true;
		this.consoleLevel = config.consoleLevel ?? 'warn';

		// Ensure log directory exists
		this.ensureLogDirectory();
	}

	/**
	 * Ensure log directory exists
	 */
	private ensureLogDirectory(): void {
		if (!fs.existsSync(this.logDir)) {
			fs.mkdirSync(this.logDir, { recursive: true });
		}
	}

	/**
	 * Get log file path for a specific log type
	 */
	private getLogFilePath(logType: string): string {
		return path.join(this.logDir, `${logType}.jsonl`);
	}

	/**
	 * Write log entry to file
	 */
	private writeLogEntry(logType: string, entry: LogEntry): void {
		const logFile = this.getLogFilePath(logType);
		const logLine = JSON.stringify(entry) + '\n';

		try {
			fs.appendFileSync(logFile, logLine, 'utf8');
		} catch (error) {
			// Fall back to console if file write fails
			console.error('[LOGGER ERROR] Failed to write log:', error);
			console.error('[ORIGINAL LOG]', logLine);
		}
	}

	/**
	 * Output to console if enabled
	 */
	private outputToConsole(entry: LogEntry): void {
		if (!this.consoleEnabled) {
			return;
		}

		// Check if log level meets console threshold
		const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];
		const entryLevelIndex = levels.indexOf(entry.level);
		const consoleLevelIndex = levels.indexOf(this.consoleLevel);

		if (entryLevelIndex < consoleLevelIndex) {
			return;
		}

		// Format for console output
		const prefix = `[${entry.level.toUpperCase()}] ${entry.timestamp}`;

		switch (entry.level) {
			case 'error':
			case 'fatal':
				console.error(prefix, JSON.stringify(entry, null, 2));
				break;
			case 'warn':
				console.warn(prefix, JSON.stringify(entry, null, 2));
				break;
			default:
				console.log(prefix, JSON.stringify(entry, null, 2));
		}
	}

	/**
	 * Log a database error
	 */
	logDatabaseError(
		operation: string,
		error: any,
		context?: {
			table?: string;
			parameters?: any[];
			additionalContext?: Record<string, any>;
		}
	): void {
		const entry: DatabaseErrorLog = {
			timestamp: new Date().toISOString(),
			level: 'error',
			type: 'database_error',
			operation,
			table: context?.table,
			error_code: error.code || 'UNKNOWN',
			error_message: error.message || String(error),
			parameters: context?.parameters,
			stack_trace: error.stack,
			context: context?.additionalContext,
		};

		this.writeLogEntry('db-errors', entry);
		this.outputToConsole(entry);
	}

	/**
	 * Log a slow query
	 */
	logSlowQuery(
		operation: string,
		durationMs: number,
		thresholdMs: number,
		context?: {
			query?: string;
			parameters?: any[];
			resultCount?: number;
			additionalContext?: Record<string, any>;
		}
	): void {
		const entry: SlowQueryLog = {
			timestamp: new Date().toISOString(),
			level: 'warn',
			type: 'slow_query',
			operation,
			query: context?.query,
			parameters: context?.parameters,
			duration_ms: Math.round(durationMs),
			result_count: context?.resultCount,
			threshold_ms: thresholdMs,
			context: context?.additionalContext,
		};

		this.writeLogEntry('slow-queries', entry);
		this.outputToConsole(entry);
	}

	/**
	 * Log a general message
	 */
	log(level: LogLevel, message: string, context?: Record<string, any>): void {
		const entry: GeneralLog = {
			timestamp: new Date().toISOString(),
			level,
			type: 'general',
			message,
			context,
		};

		this.writeLogEntry('general', entry);
		this.outputToConsole(entry);
	}

	/**
	 * Convenience methods for different log levels
	 */
	debug(message: string, context?: Record<string, any>): void {
		this.log('debug', message, context);
	}

	info(message: string, context?: Record<string, any>): void {
		this.log('info', message, context);
	}

	warn(message: string, context?: Record<string, any>): void {
		this.log('warn', message, context);
	}

	error(message: string, context?: Record<string, any>): void {
		this.log('error', message, context);
	}

	fatal(message: string, context?: Record<string, any>): void {
		this.log('fatal', message, context);
	}
}

/**
 * Default logger instance
 */
export const logger = new Logger();
