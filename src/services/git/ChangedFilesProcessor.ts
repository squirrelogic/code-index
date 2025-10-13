/**
 * ChangedFilesProcessor.ts
 * Process changed files from Git diffs and trigger incremental indexing
 */

import * as path from 'path';
import { CommitDiff, FileStatus } from '../../models/CommitDiff.js';
import { FileChangeEvent, FileChangeType, createFileChangeEvent } from '../../models/FileChangeEvent.js';
import { IncrementalIndexer } from '../indexer/IncrementalIndexer.js';

export interface ProcessingResult {
  filesProcessed: number;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  filesSkipped: number;
  errors: Array<{ file: string; error: string }>;
  duration: number;
}

export class ChangedFilesProcessor {
  private indexer: IncrementalIndexer;
  private projectRoot: string;

  constructor(projectRoot: string, indexer: IncrementalIndexer) {
    this.projectRoot = projectRoot;
    this.indexer = indexer;
  }

  /**
   * Process a commit diff and update the index
   */
  async processCommitDiff(diff: CommitDiff): Promise<ProcessingResult> {
    const startTime = Date.now();

    const result: ProcessingResult = {
      filesProcessed: 0,
      filesAdded: 0,
      filesModified: 0,
      filesDeleted: 0,
      filesSkipped: 0,
      errors: [],
      duration: 0
    };

    // Convert changed files to FileChangeEvents
    const events: FileChangeEvent[] = [];

    for (const changedFile of diff.changedFiles) {
      try {
        const absolutePath = path.resolve(this.projectRoot, changedFile.path);
        const changeType = this.mapFileStatusToChangeType(changedFile.status);

        if (changeType === null) {
          result.filesSkipped++;
          continue;
        }

        const event = createFileChangeEvent(changeType, changedFile.path, absolutePath);
        events.push(event);

        // Handle renames as delete + add
        if (changedFile.status === FileStatus.RENAMED && changedFile.oldPath) {
          const oldAbsolutePath = path.resolve(this.projectRoot, changedFile.oldPath);
          const deleteEvent = createFileChangeEvent(FileChangeType.DELETE, changedFile.oldPath, oldAbsolutePath);
          events.push(deleteEvent);
        }
      } catch (error) {
        result.errors.push({
          file: changedFile.path,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Process events through the incremental indexer
    const indexResult = await this.indexer.processBatch(events);

    result.filesProcessed = indexResult.processed;
    result.filesAdded = indexResult.created;
    result.filesModified = indexResult.updated;
    result.filesDeleted = indexResult.deleted;
    result.filesSkipped = indexResult.skipped;
    result.errors = indexResult.errors.map(e => ({ file: e.path, error: e.error }));

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Map Git FileStatus to FileChangeType
   */
  private mapFileStatusToChangeType(status: FileStatus): FileChangeType | null {
    switch (status) {
      case FileStatus.ADDED:
      case FileStatus.COPIED:
        return FileChangeType.CREATE;

      case FileStatus.MODIFIED:
      case FileStatus.TYPE_CHANGED:
        return FileChangeType.MODIFY;

      case FileStatus.DELETED:
        return FileChangeType.DELETE;

      case FileStatus.RENAMED:
        return FileChangeType.CREATE; // New path is created

      case FileStatus.UNMERGED:
      case FileStatus.UNKNOWN:
      default:
        return null;
    }
  }

  /**
   * Generate a summary message for processing results
   */
  generateSummary(result: ProcessingResult): string {
    const parts: string[] = [];

    parts.push(`Processed ${result.filesProcessed} files in ${result.duration}ms`);

    if (result.filesAdded > 0) {
      parts.push(`${result.filesAdded} added`);
    }

    if (result.filesModified > 0) {
      parts.push(`${result.filesModified} modified`);
    }

    if (result.filesDeleted > 0) {
      parts.push(`${result.filesDeleted} deleted`);
    }

    if (result.filesSkipped > 0) {
      parts.push(`${result.filesSkipped} skipped`);
    }

    if (result.errors.length > 0) {
      parts.push(`${result.errors.length} errors`);
    }

    return parts.join(', ');
  }
}
