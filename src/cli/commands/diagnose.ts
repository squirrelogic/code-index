/**
 * Diagnose command - troubleshooting and system analysis
 * Checks common issues, suggests fixes, and generates debug reports
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs/promises';
import { HealthChecker, HealthReport } from '../../services/HealthChecker.js';
import { OutputFormatter, OutputFormat } from '../utils/output.js';

export interface DiagnoseOptions {
  fix?: boolean;
  verbose?: boolean;
  report?: boolean;
  json?: boolean;
}

export interface DiagnosticIssue {
  severity: 'info' | 'warning' | 'error';
  category: string;
  issue: string;
  suggestion: string;
  autoFixable: boolean;
}

/**
 * Create the diagnose command
 */
export function createDiagnoseCommand(): Command {
  const command = new Command('diagnose');

  command
    .description('Run diagnostics and troubleshooting checks')
    .option('--fix', 'Attempt to automatically fix common issues')
    .option('--verbose', 'Show detailed diagnostic information')
    .option('--report', 'Generate a full diagnostic report')
    .option('--json', 'Output results in JSON format')
    .action(async (options: DiagnoseOptions) => {
      const formatter = new OutputFormatter(options.json ? OutputFormat.JSON : OutputFormat.HUMAN);

      try {
        const projectRoot = process.cwd();
        const dbPath = path.join(projectRoot, '.codeindex', 'index.db');
        const logPath = path.join(projectRoot, '.codeindex', 'logs', 'watcher.jsonl');

        // Run health checks
        formatter.info('Running system diagnostics...');
        const healthChecker = new HealthChecker({ projectRoot, dbPath, logPath });
        const healthReport = await healthChecker.checkHealth();

        // Collect diagnostic issues
        const issues = await collectDiagnosticIssues(projectRoot, healthReport);

        // Display health report
        if (options.json) {
          formatter.json({
            health: healthReport,
            issues,
            timestamp: Date.now()
          });
        } else {
          displayHealthReport(healthReport, formatter);
          displayIssues(issues, formatter);
        }

        // Attempt fixes if requested
        if (options.fix) {
          await attemptFixes(issues, projectRoot, formatter);
        }

        // Generate full report if requested
        if (options.report) {
          await generateDiagnosticReport(projectRoot, healthReport, issues, formatter);
        }

        // Exit with appropriate code
        const hasErrors = healthReport.overall === 'unhealthy' ||
                         issues.some(i => i.severity === 'error');
        process.exit(hasErrors ? 1 : 0);

      } catch (error: any) {
        formatter.error(`Diagnostics failed: ${error.message}`);
        if (options.verbose) {
          formatter.error(error.stack);
        }
        process.exit(1);
      }
    });

  return command;
}

/**
 * Collect diagnostic issues from various sources
 */
async function collectDiagnosticIssues(
  projectRoot: string,
  healthReport: HealthReport
): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];

  // Check for unhealthy components
  for (const check of healthReport.checks) {
    if (check.status === 'unhealthy') {
      issues.push({
        severity: 'error',
        category: 'Health',
        issue: `${check.name}: ${check.message}`,
        suggestion: getSuggestionForHealthCheck(check.name),
        autoFixable: false
      });
    } else if (check.status === 'warning') {
      issues.push({
        severity: 'warning',
        category: 'Health',
        issue: `${check.name}: ${check.message}`,
        suggestion: getSuggestionForHealthCheck(check.name),
        autoFixable: false
      });
    }
  }

  // Check for common configuration issues
  await checkConfiguration(projectRoot, issues);

  // Check for permission issues
  await checkPermissions(projectRoot, issues);

  // Check for dependency issues
  await checkDependencies(projectRoot, issues);

  return issues;
}

/**
 * Get suggestion for a health check failure
 */
function getSuggestionForHealthCheck(checkName: string): string {
  const suggestions: Record<string, string> = {
    'Watcher Status': 'Start the watcher with: code-index watch',
    'Database Connectivity': 'Try reinitializing: code-index init --force',
    'File System Access': 'Check file permissions and ensure .codeindex/ is writable',
    'Memory Usage': 'Add more ignore patterns or reduce batch size in watcher settings',
    'Disk Space': 'Free up disk space or move project to a volume with more space',
    'Log Files': 'Clear old log files: rm .codeindex/logs/*.log'
  };

  return suggestions[checkName] || 'Consult documentation for troubleshooting steps';
}

/**
 * Check configuration issues
 */
async function checkConfiguration(
  projectRoot: string,
  issues: DiagnosticIssue[]
): Promise<void> {
  const configPath = path.join(projectRoot, '.codeindex', 'config.json');

  try {
    await fs.access(configPath);
  } catch {
    issues.push({
      severity: 'warning',
      category: 'Configuration',
      issue: 'Configuration file not found',
      suggestion: 'Run: code-index init to create configuration',
      autoFixable: true
    });
  }
}

/**
 * Check permission issues
 */
