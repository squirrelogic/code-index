import { Command } from 'commander';
import { existsSync, statSync, accessSync, constants } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { DatabaseService } from '../../services/database.js';
import { Logger } from '../utils/logger.js';
import { OutputFormatter, OutputFormat } from '../utils/output.js';
import {
  HealthCheckResult,
  HealthStatus,
  ComponentStatus,
  HealthIssue,
  IssueSeverity,
  IssueCode,
  ComponentName,
  healthyComponent,
  errorComponent,
  calculateOverallHealth,
  createIssue,
  FIX_SUGGESTIONS
} from '../../models/health-check.js';

interface DoctorOptions {
  verbose?: boolean;
  json?: boolean;
  fix?: boolean;
}

/**
 * Create the doctor command
 */
export function createDoctorCommand(): Command {
  const command = new Command('doctor');

  command
    .description('Diagnose system health and suggest fixes')
    .option('-v, --verbose', 'Show detailed diagnostic information')
    .option('-j, --json', 'Output results in JSON format')
    .option('-f, --fix', 'Attempt to automatically fix issues')
    .action(async (options: DoctorOptions) => {
      const projectRoot = process.cwd();
      const logger = new Logger(projectRoot);
      const formatter = new OutputFormatter(options.json ? OutputFormat.JSON : OutputFormat.HUMAN);

      try {
        const startTime = Date.now();
        const components: ComponentStatus[] = [];
        const issues: HealthIssue[] = [];
        const suggestions: string[] = [];

        if (!options.json) {
          console.log(chalk.bold('\n🔍 Running system health checks...\n'));
        }

        // Check 1: File System and Directories
        const fsCheckStart = Date.now();
        const fsCheck = checkFileSystem(projectRoot);
        components.push({
          ...fsCheck.component,
          checkDurationMs: Date.now() - fsCheckStart
        });
        issues.push(...fsCheck.issues);

        // Check 2: Database
        const dbCheckStart = Date.now();
        const dbCheck = checkDatabase(projectRoot);
        components.push({
          ...dbCheck.component,
          checkDurationMs: Date.now() - dbCheckStart
        });
        issues.push(...dbCheck.issues);

        // Check 3: Configuration
        const configCheckStart = Date.now();
        const configCheck = checkConfiguration(projectRoot);
        components.push({
          ...configCheck.component,
          checkDurationMs: Date.now() - configCheckStart
        });
        issues.push(...configCheck.issues);

        // Check 4: Permissions
        const permCheckStart = Date.now();
        const permCheck = checkPermissions(projectRoot);
        components.push({
          ...permCheck.component,
          checkDurationMs: Date.now() - permCheckStart
        });
        issues.push(...permCheck.issues);

        // Check 5: System Resources
        const sysCheckStart = Date.now();
        const sysCheck = checkSystemResources(projectRoot);
        components.push({
          ...sysCheck.component,
          checkDurationMs: Date.now() - sysCheckStart
        });
        issues.push(...sysCheck.issues);

        // Check 6: Node.js Version
        const nodeCheckStart = Date.now();
        const nodeCheck = checkNodeVersion();
        components.push({
          ...nodeCheck.component,
          checkDurationMs: Date.now() - nodeCheckStart
        });
        issues.push(...nodeCheck.issues);

        // Generate suggestions for issues
        for (const issue of issues) {
          const suggestion = FIX_SUGGESTIONS[issue.code as IssueCode];
          if (suggestion && !suggestions.includes(suggestion)) {
            suggestions.push(suggestion);
          }
        }

        // Calculate overall health
        const overallStatus = calculateOverallHealth(components);
        const canAutoFix = issues.some(i => i.fixable);

        // Create health check result
        const result: HealthCheckResult = {
          status: overallStatus,
          timestamp: new Date(),
          components,
          issues,
          suggestions,
          canAutoFix
        };

        // Attempt fixes if requested
        let fixResults: string[] = [];
        if (options.fix && canAutoFix) {
          fixResults = await attemptFixes(issues, projectRoot);
        }

        // Output results
        if (options.json) {
          formatter.json({
            ...result,
            fixResults: options.fix ? fixResults : undefined,
            checkDurationMs: Date.now() - startTime
          });
        } else {
          // Display component statuses
          console.log(chalk.bold('Component Status:'));
          for (const component of components) {
            const icon = getStatusIcon(component.status);
            const color = getStatusColor(component.status);
            console.log(color(`  ${icon} ${component.name}: ${component.message}`));

            if (options.verbose && component.details) {
              for (const [key, value] of Object.entries(component.details)) {
                console.log(chalk.gray(`     ${key}: ${value}`));
              }
            }
          }

          // Display issues
          if (issues.length > 0) {
            console.log('');
            console.log(chalk.bold('Issues Found:'));
            for (const issue of issues) {
              const severity = getSeverityColor(issue.severity);
              console.log(severity(`  • [${issue.severity.toUpperCase()}] ${issue.message}`));
              if (issue.fixable) {
                console.log(chalk.cyan(`    → Auto-fixable with --fix flag`));
              }
            }
          }

          // Display suggestions
          if (suggestions.length > 0) {
            console.log('');
            console.log(chalk.bold('Suggested Fixes:'));
            for (const suggestion of suggestions) {
              console.log(chalk.yellow(`  → ${suggestion}`));
            }
          }

          // Display fix results
          if (fixResults.length > 0) {
            console.log('');
            console.log(chalk.bold('Fix Results:'));
            for (const result of fixResults) {
              console.log(chalk.green(`  ✓ ${result}`));
            }
          }

          // Overall summary
          console.log('');
          const summaryColor = getStatusColor(overallStatus);
          const summaryIcon = getStatusIcon(overallStatus);
          console.log(summaryColor.bold(`${summaryIcon} Overall Health: ${overallStatus.toUpperCase()}`));

          if (overallStatus === HealthStatus.HEALTHY) {
            console.log(chalk.green('All systems operational! ✨'));
          } else if (canAutoFix && !options.fix) {
            console.log(chalk.cyan('\nRun with --fix flag to attempt automatic repairs'));
          }
        }

        // Log the health check
        logger.info('health-check-complete', {
          status: overallStatus,
          issueCount: issues.length,
          duration: Date.now() - startTime
        });

        // Exit with appropriate code
        process.exit(overallStatus === HealthStatus.HEALTHY ? 0 : 1);
      } catch (error) {
        logger.error('doctor-error', { error: String(error) });
        formatter.error(`Health check failed: ${error}`);
        process.exit(1);
      }
    });

  return command;
}

