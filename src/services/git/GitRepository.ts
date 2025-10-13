/**
 * GitRepository.ts
 * Git repository detection and status checking
 */

import { simpleGit, SimpleGit } from 'simple-git';

export interface GitRepositoryInfo {
  isRepository: boolean;
  rootPath?: string;
  currentBranch?: string;
  isDetachedHead: boolean;
  headCommit?: string;
}

export class GitRepository {
  private git: SimpleGit;

  constructor(projectRoot: string) {
    this.git = simpleGit(projectRoot);
  }

  /**
   * Detect if the project is a Git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await this.git.revparse(['--git-dir']);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get repository information
   */
  async getInfo(): Promise<GitRepositoryInfo> {
    try {
      const isRepo = await this.isGitRepository();

      if (!isRepo) {
        return {
          isRepository: false,
          isDetachedHead: false
        };
      }

      const rootPath = await this.git.revparse(['--show-toplevel']);
      let currentBranch: string | undefined;
      let isDetachedHead = false;

      try {
        currentBranch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
        isDetachedHead = currentBranch === 'HEAD';
      } catch {
        isDetachedHead = true;
      }

      let headCommit: string | undefined;
      try {
        headCommit = await this.git.revparse(['HEAD']);
      } catch {
        // No commits yet
      }

      return {
        isRepository: true,
        rootPath: rootPath.trim(),
        currentBranch: isDetachedHead ? undefined : currentBranch?.trim(),
        isDetachedHead,
        headCommit: headCommit?.trim()
      };
    } catch (error) {
      return {
        isRepository: false,
        isDetachedHead: false
      };
    }
  }

  /**
   * Check if repository has any commits
   */
  async hasCommits(): Promise<boolean> {
    try {
      await this.git.revparse(['HEAD']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the root directory of the Git repository
   */
  async getRootPath(): Promise<string | null> {
    try {
      const rootPath = await this.git.revparse(['--show-toplevel']);
      return rootPath.trim();
    } catch {
      return null;
    }
  }

  /**
   * Validate a commit reference exists
   */
  async isValidCommit(ref: string): Promise<boolean> {
    try {
      await this.git.revparse([ref]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse a commit range (e.g., "HEAD~3..HEAD" or "abc123..def456")
   */
  parseCommitRange(range: string): { from: string; to: string } | null {
    // Support both ".." and "..." syntax
    const doubleDotsMatch = range.match(/^(.+)\.\.(.+)$/);
    const tripleDotsMatch = range.match(/^(.+)\.\.\.(.+)$/);

    if (doubleDotsMatch && doubleDotsMatch[1] && doubleDotsMatch[2]) {
      return {
        from: doubleDotsMatch[1].trim(),
        to: doubleDotsMatch[2].trim()
      };
    }

    if (tripleDotsMatch && tripleDotsMatch[1] && tripleDotsMatch[2]) {
      return {
        from: tripleDotsMatch[1].trim(),
        to: tripleDotsMatch[2].trim()
      };
    }

    return null;
  }
}
