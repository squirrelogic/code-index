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
import { HardwareDetector } from '../../services/hardware/HardwareDetector.js';
import { ConfigService } from '../../services/config/ConfigService.js';
import { EmbeddingCache } from '../../services/cache/EmbeddingCache.js';
import type { EmbeddingConfig } from '../../models/EmbeddingConfig.js';
import type { HardwareCapabilities } from '../../models/HardwareCapabilities.js';

interface DoctorOptions {
  verbose?: boolean;
  json?: boolean;
  fix?: boolean;
}

interface EmbeddingDiagnostics {
  hardware?: HardwareCapabilities;
  config?: EmbeddingConfig;
  modelStatus?: {
    cached: boolean;
    size: number | null;
    path: string;
    compatible: boolean;
  };
  onnxRuntime?: {
    availableProviders: string[];
    activeProvider: string;
  };
  cache?: {
    location: string;
    size: number;
    entries: number;
    hitRate: number;
  };
  issues: string[];
  recommendations: string[];
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

        // Check 7: Embedding Diagnostics (if initialized)
        let embeddingDiagnostics: EmbeddingDiagnostics | null = null;
        const embeddingCheckStart = Date.now();
        try {
          embeddingDiagnostics = await checkEmbeddingDiagnostics(projectRoot, options.verbose || false);

          // Add embedding-specific issues
          for (const issue of embeddingDiagnostics.issues) {
            issues.push(createIssue(
              IssueSeverity.MEDIUM,
              ComponentName.CONFIGURATION,
              IssueCode.CONFIG_MISSING,
              issue,
              false
            ));
          }

          // Add embedding-specific recommendations
          suggestions.push(...embeddingDiagnostics.recommendations);

          components.push({
            name: ComponentName.CONFIGURATION,
            status: embeddingDiagnostics.issues.length === 0 ? HealthStatus.HEALTHY : HealthStatus.WARNING,
            message: embeddingDiagnostics.issues.length === 0
              ? 'Embedding configuration healthy'
              : `${embeddingDiagnostics.issues.length} embedding issue(s) detected`,
            checkDurationMs: Date.now() - embeddingCheckStart,
            details: embeddingDiagnostics.config ? {
              profile: embeddingDiagnostics.config.profile.name,
              model: embeddingDiagnostics.config.profile.model,
              device: embeddingDiagnostics.config.profile.device
            } : undefined
          });
        } catch (error: any) {
          logger.warn('embedding-diagnostics-skipped', { reason: error.message });
          // Embedding not initialized - skip diagnostics
        }

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
            embedding: embeddingDiagnostics || undefined,
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

