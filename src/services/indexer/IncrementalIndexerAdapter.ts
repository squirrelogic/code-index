import { DatabaseService as Database } from '../database.js';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Adapter for incremental indexing operations
 * Provides simple methods for the BatchProcessor to use
 */
export class IncrementalIndexer {
  constructor(
    private db: Database,
    private projectRoot: string
  ) {}

  /**
   * Adds a single file to the index
   * @param filePath Absolute or canonical path
   */
  async addFile(filePath: string): Promise<void> {
    const relativePath = path.relative(this.projectRoot, filePath);

    // Read file content
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const stats = await fs.promises.stat(filePath);

    // Add to index
    this.db.addEntry({
      path: relativePath,
      content,
      language: this.detectLanguage(relativePath),
      size: stats.size,
      modifiedAt: stats.mtime,
      indexedAt: new Date()
    });
  }

  /**
   * Adds multiple files to the index
   * @param filePaths Array of absolute or canonical paths
   */
  async addFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      await this.addFile(filePath);
    }
  }

  /**
   * Updates a file in the index
   * @param filePath Absolute or canonical path
   */
  async updateFile(filePath: string): Promise<void> {
    const relativePath = path.relative(this.projectRoot, filePath);

    // Read new content
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const stats = await fs.promises.stat(filePath);

    // Update in index
    this.db.updateEntry(relativePath, {
      content,
      size: stats.size,
      modifiedAt: stats.mtime,
      indexedAt: new Date()
    });
  }

  /**
   * Updates multiple files in the index
   * @param filePaths Array of absolute or canonical paths
   */
  async updateFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      await this.updateFile(filePath);
    }
  }

  /**
   * Removes a file from the index
   * @param filePath Absolute or canonical path
   */
  async removeFile(filePath: string): Promise<void> {
    const relativePath = path.relative(this.projectRoot, filePath);
    this.db.removeEntry(relativePath);
  }

  /**
   * Removes multiple files from the index
   * @param filePaths Array of absolute or canonical paths
   */
  async removeFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      await this.removeFile(filePath);
    }
  }

  /**
   * Renames a file in the index
   * @param oldPath Old absolute or canonical path
   * @param newPath New absolute or canonical path
   * @param relativePath New relative path
   */
  async renameFile(oldPath: string, newPath: string, _relativePath?: string): Promise<void> {
    const oldRelativePath = path.relative(this.projectRoot, oldPath);

    // Get existing entry
    const existingEntry = this.db.getEntry(oldRelativePath);
    if (!existingEntry) {
      // If not found, treat as a new file
      await this.addFile(newPath);
      return;
    }

    // Remove old entry
    this.db.removeEntry(oldRelativePath);

    // Add new entry with updated path
    await this.addFile(newPath);
  }

  /**
   * Detects language from file extension
   * @param filePath File path
   * @returns Language identifier
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
      '.php': 'php',
      '.rb': 'ruby',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.r': 'r',
      '.m': 'matlab',
      '.sql': 'sql',
      '.sh': 'shell',
      '.bash': 'shell',
      '.zsh': 'shell',
      '.fish': 'shell',
      '.ps1': 'powershell',
      '.html': 'html',
      '.htm': 'html',
      '.xml': 'xml',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.ini': 'ini',
      '.cfg': 'ini',
      '.conf': 'conf',
      '.md': 'markdown',
      '.mdx': 'markdown',
      '.rst': 'restructuredtext',
      '.tex': 'latex',
      '.vue': 'vue',
      '.svelte': 'svelte'
    };

    return languageMap[ext] || 'text';
  }
}

/**
 * Creates a new IncrementalIndexer instance
 * @param db Database instance
 * @param projectRoot Project root directory
 * @returns New IncrementalIndexer
 */
export function createIncrementalIndexer(
  db: Database,
  projectRoot: string
): IncrementalIndexer {
  return new IncrementalIndexer(db, projectRoot);
}