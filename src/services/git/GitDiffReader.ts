/**
 * GitDiffReader.ts
 * Parse Git diffs to identify changed files
 */

import { simpleGit, SimpleGit } from 'simple-git';
import {
  CommitDiff,
  ChangedFile,
  DiffSource,
  FileStatus,
  parseFileStatus,
  createCommitDiff
} from '../../models/CommitDiff.js';
import { GitRepository } from './GitRepository.js';

export class GitDiffReader {
  private git: SimpleGit;
  private repository: GitRepository;

  constructor(projectRoot: string) {
    this.git = simpleGit(projectRoot);
    this.repository = new GitRepository(projectRoot);
  }

  /**
   * Get changes from the last commit
   */
  async getLastCommitChanges(): Promise<CommitDiff | null> {
    const hasCommits = await this.repository.hasCommits();

    if (!hasCommits) {
      return null;
    }

    try {
      // Get diff between HEAD~1 and HEAD
      const diff = await this.git.diff(['--name-status', 'HEAD~1', 'HEAD']);
      const changedFiles = this.parseDiffOutput(diff);

      const headCommit = (await this.git.revparse(['HEAD'])).trim();
      const previousCommit = (await this.git.revparse(['HEAD~1'])).trim();

      return createCommitDiff(
        DiffSource.LAST_COMMIT,
        changedFiles,
        previousCommit,
        headCommit
      );
    } catch (error) {
      // Might be the first commit, try a different approach
      try {
        const diff = await this.git.diff(['--name-status', '--root', 'HEAD']);
        const changedFiles = this.parseDiffOutput(diff);
        const headCommit = (await this.git.revparse(['HEAD'])).trim();

        return createCommitDiff(
          DiffSource.LAST_COMMIT,
          changedFiles,
          undefined,
          headCommit
        );
      } catch {
        return null;
      }
    }
  }

  /**
   * Get changes for a commit range
   */
  async getCommitRangeChanges(fromCommit: string, toCommit: string): Promise<CommitDiff | null> {
    try {
      // Validate commits exist
      const fromValid = await this.repository.isValidCommit(fromCommit);
      const toValid = await this.repository.isValidCommit(toCommit);

      if (!fromValid || !toValid) {
        throw new Error(`Invalid commit reference: ${!fromValid ? fromCommit : toCommit}`);
      }

      // Get diff between commits
      const diff = await this.git.diff(['--name-status', fromCommit, toCommit]);
      const changedFiles = this.parseDiffOutput(diff);

      return createCommitDiff(
        DiffSource.COMMIT_RANGE,
        changedFiles,
        fromCommit,
        toCommit
      );
    } catch (error) {
      console.error('Error reading commit range:', error);
      return null;
    }
  }

  /**
   * Get changes using Git range syntax (e.g., "HEAD~3..HEAD")
   */
  async getChangesFromRange(range: string): Promise<CommitDiff | null> {
    const parsed = this.repository.parseCommitRange(range);

    if (!parsed) {
      throw new Error(`Invalid range format: ${range}. Expected format: "commit1..commit2"`);
    }

    return this.getCommitRangeChanges(parsed.from, parsed.to);
  }

  /**
   * Parse git diff --name-status output
   * Format: STATUS\tPATH or STATUS\tOLD_PATH\tNEW_PATH
   */
  private parseDiffOutput(diffOutput: string): ChangedFile[] {
    if (!diffOutput.trim()) {
      return [];
    }

    const lines = diffOutput.trim().split('\n');
    const changedFiles: ChangedFile[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split('\t');
      if (parts.length < 2) continue;

      const statusPart = parts[0];
      const status = parseFileStatus(statusPart);

      // Handle renames (format: R100\toldpath\tnewpath)
      if (status === FileStatus.RENAMED && parts.length === 3) {
        const similarity = this.parseSimilarity(statusPart);
        changedFiles.push({
          path: parts[2],
          oldPath: parts[1],
          status,
          similarity
        });
      }
      // Handle copies
      else if (status === FileStatus.COPIED && parts.length === 3) {
        const similarity = this.parseSimilarity(statusPart);
        changedFiles.push({
          path: parts[2],
          oldPath: parts[1],
          status,
          similarity
        });
      }
      // Handle normal changes
      else {
        changedFiles.push({
          path: parts[1],
          status
        });
      }
    }

    return changedFiles;
  }

  /**
   * Parse similarity percentage from status (e.g., "R100" -> 100)
   */
  private parseSimilarity(status: string): number | undefined {
    const match = status.match(/[RC](\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  /**
   * Get working directory changes (unstaged + staged)
   */
  async getWorkingDirectoryChanges(): Promise<CommitDiff> {
    const status = await this.git.status();
    const changedFiles: ChangedFile[] = [];

    // Process modified files
    for (const file of status.modified) {
      changedFiles.push({ path: file, status: FileStatus.MODIFIED });
    }

    // Process new files
    for (const file of [...status.not_added, ...status.created]) {
      changedFiles.push({ path: file, status: FileStatus.ADDED });
    }

    // Process deleted files
    for (const file of status.deleted) {
      changedFiles.push({ path: file, status: FileStatus.DELETED });
    }

    // Process renamed files
    for (const rename of status.renamed) {
      changedFiles.push({
        path: rename.to || '',
        oldPath: rename.from || '',
        status: FileStatus.RENAMED
      });
    }

    return createCommitDiff(DiffSource.WORKING_DIRECTORY, changedFiles);
  }
}
