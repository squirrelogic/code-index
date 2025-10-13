/**
 * Health checking service for the code-index system
 * Verifies watcher status, database connectivity, and file system access
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'warning' | 'unhealthy';
  message: string;
  details?: any;
}

export interface HealthReport {
  overall: 'healthy' | 'warning' | 'unhealthy';
  timestamp: number;
  checks: HealthCheck[];
  summary: string;
}

export interface HealthCheckerOptions {
  projectRoot: string;
  dbPath: string;
  logPath: string;
}

/**
 * Performs comprehensive health checks on the code-index system
 */
export class HealthChecker {
  constructor(private options: HealthCheckerOptions) {}

  /**
   * Run all health checks and generate a report
   */
  async checkHealth(): Promise<HealthReport> {
    const checks: HealthCheck[] = [];

    // Run all checks in parallel
    const [
      watcherCheck,
      dbCheck,
      fsCheck,
      memoryCheck,
      diskCheck,
      logCheck
    ] = await Promise.all([
      this.checkWatcherStatus(),
      this.checkDatabaseConnectivity(),
      this.checkFileSystemAccess(),
      this.checkMemoryUsage(),
      this.checkDiskSpace(),
      this.checkLogFiles()
    ]);

    checks.push(watcherCheck, dbCheck, fsCheck, memoryCheck, diskCheck, logCheck);

    // Determine overall health
    const unhealthyCount = checks.filter(c => c.status === 'unhealthy').length;
    const warningCount = checks.filter(c => c.status === 'warning').length;

    let overall: 'healthy' | 'warning' | 'unhealthy';
    let summary: string;

    if (unhealthyCount > 0) {
      overall = 'unhealthy';
      summary = `${unhealthyCount} critical issue(s) detected`;
    } else if (warningCount > 0) {
      overall = 'warning';
      summary = `${warningCount} warning(s) detected`;
    } else {
      overall = 'healthy';
      summary = 'All systems operational';
    }

    return {
      overall,
      timestamp: Date.now(),
      checks,
      summary
    };
  }

