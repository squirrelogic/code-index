import { Command } from 'commander';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { Logger } from '../utils/logger.js';
import { OutputFormatter, OutputFormat } from '../utils/output.js';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

interface UninstallOptions {
  yes?: boolean;
  json?: boolean;
  verbose?: boolean;
}

/**
 * Create the uninstall command
 */
export function createUninstallCommand(): Command {
  const command = new Command('uninstall');

  command
    .description('Remove all code-index artifacts from the project')
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('-j, --json', 'Output results in JSON format')
    .option('-v, --verbose', 'Show detailed removal information')
    .action(async (options: UninstallOptions) => {
      const projectRoot = process.cwd();
      const logger = new Logger(projectRoot);
      const formatter = new OutputFormatter(options.json ? OutputFormat.JSON : OutputFormat.HUMAN);

      try {
        // Detect artifacts to remove
        const artifacts = detectArtifacts(projectRoot);

        if (artifacts.paths.length === 0) {
          if (options.json) {
            formatter.json({
              success: true,
              message: 'No code-index artifacts found',
              removed: []
            });
          } else {
            formatter.info('No code-index artifacts found to remove.');
          }
          process.exit(0);
        }

        // Show what will be removed
        if (!options.json) {
          console.log(chalk.bold('\n📦 Code-Index Uninstaller\n'));
          console.log('The following will be removed:');
          for (const path of artifacts.paths) {
            const detail = artifacts.details[path];
            if (!detail) continue;
            const type = detail.type;
            const icon = type === 'directory' ? '📁' : '📄';
            console.log(chalk.red(`  ${icon} ${path}`));
            if (options.verbose && detail.size) {
              console.log(chalk.gray(`     Size: ${formatSize(detail.size)}`));
            }
          }
          console.log('');
          console.log(chalk.yellow('⚠  This action cannot be undone!'));
        }

        // Get confirmation unless --yes flag is used
        let confirmed = options.yes;
        if (!confirmed && !options.json) {
          const rl = readline.createInterface({ input, output });
          const answer = await rl.question(
            chalk.bold('Are you sure you want to uninstall code-index? (yes/no): ')
          );
          rl.close();
          confirmed = answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
        }

        if (!confirmed) {
          if (options.json) {
            formatter.json({
              success: false,
              message: 'Uninstall cancelled',
              removed: []
            });
          } else {
            console.log(chalk.gray('\nUninstall cancelled.'));
          }
          process.exit(0);
        }

        // Perform removal
        const removed: string[] = [];
        const failed: string[] = [];

        for (const path of artifacts.paths) {
          try {
            const fullPath = join(projectRoot, path);
            const details = artifacts.details[path];

            if (existsSync(fullPath) && details) {
              if (details.type === 'directory') {
                rmSync(fullPath, { recursive: true, force: true });
              } else {
                rmSync(fullPath, { force: true });
              }
              removed.push(path);

              if (options.verbose && !options.json) {
                console.log(chalk.green(`  ✓ Removed ${path}`));
              }
            }
          } catch (error) {
            failed.push(`${path}: ${error}`);
            if (options.verbose && !options.json) {
              console.log(chalk.red(`  ✗ Failed to remove ${path}: ${error}`));
            }
          }
        }

        // Log the uninstall
        logger.info('uninstall-complete', {
          removed: removed.length,
          failed: failed.length
        });

        // Report results
        if (options.json) {
          formatter.json({
            success: failed.length === 0,
            removed,
            failed,
            totalSize: artifacts.totalSize
          });
        } else {
          console.log('');
          if (removed.length > 0) {
            console.log(chalk.green.bold(`✓ Successfully removed ${removed.length} item(s)`));
            if (artifacts.totalSize > 0) {
              console.log(chalk.gray(`  Freed ${formatSize(artifacts.totalSize)}`));
            }
          }

          if (failed.length > 0) {
            console.log(chalk.red.bold(`✗ Failed to remove ${failed.length} item(s):`));
            for (const failure of failed) {
              console.log(chalk.red(`  - ${failure}`));
            }
          }

          if (failed.length === 0) {
            console.log(chalk.green('\n🎉 Code-index has been completely uninstalled!'));
            console.log(chalk.gray('To reinstall, run: npm install -g @squirrelogic/code-index'));
          }
        }

        process.exit(failed.length > 0 ? 1 : 0);
      } catch (error) {
        logger.error('uninstall-error', { error: String(error) });
        formatter.error(`Uninstall failed: ${error}`);
        process.exit(1);
      }
    });

  return command;
}

