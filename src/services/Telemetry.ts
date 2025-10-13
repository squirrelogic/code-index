/**
 * Telemetry service for tracking feature usage and performance data
 * Respects user privacy settings and only collects anonymous usage data
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface TelemetryEvent {
  eventType: string;
  timestamp: number;
  data: Record<string, any>;
  sessionId: string;
}

export interface TelemetryConfig {
  enabled: boolean;
  logPath: string;
  flushInterval: number; // milliseconds
  maxBufferSize: number; // events
}

export interface FeatureUsageStats {
  feature: string;
  usageCount: number;
  lastUsed: number;
  averageDuration?: number;
}

export interface PerformanceStats {
  operation: string;
  count: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
}

/**
 * Collects anonymous telemetry data for feature usage and performance monitoring
 */
export class Telemetry {
  private buffer: TelemetryEvent[] = [];
  private sessionId: string;
  private flushTimer: NodeJS.Timeout | null = null;
  private config: TelemetryConfig;

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      logPath: config.logPath ?? '.codeindex/logs/telemetry.jsonl',
      flushInterval: config.flushInterval ?? 60000, // 1 minute
      maxBufferSize: config.maxBufferSize ?? 100
    };

    this.sessionId = this.generateSessionId();

    if (this.config.enabled) {
      this.startFlushTimer();
    }
  }

  /**
   * Enable telemetry collection
   */
  enable(): void {
    this.config.enabled = true;
    this.startFlushTimer();
  }

  /**
   * Disable telemetry collection
   */
  disable(): void {
    this.config.enabled = false;
    this.stopFlushTimer();
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Track a feature usage event
   */
  trackFeature(feature: string, metadata: Record<string, any> = {}): void {
    if (!this.config.enabled) return;

    this.trackEvent('feature_usage', {
      feature,
      ...metadata
    });
  }

  /**
   * Track a performance metric
   */
  trackPerformance(
    operation: string,
    durationMs: number,
    metadata: Record<string, any> = {}
  ): void {
    if (!this.config.enabled) return;

    this.trackEvent('performance', {
      operation,
      durationMs,
      ...metadata
    });
  }

  /**
   * Track an error event
   */
  trackError(
    error: Error,
    context: string,
    metadata: Record<string, any> = {}
  ): void {
    if (!this.config.enabled) return;

    this.trackEvent('error', {
      context,
      errorType: error.name,
      errorMessage: error.message,
      // Don't include stack trace to protect privacy
      ...metadata
    });
  }

  /**
   * Track a generic event
   */
  trackEvent(eventType: string, data: Record<string, any>): void {
    if (!this.config.enabled) return;

    const event: TelemetryEvent = {
      eventType,
      timestamp: Date.now(),
      data,
      sessionId: this.sessionId
    };

    this.buffer.push(event);

    // Flush if buffer is full
    if (this.buffer.length >= this.config.maxBufferSize) {
      void this.flush();
    }
  }

  /**
   * Get feature usage statistics from telemetry log
   */
  async getFeatureStats(): Promise<FeatureUsageStats[]> {
    const events = await this.readTelemetryLog();
    const featureEvents = events.filter(e => e.eventType === 'feature_usage');

    const statsMap = new Map<string, FeatureUsageStats>();

    for (const event of featureEvents) {
      const feature = event.data.feature;
      if (!feature) continue;

      const existing = statsMap.get(feature);
      if (existing) {
        existing.usageCount++;
        existing.lastUsed = Math.max(existing.lastUsed, event.timestamp);
      } else {
        statsMap.set(feature, {
          feature,
          usageCount: 1,
          lastUsed: event.timestamp
        });
      }
    }

    return Array.from(statsMap.values()).sort((a, b) => b.usageCount - a.usageCount);
  }

  /**
   * Get performance statistics from telemetry log
   */
  async getPerformanceStats(): Promise<PerformanceStats[]> {
    const events = await this.readTelemetryLog();
    const perfEvents = events.filter(e => e.eventType === 'performance');

    const statsMap = new Map<string, {
      count: number;
      totalDuration: number;
      minDuration: number;
      maxDuration: number;
    }>();

    for (const event of perfEvents) {
      const operation = event.data.operation;
      const duration = event.data.durationMs;

      if (!operation || typeof duration !== 'number') continue;

      const existing = statsMap.get(operation);
      if (existing) {
        existing.count++;
        existing.totalDuration += duration;
        existing.minDuration = Math.min(existing.minDuration, duration);
        existing.maxDuration = Math.max(existing.maxDuration, duration);
      } else {
        statsMap.set(operation, {
          count: 1,
          totalDuration: duration,
          minDuration: duration,
          maxDuration: duration
        });
      }
    }

    const stats: PerformanceStats[] = [];
    for (const [operation, data] of statsMap.entries()) {
      stats.push({
        operation,
        count: data.count,
        totalDuration: data.totalDuration,
        averageDuration: data.totalDuration / data.count,
        minDuration: data.minDuration,
        maxDuration: data.maxDuration
      });
    }

    return stats.sort((a, b) => b.count - a.count);
  }

  /**
   * Clear telemetry log
   */
  async clearLog(): Promise<void> {
    try {
      await fs.unlink(this.config.logPath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Flush buffered events to log file
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    try {
      // Ensure log directory exists
      const logDir = path.dirname(this.config.logPath);
      await fs.mkdir(logDir, { recursive: true });

      // Append events to log file (JSONL format)
      const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
      await fs.appendFile(this.config.logPath, lines, 'utf-8');
    } catch (error) {
      // Silent failure - don't interrupt application
      console.error('Failed to write telemetry:', error);
    }
  }

  /**
   * Close telemetry service and flush remaining events
   */
  async close(): Promise<void> {
    this.stopFlushTimer();
    await this.flush();
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Start automatic flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.config.flushInterval);

    // Don't keep process alive for timer
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  /**
   * Stop automatic flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Read all events from telemetry log
   */
  private async readTelemetryLog(): Promise<TelemetryEvent[]> {
    try {
      const content = await fs.readFile(this.config.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      return lines.map(line => {
        try {
          return JSON.parse(line) as TelemetryEvent;
        } catch {
          return null;
        }
      }).filter((e): e is TelemetryEvent => e !== null);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}

/**
 * Global telemetry instance for convenience
 */
export const globalTelemetry = new Telemetry();
