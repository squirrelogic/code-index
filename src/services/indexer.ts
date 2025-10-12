import { createHash } from 'crypto';
import { readFileSync, statSync, readdirSync } from 'fs';
import path from 'path';
import { DatabaseService } from './database.js';
import { GitignoreService } from './gitignore.js';
import { CodeIndexEntry } from '../models/index-entry.js';
import { Logger } from '../cli/utils/logger.js';

export interface IndexOptions {
  verbose?: boolean;
  batchSize?: number;
  followSymlinks?: boolean;
}

export interface IndexResult {
  filesIndexed: number;
  filesSkipped: number;
  totalTime: number;
  filesPerSecond: number;
  errors: string[];
}

export interface RefreshResult extends IndexResult {
  filesUpdated: number;
  filesAdded: number;
  filesDeleted: number;
}

export class IndexerService {
  private database: DatabaseService;
  private gitignore: GitignoreService;
  private logger: Logger;
  private rootPath: string;
  private batchSize: number = 100;
  private currentBatch: CodeIndexEntry[] = [];
  private stats = {
    filesIndexed: 0,
    filesSkipped: 0,
    errors: [] as string[]
  };

  constructor(rootPath: string, database: DatabaseService, logger: Logger) {
    this.rootPath = rootPath;
    this.database = database;
    this.gitignore = new GitignoreService(rootPath);
    this.logger = logger;
  }

  /**
   * Index all files in the project
   */
  public async indexProject(options: IndexOptions = {}): Promise<IndexResult> {
    const startTime = Date.now();
    this.batchSize = options.batchSize || 100;

    // Reset stats
    this.stats = {
      filesIndexed: 0,
      filesSkipped: 0,
      errors: []
    };

    // Clear existing index
    this.database.clearIndex();

    // Start indexing from root
    await this.indexDirectory(this.rootPath, options);

    // Process any remaining files in the batch
    if (this.currentBatch.length > 0) {
      await this.processBatch();
    }

    const totalTime = Date.now() - startTime;
    const filesPerSecond = this.stats.filesIndexed > 0
      ? (this.stats.filesIndexed / (totalTime / 1000))
      : 0;

    return {
      filesIndexed: this.stats.filesIndexed,
      filesSkipped: this.stats.filesSkipped,
      totalTime,
      filesPerSecond,
      errors: this.stats.errors
    };
  }

  /**
   * Index a directory recursively
   */
  private async indexDirectory(dirPath: string, options: IndexOptions): Promise<void> {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.rootPath, fullPath);

        // Check if path should be ignored
        if (this.gitignore.isIgnored(relativePath)) {
          this.stats.filesSkipped++;
          continue;
        }