/**
 * Detect code-index artifacts in the project
 */
function detectArtifacts(projectRoot: string): {
  paths: string[];
  details: Record<string, { type: 'file' | 'directory'; size?: number }>;
  totalSize: number;
} {
  const paths: string[] = [];
  const details: Record<string, { type: 'file' | 'directory'; size?: number }> = {};
  let totalSize = 0;

  // Check for .codeindex directory
  const codeIndexDir = join(projectRoot, '.codeindex');
  if (existsSync(codeIndexDir)) {
    paths.push('.codeindex');
    const size = getDirectorySize(codeIndexDir);
    details['.codeindex'] = { type: 'directory', size };
    totalSize += size;
  }

  // Check for .claude directory
  const claudeDir = join(projectRoot, '.claude');
  if (existsSync(claudeDir)) {
    // Only remove if it appears to be created by code-index
    // (check for specific structure)
    const expectedDirs = ['settings', 'hooks', 'tools'];
    const hasExpectedStructure = expectedDirs.some(dir =>
      existsSync(join(claudeDir, dir))
    );

    if (hasExpectedStructure) {
      // Check if there are any custom files
      const { readdirSync } = require('fs');
      let hasCustomFiles = false;

      try {
        for (const dir of expectedDirs) {
          const dirPath = join(claudeDir, dir);
          if (existsSync(dirPath)) {
            const files = readdirSync(dirPath);
            if (files.length > 0) {
              hasCustomFiles = true;
              break;
            }
          }
        }
      } catch {
        // Ignore errors
      }

      if (!hasCustomFiles) {
        paths.push('.claude');
        const size = getDirectorySize(claudeDir);
        details['.claude'] = { type: 'directory', size };
        totalSize += size;
      }
    }
  }

  // Check for .mcp.json file
  const mcpFile = join(projectRoot, '.mcp.json');
  if (existsSync(mcpFile)) {
    // Only remove if it appears to be created by code-index
    try {
      const content = require('fs').readFileSync(mcpFile, 'utf-8');
      const config = JSON.parse(content);

      // Check if it has our specific model configuration
      if (config.models?.codeindex?.command === 'code-index') {
        paths.push('.mcp.json');
        const stats = require('fs').statSync(mcpFile);
        details['.mcp.json'] = { type: 'file', size: stats.size };
        totalSize += stats.size;
      }
    } catch {
      // If we can't parse it, don't remove it
    }
  }

  return { paths, details, totalSize };
}

/**
 * Get total size of a directory recursively
 */
function getDirectorySize(dirPath: string): number {
  const { statSync, readdirSync } = require('fs');
  let totalSize = 0;

  try {
    const stats = statSync(dirPath);
    if (stats.isDirectory()) {
      const files = readdirSync(dirPath, { withFileTypes: true });
      for (const file of files) {
        const filePath = join(dirPath, file.name);
        if (file.isDirectory()) {
          totalSize += getDirectorySize(filePath);
        } else {
          try {
            const fileStats = statSync(filePath);
            totalSize += fileStats.size;
          } catch {
            // Ignore permission errors
          }
        }
      }
    } else {
      totalSize = stats.size;
    }
  } catch {
    // Ignore errors
  }

  return totalSize;
}

/**
 * Format file size for display
 */
function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}