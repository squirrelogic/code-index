/**
 * CommitDiff.ts
 * Model representing changes between Git commits
 */

export enum DiffSource {
  LAST_COMMIT = 'last_commit',
  COMMIT_RANGE = 'commit_range',
  WORKING_DIRECTORY = 'working_directory',
  MANUAL = 'manual',
  HOOK_MERGE = 'hook_merge',
  HOOK_CHECKOUT = 'hook_checkout',
  HOOK_REWRITE = 'hook_rewrite'
}

export enum FileStatus {
  ADDED = 'A',
  MODIFIED = 'M',
  DELETED = 'D',
  RENAMED = 'R',
  COPIED = 'C',
  TYPE_CHANGED = 'T',
  UNMERGED = 'U',
  UNKNOWN = 'X'
}

export interface ChangedFile {
  path: string;
  status: FileStatus;
  oldPath?: string; // For renames
  similarity?: number; // For renames/copies (0-100)
}

export interface CommitDiff {
  source: DiffSource;
  fromCommit?: string;
  toCommit?: string;
  changedFiles: ChangedFile[];
  timestamp: Date;
}

/**
 * Factory function to create a CommitDiff
 */
export function createCommitDiff(
  source: DiffSource,
  changedFiles: ChangedFile[],
  fromCommit?: string,
  toCommit?: string
): CommitDiff {
  return {
    source,
    changedFiles,
    fromCommit,
    toCommit,
    timestamp: new Date()
  };
}

/**
 * Parse Git status character to FileStatus enum
 */
export function parseFileStatus(status: string): FileStatus {
  const statusChar = status.trim().charAt(0).toUpperCase();

  switch (statusChar) {
    case 'A':
      return FileStatus.ADDED;
    case 'M':
      return FileStatus.MODIFIED;
    case 'D':
      return FileStatus.DELETED;
    case 'R':
      return FileStatus.RENAMED;
    case 'C':
      return FileStatus.COPIED;
    case 'T':
      return FileStatus.TYPE_CHANGED;
    case 'U':
      return FileStatus.UNMERGED;
    default:
      return FileStatus.UNKNOWN;
  }
}

/**
 * Validate CommitDiff structure
 */
export function validateCommitDiff(diff: CommitDiff): boolean {
  if (!diff.source || !diff.changedFiles) {
    return false;
  }

  if (diff.source === DiffSource.COMMIT_RANGE && (!diff.fromCommit || !diff.toCommit)) {
    return false;
  }

  return diff.changedFiles.every(file =>
    file.path && file.status
  );
}