        if (entry.isDirectory()) {
          // Recursively index subdirectory
          await this.indexDirectory(fullPath, options);
        } else if (entry.isFile()) {
          // Index the file
          await this.indexFile(fullPath, relativePath, options);
        } else if (entry.isSymbolicLink() && options.followSymlinks) {
          // Handle symlinks if option is enabled
          try {
            const stats = statSync(fullPath);
            if (stats.isDirectory()) {
              await this.indexDirectory(fullPath, options);
            } else if (stats.isFile()) {
              await this.indexFile(fullPath, relativePath, options);
            }
          } catch (error) {
            // Skip broken symlinks
            this.stats.filesSkipped++;
          }
        }
      }
    } catch (error) {
      this.stats.errors.push(`Error reading directory ${dirPath}: ${error}`);
      this.logger.error('index-directory-error', { dirPath, error: String(error) });
    }
  }

  /**
   * Index a single file
   */
  private async indexFile(fullPath: string, relativePath: string, options: IndexOptions): Promise<void> {
    try {
      const stats = statSync(fullPath);

      // Skip very large files (> 10MB by default)
      if (stats.size > 10 * 1024 * 1024) {
        this.stats.filesSkipped++;
        if (options.verbose) {
          this.logger.info('file-skipped-size', { path: relativePath, size: stats.size });
        }
        return;
      }

      // Read file content
      const content = readFileSync(fullPath, 'utf-8');

      // Calculate content hash
      const hash = createHash('sha256').update(content).digest('hex');

      // Detect language and binary status
      const language = this.detectLanguage(relativePath);
      const isBinary = this.isBinaryFile(content, relativePath);

      // Create simplified index entry for batch insertion
      const entry: any = {
        path: relativePath,
        content: isBinary ? '' : content, // Don't store binary content
        language,
        size: stats.size,
        modifiedAt: stats.mtime,
        hash,
        isBinary
      };

      // Add to batch
      this.currentBatch.push(entry);

      // Process batch if full
      if (this.currentBatch.length >= this.batchSize) {
        await this.processBatch();
      }

      this.stats.filesIndexed++;

      if (options.verbose && this.stats.filesIndexed % 100 === 0) {
        console.log(`Indexed ${this.stats.filesIndexed} files...`);
      }
    } catch (error) {
      this.stats.errors.push(`Error indexing file ${relativePath}: ${error}`);
      this.stats.filesSkipped++;
      this.logger.error('index-file-error', { path: relativePath, error: String(error) });
    }
  }

  /**
   * Process the current batch of files
   */
  private async processBatch(): Promise<void> {
    if (this.currentBatch.length === 0) return;

    try {
      this.database.insertBatch(this.currentBatch);
      this.currentBatch = [];
    } catch (error) {
      this.stats.errors.push(`Error processing batch: ${error}`);
      this.logger.error('batch-processing-error', { error: String(error) });
      // Clear batch even on error to avoid memory issues
      this.currentBatch = [];
    }
  }

  /**
   * Detect the programming language based on file extension
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
      '.cc': 'cpp',
      '.cxx': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.r': 'r',
      '.m': 'objective-c',
      '.mm': 'objective-c',
      '.lua': 'lua',
      '.pl': 'perl',
      '.sh': 'shell',
      '.bash': 'shell',
      '.zsh': 'shell',
      '.fish': 'shell',
      '.ps1': 'powershell',
      '.sql': 'sql',
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
      '.md': 'markdown',
      '.markdown': 'markdown',
      '.tex': 'latex',
      '.vim': 'vim',
      '.dockerfile': 'dockerfile',
      '.makefile': 'makefile'
    };

    // Check for special filenames
    const basename = path.basename(filePath).toLowerCase();
    if (basename === 'dockerfile') return 'dockerfile';
    if (basename === 'makefile' || basename.startsWith('makefile.')) return 'makefile';
    if (basename === 'cmakelists.txt') return 'cmake';

    return languageMap[ext] || 'text';
  }

  /**
   * Check if a file is binary
   */
  private isBinaryFile(content: string, filePath: string): boolean {
    // Check common binary extensions
    const binaryExtensions = [
      '.exe', '.dll', '.so', '.dylib', '.o', '.obj',
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
      '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv',
      '.ttf', '.otf', '.woff', '.woff2', '.eot',
      '.db', '.sqlite', '.class', '.jar', '.war', '.ear'
    ];

    const ext = path.extname(filePath).toLowerCase();
    if (binaryExtensions.includes(ext)) {
      return true;
    }

    // Check for null bytes in first 8KB
    const sampleSize = Math.min(content.length, 8192);
    for (let i = 0; i < sampleSize; i++) {
      const charCode = content.charCodeAt(i);
      if (charCode === 0) {
        return true;
      }
      // Check for other non-printable characters
      if (charCode < 32 && charCode !== 9 && charCode !== 10 && charCode !== 13) {
        return true;
      }
    }

    return false;
  }

  /**
   * Refresh the index by updating only changed files
   */
  public async refreshIndex(options: IndexOptions = {}): Promise<RefreshResult> {
    const startTime = Date.now();
    this.batchSize = options.batchSize || 100;

    // Reset stats with additional refresh-specific counters
    const refreshStats = {
      filesIndexed: 0,
      filesSkipped: 0,
      filesUpdated: 0,
      filesAdded: 0,
      filesDeleted: 0,
      errors: [] as string[]
    };

    // Get existing files from database
    const existingFiles = this.database.getPathsWithModificationTimes();
    const currentFiles = new Set<string>();

    // Scan filesystem and collect current files
    await this.scanForRefresh(this.rootPath, existingFiles, currentFiles, refreshStats, options);

    // Process any remaining files in the batch
    if (this.currentBatch.length > 0) {
      await this.processBatch();
    }

    // Find and remove deleted files
    const deletedPaths: string[] = [];
    for (const [path] of existingFiles) {
      if (!currentFiles.has(path)) {
        deletedPaths.push(path);
        refreshStats.filesDeleted++;
      }
    }

    if (deletedPaths.length > 0) {
      this.database.deleteMultipleEntries(deletedPaths);
      this.logger.info('files-deleted', { count: deletedPaths.length });
    }

    const totalTime = Date.now() - startTime;
    const filesPerSecond = refreshStats.filesIndexed > 0
      ? (refreshStats.filesIndexed / (totalTime / 1000))
      : 0;

    return {
      filesIndexed: refreshStats.filesIndexed,
      filesSkipped: refreshStats.filesSkipped,
      filesUpdated: refreshStats.filesUpdated,
      filesAdded: refreshStats.filesAdded,
      filesDeleted: refreshStats.filesDeleted,
      totalTime,
      filesPerSecond,
      errors: refreshStats.errors
    };
  }

  /**
   * Scan directory for refresh operation
   */
  private async scanForRefresh(
    dirPath: string,
    existingFiles: Map<string, { modifiedAt: Date; hash: string }>,
    currentFiles: Set<string>,
    stats: any,
    options: IndexOptions
  ): Promise<void> {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.rootPath, fullPath);

        // Check if path should be ignored
        if (this.gitignore.isIgnored(relativePath)) {
          stats.filesSkipped++;
          continue;
        }

        if (entry.isDirectory()) {
          // Recursively scan subdirectory
          await this.scanForRefresh(fullPath, existingFiles, currentFiles, stats, options);
        } else if (entry.isFile()) {
          currentFiles.add(relativePath);

          // Check if file needs updating
          const existingEntry = existingFiles.get(relativePath);
          const fileStat = statSync(fullPath);

          if (!existingEntry) {
            // New file - add it
            await this.indexFile(fullPath, relativePath, options);
            stats.filesAdded++;
            stats.filesIndexed++;
          } else if (fileStat.mtime > existingEntry.modifiedAt) {
            // Modified file - check if content actually changed
            const content = readFileSync(fullPath, 'utf-8');
            const hash = createHash('sha256').update(content).digest('hex');

            if (hash !== existingEntry.hash) {
              // Content changed - update it
              await this.indexFile(fullPath, relativePath, options);
              stats.filesUpdated++;
              stats.filesIndexed++;
            } else {
              // Only timestamp changed, skip
              stats.filesSkipped++;
            }
          } else {
            // File unchanged
            stats.filesSkipped++;
          }
        } else if (entry.isSymbolicLink() && options.followSymlinks) {
          // Handle symlinks if option is enabled
          try {
            const symlinkStat = statSync(fullPath);
            if (symlinkStat.isDirectory()) {
              await this.scanForRefresh(fullPath, existingFiles, currentFiles, stats, options);
            } else if (symlinkStat.isFile()) {
              currentFiles.add(relativePath);
              // Check if symlink target needs updating
              const existingEntry = existingFiles.get(relativePath);
              if (!existingEntry || symlinkStat.mtime > existingEntry.modifiedAt) {
                await this.indexFile(fullPath, relativePath, options);
                stats.filesIndexed++;
                stats.filesUpdated++;
              } else {
                stats.filesSkipped++;
              }
            }
          } catch (error) {
            // Skip broken symlinks
            stats.filesSkipped++;
          }
        }
      }
    } catch (error) {
      stats.errors.push(`Error scanning directory ${dirPath}: ${error}`);
      this.logger.error('scan-directory-error', { dirPath, error: String(error) });
    }
  }
}