/**
 * Check file system and directories
 */
function checkFileSystem(projectRoot: string): {
  component: ComponentStatus;
  issues: HealthIssue[];
} {
  const issues: HealthIssue[] = [];
  const codeIndexDir = join(projectRoot, '.codeindex');
  const claudeDir = join(projectRoot, '.claude');
  const logsDir = join(codeIndexDir, 'logs');

  // Check .codeindex directory
  if (!existsSync(codeIndexDir)) {
    issues.push(createIssue(
      IssueSeverity.HIGH,
      ComponentName.FILE_SYSTEM,
      IssueCode.DIR_NOT_FOUND,
      '.codeindex directory not found',
      true,
      'code-index init'
    ));
  }

  // Check .claude directory
  if (!existsSync(claudeDir)) {
    issues.push(createIssue(
      IssueSeverity.MEDIUM,
      ComponentName.FILE_SYSTEM,
      IssueCode.DIR_NOT_FOUND,
      '.claude directory not found',
      true,
      'code-index init'
    ));
  }

  // Check logs directory
  if (existsSync(codeIndexDir) && !existsSync(logsDir)) {
    issues.push(createIssue(
      IssueSeverity.LOW,
      ComponentName.FILE_SYSTEM,
      IssueCode.DIR_NOT_FOUND,
      'logs directory not found',
      true
    ));
  }

  const component = issues.length === 0
    ? healthyComponent(ComponentName.FILE_SYSTEM, 'All directories present')
    : errorComponent(ComponentName.FILE_SYSTEM, `${issues.length} directory issue(s) found`);

  return { component, issues };
}

/**
 * Check database health
 */