async function checkPermissions(
  projectRoot: string,
  issues: DiagnosticIssue[]
): Promise<void> {
  const criticalPaths = [
    '.codeindex',
    '.codeindex/logs',
    '.codeindex/index.db'
  ];

  for (const relativePath of criticalPaths) {
    const fullPath = path.join(projectRoot, relativePath);

    try {
      const stats = await fs.stat(fullPath);

      if (relativePath.endsWith('.db')) {
        // Check if database is writable
        await fs.access(fullPath, fs.constants.W_OK);
      } else if (stats.isDirectory()) {
        // Check if directory is writable
        await fs.access(fullPath, fs.constants.W_OK);
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        issues.push({
          severity: 'error',
          category: 'Permissions',
          issue: `Missing required path: ${relativePath}`,
          suggestion: 'Run: code-index init to create required directories',
          autoFixable: true
        });
      } else if (error.code === 'EACCES') {
        issues.push({
          severity: 'error',
          category: 'Permissions',
          issue: `No write access to: ${relativePath}`,
          suggestion: `Fix permissions: chmod -R u+w ${relativePath}`,
          autoFixable: false
        });
      }
    }
  }
}

/**
 * Check dependency issues
 */
async function checkDependencies(
  projectRoot: string,
  issues: DiagnosticIssue[]
): Promise<void> {
  const packageJsonPath = path.join(projectRoot, 'package.json');

  try {
    const packageJson = JSON.parse(
      await fs.readFile(packageJsonPath, 'utf-8')
    );

    const requiredDeps = ['chokidar', 'simple-git', 'better-sqlite3'];
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    for (const dep of requiredDeps) {
      if (!allDeps[dep]) {
        issues.push({
          severity: 'error',
          category: 'Dependencies',
          issue: `Missing required dependency: ${dep}`,
          suggestion: `Run: npm install ${dep}`,
          autoFixable: true
        });
      }
    }
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      issues.push({
        severity: 'warning',
        category: 'Dependencies',
        issue: 'Could not read package.json',
        suggestion: 'Ensure package.json is valid JSON',
        autoFixable: false
      });
    }
  }
}

/**
 * Display health report
 */
function displayHealthReport(
  report: HealthReport,
  formatter: OutputFormatter
): void {
  const statusEmoji: Record<string, string> = {
    healthy: '✓',
    warning: '⚠',
    unhealthy: '✗'
  };

  formatter.info(`\n=== System Health ===`);
  formatter.info(`Overall: ${statusEmoji[report.overall]} ${report.overall.toUpperCase()}`);
  formatter.info(`Summary: ${report.summary}`);
  formatter.info('');

  for (const check of report.checks) {
    const emoji = statusEmoji[check.status];
    formatter.info(`${emoji} ${check.name}: ${check.message}`);
  }
}

/**
 * Display diagnostic issues
 */
function displayIssues(
  issues: DiagnosticIssue[],
  formatter: OutputFormatter
): void {
  if (issues.length === 0) {
    formatter.success('\n✓ No issues detected');
    return;
  }

  formatter.info('\n=== Diagnostic Issues ===');

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  formatter.info(`Found ${errorCount} error(s) and ${warningCount} warning(s)\n`);

  for (const issue of issues) {
    const icon = issue.severity === 'error' ? '✗' : '⚠';
    formatter.info(`${icon} [${issue.category}] ${issue.issue}`);
    formatter.info(`  → ${issue.suggestion}`);
    if (issue.autoFixable) {
      formatter.info(`  → Can be auto-fixed with: --fix`);
    }
    formatter.info('');
  }
}

/**
 * Attempt to automatically fix issues
 */
async function attemptFixes(
  issues: DiagnosticIssue[],
  projectRoot: string,
  formatter: OutputFormatter
): Promise<void> {
  const fixableIssues = issues.filter(i => i.autoFixable);

  if (fixableIssues.length === 0) {
    formatter.info('No auto-fixable issues found');
    return;
  }

  formatter.info(`\n=== Attempting Fixes ===`);
  formatter.info(`Found ${fixableIssues.length} fixable issue(s)\n`);

  for (const issue of fixableIssues) {
    try {
      formatter.info(`Fixing: ${issue.issue}`);

      if (issue.issue.includes('Configuration file not found')) {
        // Create default configuration
        const configPath = path.join(projectRoot, '.codeindex', 'config.json');
        await fs.mkdir(path.dirname(configPath), { recursive: true });
        await fs.writeFile(configPath, JSON.stringify({
          debounceDelay: 500,
          batchSize: 100,
          ignorePatterns: []
        }, null, 2));
        formatter.success('  ✓ Created default configuration');
      } else if (issue.issue.includes('Missing required path')) {
        // Create missing directories
        const match = issue.issue.match(/Missing required path: (.+)/);
        if (match && match[1]) {
          const missingPath = path.join(projectRoot, match[1]);
          await fs.mkdir(missingPath, { recursive: true });
          formatter.success(`  ✓ Created directory: ${match[1]}`);
        }
      }
    } catch (error: any) {
      formatter.error(`  ✗ Failed to fix: ${error.message}`);
    }
  }
}

/**
 * Generate a comprehensive diagnostic report
 */
async function generateDiagnosticReport(
  projectRoot: string,
  healthReport: HealthReport,
  issues: DiagnosticIssue[],
  formatter: OutputFormatter
): Promise<void> {
  formatter.info('\n=== Generating Diagnostic Report ===');

  const reportPath = path.join(projectRoot, '.codeindex', 'diagnostic-report.json');

  const report = {
    timestamp: new Date().toISOString(),
    projectRoot,
    health: healthReport,
    issues,
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: process.memoryUsage()
    }
  };

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  formatter.success(`Report saved to: ${reportPath}`);
}
