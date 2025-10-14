import fs from 'fs/promises';
import path from 'path';
import type { FallbackEvent } from '../../models/FallbackEvent.js';
import { Logger } from '../../cli/utils/logger.js';

// Create logger instance
const logger = new Logger(process.cwd());

/**
 * Logger for fallback events in JSON Lines format
 *
 * Writes fallback events to .codeindex/logs/embedding.jsonl
 * Each line is a JSON object representing a single fallback event
 */
export class FallbackLogger {
  private logFilePath: string;
  private logDir: string;

  constructor(logFilePath: string = '.codeindex/logs/embedding.jsonl') {
    this.logFilePath = logFilePath;
    this.logDir = path.dirname(logFilePath);
  }

  /**
   * Initialize the logger (create directories if needed)
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      logger.error(`Failed to create log directory ${this.logDir}:`, error);
      throw error;
    }
  }

  /**
   * Log a fallback event to the JSONL file
   *
   * @param event Fallback event to log
   */
  async logFallback(event: FallbackEvent): Promise<void> {
    try {
      // Convert event to JSON line
      const jsonLine = JSON.stringify({
        timestamp: event.timestamp.toISOString(),
        level: event.level,
        action: event.action,
        from: event.from,
        to: event.to,
        reason: event.reason,
        success: event.success
      }) + '\n';

      // Append to log file
      await fs.appendFile(this.logFilePath, jsonLine, 'utf-8');

    } catch (error) {
      logger.error('Failed to write fallback event to log:', error);
      // Don't throw - logging failures shouldn't break the application
    }
  }

  /**
   * Log multiple fallback events
   *
   * @param events Array of fallback events
   */
  async logFallbacks(events: FallbackEvent[]): Promise<void> {
    for (const event of events) {
      await this.logFallback(event);
    }
  }

  /**
   * Read all fallback events from the log file
   *
   * @returns Array of fallback events
   */
  async readFallbacks(): Promise<FallbackEvent[]> {
    try {
      const content = await fs.readFile(this.logFilePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);

      return lines.map(line => {
        const parsed = JSON.parse(line);
        return {
          timestamp: new Date(parsed.timestamp),
          level: parsed.level,
          action: parsed.action,
          from: parsed.from,
          to: parsed.to,
          reason: parsed.reason,
          success: parsed.success
        };
      });

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet - return empty array
        return [];
      }

      logger.error('Failed to read fallback log:', error);
      return [];
    }
  }

  /**
   * Get recent fallback events (last N)
   *
   * @param limit Maximum number of events to return
   * @returns Array of recent fallback events
   */
  async getRecentFallbacks(limit: number = 10): Promise<FallbackEvent[]> {
    const allEvents = await this.readFallbacks();
    return allEvents.slice(-limit);
  }

  /**
   * Clear all fallback logs
   */
  async clear(): Promise<void> {
    try {
      await fs.unlink(this.logFilePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to clear fallback log:', error);
      }
    }
  }

  /**
   * Get log file stats
   *
   * @returns Stats about the log file
   */
  async getStats(): Promise<{
    exists: boolean;
    sizeBytes: number;
    eventCount: number;
    oldestEvent: Date | null;
    newestEvent: Date | null;
  }> {
    try {
      const stats = await fs.stat(this.logFilePath);
      const events = await this.readFallbacks();

      const oldestEvent = events.length > 0 && events[0] ? events[0].timestamp : null;
      const newestEvent = events.length > 0 && events[events.length - 1]
        ? events[events.length - 1]?.timestamp ?? null
        : null;

      return {
        exists: true,
        sizeBytes: stats.size,
        eventCount: events.length,
        oldestEvent,
        newestEvent
      };

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {
          exists: false,
          sizeBytes: 0,
          eventCount: 0,
          oldestEvent: null,
          newestEvent: null
        };
      }

      throw error;
    }
  }

  /**
   * Get log file path
   *
   * @returns Path to the log file
   */
  getLogFilePath(): string {
    return this.logFilePath;
  }
}
