import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { DatabaseService } from '../../services/database.js';
import { IndexerService } from '../../services/indexer.js';
import { Logger } from '../utils/logger.js';
import { OutputFormatter } from '../utils/output.js';

interface IndexCommandOptions {
  verbose?: boolean;
  force?: boolean;
  batchSize?: number;
  followSymlinks?: boolean;
  format?: 'human' | 'json';
}

export function createIndexCommand(): Command {
  return new Command('index')
    .description('Index all project files into SQLite database')
    .option('-v, --verbose', 'Show detailed progress information')
    .option('-f, --force', 'Force re-indexing even if index exists')
    .option('-b, --batch-size <size>', 'Number of files to process per batch', '100')
    .option('-s, --follow-symlinks', 'Follow symbolic links during indexing')
    .option('--format <type>', 'Output format (human or json)', 'human')
    .action(async (options: IndexCommandOptions) => {
      const cwd = process.cwd();
      const codeIndexDir = join(cwd, '.codeindex');
      const formatter = new OutputFormatter();

      // Check if initialization has been done
      if (!existsSync(codeIndexDir)) {
        formatter.error('Project not initialized', {
          message: 'Project has not been initialized. Please run "code-index init" first.',
          path: cwd
        });
        process.exit(1);
      }

      const logger = new Logger(cwd);

      try {
        // Initialize database
        const database = new DatabaseService(cwd);
        database.open();

        // Check existing index
        const existingCount = database.getEntryCount();
        if (existingCount > 0 && !options.force) {
          formatter.warning('Index already exists', {
            message: `Index already contains ${existingCount} files. Use --force to re-index.`,
            fileCount: existingCount
          });
          database.close();
          process.exit(1);
        }

        // Log indexing start
        logger.info('indexing-started', {
          projectRoot: cwd,
          force: options.force || false,
          batchSize: typeof options.batchSize === 'string' ? parseInt(options.batchSize) : options.batchSize || 100,
          followSymlinks: options.followSymlinks || false
        });

        // Start indexing
        formatter.info('Starting indexing', {
          path: cwd,
          batchSize: options.batchSize
        });

        const indexer = new IndexerService(cwd, database, logger);
        const startTime = Date.now();

        // Show progress indicator for verbose mode
        if (options.verbose && options.format === 'human') {
          console.log(chalk.blue('Scanning files...'));
        }

        const result = await indexer.indexProject({
          verbose: options.verbose,
          batchSize: typeof options.batchSize === 'string' ? parseInt(options.batchSize) : options.batchSize || 100,
          followSymlinks: options.followSymlinks
        });

        // Calculate statistics
        const duration = (Date.now() - startTime) / 1000;
        const dbSize = database.getDatabaseSize();

        // Update project configuration
        const config = database.getProjectConfig();
        if (config) {
          config.lastIndexedAt = new Date();
          database.saveProjectConfig(config);
        }

        // Log completion
        logger.info('indexing-completed', {
          filesIndexed: result.filesIndexed,
          filesSkipped: result.filesSkipped,
          duration,
          filesPerSecond: result.filesPerSecond,
          databaseSize: dbSize,
          errors: result.errors.length
        });

        // Close database
        database.close();

        // Format output
        if (options.format === 'json') {
          formatter.success('Indexing complete', {
            filesIndexed: result.filesIndexed,
            filesSkipped: result.filesSkipped,
            duration,
            filesPerSecond: Math.round(result.filesPerSecond),
            databaseSize: dbSize,
            errors: result.errors
          });
        } else {
          console.log('');
          console.log(chalk.green('✓') + ' Indexing complete');
          console.log('');
          console.log(chalk.bold('Statistics:'));
          console.log(`  Files indexed:    ${chalk.cyan(result.filesIndexed)}`);
          console.log(`  Files skipped:    ${chalk.yellow(result.filesSkipped)}`);
          console.log(`  Total time:       ${chalk.cyan(duration.toFixed(2))} seconds`);
          console.log(`  Indexing speed:   ${chalk.cyan(Math.round(result.filesPerSecond))} files/second`);
          console.log(`  Database size:    ${chalk.cyan(formatBytes(dbSize))}`);

          if (result.errors.length > 0) {
            console.log('');
            console.log(chalk.yellow('⚠ Warnings:'));
            result.errors.slice(0, 5).forEach(error => {
              console.log(`  - ${error}`);
            });
            if (result.errors.length > 5) {
              console.log(`  ... and ${result.errors.length - 5} more`);
            }
          }

          // Performance assessment
          console.log('');
          if (result.filesPerSecond >= 1000) {
            console.log(chalk.green('✓') + ' Performance target met (≥1000 files/second)');
          } else if (result.filesPerSecond >= 500) {
            console.log(chalk.yellow('⚠') + ` Performance below target: ${Math.round(result.filesPerSecond)} files/second (target: 1000)`);
          } else {
            console.log(chalk.red('✗') + ` Performance issue: ${Math.round(result.filesPerSecond)} files/second (target: 1000)`);
          }
        }

        // Exit with appropriate code
        process.exit(result.errors.length > 0 ? 1 : 0);
      } catch (error) {
        logger.error('indexing-failed', {
          error: String(error),
          stack: error instanceof Error ? error.stack : undefined
        });

        formatter.error('Indexing failed', {
          message: error instanceof Error ? error.message : String(error)
        });

        process.exit(1);
      }
    });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}