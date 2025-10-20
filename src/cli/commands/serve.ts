import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { MCPServer } from '../../services/mcp-server.js';

interface ServeOptions {
  project?: string;
}

/**
 * Create the serve command
 *
 * Starts the MCP (Model Context Protocol) server for code intelligence.
 * The server listens on stdio for JSON-RPC 2.0 requests and provides
 * 8 tool functions for AI assistants:
 * - search: Search codebase
 * - find_def: Find symbol definition
 * - find_refs: Find symbol references
 * - callers: Find function callers
 * - callees: Find function callees
 * - open_at: Open file at specific line
 * - refresh: Refresh code index
 * - symbols: List symbols
 */
export function createServeCommand(): Command {
  const command = new Command('serve');

  command
    .description('Start MCP server for code intelligence (stdio transport)')
    .option('-p, --project <path>', 'Project root directory (defaults to current directory)')
    .action(async (options: ServeOptions) => {
      const projectRoot = options.project || process.cwd();
      const dbPath = join(projectRoot, '.codeindex', 'index.db');

      // Verify database exists
      if (!existsSync(dbPath)) {
        console.error(chalk.red('\n❌ Error: Code index not found'));
        console.error(chalk.gray('\nRun the following command first:'));
        console.error(chalk.cyan('  code-index index\n'));
        process.exit(1);
      }

      try {
        // Initialize MCP server
        const server = new MCPServer(projectRoot);

        // Log to stderr (stdout is reserved for JSON-RPC protocol)
        process.stderr.write(chalk.green('✓ MCP server starting...\n'));
        process.stderr.write(chalk.gray(`  Project: ${projectRoot}\n`));
        process.stderr.write(chalk.gray(`  Database: ${dbPath}\n`));

        if (process.env.CODE_INDEX_AUTH_TOKEN) {
          process.stderr.write(chalk.yellow('  Auth: Enabled\n'));
        } else {
          process.stderr.write(chalk.gray('  Auth: Disabled\n'));
        }

        process.stderr.write(chalk.gray('\nAvailable tools:\n'));
        process.stderr.write(chalk.gray('  • search        - Search codebase\n'));
        process.stderr.write(chalk.gray('  • find_def      - Find symbol definition\n'));
        process.stderr.write(chalk.gray('  • find_refs     - Find symbol references\n'));
        process.stderr.write(chalk.gray('  • callers       - Find function callers\n'));
        process.stderr.write(chalk.gray('  • callees       - Find function callees\n'));
        process.stderr.write(chalk.gray('  • open_at       - Open file at line\n'));
        process.stderr.write(chalk.gray('  • refresh       - Refresh index\n'));
        process.stderr.write(chalk.gray('  • symbols       - List symbols\n'));
        process.stderr.write(chalk.gray('\nListening on stdio for JSON-RPC 2.0 requests...\n\n'));

        // Start server (blocks until shutdown)
        await server.start();

      } catch (error: any) {
        process.stderr.write(chalk.red(`\n❌ Failed to start MCP server: ${error.message}\n\n`));
        process.exit(1);
      }
    });

  return command;
}
