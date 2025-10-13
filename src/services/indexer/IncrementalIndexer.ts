import { DatabaseService } from '../database.js';
import { FileChangeEvent, ProcessingStatus } from '../../models/FileChangeEvent.js';
import { getFileSize, getLastModified } from '../../lib/FileSystemUtils.js';
import { DatabaseError } from '../../lib/errors/WatcherErrors.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Result of an incremental indexing operation
 */
export interface IncrementalIndexResult {
  processed: number;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  failed: number;
  errors: Array<{ path: string; error: string }>;
  duration: number;
}

/**
 * Batch of changes to process
 */
export interface ChangeBatch {
  events: FileChangeEvent[];
  priority: number;
}

/**
 * Service for incremental indexing of file changes
 */
export class IncrementalIndexer {
  constructor(
    private readonly db: DatabaseService,
    private readonly projectRoot: string
  ) {}

  /**
   * Processes a batch of file change events
   * @param events Array of file change events to process
   * @returns Result of the incremental indexing
   */
  async processBatch(events: FileChangeEvent[]): Promise<IncrementalIndexResult> {
    const startTime = Date.now();
    const result: IncrementalIndexResult = {
      processed: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      duration: 0
    };

    // Group events by type for efficient processing
    const eventsByType = this.groupEventsByType(events);

    try {
      // Process in transaction for consistency
      await this.db.transaction(() => {
        // Process deletions first (they don't require file access)
        this.processDeletes(eventsByType.delete || [], result);

        // Process creates and modifies (require file access)
        this.processCreatesAndModifies(
          [...(eventsByType.create || []), ...(eventsByType.modify || [])],
          result
        );

        // Process renames
        this.processRenames(eventsByType.rename || [], result);

        // Update event statuses
        this.updateEventStatuses(events, result);
      });
    } catch (error) {
      throw new DatabaseError('incremental indexing', error as Error);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Groups events by type for batch processing
   */
  private groupEventsByType(events: FileChangeEvent[]): Record<string, FileChangeEvent[]> {
    const groups: Record<string, FileChangeEvent[]> = {};

    for (const event of events) {
      if (!groups[event.type]) {
        groups[event.type] = [];
      }
      groups[event.type]!.push(event);
    }

    return groups;
  }

  /**
   * Processes delete events
   */
  private processDeletes(events: FileChangeEvent[], result: IncrementalIndexResult): void {
    for (const event of events) {
      try {
        const stmt = this.db.prepare(
          'DELETE FROM index_entries WHERE canonical_path = ?'
        );
        const info = stmt.run(event.canonicalPath);

        if (info && info.changes > 0) {
          result.deleted++;
          result.processed++;
          event.status = ProcessingStatus.COMPLETED;
        } else {
          result.skipped++;
          event.status = ProcessingStatus.SKIPPED;
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          path: event.path,
          error: (error as Error).message
        });
        event.status = ProcessingStatus.FAILED;
        event.error = (error as Error).message;
      }
    }
  }

  /**
   * Processes create and modify events
   */
  private async processCreatesAndModifies(
    events: FileChangeEvent[],
    result: IncrementalIndexResult
  ): Promise<void> {
    for (const event of events) {
      try {
        // Skip if file doesn't exist or is a directory
        if (event.isDirectory) {
          result.skipped++;
          event.status = ProcessingStatus.SKIPPED;
          continue;
        }

        // Read file content
        const absolutePath = path.join(this.projectRoot, event.path);
        const content = await this.readFileContent(absolutePath);

        if (content === null) {
          result.skipped++;
          event.status = ProcessingStatus.SKIPPED;
          continue;
        }

        // Get file metadata
        const size = await getFileSize(absolutePath);
        const modified = await getLastModified(absolutePath);

        // Detect language from extension
        const language = this.detectLanguage(event.path);

        // Check if entry exists
        const existing = this.db.prepare(
          'SELECT id FROM index_entries WHERE canonical_path = ?'
        ).get(event.canonicalPath);

        if (existing) {
          // Update existing entry
          const stmt = this.db.prepare(`
            UPDATE index_entries
            SET content = ?, size = ?, modified_at = ?, language = ?, updated_at = ?
            WHERE canonical_path = ?
          `);

          stmt.run(
            content,
            size,
            modified,
            language,
            Math.floor(Date.now() / 1000),
            event.canonicalPath
          );

          result.updated++;
        } else {
          // Create new entry
          const stmt = this.db.prepare(`
            INSERT INTO index_entries (path, canonical_path, content, size, modified_at, indexed_at, language)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);

          stmt.run(
            event.path,
            event.canonicalPath,
            content,
            size,
            modified,
            Math.floor(Date.now() / 1000),
            language
          );

          result.created++;
        }

        result.processed++;
        event.status = ProcessingStatus.COMPLETED;

        // Update change tracking
        this.updateChangeTracking(event.path, modified);
      } catch (error) {
        result.failed++;
        result.errors.push({
          path: event.path,
          error: (error as Error).message
        });
        event.status = ProcessingStatus.FAILED;
        event.error = (error as Error).message;
      }
    }
  }

  /**
   * Processes rename events
   */
  private processRenames(events: FileChangeEvent[], result: IncrementalIndexResult): void {
    for (const event of events) {
      try {
        // For renames, we need both old and new paths
        // This is a simplified implementation - real implementation would need more context
        const stmt = this.db.prepare(`
          UPDATE index_entries
          SET path = ?, canonical_path = ?, updated_at = ?
          WHERE canonical_path = ?
        `);

        const info = stmt.run(
          event.path,
          event.canonicalPath,
          Math.floor(Date.now() / 1000),
          event.canonicalPath // In real implementation, would need old canonical path
        );

        if (info.changes > 0) {
          result.updated++;
          result.processed++;
          event.status = ProcessingStatus.COMPLETED;
        } else {
          result.skipped++;
          event.status = ProcessingStatus.SKIPPED;
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          path: event.path,
          error: (error as Error).message
        });
        event.status = ProcessingStatus.FAILED;
        event.error = (error as Error).message;
      }
    }
  }

  /**
   * Updates event statuses in the database
   */
  private updateEventStatuses(events: FileChangeEvent[], _result: IncrementalIndexResult): void {
    const stmt = this.db.prepare(`
      UPDATE file_change_events
      SET status = ?, error = ?, updated_at = ?
      WHERE id = ?
    `);

    for (const event of events) {
      try {
        stmt.run(
          event.status,
          event.error || null,
          Math.floor(Date.now() / 1000),
          event.id
        );
      } catch (error) {
        console.error(`Failed to update event status for ${event.id}:`, error);
      }
    }
  }

  /**
   * Updates change tracking information
   */
  private updateChangeTracking(filePath: string, lastModified: number): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO change_tracking (path, last_modified, last_indexed, change_count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(path) DO UPDATE SET
          last_modified = excluded.last_modified,
          last_indexed = excluded.last_indexed,
          change_count = change_count + 1
      `);

      stmt.run(filePath, lastModified, Date.now());
    } catch (error) {
      console.error(`Failed to update change tracking for ${filePath}:`, error);
    }
  }

  /**
   * Reads file content with error handling
   */
  private async readFileContent(filePath: string): Promise<string | null> {
    try {
      const stats = await fs.stat(filePath);

      // Skip large files (> 10MB)
      if (stats.size > 10 * 1024 * 1024) {
        return null;
      }

      // Skip binary files (simple detection)
      if (this.isBinaryFile(filePath)) {
        return null;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      // File might have been deleted or is inaccessible
      return null;
    }
  }

  /**
   * Detects if a file is binary based on extension
   */
  private isBinaryFile(filePath: string): boolean {
    const binaryExtensions = [
      '.exe', '.dll', '.so', '.dylib', '.bin',
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg',
      '.mp3', '.mp4', '.avi', '.mov', '.wmv',
      '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.ttf', '.otf', '.woff', '.woff2', '.eot',
      '.class', '.jar', '.pyc', '.pyo'
    ];

    const ext = path.extname(filePath).toLowerCase();
    return binaryExtensions.includes(ext);
  }

  /**
   * Detects programming language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.r': 'r',
      '.m': 'matlab',
      '.sql': 'sql',
      '.sh': 'bash',
      '.ps1': 'powershell',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.less': 'less',
      '.xml': 'xml',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
      '.rst': 'restructuredtext',
      '.tex': 'latex'
    };

    return languageMap[ext] || 'text';
  }

  /**
   * Gets pending events from the database
   */
  async getPendingEvents(limit: number = 100): Promise<FileChangeEvent[]> {
    const rows = this.db.prepare(`
      SELECT * FROM file_change_events
      WHERE status = 'pending'
      ORDER BY timestamp ASC
      LIMIT ?
    `).all(limit);

    return rows.map(this.rowToFileChangeEvent);
  }

  /**
   * Converts a database row to FileChangeEvent
   */
  private rowToFileChangeEvent(row: any): FileChangeEvent {
    return {
      id: row.id,
      path: row.path,
      canonicalPath: row.canonical_path,
      type: row.type,
      timestamp: row.timestamp,
      status: row.status,
      retryCount: row.retry_count,
      error: row.error,
      size: row.size,
      isDirectory: Boolean(row.is_directory),
      isSymlink: Boolean(row.is_symlink)
    };
  }
}