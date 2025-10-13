/**
 * Git Hook Execution Handler
 *
 * Handles execution of Git hooks and triggers incremental indexing.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { GitDiffReader } from './GitDiffReader.js';
import { IncrementalIndexer } from '../indexer/IncrementalIndexer.js';
import { FileStatus } from '../../models/CommitDiff.js';

export interface HookExecutionContext {
  hookType: 'post-merge' | 'post-checkout' | 'post-rewrite';
  oldRef: string;
  newRef: string;
  operation?: string; // For post-rewrite: 'amend' or 'rebase'
  isBranchCheckout?: boolean; // For post-checkout
}

export interface HookExecutionResult {
  success: boolean;
  filesProcessed: number;
  duration: number;
  error?: string;
}

export class HookExecutor {
  private gitDiffReader: GitDiffReader;
  private indexer: IncrementalIndexer;
  private logPath: string;

  constructor(projectRoot: string) {
    this.gitDiffReader = new GitDiffReader(projectRoot);
    // IncrementalIndexer needs database service - we'll create a placeholder
    // For now, create a placeholder that will be properly initialized
    this.indexer = new IncrementalIndexer(null as any, projectRoot);
    this.logPath = path.join(projectRoot, '.codeindex', 'logs', 'git-hook.log');
  }

  /**
   * Execute hook and trigger incremental indexing
   */
  async execute(context: HookExecutionContext): Promise<HookExecutionResult> {
    const startTime = Date.now();

    try {
      // Log hook execution
      await this.logExecution(context, 'started');

      // Get changed files from Git diff
      const diff = await this.gitDiffReader.getCommitRangeChanges(context.oldRef, context.newRef);

      if (!diff) {
        return {
          success: true,
          filesProcessed: 0,
          duration: Date.now() - startTime,
        };
      }

      // Process changed files
      // Convert CommitDiff to file paths for indexing
      const filesToIndex = diff.changedFiles
        .filter(f => f.status !== FileStatus.DELETED)
        .map(f => f.path);

      await this.indexer.updateFiles(filesToIndex);
      const filesProcessed = filesToIndex.length;

      const duration = Date.now() - startTime;

      // Log success
      await this.logExecution(context, 'completed', { filesProcessed, duration });

      return {
        success: true,
        filesProcessed,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      // Log error
      await this.logExecution(context, 'failed', { error: errorMessage, duration });

      return {
        success: false,
        filesProcessed: 0,
        duration,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute hook from command line arguments
   *
   * This is called from the hook script with parsed arguments.
   */
  static async executeFromHook(
    hookType: 'post-merge' | 'post-checkout' | 'post-rewrite',
    args: string[]
  ): Promise<HookExecutionResult> {
    const projectRoot = process.cwd();
    const executor = new HookExecutor(projectRoot);

    const context = this.parseHookArguments(hookType, args);
    return executor.execute(context);
  }

  /**
   * Parse hook arguments into execution context
   */
  private static parseHookArguments(
    hookType: 'post-merge' | 'post-checkout' | 'post-rewrite',
    args: string[]
  ): HookExecutionContext {
    switch (hookType) {
      case 'post-merge':
        // post-merge: PREV_HEAD (from env) and NEW_HEAD (current HEAD)
        return {
          hookType,
          oldRef: args[0] || 'HEAD~1',
          newRef: args[1] || 'HEAD',
        };

      case 'post-checkout':
        // post-checkout: prev-ref new-ref is-branch-checkout
        return {
          hookType,
          oldRef: args[0] || 'HEAD~1',
          newRef: args[1] || 'HEAD',
          isBranchCheckout: args[2] === '1',
        };

      case 'post-rewrite':
        // post-rewrite: operation (amend|rebase), old/new SHA from stdin
        return {
          hookType,
          oldRef: args[1] || 'HEAD~1',
          newRef: args[2] || 'HEAD',
          operation: args[0] || 'amend',
        };

      default:
        throw new Error(`Unknown hook type: ${hookType}`);
    }
  }


  /**
   * Log hook execution to file
   */
  private async logExecution(
    context: HookExecutionContext,
    status: 'started' | 'completed' | 'failed',
    details?: { filesProcessed?: number; duration?: number; error?: string }
  ): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      hookType: context.hookType,
      status,
      oldRef: context.oldRef,
      newRef: context.newRef,
      ...details,
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      // Ensure log directory exists
      await fs.mkdir(path.dirname(this.logPath), { recursive: true });

      // Append to log file
      await fs.appendFile(this.logPath, logLine);
    } catch (error) {
      // Ignore logging errors - don't fail the hook
      console.error('Failed to write hook log:', error);
    }
  }
}
