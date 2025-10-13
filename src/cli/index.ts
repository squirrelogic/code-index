#!/usr/bin/env node

import { Command } from 'commander';
import { OutputFormatter, OutputFormat } from './utils/output.js';

const program = new Command();
const output = new OutputFormatter();

program
  .name('code-index')
  .description('A CLI tool for local code indexing and search using SQLite')
  .version('1.0.0')
  .option('--json', 'Output results in JSON format')
  .hook('preAction', (thisCommand) => {
    // Set output format based on global --json flag
    const opts = thisCommand.opts();
    if (opts.json) {
      output.setFormat(OutputFormat.JSON);
    }
  });

// Error handling
program.exitOverride();

process.on('SIGINT', () => {
  console.log('\nOperation cancelled.');
  process.exit(130);
});

process.on('SIGTERM', () => {
  process.exit(143);
});

// Import and register commands
import { createInitCommand } from './commands/init.js';
import { createIndexCommand } from './commands/index.js';
import { createSearchCommand } from './commands/search.js';
import { createRefreshCommand } from './commands/refresh.js';
import { createDoctorCommand } from './commands/doctor.js';
import { createUninstallCommand } from './commands/uninstall.js';
import { createWatchCommand } from './commands/watch.js';
import { createHooksCommand } from './commands/hooks.js';
import { createDiagnoseCommand } from './commands/diagnose.js';

// Register commands
program.addCommand(createInitCommand());
program.addCommand(createIndexCommand());
program.addCommand(createSearchCommand());
program.addCommand(createRefreshCommand());
program.addCommand(createDoctorCommand());
program.addCommand(createUninstallCommand());
program.addCommand(createWatchCommand());
program.addCommand(createHooksCommand());
program.addCommand(createDiagnoseCommand());

// Parse arguments
try {
  program.parse(process.argv);
} catch (error: any) {
  output.error(error.message);
  process.exit(1);
}

// Export for use in commands
export { program, output };