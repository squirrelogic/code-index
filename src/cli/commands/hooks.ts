/**
 * Hooks Command
 *
 * Manages Git hooks for automatic code indexing.
 * Commands: install, uninstall, status
 */

import { Command } from 'commander';
import { GitHooksService } from '../../services/git/GitHooks.js';
import { GitHookType } from '../../models/GitHookConfiguration.js';
import { output } from '../utils/output.js';

const out = output;

export function createHooksCommand(): Command {
  const command = new Command('hooks')
    .description('Manage Git hooks for automatic code indexing')
    .addCommand(createInstallCommand())
    .addCommand(createUninstallCommand())
    .addCommand(createStatusCommand());

  return command;
}

/**
 * hooks install command
 */
function createInstallCommand(): Command {
  return new Command('install')
    .description('Install Git hooks for automatic indexing')
    .option(
      '--hooks <hooks>',
      'Comma-separated list of hooks to install (post-merge,post-checkout,post-rewrite)',
      'all'
    )
    .option('--force', 'Force reinstall even if hooks already exist')
    .action(async (options) => {
      try {
        const service = new GitHooksService();

        // Parse hooks option
        const hooksToInstall: GitHookType[] =
          options.hooks === 'all'
            ? [GitHookType.POST_MERGE, GitHookType.POST_CHECKOUT, GitHookType.POST_REWRITE]
            : options.hooks.split(',').map((h: string) => h.trim() as GitHookType);

        // Validate hook types
        const validHooks = Object.values(GitHookType);
        for (const hook of hooksToInstall) {
          if (!validHooks.includes(hook)) {
            out.error(`Invalid hook type: ${hook}`);
            out.info(`Valid hooks: ${validHooks.join(', ')}`);
            process.exit(1);
          }
        }

        // Install each hook
        let installed = 0;
        let skipped = 0;
        for (const hookType of hooksToInstall) {
          try {
            await service.installHook(hookType, options.force);
            out.success(`Installed ${hookType} hook`);
            installed++;
          } catch (error) {
            if ((error as Error).message.includes('already installed')) {
              out.info(`${hookType} already installed (use --force to reinstall)`);
              skipped++;
            } else {
              out.error(`Failed to install ${hookType}: ${(error as Error).message}`);
            }
          }
        }

        out.info('');
        out.success(`✓ Installed ${installed} hook(s)`);
        if (skipped > 0) {
          out.info(`  Skipped ${skipped} (already installed)`);
        }

        process.exit(0);
      } catch (error) {
        out.error(`Failed to install hooks: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}

/**
 * hooks uninstall command
 */
function createUninstallCommand(): Command {
  return new Command('uninstall')
    .description('Uninstall Git hooks')
    .option(
      '--hooks <hooks>',
      'Comma-separated list of hooks to uninstall (post-merge,post-checkout,post-rewrite)',
      'all'
    )
    .action(async (options) => {
      try {
        const service = new GitHooksService();

        // Parse hooks option
        const hooksToUninstall: GitHookType[] =
          options.hooks === 'all'
            ? [GitHookType.POST_MERGE, GitHookType.POST_CHECKOUT, GitHookType.POST_REWRITE]
            : options.hooks.split(',').map((h: string) => h.trim() as GitHookType);

        // Uninstall each hook
        let uninstalled = 0;
        let notFound = 0;
        for (const hookType of hooksToUninstall) {
          try {
            await service.uninstallHook(hookType);
            out.success(`Uninstalled ${hookType} hook`);
            uninstalled++;
          } catch (error) {
            if ((error as Error).message.includes('is not installed')) {
              out.info(`${hookType} is not installed`);
              notFound++;
            } else {
              out.error(`Failed to uninstall ${hookType}: ${(error as Error).message}`);
            }
          }
        }

        out.info('');
        out.success(`✓ Uninstalled ${uninstalled} hook(s)`);
        if (notFound > 0) {
          out.info(`  ${notFound} hook(s) were not installed`);
        }

        process.exit(0);
      } catch (error) {
        out.error(`Failed to uninstall hooks: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}

/**
 * hooks status command
 */
function createStatusCommand(): Command {
  return new Command('status')
    .description('Show status of Git hooks')
    .action(async () => {
      try {
        const service = new GitHooksService();
        const configs = await service.getAllHookConfigurations();

        out.info('Git Hooks Status:');
        out.info('');

        for (const config of configs) {
          const status = config.installed ? '✓ Installed' : '✗ Not installed';
          const statusColor = config.installed ? '\x1b[32m' : '\x1b[31m';
          const resetColor = '\x1b[0m';

          console.log(`  ${config.name}:`);
          console.log(`    Status: ${statusColor}${status}${resetColor}`);
          console.log(`    Path: ${config.path}`);

          if (config.installed) {
            console.log(`    Version: ${config.version}`);
            console.log(`    Enabled: ${config.enabled ? 'Yes' : 'No'}`);
            console.log(`    Timeout: ${config.timeout}ms`);
            console.log(`    Blocking: ${config.blocking ? 'Yes' : 'No'}`);

            if (config.installedAt) {
              const date = new Date(config.installedAt).toLocaleString();
              console.log(`    Installed: ${date}`);
            }

            if (config.executionCount > 0) {
              console.log(`    Executions: ${config.executionCount}`);
              if (config.averageRuntime) {
                console.log(`    Avg Runtime: ${config.averageRuntime}ms`);
              }
              if (config.failureCount > 0) {
                console.log(`    Failures: ${config.failureCount}`);
              }
            }
          }

          console.log('');
        }

        const installedCount = configs.filter((c) => c.installed).length;
        out.success(`${installedCount} of ${configs.length} hooks installed`);

        process.exit(0);
      } catch (error) {
        out.error(`Failed to get hook status: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
