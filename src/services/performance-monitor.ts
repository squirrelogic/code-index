/**
 * Performance monitoring service for hybrid search
 *
 * @module performance-monitor
 */

import fs from 'node:fs';
import path from 'node:path';
import type { PerformanceMetrics } from '../models/hybrid-search-result.js';

/**
 * PerformanceMonitor tracks timing and metrics for hybrid search operations
 *
 * Features:
 * - Per-phase timing (lexical, vector, ranking)
 * - SLA violation detection
 * - Fallback mode tracking
 * - Candidate count tracking
 */
export class PerformanceMonitor {
  private timeoutMs: number;
  private timers: Map<string, number>;
  private phaseTimes: Map<string, number>;
  private lexicalCandidates: number;
  private vectorCandidates: number;
  private uniqueCandidates: number;
  private fallbackMode?: 'lexical' | 'vector';

  /**
   * Create a new PerformanceMonitor
   *
   * @param timeoutMs - SLA timeout in milliseconds (default: 300)
   */
  constructor(timeoutMs: number = 300) {
    this.timeoutMs = timeoutMs;
    this.timers = new Map();
    this.phaseTimes = new Map();
    this.lexicalCandidates = 0;
    this.vectorCandidates = 0;
    this.uniqueCandidates = 0;
  }

  /**
   * Start timing a phase
   *
   * @param phase - Phase name (e.g., 'lexicalSearch', 'vectorSearch', 'ranking')
   */
  startTimer(phase: string): void {
    this.timers.set(phase, performance.now());
  }

  /**
   * Stop timing a phase and record elapsed time
   *
   * @param phase - Phase name
   * @returns Elapsed time in milliseconds
   */
  stopTimer(phase: string): number {
    const startTime = this.timers.get(phase);

    if (startTime === undefined) {
      return 0; // Timer never started
    }

    const elapsed = performance.now() - startTime;
    this.phaseTimes.set(phase, elapsed);
    this.timers.delete(phase);

    return elapsed;
  }

  /**
   * Record candidate counts from search phases
   *
   * @param lexical - Number of lexical candidates
   * @param vector - Number of vector candidates
   * @param unique - Number of unique candidates after deduplication (optional)
   */
  recordCandidateCounts(lexical: number, vector: number, unique?: number): void {
    this.lexicalCandidates = lexical;
    this.vectorCandidates = vector;
    this.uniqueCandidates = unique !== undefined ? unique : lexical + vector;
  }

  /**
   * Set fallback mode indicator
   *
   * @param mode - 'lexical' or 'vector' depending on which component returned results
   */
  setFallbackMode(mode: 'lexical' | 'vector'): void {
    this.fallbackMode = mode;
  }

  /**
   * Get complete performance metrics
   *
   * @returns Performance metrics object
   */
  getMetrics(): PerformanceMetrics {
    const lexicalSearchTimeMs = this.phaseTimes.get('lexicalSearch') || 0;
    const vectorSearchTimeMs = this.phaseTimes.get('vectorSearch') || 0;
    const rankingTimeMs = this.phaseTimes.get('ranking') || 0;

    // Calculate total time
    const totalTimeMs = lexicalSearchTimeMs + vectorSearchTimeMs + rankingTimeMs;

    // Detect SLA violation
    const slaViolation = totalTimeMs > this.timeoutMs;

    return {
      lexicalSearchTimeMs,
      vectorSearchTimeMs,
      rankingTimeMs,
      totalTimeMs,
      lexicalCandidates: this.lexicalCandidates,
      vectorCandidates: this.vectorCandidates,
      uniqueCandidates: this.uniqueCandidates,
      slaViolation,
      fallbackMode: this.fallbackMode,
    };
  }

  /**
   * Reset all metrics and timers
   *
   * Useful for reusing the same monitor instance
   */
  reset(): void {
    this.timers.clear();
    this.phaseTimes.clear();
    this.lexicalCandidates = 0;
    this.vectorCandidates = 0;
    this.uniqueCandidates = 0;
    this.fallbackMode = undefined;
  }

  /**
   * Get total elapsed time so far
   *
   * Useful for checking if approaching timeout
   *
   * @returns Total time in milliseconds
   */
  getTotalTime(): number {
    let total = 0;
    for (const time of this.phaseTimes.values()) {
      total += time;
    }
    return total;
  }

  /**
   * Check if approaching SLA timeout
   *
   * @param bufferMs - Buffer time in milliseconds (default: 50)
   * @returns True if within buffer of timeout
   */
  isApproachingTimeout(bufferMs: number = 50): boolean {
    return this.getTotalTime() >= (this.timeoutMs - bufferMs);
  }

  /**
   * Log performance metrics to JSON lines file
   *
   * Writes to .codeindex/logs/search-performance.jsonl
   *
   * @param query - The search query
   * @param logDir - Log directory (default: '.codeindex/logs')
   */
  logMetrics(query: string, logDir: string = '.codeindex/logs'): void {
    const metrics = this.getMetrics();

    // Prepare log entry
    const logEntry = {
      timestamp: new Date().toISOString(),
      query,
      metrics: {
        lexicalSearchTimeMs: metrics.lexicalSearchTimeMs,
        vectorSearchTimeMs: metrics.vectorSearchTimeMs,
        rankingTimeMs: metrics.rankingTimeMs,
        totalTimeMs: metrics.totalTimeMs,
        lexicalCandidates: metrics.lexicalCandidates,
        vectorCandidates: metrics.vectorCandidates,
        uniqueCandidates: metrics.uniqueCandidates,
        slaViolation: metrics.slaViolation,
        fallbackMode: metrics.fallbackMode || null,
      },
    };

    // Determine log level based on SLA violation
    const logLevel = metrics.slaViolation ? 'WARN' : 'INFO';
    const logEntryWithLevel = { level: logLevel, ...logEntry };

    try {
      // Ensure log directory exists
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Append to JSON lines file
      const logPath = path.join(logDir, 'search-performance.jsonl');
      const logLine = JSON.stringify(logEntryWithLevel) + '\n';
      fs.appendFileSync(logPath, logLine, 'utf-8');
    } catch (error) {
      // Log to stderr if file logging fails (don't crash)
      console.error('Failed to write performance log:', error);
    }
  }
}
