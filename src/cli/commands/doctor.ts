/**
 * Doctor Command - Simplified
 *
 * Diagnostic tool for code-index health.
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { DatabaseService } from '../../services/database.js';
import { IndexStoreService } from '../../services/index-store.js';
import { ASTPersistenceService } from '../../services/ast-persistence.js';

export function createDoctorCommand(): Command {
  return new Command('doctor')
    .description('Check code-index health and display diagnostic information')
    .action(async () => {
      const cwd = process.cwd();
      const codeIndexDir = join(cwd, '.codeindex');

      console.log(chalk.bold('\n🔍 Code-Index Doctor\n'));

      // Check initialization
      if (!existsSync(codeIndexDir)) {
        console.log(chalk.red('✗') + ' Not initialized');
        console.log(
          chalk.dim('  Run "code-index init" to set up code-index\n')
        );
        process.exit(1);
      }

      console.log(chalk.green('✓') + ' Initialized');

      // Check database
      const dbPath = join(codeIndexDir, 'index.db');
      if (existsSync(dbPath)) {
        console.log(chalk.green('✓') + ' Database exists');

        try {
          const db = new DatabaseService(dbPath);
          const stats = db.getStats();

          console.log(chalk.dim(`  Files indexed: ${stats.fileCount}`));
          console.log(
            chalk.dim(
              `  Database size: ${formatBytes(stats.dbSizeBytes)}`
            )
          );
          console.log(chalk.dim(`  Schema version: ${stats.schemaVersion}`));

          db.close();
        } catch (error) {
          console.log(
            chalk.yellow('⚠') +
              ` Database error: ${error instanceof Error ? error.message : error}`
          );
        }
      } else {
        console.log(chalk.yellow('⚠') + ' Database not found');
      }

      // Check model
      const modelPath = join(codeIndexDir, 'models', 'gte-small.onnx');
      if (existsSync(modelPath)) {
        console.log(chalk.green('✓') + ' ONNX model exists (gte-small.onnx)');
        console.log(chalk.dim('  Dimensions: 384'));
      } else {
        console.log(chalk.red('✗') + ' ONNX model not found');
        console.log(
          chalk.dim('  Run "code-index init" to download the model')
        );
      }

      // Check vector index
      const indexStore = new IndexStoreService(codeIndexDir);
      const indexExists = await indexStore.exists();

      if (indexExists) {
        console.log(chalk.green('✓') + ' Vector index exists');

        const indexStats = await indexStore.getStats();
        console.log(
          chalk.dim(
            `  Sparse vectors: ${formatBytes(indexStats.sparseSizeBytes)}`
          )
        );
        console.log(
          chalk.dim(
            `  Dense vectors: ${formatBytes(indexStats.denseSizeBytes)}`
          )
        );
        console.log(
          chalk.dim(`  Total: ${formatBytes(indexStats.totalSizeBytes)}`)
        );
      } else {
        console.log(chalk.yellow('⚠') + ' Vector index not found');
        console.log(
          chalk.dim('  Run "code-index index" to create the index')
        );
      }

      // Check AST storage
      const astPersistence = new ASTPersistenceService(codeIndexDir);
      const astStats = await astPersistence.getStats();

      if (astStats.totalFiles > 0) {
        console.log(chalk.green('✓') + ' AST storage populated');
        console.log(chalk.dim(`  Files: ${astStats.totalFiles}`));
        console.log(
          chalk.dim(`  Total size: ${formatBytes(astStats.totalSizeBytes)}`)
        );
        console.log(
          chalk.dim(
            `  Average per file: ${formatBytes(astStats.averageSizeBytes)}`
          )
        );
      } else {
        console.log(chalk.yellow('⚠') + ' AST storage empty');
        console.log(
          chalk.dim('  Run "code-index index" to populate AST storage')
        );
      }

      console.log('');
      console.log(chalk.bold('Summary:'));
      console.log(
        chalk.dim(
          '  Code-index is using hybrid sparse+dense search architecture'
        )
      );
      console.log(
        chalk.dim(
          '  Model: gte-small.onnx (384 dimensions)'
        )
      );
      console.log(
        chalk.dim(
          '  Scoring: 60% dense + 40% sparse (configurable)'
        )
      );
      console.log('');

      process.exit(0);
    });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}
