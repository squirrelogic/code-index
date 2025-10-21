/**
 * Simplified Index Command
 *
 * Indexes files using hybrid sparse+dense approach.
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { DatabaseService } from '../../services/database.js';
import { IndexerService } from '../../services/indexer.js';
import { HybridIndex } from '../../services/hybrid-index.js';
import { ASTPersistenceService } from '../../services/ast-persistence.js';
import { OnnxEmbedder } from '../../services/onnx-embedder.js';
import { IndexStoreService } from '../../services/index-store.js';
import { Logger } from '../utils/logger.js';
import { OutputFormatter } from '../utils/output.js';

interface IndexCommandOptions {
  verbose?: boolean;
  force?: boolean;
  batchSize?: number;
  followSymlinks?: boolean;
  format?: 'human' | 'json';
  quiet?: boolean;
}

export function createIndexCommand(): Command {
  return new Command('index')
    .description('Index all project files using hybrid search')
    .option('-v, --verbose', 'Show detailed progress information')
    .option('-f, --force', 'Force re-indexing even if index exists')
    .option('-b, --batch-size <size>', 'Number of files to process per batch', '100')
    .option('-s, --follow-symlinks', 'Follow symbolic links during indexing')
    .option('-q, --quiet', 'Suppress warnings and performance messages')
    .option('--format <type>', 'Output format (human or json)', 'human')
    .action(async (options: IndexCommandOptions) => {
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

        // Check existing index
        const existingCount = database.getFileCount();
        if (existingCount > 0 && !options.force) {
          formatter.warning('Index already exists', {
            message: `Index already contains ${existingCount} files. Use --force to re-index.`,
            fileCount: existingCount,
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

        // Create indexer service
        const indexer = new IndexerService(
          cwd,
          database,
          hybridIndex,
          astPersistence,
          logger
        );

        // Start indexing
        formatter.info('Starting indexing', {
          path: cwd,
          batchSize: options.batchSize,
        });

        if (options.verbose && options.format === 'human') {
          console.log(chalk.blue('Scanning files...'));
        }

        const startTime = Date.now();
        const batchSize =
          typeof options.batchSize === 'string'
            ? parseInt(options.batchSize)
            : options.batchSize || 100;

        const result = await indexer.indexProject({
          verbose: options.verbose,
          batchSize,
          followSymlinks: options.followSymlinks,
        });

        // Calculate statistics
        const duration = (Date.now() - startTime) / 1000;
        const stats = database.getStats();

        // Close services
        await embedder.dispose();
        database.close();

        // Format output
        if (options.format === 'json') {
          formatter.success('Indexing complete', {
            filesIndexed: result.filesIndexed,
            filesSkipped: result.filesSkipped,
            duration,
            filesPerSecond: Math.round(result.filesPerSecond),
            databaseSize: stats.dbSizeBytes,
            errors: result.errors,
          });
        } else {
          console.log('');
          console.log(chalk.green('✓') + ' Indexing complete');
          console.log('');
          console.log(chalk.bold('Statistics:'));
          console.log(`  Files indexed:    ${chalk.cyan(result.filesIndexed)}`);
          console.log(`  Files skipped:    ${chalk.yellow(result.filesSkipped)}`);
          console.log(
            `  Total time:       ${chalk.cyan(duration.toFixed(2))} seconds`
          );
          console.log(
            `  Indexing speed:   ${chalk.cyan(Math.round(result.filesPerSecond))} files/second`
          );
          console.log(
            `  Database size:    ${chalk.cyan(formatBytes(stats.dbSizeBytes))}`
          );

          if (!options.quiet && result.errors.length > 0) {
            console.log('');
            console.log(chalk.yellow('⚠ Warnings:'));
            result.errors.slice(0, 5).forEach(error => {
              console.log(`  - ${error}`);
            });
            if (result.errors.length > 5) {
              console.log(`  ... and ${result.errors.length - 5} more`);
            }
          }

          // Performance assessment (skip for hybrid search with ONNX - it's expected to be slower)
          if (!options.quiet && result.filesPerSecond < 50) {
            console.log('');
            console.log(
              chalk.yellow('⚠') +
                ` Slow indexing: ${Math.round(result.filesPerSecond)} files/second`
            );
            console.log(
              chalk.dim('  Note: Neural embedding generation is CPU-intensive')
            );
          }
        }

        // Exit with appropriate code
        process.exit(result.errors.length > 0 ? 1 : 0);
      } catch (error) {
        logger.error('indexing-failed', {
          error: String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        formatter.error('Indexing failed', {
          message: error instanceof Error ? error.message : String(error),
        });

        process.exit(1);
      }
    });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}
