import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { DatabaseService } from '../../services/database.js';
import { IndexerService } from '../../services/indexer.js';
import { IncrementalIndexer } from '../../services/indexer/IncrementalIndexer.js';
import { Logger } from '../utils/logger.js';
import { OutputFormatter, OutputFormat } from '../utils/output.js';
import { GitDiffReader } from '../../services/git/GitDiffReader.js';
import { GitRepository } from '../../services/git/GitRepository.js';
import { ChangedFilesProcessor } from '../../services/git/ChangedFilesProcessor.js';

interface RefreshOptions {
  verbose?: boolean;
  json?: boolean;
  changed?: boolean;
  gitRange?: string;
  dryRun?: boolean;
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
    .option('-c, --changed', 'Index only files changed in the last Git commit')
    .option('-r, --git-range <range>', 'Index files changed in a Git range (e.g., HEAD~3..HEAD)')
    .option('-d, --dry-run', 'Show what would be indexed without making changes')
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

        // Handle --changed or --git-range mode
        if (options.changed || options.gitRange) {
          await handleGitMode(projectRoot, options, formatter, logger);
          return;
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

/**
 * Handle --changed or --git-range mode
 */
async function handleGitMode(
  projectRoot: string,
  options: RefreshOptions,
  formatter: OutputFormatter,
  logger: Logger
): Promise<void> {
  try {
    // Check if this is a Git repository
    const repository = new GitRepository(projectRoot);
    const repoInfo = await repository.getInfo();

    if (!repoInfo.isRepository) {
      formatter.error('Not a Git repository. Cannot use --changed or --git-range options.');
      process.exit(1);
    }

    if (!repoInfo.headCommit) {
      formatter.error('No commits found in repository. Cannot use --changed or --git-range options.');
      process.exit(1);
    }

    // Get the diff
    const diffReader = new GitDiffReader(projectRoot);
    let diff;

    if (options.gitRange) {
      formatter.info(`Reading changes from range: ${options.gitRange}`);
      diff = await diffReader.getChangesFromRange(options.gitRange);
    } else {
      formatter.info('Reading changes from last commit...');
      diff = await diffReader.getLastCommitChanges();
    }

    if (!diff) {
      formatter.error('Could not read Git changes.');
      process.exit(1);
    }

    if (diff.changedFiles.length === 0) {
      formatter.info('No changed files found.');
      process.exit(0);
    }

    // Dry-run mode: just display what would be indexed
    if (options.dryRun) {
      console.log('');
      console.log(chalk.bold('Files that would be indexed:'));
      console.log('');

      let addedCount = 0;
      let modifiedCount = 0;
      let deletedCount = 0;

      for (const file of diff.changedFiles) {
        let symbol = '•';
        let color = chalk.gray;

        if (file.status === 'A') {
          symbol = '+';
          color = chalk.green;
          addedCount++;
        } else if (file.status === 'M') {
          symbol = '~';
          color = chalk.yellow;
          modifiedCount++;
        } else if (file.status === 'D') {
          symbol = '-';
          color = chalk.red;
          deletedCount++;
        } else if (file.status === 'R') {
          symbol = '→';
          color = chalk.blue;
          addedCount++; // Counted as add for the new path
        }

        const displayPath = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;
        console.log(color(`  ${symbol} ${displayPath}`));
      }

      console.log('');
      console.log(chalk.dim(`Total: ${diff.changedFiles.length} files`));
      console.log(chalk.dim(`  ${addedCount} added, ${modifiedCount} modified, ${deletedCount} deleted`));
      console.log('');
      console.log(chalk.dim('Run without --dry-run to perform the indexing.'));

      process.exit(0);
    }

    // Initialize database and processor
    const database = new DatabaseService(projectRoot);
    database.open();

    const incrementalIndexer = new IncrementalIndexer(database, projectRoot);
    const processor = new ChangedFilesProcessor(projectRoot, incrementalIndexer);

    formatter.info(`Processing ${diff.changedFiles.length} changed files...`);

    // Process the changes
    const result = await processor.processCommitDiff(diff);

    // Report results
    if (options.json) {
      formatter.json({
        success: true,
        filesProcessed: result.filesProcessed,
        filesAdded: result.filesAdded,
        filesModified: result.filesModified,
        filesDeleted: result.filesDeleted,
        filesSkipped: result.filesSkipped,
        errors: result.errors,
        durationMs: result.duration
      });
    } else {
      console.log('');
      console.log(chalk.bold('Git Changes Processed:'));
      console.log(chalk.green(`  + ${result.filesAdded} files added`));
      console.log(chalk.yellow(`  ~ ${result.filesModified} files modified`));
      console.log(chalk.red(`  - ${result.filesDeleted} files deleted`));

      if (result.filesSkipped > 0) {
        console.log(chalk.gray(`  • ${result.filesSkipped} files skipped`));
      }

      if (result.errors.length > 0) {
        console.log('');
        console.log(chalk.yellow(`⚠ ${result.errors.length} errors occurred:`));
        result.errors.slice(0, 5).forEach(error => {
          console.log(chalk.yellow(`  - ${error.file}: ${error.error}`));
        });
        if (result.errors.length > 5) {
          console.log(chalk.yellow(`  ... and ${result.errors.length - 5} more`));
        }
      }

      console.log('');
      console.log(chalk.dim(`Time: ${(result.duration / 1000).toFixed(2)}s`));

      // Log the operation
      logger.info('git-mode-complete', {
        mode: options.gitRange ? 'range' : 'changed',
        range: options.gitRange,
        filesProcessed: result.filesProcessed,
        filesAdded: result.filesAdded,
        filesModified: result.filesModified,
        filesDeleted: result.filesDeleted,
        duration: result.duration
      });
    }

    database.close();
    process.exit(0);
  } catch (error) {
    logger.error('git-mode-error', { error: String(error) });
    formatter.error(`Git mode failed: ${error}`);
    process.exit(1);
  }
}