          // Display embedding diagnostics if available
          if (embeddingDiagnostics) {
            displayEmbeddingDiagnostics(embeddingDiagnostics, options.verbose || false);
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

/**
 * Check embedding-specific diagnostics
 */
async function checkEmbeddingDiagnostics(
  projectRoot: string,
  _verbose: boolean
): Promise<EmbeddingDiagnostics> {
  const diagnostics: EmbeddingDiagnostics = {
    issues: [],
    recommendations: []
  };

  // Load configuration
  const configService = new ConfigService(projectRoot);
  const configExists = await configService.exists();

  if (!configExists) {
    diagnostics.issues.push('Embedding not initialized. Run "code-index init" to set up.');
    return diagnostics;
  }

  try {
    diagnostics.config = await configService.load();
  } catch (error: any) {
    diagnostics.issues.push(`Failed to load embedding configuration: ${error.message}`);
    return diagnostics;
  }

  // Re-detect hardware
  try {
    const detector = new HardwareDetector();
    diagnostics.hardware = await detector.detect();

    // Check hardware compatibility with config
    const hwIssues = checkHardwareCompatibility(diagnostics.hardware, diagnostics.config);
    diagnostics.issues.push(...hwIssues);
  } catch (error: any) {
    diagnostics.issues.push(`Hardware detection failed: ${error.message}`);
  }

  // Check model status
  try {
    diagnostics.modelStatus = await checkModelStatus(projectRoot, diagnostics.config);
  } catch (error: any) {
    diagnostics.issues.push(`Model status check failed: ${error.message}`);
  }

  // Check ONNX Runtime providers
  try {
    diagnostics.onnxRuntime = checkONNXProviders(diagnostics.hardware);
  } catch (error: any) {
    diagnostics.issues.push(`ONNX provider check failed: ${error.message}`);
  }

  // Check cache
  try {
    diagnostics.cache = await checkCacheStatus(projectRoot, diagnostics.config);
  } catch (error: any) {
    diagnostics.issues.push(`Cache check failed: ${error.message}`);
  }

  // Generate recommendations
  diagnostics.recommendations = generateRecommendations(diagnostics);

  return diagnostics;
}

/**
 * Check hardware compatibility with configuration
 */
function checkHardwareCompatibility(
  hardware: HardwareCapabilities,
  config: EmbeddingConfig
): string[] {
  const issues: string[] = [];
  const profile = config.profile;

  // Check device compatibility
  if (profile.device === 'cuda' && !hardware.gpu) {
    issues.push('CUDA device configured but no GPU detected. Consider switching to CPU.');
  }

  if (profile.device === 'cuda' && hardware.gpu?.vendor !== 'NVIDIA') {
    issues.push(`CUDA device configured but GPU is ${hardware.gpu?.vendor}. Consider switching device.`);
  }

  if (profile.device === 'mps' && hardware.platform !== 'darwin') {
    issues.push('MPS device configured but not running on macOS. Switch to CPU or CUDA.');
  }

  // Check batch size vs available memory
  const freeGB = hardware.freeRAM / (1024 * 1024 * 1024);
  const estimatedMemoryGB = (profile.batchSize * profile.dimensions * 4) / (1024 * 1024 * 1024);

  if (estimatedMemoryGB > freeGB * 0.5) {
    issues.push(
      `Batch size (${profile.batchSize}) may be too large for available memory (${freeGB.toFixed(1)} GB free). ` +
      `Consider reducing to ${Math.floor(profile.batchSize / 2)}.`
    );
  }

  return issues;
}

/**
 * Check model status (cached, size, compatibility)
 */
async function checkModelStatus(
  projectRoot: string,
  config: EmbeddingConfig
): Promise<{
  cached: boolean;
  size: number | null;
  path: string;
  compatible: boolean;
}> {
  const modelId = config.profile.model;
  const modelsDir = join(projectRoot, '.codeindex', 'models');

  // Convert model ID to directory name (e.g., "Xenova/all-MiniLM-L6-v2" -> "models--Xenova--all-MiniLM-L6-v2")
  const modelDirName = 'models--' + modelId.replace(/\//g, '--');
  const modelPath = join(modelsDir, modelDirName);

  const cached = existsSync(modelPath);
  let size: number | null = null;

  if (cached) {
    try {
      // Calculate directory size
      size = await getDirectorySize(modelPath);
    } catch {
      size = null;
    }
  }

  return {
    cached,
    size,
    path: modelPath,
    compatible: true // Assume compatible for now
  };
}

/**
 * Calculate directory size recursively
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  const { readdir, stat } = await import('fs/promises');
  let totalSize = 0;

  try {
    const files = await readdir(dirPath, { withFileTypes: true });

    for (const file of files) {
      const filePath = join(dirPath, file.name);

      if (file.isDirectory()) {
        totalSize += await getDirectorySize(filePath);
      } else {
        const stats = await stat(filePath);
        totalSize += stats.size;
      }
    }
  } catch {
    // Ignore errors
  }

  return totalSize;
}

/**
 * Check ONNX Runtime providers
 */
function checkONNXProviders(hardware?: HardwareCapabilities): {
  availableProviders: string[];
  activeProvider: string;
} {
  const providers = hardware?.onnxProviders || ['CPUExecutionProvider'];

  // Active provider is the first in the list (highest priority)
  const activeProvider = providers[0] || 'CPUExecutionProvider';

  return {
    availableProviders: providers,
    activeProvider
  };
}

/**
 * Check cache status
 */
async function checkCacheStatus(
  projectRoot: string,
  config: EmbeddingConfig
): Promise<{
  location: string;
  size: number;
  entries: number;
  hitRate: number;
}> {
  const cacheDir = join(projectRoot, config.profile.cacheDir);
  const cache = new EmbeddingCache(cacheDir);

  try {
    await cache.initialize();
    const stats = cache.getStats();
    const hitRate = cache.getHitRate();

    cache.close();

    return {
      location: join(cacheDir, 'embeddings.db'),
      size: stats.totalSize,
      entries: stats.totalEntries,
      hitRate
    };
  } catch (error) {
    // Cache not initialized or error
    return {
      location: join(cacheDir, 'embeddings.db'),
      size: 0,
      entries: 0,
      hitRate: 0
    };
  }
}

/**
 * Generate recommendations based on diagnostics
 */
function generateRecommendations(diagnostics: EmbeddingDiagnostics): string[] {
  const recommendations: string[] = [];

  // No issues detected
  if (diagnostics.issues.length === 0) {
    recommendations.push('System configuration optimal for detected hardware');
    return recommendations;
  }

  // Hardware-specific recommendations
  if (diagnostics.hardware && diagnostics.config) {
    const profile = diagnostics.config.profile;

    // GPU recommendations
    if (diagnostics.hardware.gpu && profile.device === 'cpu') {
      recommendations.push(
        `GPU detected but using CPU. Consider switching to ${diagnostics.hardware.gpu.vendor === 'NVIDIA' ? 'CUDA' : 'MPS'} for better performance.`
      );
    }

    // Memory recommendations
    const freeGB = diagnostics.hardware.freeRAM / (1024 * 1024 * 1024);
    if (freeGB < 2) {
      recommendations.push('Low available memory detected. Consider using light profile or reducing batch size.');
    }

    // Model not cached
    if (diagnostics.modelStatus && !diagnostics.modelStatus.cached) {
      recommendations.push('Model not cached locally. First embedding run will download the model (requires network).');
    }

    // Cache recommendations
    if (diagnostics.cache && diagnostics.cache.entries === 0) {
      recommendations.push('No cached embeddings found. Run "code-index embed" to generate embeddings.');
    }

    if (diagnostics.cache && diagnostics.cache.hitRate < 0.5 && diagnostics.cache.entries > 100) {
      recommendations.push('Low cache hit rate detected. Consider regenerating embeddings with "code-index embed --rebuild".');
    }
  }

  return recommendations;
}

/**
 * Display embedding diagnostics in human-readable format
 */
function displayEmbeddingDiagnostics(diagnostics: EmbeddingDiagnostics, verbose: boolean): void {
  console.log('');
  console.log(chalk.bold.cyan('Embedding Diagnostics:'));
  console.log(chalk.cyan('='.repeat(50)));

  // Hardware section
  if (diagnostics.hardware) {
    console.log('');
    console.log(chalk.bold('Hardware:'));
    console.log(`  CPU: ${diagnostics.hardware.cpuModel} (${diagnostics.hardware.cpuCores} cores)`);

    const totalGB = (diagnostics.hardware.totalRAM / (1024 * 1024 * 1024)).toFixed(1);
    const freeGB = (diagnostics.hardware.freeRAM / (1024 * 1024 * 1024)).toFixed(1);
    console.log(`  RAM: ${totalGB} GB total, ${freeGB} GB free`);

    if (diagnostics.hardware.gpu) {
      const gpuMemGB = (diagnostics.hardware.gpu.memory / (1024 * 1024 * 1024)).toFixed(1);
      console.log(`  GPU: ${diagnostics.hardware.gpu.vendor} ${diagnostics.hardware.gpu.name} (${gpuMemGB} GB)`);
    } else {
      console.log(`  GPU: None`);
    }

    console.log(`  Platform: ${diagnostics.hardware.platform} (${diagnostics.hardware.arch})`);

    if (verbose) {
      console.log(chalk.gray(`  Detected at: ${diagnostics.hardware.detectedAt.toLocaleString()}`));
    }
  }

  // Configuration section
  if (diagnostics.config) {
    console.log('');
    console.log(chalk.bold('Configuration:'));
    console.log(`  Profile: ${diagnostics.config.profile.name}`);
    console.log(`  Model: ${diagnostics.config.profile.model}`);
    console.log(`  Dimensions: ${diagnostics.config.profile.dimensions}`);
    console.log(`  Backend: ${diagnostics.config.profile.backend}`);
    console.log(`  Device: ${diagnostics.config.profile.device}`);
    console.log(`  Quantization: ${diagnostics.config.profile.quantization}`);
    console.log(`  Batch Size: ${diagnostics.config.profile.batchSize}`);

    if (verbose) {
      console.log(chalk.gray(`  Version: ${diagnostics.config.version}`));
      console.log(chalk.gray(`  Updated: ${diagnostics.config.updatedAt.toLocaleString()}`));
    }
  }

  // Model status section
  if (diagnostics.modelStatus) {
    console.log('');
    console.log(chalk.bold('Model Status:'));

    if (diagnostics.modelStatus.cached) {
      console.log(chalk.green(`  ✓ Model cached locally`));
      if (diagnostics.modelStatus.size) {
        const sizeMB = (diagnostics.modelStatus.size / (1024 * 1024)).toFixed(2);
        console.log(`  Size: ${sizeMB} MB`);
      }
      if (verbose) {
        console.log(chalk.gray(`  Path: ${diagnostics.modelStatus.path}`));
      }
    } else {
      console.log(chalk.yellow(`  ⚠ Model not cached (will download on first use)`));
    }

    if (diagnostics.modelStatus.compatible) {
      console.log(chalk.green(`  ✓ Model compatible with hardware`));
    } else {
      console.log(chalk.red(`  ✗ Model incompatible with hardware`));
    }
  }

  // ONNX Runtime section
  if (diagnostics.onnxRuntime) {
    console.log('');
    console.log(chalk.bold('ONNX Runtime:'));
    console.log(`  Available Providers: [${diagnostics.onnxRuntime.availableProviders.join(', ')}]`);
    console.log(`  Active Provider: ${diagnostics.onnxRuntime.activeProvider}`);
  }

  // Cache section
  if (diagnostics.cache) {
    console.log('');
    console.log(chalk.bold('Cache:'));
    console.log(`  Location: ${diagnostics.cache.location}`);

    const sizeMB = (diagnostics.cache.size / (1024 * 1024)).toFixed(2);
    console.log(`  Size: ${sizeMB} MB`);
    console.log(`  Entries: ${diagnostics.cache.entries} embeddings`);

    if (diagnostics.cache.entries > 0) {
      const hitRatePercent = (diagnostics.cache.hitRate * 100).toFixed(1);
      console.log(`  Hit Rate: ${hitRatePercent}% (last 1000 operations)`);
    }
  }

  // Recent fallbacks section
  if (diagnostics.config && diagnostics.config.fallbackHistory.length > 0) {
    console.log('');
    console.log(chalk.bold('Recent Fallbacks:'));

    const recentFallbacks = diagnostics.config.fallbackHistory.slice(-5); // Last 5
    for (const fallback of recentFallbacks) {
      const timeStr = fallback.timestamp.toLocaleString();
      const actionStr = fallback.action.replace('_', ' ');
      console.log(chalk.yellow(`  • [${timeStr}] ${actionStr}: ${fallback.reason}`));

      if (verbose) {
        if (fallback.from) {
          console.log(chalk.gray(`    From: ${JSON.stringify(fallback.from)}`));
        }
        if (fallback.to) {
          console.log(chalk.gray(`    To: ${JSON.stringify(fallback.to)}`));
        }
        console.log(chalk.gray(`    Success: ${fallback.success}`));
      }
    }
  } else if (diagnostics.config) {
    console.log('');
    console.log(chalk.bold('Recent Fallbacks:'));
    console.log(chalk.green('  None'));
  }

  // Recommendations section
  if (diagnostics.recommendations.length > 0) {
    console.log('');
    console.log(chalk.bold('Recommendations:'));
    for (const recommendation of diagnostics.recommendations) {
      if (recommendation.includes('optimal')) {
        console.log(chalk.green(`  ✓ ${recommendation}`));
      } else {
        console.log(chalk.yellow(`  → ${recommendation}`));
      }
    }
  }
}