/**
 * Unit tests for PerformanceMonitor service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceMonitor } from '../../src/services/performance-monitor.js';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor(300); // 300ms timeout
  });

  describe('Timing tracking', () => {
    it('should track timing for a single phase', async () => {
      monitor.startTimer('test-phase');

      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 10));

      const elapsed = monitor.stopTimer('test-phase');

      expect(elapsed).toBeGreaterThan(0);
      expect(elapsed).toBeGreaterThanOrEqual(10);
    });

    it('should track multiple phases independently', async () => {
      monitor.startTimer('phase1');
      await new Promise(resolve => setTimeout(resolve, 10));
      const time1 = monitor.stopTimer('phase1');

      monitor.startTimer('phase2');
      await new Promise(resolve => setTimeout(resolve, 5));
      const time2 = monitor.stopTimer('phase2');

      expect(time1).toBeGreaterThan(0);
      expect(time2).toBeGreaterThan(0);
      expect(time1).toBeGreaterThan(time2);
    });

    it('should allow restarting the same phase', async () => {
      monitor.startTimer('test');
      await new Promise(resolve => setTimeout(resolve, 5));
      monitor.stopTimer('test');

      monitor.startTimer('test');
      await new Promise(resolve => setTimeout(resolve, 5));
      const time = monitor.stopTimer('test');

      // Second timing should be fresh
      expect(time).toBeGreaterThan(0);
    });
  });

  describe('Metrics collection', () => {
    it('should collect all timing metrics', async () => {
      monitor.startTimer('lexicalSearch');
      await new Promise(resolve => setTimeout(resolve, 50));
      monitor.stopTimer('lexicalSearch');

      monitor.startTimer('vectorSearch');
      await new Promise(resolve => setTimeout(resolve, 80));
      monitor.stopTimer('vectorSearch');

      monitor.startTimer('ranking');
      await new Promise(resolve => setTimeout(resolve, 20));
      monitor.stopTimer('ranking');

      const metrics = monitor.getMetrics();

      expect(metrics.lexicalSearchTimeMs).toBeGreaterThanOrEqual(50);
      expect(metrics.vectorSearchTimeMs).toBeGreaterThanOrEqual(80);
      expect(metrics.rankingTimeMs).toBeGreaterThanOrEqual(20);
      expect(metrics.totalTimeMs).toBeGreaterThanOrEqual(150);
    });

    it('should calculate total time correctly', async () => {
      monitor.startTimer('lexicalSearch');
      await new Promise(resolve => setTimeout(resolve, 10));
      monitor.stopTimer('lexicalSearch');

      monitor.startTimer('vectorSearch');
      await new Promise(resolve => setTimeout(resolve, 10));
      monitor.stopTimer('vectorSearch');

      const metrics = monitor.getMetrics();

      // Total should be sum of all phases
      expect(metrics.totalTimeMs).toBeGreaterThanOrEqual(
        metrics.lexicalSearchTimeMs + metrics.vectorSearchTimeMs
      );
    });

    it('should include candidate counts in metrics', () => {
      monitor.recordCandidateCounts(150, 200);

      const metrics = monitor.getMetrics();

      expect(metrics.lexicalCandidates).toBe(150);
      expect(metrics.vectorCandidates).toBe(200);
      expect(metrics.uniqueCandidates).toBe(350); // Default sum
    });

    it('should allow setting unique candidate count', () => {
      monitor.recordCandidateCounts(150, 200, 280); // 280 unique after dedup

      const metrics = monitor.getMetrics();

      expect(metrics.uniqueCandidates).toBe(280);
    });
  });

  describe('SLA violation detection', () => {
    it('should detect SLA violation when total time exceeds timeout', async () => {
      const shortMonitor = new PerformanceMonitor(50); // 50ms timeout

      shortMonitor.startTimer('lexicalSearch');
      await new Promise(resolve => setTimeout(resolve, 60));
      shortMonitor.stopTimer('lexicalSearch');

      const metrics = shortMonitor.getMetrics();

      expect(metrics.slaViolation).toBe(true);
    });

    it('should not flag violation when within timeout', async () => {
      monitor.startTimer('lexicalSearch');
      await new Promise(resolve => setTimeout(resolve, 10));
      monitor.stopTimer('lexicalSearch');

      const metrics = monitor.getMetrics();

      expect(metrics.slaViolation).toBe(false);
    });
  });

  describe('Fallback mode tracking', () => {
    it('should track lexical fallback mode', () => {
      monitor.setFallbackMode('lexical');

      const metrics = monitor.getMetrics();

      expect(metrics.fallbackMode).toBe('lexical');
    });

    it('should track vector fallback mode', () => {
      monitor.setFallbackMode('vector');

      const metrics = monitor.getMetrics();

      expect(metrics.fallbackMode).toBe('vector');
    });

    it('should have no fallback mode by default', () => {
      const metrics = monitor.getMetrics();

      expect(metrics.fallbackMode).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle stopping timer that was never started', () => {
      const time = monitor.stopTimer('nonexistent');

      expect(time).toBe(0);
    });

    it('should handle missing phase times gracefully', () => {
      const metrics = monitor.getMetrics();

      expect(metrics.lexicalSearchTimeMs).toBe(0);
      expect(metrics.vectorSearchTimeMs).toBe(0);
      expect(metrics.rankingTimeMs).toBe(0);
      expect(metrics.totalTimeMs).toBe(0);
    });

    it('should handle concurrent timing requests', async () => {
      monitor.startTimer('phase1');
      monitor.startTimer('phase2');

      await new Promise(resolve => setTimeout(resolve, 10));

      const time1 = monitor.stopTimer('phase1');
      const time2 = monitor.stopTimer('phase2');

      expect(time1).toBeGreaterThan(0);
      expect(time2).toBeGreaterThan(0);
    });

    it('should handle zero candidates', () => {
      monitor.recordCandidateCounts(0, 0);

      const metrics = monitor.getMetrics();

      expect(metrics.lexicalCandidates).toBe(0);
      expect(metrics.vectorCandidates).toBe(0);
      expect(metrics.uniqueCandidates).toBe(0);
    });
  });

  describe('Reset functionality', () => {
    it('should reset all metrics', async () => {
      monitor.startTimer('lexicalSearch');
      await new Promise(resolve => setTimeout(resolve, 10));
      monitor.stopTimer('lexicalSearch');

      monitor.recordCandidateCounts(100, 200);
      monitor.setFallbackMode('lexical');

      monitor.reset();

      const metrics = monitor.getMetrics();

      expect(metrics.lexicalSearchTimeMs).toBe(0);
      expect(metrics.totalTimeMs).toBe(0);
      expect(metrics.lexicalCandidates).toBe(0);
      expect(metrics.fallbackMode).toBeUndefined();
      expect(metrics.slaViolation).toBe(false);
    });
  });
});