function checkDatabase(projectRoot: string): {
  component: ComponentStatus;
  issues: HealthIssue[];
} {
  const issues: HealthIssue[] = [];
  const dbPath = join(projectRoot, '.codeindex', 'index.db');

  if (!existsSync(dbPath)) {
    issues.push(createIssue(
      IssueSeverity.HIGH,
      ComponentName.DATABASE,
      IssueCode.DB_NOT_FOUND,
      'Database file not found',
      true,
      'code-index init'
    ));

    return {
      component: errorComponent(ComponentName.DATABASE, 'Database not found'),
      issues
    };
  }

  try {
    const database = new DatabaseService(projectRoot);
    database.open();

    const health = database.performHealthCheck();

    if (!health.isHealthy) {
      for (const issue of health.issues) {
        issues.push(createIssue(
          IssueSeverity.HIGH,
          ComponentName.DATABASE,
          IssueCode.DB_CORRUPTED,
          issue,
          false
        ));
      }
    }

    // Check if index is empty
    if (health.stats.totalEntries === 0) {
      issues.push(createIssue(
        IssueSeverity.MEDIUM,
        ComponentName.INDEX,
        IssueCode.INDEX_EMPTY,
        'Index is empty',
        false,
        'code-index index'
      ));
    }

    // Check if index is outdated
    const config = database.getProjectConfig();
    if (config && config.lastIndexedAt) {
      const daysSinceIndex = (Date.now() - config.lastIndexedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceIndex > 7) {
        issues.push(createIssue(
          IssueSeverity.LOW,
          ComponentName.INDEX,
          IssueCode.INDEX_OUTDATED,
          `Index is ${Math.floor(daysSinceIndex)} days old`,
          false,
          'code-index refresh'
        ));
      }
    }

    database.close();

    const details = {
      entries: health.stats.totalEntries,
      size: `${(health.stats.databaseSize / 1024 / 1024).toFixed(2)} MB`,
      walSize: `${(health.stats.walSize / 1024 / 1024).toFixed(2)} MB`
    };

    const component = issues.length === 0
      ? healthyComponent(ComponentName.DATABASE, 'Database healthy', 0)
      : errorComponent(ComponentName.DATABASE, `${issues.length} database issue(s) found`, details);

    component.details = details;
    return { component, issues };
  } catch (error) {
    issues.push(createIssue(
      IssueSeverity.CRITICAL,
      ComponentName.DATABASE,
      IssueCode.DB_CORRUPTED,
      `Database error: ${error}`,
      false
    ));

    return {
      component: errorComponent(ComponentName.DATABASE, 'Database check failed'),
      issues
    };
  }
}

/**
 * Check configuration
 */
function checkConfiguration(projectRoot: string): {
  component: ComponentStatus;
  issues: HealthIssue[];
} {
  const issues: HealthIssue[] = [];
  const mcpPath = join(projectRoot, '.mcp.json');

  if (!existsSync(mcpPath)) {
    issues.push(createIssue(
      IssueSeverity.LOW,
      ComponentName.CONFIGURATION,
      IssueCode.CONFIG_MISSING,
      'MCP configuration file not found',
      true,
      'code-index init'
    ));
  }

  const component = issues.length === 0
    ? healthyComponent(ComponentName.CONFIGURATION, 'Configuration valid')
    : errorComponent(ComponentName.CONFIGURATION, `${issues.length} configuration issue(s) found`);

  return { component, issues };
}

/**
 * Check file permissions
 */
function checkPermissions(projectRoot: string): {
  component: ComponentStatus;
  issues: HealthIssue[];
} {
  const issues: HealthIssue[] = [];
  const paths = [
    { path: join(projectRoot, '.codeindex'), name: '.codeindex directory' },
    { path: join(projectRoot, '.codeindex', 'index.db'), name: 'database file' },
    { path: join(projectRoot, '.codeindex', 'logs'), name: 'logs directory' }
  ];

  for (const { path, name } of paths) {
    if (existsSync(path)) {
      try {
        accessSync(path, constants.R_OK | constants.W_OK);
      } catch {
        issues.push(createIssue(
          IssueSeverity.HIGH,
          ComponentName.PERMISSIONS,
          IssueCode.DIR_PERMISSION_DENIED,
          `Insufficient permissions for ${name}`,
          false
        ));
      }
    }
  }

  const component = issues.length === 0
    ? healthyComponent(ComponentName.PERMISSIONS, 'All permissions OK')
    : errorComponent(ComponentName.PERMISSIONS, `${issues.length} permission issue(s) found`);

  return { component, issues };
}

/**
 * Check system resources
 */
function checkSystemResources(projectRoot: string): {
  component: ComponentStatus;
  issues: HealthIssue[];
} {
  const issues: HealthIssue[] = [];

  // Check available disk space (simplified check)
  try {
    // const stats = statSync(projectRoot); - unused for now
    // This is a simplified check - in production, you'd use a proper disk space library
    // For now, we'll just ensure the directory exists and is accessible
    statSync(projectRoot);
  } catch (error) {
    issues.push(createIssue(
      IssueSeverity.MEDIUM,
      ComponentName.SYSTEM,
      IssueCode.DISK_SPACE_LOW,
      'Unable to check disk space',
      false
    ));
  }

  // Check memory usage
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;

  if (heapUsedMB > 400) {
    issues.push(createIssue(
      IssueSeverity.LOW,
      ComponentName.SYSTEM,
      IssueCode.MEMORY_LOW,
      `High memory usage: ${heapUsedMB.toFixed(2)} MB`,
      false
    ));
  }

  const details = {
    memory: `${heapUsedMB.toFixed(2)} MB`,
    pid: process.pid
  };

  const component = issues.length === 0
    ? healthyComponent(ComponentName.SYSTEM, 'System resources adequate', 0)
    : errorComponent(ComponentName.SYSTEM, `${issues.length} system issue(s) found`, details);

  component.details = details;
  return { component, issues };
}

