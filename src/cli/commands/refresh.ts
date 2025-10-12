import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { DatabaseService } from '../../services/database.js';
import { IndexerService } from '../../services/indexer.js';
import { Logger } from '../utils/logger.js';
import { OutputFormatter, OutputFormat } from '../utils/output.js';

interface RefreshOptions {
  verbose?: boolean;
  json?: boolean;
}

/**
 * Create the refresh command
 */
export function createRefreshCommand(): Command {
  const command = new Command('refresh');

  command
    .description('Update the index for modified files only')
    .option('-v, --verbose', 'Show detailed progress information')
    .option('-j, --json', 'Output results in JSON format')
    .action(async (options: RefreshOptions) => {
      const projectRoot = process.cwd();
      const logger = new Logger(projectRoot);
      const formatter = new OutputFormatter(options.json ? OutputFormat.JSON : OutputFormat.HUMAN);

      try {
        // Check if project is initialized
        const codeIndexDir = join(projectRoot, '.codeindex');
        const dbPath = join(codeIndexDir, 'index.db');

        if (!existsSync(dbPath)) {
          formatter.error('Project not initialized. Run "code-index init" first.');
          process.exit(1);
        }

        // Initialize database
        const database = new DatabaseService(projectRoot);
        database.open();

        // Check if index exists
        const entryCount = database.getEntryCount();
        if (entryCount === 0) {
          formatter.warning('No existing index found. Running full index instead...');

          // Run full index
          const indexer = new IndexerService(projectRoot, database, logger);
          const result = await indexer.indexProject({ verbose: options.verbose });

          // Update last indexed timestamp
          const config = database.getProjectConfig();
          if (config) {
            config.lastIndexedAt = new Date();
            database.saveProjectConfig(config);
          }

          formatter.success('Initial indexing complete', {
            filesIndexed: result.filesIndexed,
            filesSkipped: result.filesSkipped,
            time: `${(result.totalTime / 1000).toFixed(2)}s`,
            rate: `${result.filesPerSecond.toFixed(0)} files/sec`
          });

          database.close();
          process.exit(0);
        }

        // Run incremental refresh
        formatter.info('Refreshing index...');

        const indexer = new IndexerService(projectRoot, database, logger);
        const startTime = Date.now();
        const result = await indexer.refreshIndex({ verbose: options.verbose });
        const elapsed = Date.now() - startTime;

        // Update last refreshed timestamp
        const config = database.getProjectConfig();
        if (config) {
          config.lastRefreshedAt = new Date();
          database.saveProjectConfig(config);
        }

        // Report results
        if (options.json) {
          formatter.json({
            success: true,
            filesUpdated: result.filesUpdated,
            filesAdded: result.filesAdded,
            filesDeleted: result.filesDeleted,
            filesSkipped: result.filesSkipped,
            totalProcessed: result.filesIndexed,
            timeMs: elapsed,
            filesPerSecond: result.filesPerSecond,
            errors: result.errors
          });
        } else {
          // Summary statistics
          console.log('');
          console.log(chalk.bold('Refresh Summary:'));
          console.log(chalk.green(`  ✓ ${result.filesUpdated} files updated`));
          console.log(chalk.green(`  + ${result.filesAdded} files added`));
          console.log(chalk.red(`  - ${result.filesDeleted} files deleted`));
          console.log(chalk.gray(`  • ${result.filesSkipped} files unchanged`));

          if (result.errors.length > 0) {
            console.log('');
            console.log(chalk.yellow(`⚠ ${result.errors.length} errors occurred:`));
            result.errors.slice(0, 5).forEach(error => {
              console.log(chalk.yellow(`  - ${error}`));
            });
            if (result.errors.length > 5) {
              console.log(chalk.yellow(`  ... and ${result.errors.length - 5} more`));
            }
          }

          console.log('');
          console.log(chalk.dim(`Time: ${(elapsed / 1000).toFixed(2)}s`));

          if (result.filesIndexed > 0) {
            console.log(chalk.dim(`Rate: ${result.filesPerSecond.toFixed(0)} files/sec`));
          }

          // Log the operation
          logger.info('refresh-complete', {
            filesUpdated: result.filesUpdated,
            filesAdded: result.filesAdded,
            filesDeleted: result.filesDeleted,
            filesSkipped: result.filesSkipped,
            elapsed
          });
        }

        database.close();
        process.exit(0);
      } catch (error) {
        logger.error('refresh-error', { error: String(error) });
        formatter.error(`Refresh failed: ${error}`);
        process.exit(1);
      }
    });

  return command;
}