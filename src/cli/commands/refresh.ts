/**
 * Refresh Command
 *
 * Incrementally updates the index for changed files only.
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { DatabaseService } from '../../services/database.js';
import { IndexerService } from '../../services/indexer.js';
import { HybridIndex } from '../../services/hybrid-index.js';
import { SymbolIndex } from '../../services/symbol-index.js';
import { ASTPersistenceService } from '../../services/ast-persistence.js';
import { OnnxEmbedder } from '../../services/onnx-embedder.js';
import { IndexStoreService } from '../../services/index-store.js';
import { Logger } from '../utils/logger.js';
import { OutputFormatter } from '../utils/output.js';

interface RefreshCommandOptions {
  verbose?: boolean;
  batchSize?: number;
  followSymlinks?: boolean;
  format?: 'human' | 'json';
  quiet?: boolean;
}

export function createRefreshCommand(): Command {
  return new Command('refresh')
    .description('Incrementally update index for changed files')
    .argument('[files...]', 'Specific files to refresh (optional, refreshes all if omitted)')
    .option('-v, --verbose', 'Show detailed progress information')
    .option('-b, --batch-size <size>', 'Number of files to process per batch', '100')
    .option('-s, --follow-symlinks', 'Follow symbolic links during refresh')
    .option('-q, --quiet', 'Suppress warnings')
    .option('--format <type>', 'Output format (human or json)', 'human')
    .action(async (files: string[], options: RefreshCommandOptions) => {
      const cwd = process.cwd();
      const codeIndexDir = join(cwd, '.codeindex');
      const formatter = new OutputFormatter();

      // Check if initialization has been done
      if (!existsSync(codeIndexDir)) {
        formatter.error('Project not initialized', {
          message: 'Project has not been initialized. Please run "code-index init" first.',
          path: cwd,
        });
        process.exit(1);
      }

      const logger = new Logger(cwd);

      try {
        // Initialize database
        const dbPath = join(codeIndexDir, 'index.db');
        const database = new DatabaseService(dbPath);

        // Check if index exists
        const existingCount = database.getFileCount();
        if (existingCount === 0) {
          formatter.warning('No existing index', {
            message: 'No index found. Use "code-index index" to create initial index.',
          });
          database.close();
          process.exit(1);
        }

        // Initialize hybrid index components
        const modelPath = join(codeIndexDir, 'models', 'gte-small.onnx');
        if (!existsSync(modelPath)) {
          throw new Error(
            'ONNX model not found. Run "code-index init" to download the model.'
          );
        }

        const embedder = new OnnxEmbedder(modelPath);
        await embedder.init();

        const indexStore = new IndexStoreService(codeIndexDir);
        await indexStore.initialize();

        const astPersistence = new ASTPersistenceService(codeIndexDir);
        await astPersistence.initialize();

        const hybridIndex = new HybridIndex(embedder, indexStore);
        await hybridIndex.load();

        const symbolIndex = new SymbolIndex();

        // Create indexer service
        const indexer = new IndexerService(
          cwd,
          database,
          hybridIndex,
          symbolIndex,
          astPersistence,
          logger
        );

        // Start refresh
        const isFileSpecific = files && files.length > 0;

        formatter.info(isFileSpecific ? 'Starting file-specific refresh' : 'Starting incremental refresh', {
          path: cwd,
          batchSize: options.batchSize,
          existingFiles: existingCount,
          ...(isFileSpecific && { targetFiles: files.length }),
        });

        if (options.verbose && options.format === 'human') {
          if (isFileSpecific) {
            console.log(chalk.blue(`Refreshing ${files.length} specific file(s)...`));
          } else {
            console.log(chalk.blue('Scanning for changes...'));
          }
        }

        const startTime = Date.now();
        const batchSize =
          typeof options.batchSize === 'string'
            ? parseInt(options.batchSize)
            : options.batchSize || 100;

        const result = isFileSpecific
          ? await indexer.refreshFiles(files, {
              verbose: options.verbose,
              batchSize,
              followSymlinks: options.followSymlinks,
            })
          : await indexer.refreshIndex({
              verbose: options.verbose,
              batchSize,
              followSymlinks: options.followSymlinks,
            });

        // Calculate statistics
        const duration = (Date.now() - startTime) / 1000;
        const stats = database.getStats();
        const sizeKB = stats.dbSizeBytes / 1024;
        const sizeFormatted = sizeKB < 1024
          ? `${sizeKB.toFixed(2)} KB`
          : `${(sizeKB / 1024).toFixed(2)} MB`;

        // Output results
        if (options.format === 'json') {
          console.log(
            JSON.stringify(
              {
                success: true,
                statistics: {
                  filesUpdated: result.filesUpdated,
                  filesAdded: result.filesAdded,
                  filesDeleted: result.filesDeleted,
                  totalFiles: stats.fileCount,
                  totalTime: duration,
                  filesPerSecond: result.filesPerSecond,
                },
                warnings: result.errors.slice(0, 10),
              },
              null,
              2
            )
          );
        } else {
          console.log('');
          console.log(chalk.green('✓ Refresh complete'));
          console.log('');
          console.log('Statistics:');
          console.log(`  Files updated:    ${result.filesUpdated}`);
          console.log(`  Files added:      ${result.filesAdded}`);
          console.log(`  Files deleted:    ${result.filesDeleted}`);
          console.log(`  Total files:      ${stats.fileCount}`);
          console.log(`  Total time:       ${duration.toFixed(2)} seconds`);
          console.log(
            `  Refresh speed:    ${Math.round(result.filesPerSecond)} files/second`
          );
          console.log(`  Database size:    ${sizeFormatted}`);

          if (!options.quiet && result.errors.length > 0) {
            console.log('');
            console.log(chalk.yellow('⚠ Warnings:'));
            result.errors.slice(0, 10).forEach(err => {
              console.log(chalk.dim(`  - ${err}`));
            });
            if (result.errors.length > 10) {
              console.log(
                chalk.dim(`  ... and ${result.errors.length - 10} more`)
              );
            }
          }
        }

        database.close();
        process.exit(0);
      } catch (error) {
        formatter.error('Refresh failed', {
          message: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });
}
