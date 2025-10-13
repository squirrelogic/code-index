/**
 * Performance benchmarking utilities for the file watcher and indexing operations
 */

export interface BenchmarkMetrics {
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  filesProcessed: number;
  bytesProcessed: number;
  memoryUsage: MemoryMetrics;
  throughput: ThroughputMetrics;
}

export interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export interface ThroughputMetrics {
  filesPerSecond: number;
  bytesPerSecond: number;
  mbPerSecond: number;
}

export interface BenchmarkSummary {
  totalOperations: number;
  totalDuration: number;
  totalFiles: number;
  totalBytes: number;
  averageFilesPerSecond: number;
  averageMbPerSecond: number;
  peakMemoryMb: number;
}

/**
 * Tracks performance metrics for indexing and watcher operations
 */
export class Benchmarker {
  private metrics: BenchmarkMetrics[] = [];
  private startTime: number | null = null;
  private startMemory: MemoryMetrics | null = null;
  private filesProcessed: number = 0;
  private bytesProcessed: number = 0;

  /**
   * Start tracking a new operation
   */
  start(_operation: string): void {
    this.startTime = Date.now();
    this.startMemory = this.getMemoryMetrics();
    this.filesProcessed = 0;
    this.bytesProcessed = 0;
  }

  /**
   * Record progress during an operation
   */
  recordProgress(files: number, bytes: number): void {
    this.filesProcessed += files;
    this.bytesProcessed += bytes;
  }

  /**
   * Stop tracking and save metrics
   */
  stop(operation: string): BenchmarkMetrics {
    if (!this.startTime || !this.startMemory) {
      throw new Error('Benchmark not started. Call start() first.');
    }

    const endTime = Date.now();
    const duration = endTime - this.startTime;
    const endMemory = this.getMemoryMetrics();

    const throughput = this.calculateThroughput(
      this.filesProcessed,
      this.bytesProcessed,
      duration
    );

    const metrics: BenchmarkMetrics = {
      operation,
      startTime: this.startTime,
      endTime,
      duration,
      filesProcessed: this.filesProcessed,
      bytesProcessed: this.bytesProcessed,
      memoryUsage: endMemory,
      throughput
    };

    this.metrics.push(metrics);

    // Reset for next operation
    this.startTime = null;
    this.startMemory = null;
    this.filesProcessed = 0;
    this.bytesProcessed = 0;

    return metrics;
  }

  /**
   * Get summary of all tracked operations
   */
  getSummary(): BenchmarkSummary {
    if (this.metrics.length === 0) {
      return {
        totalOperations: 0,
        totalDuration: 0,
        totalFiles: 0,
        totalBytes: 0,
        averageFilesPerSecond: 0,
        averageMbPerSecond: 0,
        peakMemoryMb: 0
      };
    }

    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    const totalFiles = this.metrics.reduce((sum, m) => sum + m.filesProcessed, 0);
    const totalBytes = this.metrics.reduce((sum, m) => sum + m.bytesProcessed, 0);
    const peakMemoryBytes = Math.max(...this.metrics.map(m => m.memoryUsage.heapUsed));

    const averageFilesPerSecond = totalDuration > 0
      ? (totalFiles / totalDuration) * 1000
      : 0;
    const averageMbPerSecond = totalDuration > 0
      ? ((totalBytes / (1024 * 1024)) / totalDuration) * 1000
      : 0;

    return {
      totalOperations: this.metrics.length,
      totalDuration,
      totalFiles,
      totalBytes,
      averageFilesPerSecond,
      averageMbPerSecond,
      peakMemoryMb: peakMemoryBytes / (1024 * 1024)
    };
  }

  /**
   * Get all collected metrics
   */
  getMetrics(): BenchmarkMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear all collected metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Format metrics as human-readable string
   */
  formatMetrics(metrics: BenchmarkMetrics): string {
    const durationSec = (metrics.duration / 1000).toFixed(2);
    const memoryMb = (metrics.memoryUsage.heapUsed / (1024 * 1024)).toFixed(2);

    return [
      `Operation: ${metrics.operation}`,
      `Duration: ${durationSec}s`,
      `Files: ${metrics.filesProcessed}`,
      `Throughput: ${metrics.throughput.filesPerSecond.toFixed(2)} files/s`,
      `Speed: ${metrics.throughput.mbPerSecond.toFixed(2)} MB/s`,
      `Memory: ${memoryMb} MB`
    ].join('\n');
  }

  /**
   * Format summary as human-readable string
   */
  formatSummary(summary: BenchmarkSummary): string {
    const totalDurationSec = (summary.totalDuration / 1000).toFixed(2);
    const totalMb = (summary.totalBytes / (1024 * 1024)).toFixed(2);

    return [
      `=== Performance Summary ===`,
      `Total Operations: ${summary.totalOperations}`,
      `Total Duration: ${totalDurationSec}s`,
      `Total Files: ${summary.totalFiles}`,
      `Total Size: ${totalMb} MB`,
      `Average Speed: ${summary.averageFilesPerSecond.toFixed(2)} files/s`,
      `Average Throughput: ${summary.averageMbPerSecond.toFixed(2)} MB/s`,
      `Peak Memory: ${summary.peakMemoryMb.toFixed(2)} MB`
    ].join('\n');
  }

  /**
   * Get current memory metrics
   */
  private getMemoryMetrics(): MemoryMetrics {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss
    };
  }

  /**
   * Calculate throughput metrics
   */
  private calculateThroughput(
    files: number,
    bytes: number,
    durationMs: number
  ): ThroughputMetrics {
    if (durationMs === 0) {
      return {
        filesPerSecond: 0,
        bytesPerSecond: 0,
        mbPerSecond: 0
      };
    }

    const durationSec = durationMs / 1000;
    const filesPerSecond = files / durationSec;
    const bytesPerSecond = bytes / durationSec;
    const mbPerSecond = bytesPerSecond / (1024 * 1024);

    return {
      filesPerSecond,
      bytesPerSecond,
      mbPerSecond
    };
  }
}

/**
 * Global benchmarker instance for convenience
 */
export const globalBenchmarker = new Benchmarker();
