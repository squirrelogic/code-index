import { MemoryThresholdError } from './errors/WatcherErrors.js';

/**
 * Performance metrics snapshot
 */
export interface PerformanceMetrics {
  timestamp: number;
  memoryUsageMB: number;
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  rssMB: number;
  cpuUsage: NodeJS.CpuUsage;
  eventLoopLag?: number;
}

/**
 * Performance alert configuration
 */
export interface PerformanceAlertConfig {
  memoryThresholdMB: number;
  cpuThresholdPercent: number;
  eventLoopLagMs: number;
  onAlert: (type: string, metrics: PerformanceMetrics) => void;
}

/**
 * Performance statistics over time
 */
export interface PerformanceStats {
  current: PerformanceMetrics;
  average: {
    memoryUsageMB: number;
    cpuPercent: number;
    eventLoopLagMs: number;
  };
  peak: {
    memoryUsageMB: number;
    timestamp: number;
  };
  samples: number;
}

/**
 * Monitors performance metrics and alerts on thresholds
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private intervalId?: NodeJS.Timeout;
  private lastCpuUsage?: NodeJS.CpuUsage;
  private config: PerformanceAlertConfig;
  private isMonitoring = false;

  constructor(config?: Partial<PerformanceAlertConfig>) {
    this.config = {
      memoryThresholdMB: 400,
      cpuThresholdPercent: 80,
      eventLoopLagMs: 100,
      onAlert: (type, metrics) => {
        console.warn(`Performance alert [${type}]:`, metrics);
      },
      ...config
    };
  }

  /**
   * Starts monitoring performance metrics
   * @param intervalMs Monitoring interval in milliseconds
   */
  start(intervalMs: number = 30000): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.lastCpuUsage = process.cpuUsage();

    // Take initial measurement
    this.measure();

    // Set up periodic monitoring
    this.intervalId = setInterval(() => {
      try {
        this.measure();
      } catch (error) {
        console.error('Performance monitoring error:', error);
      }
    }, intervalMs);

    // Prevent timer from keeping process alive
    if (this.intervalId.unref) {
      this.intervalId.unref();
    }
  }

  /**
   * Stops monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isMonitoring = false;
  }

  /**
   * Takes a single performance measurement
   */
  measure(): PerformanceMetrics {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage(this.lastCpuUsage);
    this.lastCpuUsage = process.cpuUsage();

    const metrics: PerformanceMetrics = {
      timestamp: Date.now(),
      memoryUsageMB: (memUsage.heapUsed + memUsage.external) / 1024 / 1024,
      heapUsedMB: memUsage.heapUsed / 1024 / 1024,
      heapTotalMB: memUsage.heapTotal / 1024 / 1024,
      externalMB: memUsage.external / 1024 / 1024,
      rssMB: memUsage.rss / 1024 / 1024,
      cpuUsage
    };

    // Measure event loop lag if possible
    metrics.eventLoopLag = this.measureEventLoopLag();

    // Store metrics (keep last 100 samples)
    this.metrics.push(metrics);
    if (this.metrics.length > 100) {
      this.metrics.shift();
    }

    // Check thresholds
    this.checkThresholds(metrics);

    return metrics;
  }

  /**
   * Gets current performance metrics
   */
  getCurrentMetrics(): PerformanceMetrics | undefined {
    return this.metrics[this.metrics.length - 1];
  }

  /**
   * Gets performance statistics
   */
  getStats(): PerformanceStats | null {
    if (this.metrics.length === 0) {
      return null;
    }

    const current = this.metrics[this.metrics.length - 1];
    if (!current) {
      return null;
    }

    // Calculate averages
    let totalMemory = 0;
    let totalCpu = 0;
    let totalLag = 0;
    let peakMemory = 0;
    let peakTimestamp = 0;

    for (const metric of this.metrics) {
      totalMemory += metric.memoryUsageMB;

      if (metric.memoryUsageMB > peakMemory) {
        peakMemory = metric.memoryUsageMB;
        peakTimestamp = metric.timestamp;
      }

      // Estimate CPU percentage (rough approximation)
      const cpuTime = (metric.cpuUsage.user + metric.cpuUsage.system) / 1000; // microseconds to ms
      const wallTime = 30000; // Assuming 30s interval
      totalCpu += (cpuTime / wallTime) * 100;

      if (metric.eventLoopLag) {
        totalLag += metric.eventLoopLag;
      }
    }

    return {
      current,
      average: {
        memoryUsageMB: totalMemory / this.metrics.length,
        cpuPercent: totalCpu / this.metrics.length,
        eventLoopLagMs: totalLag / this.metrics.length
      },
      peak: {
        memoryUsageMB: peakMemory,
        timestamp: peakTimestamp
      },
      samples: this.metrics.length
    };
  }

  /**
   * Checks performance thresholds and triggers alerts
   */
  private checkThresholds(metrics: PerformanceMetrics): void {
    // Check memory threshold
    if (metrics.memoryUsageMB > this.config.memoryThresholdMB) {
      this.config.onAlert('memory', metrics);

      // Throw error if critically high
      if (metrics.memoryUsageMB > this.config.memoryThresholdMB * 1.5) {
        throw new MemoryThresholdError(
          metrics.memoryUsageMB,
          this.config.memoryThresholdMB
        );
      }
    }

    // Check event loop lag
    if (metrics.eventLoopLag && metrics.eventLoopLag > this.config.eventLoopLagMs) {
      this.config.onAlert('eventloop', metrics);
    }

    // Estimate and check CPU usage
    if (this.metrics.length >= 2) {
      const prevMetrics = this.metrics[this.metrics.length - 2];
      if (prevMetrics) {
        const timeDelta = metrics.timestamp - prevMetrics.timestamp;
        const cpuDelta = (
          (metrics.cpuUsage.user - prevMetrics.cpuUsage.user) +
          (metrics.cpuUsage.system - prevMetrics.cpuUsage.system)
        ) / 1000; // microseconds to milliseconds

        const cpuPercent = (cpuDelta / timeDelta) * 100;

        if (cpuPercent > this.config.cpuThresholdPercent) {
          this.config.onAlert('cpu', { ...metrics, cpuPercent } as any);
        }
      }
    }
  }

  /**
   * Measures event loop lag
   */
  private measureEventLoopLag(): number | undefined {
    // Simple event loop lag measurement
    const start = Date.now();

    setImmediate(() => {
      const lag = Date.now() - start;
      if (this.metrics.length > 0) {
        const lastMetric = this.metrics[this.metrics.length - 1];
        if (lastMetric) {
          lastMetric.eventLoopLag = lag;
        }
      }
    });

    // Return previous measurement
    if (this.metrics.length > 0) {
      const lastMetric = this.metrics[this.metrics.length - 1];
      return lastMetric ? lastMetric.eventLoopLag : undefined;
    }
    return undefined;
  }

  /**
   * Forces garbage collection if available (requires --expose-gc flag)
   */
  forceGarbageCollection(): void {
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Gets memory usage summary
   */
  getMemorySummary(): {
    current: number;
    threshold: number;
    percentage: number;
    status: 'ok' | 'warning' | 'critical';
  } {
    const current = this.getCurrentMetrics();
    if (!current) {
      return {
        current: 0,
        threshold: this.config.memoryThresholdMB,
        percentage: 0,
        status: 'ok'
      };
    }

    const percentage = (current.memoryUsageMB / this.config.memoryThresholdMB) * 100;
    let status: 'ok' | 'warning' | 'critical' = 'ok';

    if (percentage >= 150) {
      status = 'critical';
    } else if (percentage >= 100) {
      status = 'warning';
    }

    return {
      current: current.memoryUsageMB,
      threshold: this.config.memoryThresholdMB,
      percentage,
      status
    };
  }

  /**
   * Resets collected metrics
   */
  reset(): void {
    this.metrics = [];
    this.lastCpuUsage = process.cpuUsage();
  }
}

/**
 * Global performance monitor instance
 */
export const globalPerformanceMonitor = new PerformanceMonitor();

/**
 * Decorator for monitoring method performance
 */
export function MonitorPerformance(name?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const methodName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      try {
        const result = await originalMethod.apply(this, args);

        const duration = Date.now() - startTime;
        const memoryDelta = process.memoryUsage().heapUsed - startMemory;

        console.debug(`[Performance] ${methodName}: ${duration}ms, ${(memoryDelta / 1024 / 1024).toFixed(2)}MB`);

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[Performance] ${methodName} failed after ${duration}ms:`, error);
        throw error;
      }
    };

    return descriptor;
  };
}