/**
 * Check Node.js version
 */
function checkNodeVersion(): {
  component: ComponentStatus;
  issues: HealthIssue[];
} {
  const issues: HealthIssue[] = [];
  const nodeVersion = process.versions.node;
  const majorVersion = parseInt(nodeVersion.split('.')[0] || '0');

  if (majorVersion < 20) {
    issues.push(createIssue(
      IssueSeverity.HIGH,
      ComponentName.DEPENDENCIES,
      IssueCode.NODE_VERSION_UNSUPPORTED,
      `Node.js version ${nodeVersion} is unsupported (requires 20+)`,
      false
    ));
  }

  const details = {
    node: nodeVersion,
    v8: process.versions.v8
  };

  const component = issues.length === 0
    ? healthyComponent(ComponentName.DEPENDENCIES, `Node.js ${nodeVersion}`, 0)
    : errorComponent(ComponentName.DEPENDENCIES, 'Node.js version issue', details);

  component.details = details;
  return { component, issues };
}

/**
 * Attempt to automatically fix issues
 */
async function attemptFixes(issues: HealthIssue[], projectRoot: string): Promise<string[]> {
  const results: string[] = [];

  for (const issue of issues) {
    if (!issue.fixable) continue;

    try {
      switch (issue.code) {
        case IssueCode.DIR_NOT_FOUND:
          // Create missing directories
          const { mkdirSync } = await import('fs');
          if (issue.message.includes('.codeindex')) {
            mkdirSync(join(projectRoot, '.codeindex', 'logs'), { recursive: true });
            results.push('Created .codeindex directory structure');
          }
          if (issue.message.includes('.claude')) {
            mkdirSync(join(projectRoot, '.claude', 'settings'), { recursive: true });
            mkdirSync(join(projectRoot, '.claude', 'hooks'), { recursive: true });
            mkdirSync(join(projectRoot, '.claude', 'tools'), { recursive: true });
            results.push('Created .claude directory structure');
          }
          break;

        case IssueCode.CONFIG_MISSING:
          // Create MCP configuration
          const { writeFileSync } = await import('fs');
          const mcpConfig = {
            models: {
              codeindex: {
                type: 'local',
                command: 'code-index',
                args: ['search'],
                env: {}
              }
            }
          };
          writeFileSync(
            join(projectRoot, '.mcp.json'),
            JSON.stringify(mcpConfig, null, 2)
          );
          results.push('Created MCP configuration file');
          break;

        case IssueCode.DB_NOT_FOUND:
          // Initialize database
          const database = new DatabaseService(projectRoot);
          database.open();
          database.close();
          results.push('Initialized database');
          break;
      }
    } catch (error) {
      results.push(`Failed to fix ${issue.message}: ${error}`);
    }
  }

  return results;
}

/**
 * Get status icon
 */
function getStatusIcon(status: HealthStatus): string {
  switch (status) {
    case HealthStatus.HEALTHY: return '✓';
    case HealthStatus.WARNING: return '⚠';
    case HealthStatus.ERROR: return '✗';
    case HealthStatus.CRITICAL: return '‼';
  }
}

/**
 * Get status color function
 */
function getStatusColor(status: HealthStatus): typeof chalk {
  switch (status) {
    case HealthStatus.HEALTHY: return chalk.green;
    case HealthStatus.WARNING: return chalk.yellow;
    case HealthStatus.ERROR: return chalk.red;
    case HealthStatus.CRITICAL: return chalk.red.bold;
  }
}

/**
 * Get severity color function
 */
function getSeverityColor(severity: IssueSeverity): typeof chalk {
  switch (severity) {
    case IssueSeverity.LOW: return chalk.gray;
    case IssueSeverity.MEDIUM: return chalk.yellow;
    case IssueSeverity.HIGH: return chalk.red;
    case IssueSeverity.CRITICAL: return chalk.red.bold;
  }
}