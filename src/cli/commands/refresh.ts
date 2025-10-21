/**
 * Refresh Command - Stub
 *
 * Incrementally updates the index for changed files.
 * TODO: Fully implement with hybrid index
 */

import { Command } from 'commander';
import chalk from 'chalk';

export function createRefreshCommand(): Command {
  return new Command('refresh')
    .description('Refresh index for changed files (stub - use "code-index index --force" for now)')
    .action(async () => {
      console.log(chalk.yellow('⚠ Refresh command is being refactored.'));
      console.log(chalk.dim('  Use "code-index index --force" to re-index the project.'));
      console.log('');
      console.log(chalk.dim('  The refresh command will be available in a future update.'));
      process.exit(0);
    });
}
