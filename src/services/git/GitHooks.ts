/**
 * Git Hooks Service
 *
 * Manages installation, uninstallation, and status of Git hooks.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import {
  GitHookType,
  GitHookConfiguration,
  createGitHookConfiguration,
  validateGitHookConfiguration,
} from '../../models/GitHookConfiguration.js';
import { generateHookScript, hasHookMarker } from './HookTemplates.js';

export class GitHooksService {
  private git = simpleGit();

  /**
   * Find the .git directory for the current repository
   */
  private async findGitDirectory(): Promise<string> {
    try {
      const gitDir = await this.git.revparse(['--git-dir']);
      return path.resolve(gitDir.trim());
    } catch (error) {
      throw new Error('Not a Git repository or unable to find .git directory');
    }
  }

  /**
   * Get the path to a specific hook file
   */
  private async getHookPath(hookType: GitHookType): Promise<string> {
    const gitDir = await this.findGitDirectory();
    return path.join(gitDir, 'hooks', hookType);
  }

  /**
   * Check if a hook is installed
   */
  async isHookInstalled(hookType: GitHookType): Promise<boolean> {
    try {
      const hookPath = await this.getHookPath(hookType);
      const content = await fs.readFile(hookPath, 'utf-8');
      return hasHookMarker(content);
    } catch (error) {
      // File doesn't exist or can't be read
      return false;
    }
  }

  /**
   * Get the configuration for a specific hook
   */
  async getHookConfiguration(hookType: GitHookType): Promise<GitHookConfiguration> {
    const hookPath = await this.getHookPath(hookType);
    const installed = await this.isHookInstalled(hookType);

    const config = createGitHookConfiguration(hookType, hookPath);
    config.installed = installed;

    if (installed) {
      try {
        const stats = await fs.stat(hookPath);
        config.installedAt = stats.mtime.getTime();
      } catch {
        // Ignore stat errors
      }
    }

    return config;
  }

  /**
   * Get configurations for all hook types
   */
  async getAllHookConfigurations(): Promise<GitHookConfiguration[]> {
    const hookTypes = [
      GitHookType.POST_MERGE,
      GitHookType.POST_CHECKOUT,
      GitHookType.POST_REWRITE,
    ];

    return Promise.all(hookTypes.map((type) => this.getHookConfiguration(type)));
  }

  /**
   * Install a Git hook
   */
  async installHook(hookType: GitHookType, force: boolean = false): Promise<void> {
    const hookPath = await this.getHookPath(hookType);

    // Check if already installed
    if (!force && (await this.isHookInstalled(hookType))) {
      throw new Error(`Hook ${hookType} is already installed. Use --force to reinstall.`);
    }

    // Read existing content if file exists
    let existingContent = '';
    try {
      existingContent = await fs.readFile(hookPath, 'utf-8');
    } catch (error) {
      // File doesn't exist, that's fine
    }

    // If force reinstall and our hook exists, remove it first
    if (force && hasHookMarker(existingContent)) {
      const { removeHookCode } = await import('./HookTemplates.js');
      existingContent = removeHookCode(existingContent);
    }

    // Generate our hook script
    const hookScript = generateHookScript(hookType);

    // Combine with existing content
    let finalContent: string;
    if (existingContent && !hasHookMarker(existingContent)) {
      // Preserve existing hook content
      finalContent = `${existingContent.trimEnd()}\n\n${hookScript}`;
    } else {
      finalContent = hookScript;
    }

    // Ensure hooks directory exists
    const hooksDir = path.dirname(hookPath);
    await fs.mkdir(hooksDir, { recursive: true });

    // Write hook file
    await fs.writeFile(hookPath, finalContent, { mode: 0o755 });
  }

  /**
   * Install all hooks
   */
  async installAllHooks(force: boolean = false): Promise<void> {
    const hookTypes = [
      GitHookType.POST_MERGE,
      GitHookType.POST_CHECKOUT,
      GitHookType.POST_REWRITE,
    ];

    for (const hookType of hookTypes) {
      try {
        await this.installHook(hookType, force);
      } catch (error) {
        throw new Error(`Failed to install ${hookType}: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Uninstall a Git hook
   */
  async uninstallHook(hookType: GitHookType): Promise<void> {
    const hookPath = await this.getHookPath(hookType);

    if (!(await this.isHookInstalled(hookType))) {
      throw new Error(`Hook ${hookType} is not installed`);
    }

    // Read existing content
    const content = await fs.readFile(hookPath, 'utf-8');

    // Remove our hook code
    const { removeHookCode } = await import('./HookTemplates.js');
    const newContent = removeHookCode(content);

    if (newContent.trim().length === 0) {
      // Our hook was the only content, remove the file
      await fs.unlink(hookPath);
    } else {
      // Preserve other hook content
      await fs.writeFile(hookPath, newContent, { mode: 0o755 });
    }
  }

  /**
   * Uninstall all hooks
   */
  async uninstallAllHooks(): Promise<void> {
    const hookTypes = [
      GitHookType.POST_MERGE,
      GitHookType.POST_CHECKOUT,
      GitHookType.POST_REWRITE,
    ];

    for (const hookType of hookTypes) {
      try {
        await this.uninstallHook(hookType);
      } catch (error) {
        // Ignore errors for hooks that aren't installed
        if (!(error as Error).message.includes('is not installed')) {
          throw error;
        }
      }
    }
  }

  /**
   * Validate a hook configuration
   */
  validateConfiguration(config: GitHookConfiguration): { valid: boolean; errors: string[] } {
    return validateGitHookConfiguration(config);
  }
}