  /**
   * Check watcher status from database
   */
  private async checkWatcherStatus(): Promise<HealthCheck> {
    try {
      const Database = require('better-sqlite3');
      const db = new Database(this.options.dbPath, { readonly: true });

      try {
        const state = db.prepare(`
          SELECT watching, last_event_at, events_processed, memory_usage
          FROM watcher_state
          WHERE id = 1
        `).get() as any;

        db.close();

        if (!state) {
          return {
            name: 'Watcher Status',
            status: 'warning',
            message: 'Watcher has never been started',
            details: { initialized: false }
          };
        }

        const isActive = state.watching === 1;
        const lastEventAgo = state.last_event_at
          ? Date.now() - state.last_event_at
          : null;

        const details = {
          active: isActive,
          eventsProcessed: state.events_processed,
          memoryUsageMb: state.memory_usage ? (state.memory_usage / (1024 * 1024)).toFixed(2) : null,
          lastEventAgo: lastEventAgo ? `${Math.floor(lastEventAgo / 1000)}s ago` : 'never'
        };

        if (isActive) {
          return {
            name: 'Watcher Status',
            status: 'healthy',
            message: 'Watcher is active and processing events',
            details
          };
        } else {
          return {
            name: 'Watcher Status',
            status: 'warning',
            message: 'Watcher is not currently active',
            details
          };
        }
      } finally {
        db.close();
      }
    } catch (error: any) {
      return {
        name: 'Watcher Status',
        status: 'unhealthy',
        message: `Failed to check watcher status: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Check database connectivity and integrity
   */
  private async checkDatabaseConnectivity(): Promise<HealthCheck> {
    try {
      const Database = require('better-sqlite3');
      const db = new Database(this.options.dbPath, { readonly: true });

      try {
        // Test basic query
        const result = db.prepare('SELECT COUNT(*) as count FROM index_entries').get() as any;
        const indexedFiles = result.count;

        // Check database file size
        const stats = await fs.stat(this.options.dbPath);
        const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

        // Run integrity check
        const integrityResult = db.prepare('PRAGMA integrity_check').get() as any;
        const isIntact = integrityResult.integrity_check === 'ok';

        db.close();

        if (!isIntact) {
          return {
            name: 'Database Connectivity',
            status: 'unhealthy',
            message: 'Database integrity check failed',
            details: { integrityCheck: integrityResult }
          };
        }

        return {
          name: 'Database Connectivity',
          status: 'healthy',
          message: `Database is healthy with ${indexedFiles} indexed files`,
          details: {
            indexedFiles,
            sizeMb: `${sizeMb} MB`,
            integrity: 'ok'
          }
        };
      } finally {
        db.close();
      }
    } catch (error: any) {
      return {
        name: 'Database Connectivity',
        status: 'unhealthy',
        message: `Failed to connect to database: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Check file system access permissions
   */
  private async checkFileSystemAccess(): Promise<HealthCheck> {
    try {
      // Test read access
      await fs.access(this.options.projectRoot, fs.constants.R_OK);

      // Test write access to .codeindex directory
      const codeindexDir = path.join(this.options.projectRoot, '.codeindex');
      await fs.access(codeindexDir, fs.constants.W_OK);

      // Test creating/removing a test file
      const testFile = path.join(codeindexDir, '.health-check-test');
      try {
        await fs.writeFile(testFile, 'test', 'utf-8');
        await fs.unlink(testFile);
      } catch (error: any) {
        return {
          name: 'File System Access',
          status: 'unhealthy',
          message: `Cannot write to .codeindex directory: ${error.message}`,
          details: { error: error.message }
        };
      }

      return {
        name: 'File System Access',
        status: 'healthy',
        message: 'File system is accessible with read/write permissions',
        details: { projectRoot: this.options.projectRoot }
      };
    } catch (error: any) {
      return {
        name: 'File System Access',
        status: 'unhealthy',
        message: `File system access error: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Check current memory usage
   */
  private async checkMemoryUsage(): Promise<HealthCheck> {
    const usage = process.memoryUsage();
    const heapUsedMb = usage.heapUsed / (1024 * 1024);
    const heapTotalMb = usage.heapTotal / (1024 * 1024);
    const rssMb = usage.rss / (1024 * 1024);

    const WARNING_THRESHOLD = 400; // MB
    const CRITICAL_THRESHOLD = 500; // MB

    const details = {
      heapUsedMb: heapUsedMb.toFixed(2),
      heapTotalMb: heapTotalMb.toFixed(2),
      rssMb: rssMb.toFixed(2)
    };

    if (heapUsedMb > CRITICAL_THRESHOLD) {
      return {
        name: 'Memory Usage',
        status: 'unhealthy',
        message: `Critical memory usage: ${heapUsedMb.toFixed(2)} MB (threshold: ${CRITICAL_THRESHOLD} MB)`,
        details
      };
    } else if (heapUsedMb > WARNING_THRESHOLD) {
      return {
        name: 'Memory Usage',
        status: 'warning',
        message: `High memory usage: ${heapUsedMb.toFixed(2)} MB (threshold: ${WARNING_THRESHOLD} MB)`,
        details
      };
    } else {
      return {
        name: 'Memory Usage',
        status: 'healthy',
        message: `Memory usage is normal: ${heapUsedMb.toFixed(2)} MB`,
        details
      };
    }
  }

  /**
   * Check available disk space
   */
  private async checkDiskSpace(): Promise<HealthCheck> {
    try {
      // Get filesystem stats
      await fs.stat(this.options.projectRoot);

      // Note: Node.js doesn't provide direct disk space info
      // This is a placeholder for filesystem check
      return {
        name: 'Disk Space',
        status: 'healthy',
        message: 'Filesystem is accessible',
        details: {
          note: 'Disk space monitoring requires platform-specific implementation'
        }
      };
    } catch (error: any) {
      return {
        name: 'Disk Space',
        status: 'warning',
        message: `Could not check disk space: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Check log files status
   */
  private async checkLogFiles(): Promise<HealthCheck> {
    try {
      const logDir = path.dirname(this.options.logPath);

      // Check if log directory exists
      try {
        await fs.access(logDir);
      } catch {
        return {
          name: 'Log Files',
          status: 'warning',
          message: 'Log directory does not exist',
          details: { logDir }
        };
      }

      // Check log file sizes
      const files = await fs.readdir(logDir);
      const logFiles = files.filter(f => f.endsWith('.log') || f.endsWith('.jsonl'));

      let totalSize = 0;
      for (const file of logFiles) {
        const filePath = path.join(logDir, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      }

      const totalSizeMb = totalSize / (1024 * 1024);
      const WARNING_THRESHOLD = 100; // MB

      const details = {
        logFiles: logFiles.length,
        totalSizeMb: totalSizeMb.toFixed(2)
      };

      if (totalSizeMb > WARNING_THRESHOLD) {
        return {
          name: 'Log Files',
          status: 'warning',
          message: `Log files are large: ${totalSizeMb.toFixed(2)} MB (consider cleanup)`,
          details
        };
      } else {
        return {
          name: 'Log Files',
          status: 'healthy',
          message: `Log files are healthy: ${logFiles.length} files, ${totalSizeMb.toFixed(2)} MB`,
          details
        };
      }
    } catch (error: any) {
      return {
        name: 'Log Files',
        status: 'warning',
        message: `Could not check log files: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Format health report as human-readable string
   */
  formatReport(report: HealthReport): string {
    const timestamp = new Date(report.timestamp).toISOString();
    const statusIcon = {
      healthy: '✓',
      warning: '⚠',
      unhealthy: '✗'
    };

    const lines = [
      `=== Code Index Health Report ===`,
      `Time: ${timestamp}`,
      `Overall Status: ${statusIcon[report.overall]} ${report.overall.toUpperCase()}`,
      `Summary: ${report.summary}`,
      '',
      '--- Checks ---'
    ];

    for (const check of report.checks) {
      lines.push('');
      lines.push(`${statusIcon[check.status]} ${check.name}: ${check.status.toUpperCase()}`);
      lines.push(`  ${check.message}`);
      if (check.details) {
        lines.push(`  Details: ${JSON.stringify(check.details, null, 2).split('\n').join('\n  ')}`);
      }
    }

    return lines.join('\n');
  }
}
