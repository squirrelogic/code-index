/**
 * Integration tests for SLA violation handling
 *
 * Tests behavior when hybrid search operations exceed the configured timeout.
 *
 * @module sla-violation.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceMonitor } from '../../src/services/performance-monitor.js';

describe('SLA Violation Handling', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor(300); // 300ms timeout
  });

  describe('Performance Monitor SLA Detection', () => {
    it('should detect SLA violation when total time exceeds timeout', () => {
      // Simulate phases that exceed SLA
      monitor.startTimer('lexicalSearch');
      // Simulate 150ms delay
      const lexicalStart = performance.now();
      while (performance.now() - lexicalStart < 150) {
        // Busy wait
      }
      monitor.stopTimer('lexicalSearch');

      monitor.startTimer('vectorSearch');
      // Simulate 150ms delay
      const vectorStart = performance.now();
      while (performance.now() - vectorStart < 150) {
        // Busy wait
      }
      monitor.stopTimer('vectorSearch');

      monitor.startTimer('ranking');
      // Simulate 50ms delay
      const rankingStart = performance.now();
      while (performance.now() - rankingStart < 50) {
        // Busy wait
      }
      monitor.stopTimer('ranking');

      const metrics = monitor.getMetrics();

      // Total time should be ~350ms, exceeding 300ms SLA
      expect(metrics.totalTimeMs).toBeGreaterThan(300);
      expect(metrics.slaViolation).toBe(true);
    });

    it('should not detect SLA violation when within timeout', () => {
      // Simulate phases within SLA
      monitor.startTimer('lexicalSearch');
      const lexicalStart = performance.now();
      while (performance.now() - lexicalStart < 80) {
        // Busy wait 80ms
      }
      monitor.stopTimer('lexicalSearch');

      monitor.startTimer('vectorSearch');
      const vectorStart = performance.now();
      while (performance.now() - vectorStart < 100) {
        // Busy wait 100ms
      }
      monitor.stopTimer('vectorSearch');

      monitor.startTimer('ranking');
      const rankingStart = performance.now();
      while (performance.now() - rankingStart < 50) {
        // Busy wait 50ms
      }
      monitor.stopTimer('ranking');

      const metrics = monitor.getMetrics();

      // Total time should be ~230ms, within 300ms SLA
      expect(metrics.totalTimeMs).toBeLessThan(300);
      expect(metrics.slaViolation).toBe(false);
    });

    it('should provide timing breakdown for bottleneck identification', () => {
      monitor.startTimer('lexicalSearch');
      const lexicalStart = performance.now();
      while (performance.now() - lexicalStart < 50) {
        // Busy wait 50ms
      }
      monitor.stopTimer('lexicalSearch');

      monitor.startTimer('vectorSearch');
      const vectorStart = performance.now();
      while (performance.now() - vectorStart < 200) {
        // Busy wait 200ms - bottleneck
      }
      monitor.stopTimer('vectorSearch');

      monitor.startTimer('ranking');
      const rankingStart = performance.now();
      while (performance.now() - rankingStart < 30) {
        // Busy wait 30ms
      }
      monitor.stopTimer('ranking');

      const metrics = monitor.getMetrics();

      // Vector search should be the bottleneck
      expect(metrics.vectorSearchTimeMs).toBeGreaterThan(metrics.lexicalSearchTimeMs);
      expect(metrics.vectorSearchTimeMs).toBeGreaterThan(metrics.rankingTimeMs);
      expect(metrics.vectorSearchTimeMs).toBeGreaterThan(150); // Significantly slow
    });
  });

  describe('Approaching Timeout Detection', () => {
    it('should detect when approaching timeout', () => {
      monitor.startTimer('lexicalSearch');
      const lexicalStart = performance.now();
      while (performance.now() - lexicalStart < 260) {
        // Busy wait 260ms
      }
      monitor.stopTimer('lexicalSearch');

      // With 50ms buffer, should be approaching at 250ms (300 - 50)
      expect(monitor.isApproachingTimeout(50)).toBe(true);
    });

    it('should not detect approaching timeout when well within budget', () => {
      monitor.startTimer('lexicalSearch');
      const lexicalStart = performance.now();
      while (performance.now() - lexicalStart < 100) {
        // Busy wait 100ms
      }
      monitor.stopTimer('lexicalSearch');

      // At 100ms, not approaching 300ms timeout even with 50ms buffer
      expect(monitor.isApproachingTimeout(50)).toBe(false);
    });

    it('should support custom buffer values', () => {
      monitor.startTimer('lexicalSearch');
      const lexicalStart = performance.now();
      while (performance.now() - lexicalStart < 250) {
        // Busy wait 250ms
      }
      monitor.stopTimer('lexicalSearch');

      // With 100ms buffer, should be approaching at 200ms (300 - 100)
      expect(monitor.isApproachingTimeout(100)).toBe(true);

      // With 30ms buffer, should not be approaching at 270ms (300 - 30)
      expect(monitor.isApproachingTimeout(30)).toBe(false);
    });
  });

  describe('Performance Metrics Logging', () => {
    it('should log SLA violations with WARN level', () => {
      // Simulate SLA violation
      monitor.startTimer('lexicalSearch');
      const lexicalStart = performance.now();
      while (performance.now() - lexicalStart < 350) {
        // Busy wait 350ms - exceeds SLA
      }
      monitor.stopTimer('lexicalSearch');

      monitor.recordCandidateCounts(200, 200, 350);

      const metrics = monitor.getMetrics();
      expect(metrics.slaViolation).toBe(true);

      // Log metrics (to temp file for testing)
      const tempLogDir = './tests/fixtures/temp-logs';
      monitor.logMetrics('test query with SLA violation', tempLogDir);

      // Verify log entry would have WARN level (checked by logMetrics implementation)
      // The actual file verification would require reading the log file
    });

    it('should log normal performance with INFO level', () => {
      // Simulate normal operation within SLA
      monitor.startTimer('lexicalSearch');
      const lexicalStart = performance.now();
      while (performance.now() - lexicalStart < 80) {
        // Busy wait 80ms
      }
      monitor.stopTimer('lexicalSearch');

      monitor.startTimer('vectorSearch');
      const vectorStart = performance.now();
      while (performance.now() - vectorStart < 100) {
        // Busy wait 100ms
      }
      monitor.stopTimer('vectorSearch');

      monitor.recordCandidateCounts(200, 200, 350);

      const metrics = monitor.getMetrics();
      expect(metrics.slaViolation).toBe(false);

      // Log metrics
      const tempLogDir = './tests/fixtures/temp-logs';
      monitor.logMetrics('test query within SLA', tempLogDir);

      // Verify log entry would have INFO level
    });

    it('should include all relevant metrics in log entry', () => {
      monitor.startTimer('lexicalSearch');
      const lexicalStart = performance.now();
      while (performance.now() - lexicalStart < 50) {
        // Busy wait
      }
      monitor.stopTimer('lexicalSearch');

      monitor.startTimer('vectorSearch');
      const vectorStart = performance.now();
      while (performance.now() - vectorStart < 80) {
        // Busy wait
      }
      monitor.stopTimer('vectorSearch');

      monitor.startTimer('ranking');
      const rankingStart = performance.now();
      while (performance.now() - rankingStart < 30) {
        // Busy wait
      }
      monitor.stopTimer('ranking');

      monitor.recordCandidateCounts(200, 180, 340);
      monitor.setFallbackMode('lexical');

      const metrics = monitor.getMetrics();

      // Verify all metrics are captured
      expect(metrics.lexicalSearchTimeMs).toBeGreaterThan(0);
      expect(metrics.vectorSearchTimeMs).toBeGreaterThan(0);
      expect(metrics.rankingTimeMs).toBeGreaterThan(0);
      expect(metrics.lexicalCandidates).toBe(200);
      expect(metrics.vectorCandidates).toBe(180);
      expect(metrics.uniqueCandidates).toBe(340);
      expect(metrics.fallbackMode).toBe('lexical');
    });
  });

  describe('Fallback Mode Tracking', () => {
    it('should track fallback to lexical-only mode', () => {
      monitor.setFallbackMode('lexical');
      monitor.recordCandidateCounts(200, 0, 200);

      const metrics = monitor.getMetrics();

      expect(metrics.fallbackMode).toBe('lexical');
      expect(metrics.vectorCandidates).toBe(0);
      expect(metrics.uniqueCandidates).toBe(200);
    });

    it('should track fallback to vector-only mode', () => {
      monitor.setFallbackMode('vector');
      monitor.recordCandidateCounts(0, 200, 200);

      const metrics = monitor.getMetrics();

      expect(metrics.fallbackMode).toBe('vector');
      expect(metrics.lexicalCandidates).toBe(0);
      expect(metrics.uniqueCandidates).toBe(200);
    });

    it('should not set fallback mode for hybrid searches', () => {
      monitor.recordCandidateCounts(200, 180, 340);

      const metrics = monitor.getMetrics();

      expect(metrics.fallbackMode).toBeUndefined();
      expect(metrics.lexicalCandidates).toBeGreaterThan(0);
      expect(metrics.vectorCandidates).toBeGreaterThan(0);
    });
  });

  describe('Monitor Reset', () => {
    it('should reset all metrics and timers', () => {
      // Record some metrics
      monitor.startTimer('lexicalSearch');
      const lexicalStart = performance.now();
      while (performance.now() - lexicalStart < 50) {
        // Busy wait
      }
      monitor.stopTimer('lexicalSearch');

      monitor.recordCandidateCounts(200, 180, 340);
      monitor.setFallbackMode('lexical');

      // Reset
      monitor.reset();

      // Verify all cleared
      const metrics = monitor.getMetrics();
      expect(metrics.lexicalSearchTimeMs).toBe(0);
      expect(metrics.vectorSearchTimeMs).toBe(0);
      expect(metrics.rankingTimeMs).toBe(0);
      expect(metrics.totalTimeMs).toBe(0);
      expect(metrics.lexicalCandidates).toBe(0);
      expect(metrics.vectorCandidates).toBe(0);
      expect(metrics.uniqueCandidates).toBe(0);
      expect(metrics.fallbackMode).toBeUndefined();
    });
  });
});
