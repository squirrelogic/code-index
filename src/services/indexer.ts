/**
 * Simplified Indexer Service
 *
 * Indexes files using the hybrid sparse+dense approach with AST persistence.
 * Much simpler than the original - no complex symbol persistence or hash tracking.
 */

import { statSync, readdirSync } from 'fs';
import path from 'path';
import { DatabaseService } from './database.js';
import { Logger } from '../cli/utils/logger.js';
import { parse } from './parser/index.js';
import { HybridIndex } from './hybrid-index.js';
import { ASTPersistenceService } from './ast-persistence.js';
import { GitignoreService } from './gitignore.js';
import { SymbolIndex } from './symbol-index.js';

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

/**
 * Simplified indexer using hybrid search
 */
export class IndexerService {
  private database: DatabaseService;
  private logger: Logger;
  private rootPath: string;
  private hybridIndex: HybridIndex;
  private symbolIndex: SymbolIndex;
  private astPersistence: ASTPersistenceService;
  private gitignore: GitignoreService;
  private batchSize: number = 100;

  private stats = {
    filesIndexed: 0,
    filesSkipped: 0,
    errors: [] as string[],
  };

  constructor(
    rootPath: string,
    database: DatabaseService,
    hybridIndex: HybridIndex,
    symbolIndex: SymbolIndex,
    astPersistence: ASTPersistenceService,
    logger: Logger
  ) {
    this.rootPath = rootPath;
    this.database = database;
    this.hybridIndex = hybridIndex;
    this.symbolIndex = symbolIndex;
    this.astPersistence = astPersistence;
    this.logger = logger;
    this.gitignore = new GitignoreService(rootPath);
  }

  /**
   * Index all files in the project (full index)
   */
  public async indexProject(options: IndexOptions = {}): Promise<IndexResult> {
    const startTime = Date.now();
    this.batchSize = options.batchSize || 100;

    // Reset stats
    this.stats = {
      filesIndexed: 0,
      filesSkipped: 0,
      errors: [],
    };

    // Clear existing index
    this.database.clearFiles();
    await this.hybridIndex.clear();
    this.symbolIndex.clear();
    await this.astPersistence.clear();

    // Set batch size for hybrid index
    this.hybridIndex.setBatchSize(this.batchSize);

    // Start indexing from root
    await this.indexDirectory(this.rootPath, options);

    // Rebuild hybrid index (processes any pending items)
    if (this.logger) {
      this.logger.info('Building hybrid search index...');
    }
    await this.hybridIndex.rebuild();

    const totalTime = Date.now() - startTime;
    const filesPerSecond =
      this.stats.filesIndexed > 0 ? this.stats.filesIndexed / (totalTime / 1000) : 0;

    return {
      filesIndexed: this.stats.filesIndexed,
      filesSkipped: this.stats.filesSkipped,
      totalTime,
      filesPerSecond,
      errors: this.stats.errors,
    };
  }

  /**
   * Refresh specific files without directory scanning
   */
  public async refreshFiles(filePaths: string[], options: IndexOptions = {}): Promise<RefreshResult> {
    const startTime = Date.now();
    this.batchSize = options.batchSize || 100;

    // Reset stats
    const stats = {
      filesIndexed: 0,
      filesSkipped: 0,
      filesUpdated: 0,
      filesAdded: 0,
      filesDeleted: 0,
      errors: [] as string[],
    };

    // Get all existing files from database for mtime comparison
    const existingFiles = this.database.getAllFiles();
    const existingFileMap = new Map(existingFiles.map(f => [f.file_path, f.mtime_ms]));

    // Process each file path
    for (const filePath of filePaths) {
      try {
        // Normalize to relative path
        const relativePath = path.isAbsolute(filePath)
          ? path.relative(this.rootPath, filePath)
          : filePath;

        // Check if path should be ignored
        if (this.gitignore.isIgnored(relativePath)) {
          stats.filesSkipped++;
          continue;
        }

        const fullPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(this.rootPath, filePath);

        // Check if file exists
        try {
          const fileStats = statSync(fullPath);

          if (!fileStats.isFile()) {
            stats.filesSkipped++;
            continue;
          }

          const mtimeMs = fileStats.mtimeMs;
          const existingMtime = existingFileMap.get(relativePath);

          if (existingMtime === undefined) {
            // New file
            await this.indexFile(fullPath, mtimeMs);
            stats.filesAdded++;
            stats.filesIndexed++;
          } else if (mtimeMs > existingMtime) {
            // File was modified
            await this.indexFile(fullPath, mtimeMs);
            stats.filesUpdated++;
            stats.filesIndexed++;
          } else {
            // File unchanged
            stats.filesSkipped++;
          }
        } catch (error) {
          // File doesn't exist - delete from index
          if ((error as any).code === 'ENOENT') {
            this.database.deleteFile(relativePath);
            await this.hybridIndex.remove(relativePath);
            this.symbolIndex.remove(relativePath);
            await this.astPersistence.delete(relativePath);
            stats.filesDeleted++;
          } else {
            stats.errors.push(`Failed to process ${relativePath}: ${error}`);
          }
        }
      } catch (error) {
        stats.errors.push(`Failed to refresh ${filePath}: ${error}`);
      }
    }

    // Rebuild hybrid index if files were changed
    if (stats.filesUpdated > 0 || stats.filesAdded > 0 || stats.filesDeleted > 0) {
      if (this.logger) {
        this.logger.info('Rebuilding hybrid search index...');
      }
      await this.hybridIndex.rebuild();
    }

    const totalTime = Date.now() - startTime;
    const filesPerSecond =
      stats.filesIndexed > 0 ? stats.filesIndexed / (totalTime / 1000) : 0;

    return {
      filesIndexed: stats.filesIndexed,
      filesSkipped: stats.filesSkipped,
      filesUpdated: stats.filesUpdated,
      filesAdded: stats.filesAdded,
      filesDeleted: stats.filesDeleted,
      totalTime,
      filesPerSecond,
      errors: stats.errors,
    };
  }

  /**
   * Refresh index - only re-index changed files
   */
  public async refreshIndex(options: IndexOptions = {}): Promise<RefreshResult> {
    const startTime = Date.now();
    this.batchSize = options.batchSize || 100;

    // Reset stats
    const stats = {
      filesIndexed: 0,
      filesSkipped: 0,
      filesUpdated: 0,
      filesAdded: 0,
      filesDeleted: 0,
      errors: [] as string[],
    };

    // Load existing file mtimes from database
    const existingFiles = this.database.getAllFiles();
    const existingFileMap = new Map(existingFiles.map(f => [f.file_path, f.mtime_ms]));

    // Track files we've seen during scan
    const seenFiles = new Set<string>();

    // Scan and index changed files
    await this.refreshDirectory(this.rootPath, existingFileMap, seenFiles, stats, options);

    // Find deleted files (in database but not seen during scan)
    for (const [filePath, _] of existingFileMap) {
      if (!seenFiles.has(filePath)) {
        // File was deleted
        this.database.deleteFile(filePath);
        await this.hybridIndex.remove(filePath);
        this.symbolIndex.remove(filePath);
        await this.astPersistence.delete(filePath);
        stats.filesDeleted++;
      }
    }

    // Rebuild hybrid index if files were changed
    if (stats.filesUpdated > 0 || stats.filesAdded > 0 || stats.filesDeleted > 0) {
      if (this.logger) {
        this.logger.info('Rebuilding hybrid search index...');
      }
      await this.hybridIndex.rebuild();
    }

    const totalTime = Date.now() - startTime;
    const filesPerSecond =
      stats.filesIndexed > 0 ? stats.filesIndexed / (totalTime / 1000) : 0;

    return {
      filesIndexed: stats.filesIndexed,
      filesSkipped: stats.filesSkipped,
      filesUpdated: stats.filesUpdated,
      filesAdded: stats.filesAdded,
      filesDeleted: stats.filesDeleted,
      totalTime,
      filesPerSecond,
      errors: stats.errors,
    };
  }

  /**
   * Index a directory recursively (full index)
   */
  private async indexDirectory(dirPath: string, options: IndexOptions): Promise<void> {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.rootPath, fullPath);

        // Check if path should be ignored using gitignore
        if (this.gitignore.isIgnored(relativePath)) {
          continue;
        }

        if (entry.isDirectory()) {
          // Recurse into directory
          await this.indexDirectory(fullPath, options);
        } else if (entry.isFile()) {
          // Index file
          await this.indexFile(fullPath);
        } else if (entry.isSymbolicLink() && options.followSymlinks) {
          // Follow symlink if option is set
          try {
            const stats = statSync(fullPath);
            if (stats.isDirectory()) {
              await this.indexDirectory(fullPath, options);
            } else if (stats.isFile()) {
              await this.indexFile(fullPath);
            }
          } catch {
            // Skip broken symlinks
          }
        }
      }
    } catch (error) {
      this.stats.errors.push(`Failed to index directory ${dirPath}: ${error}`);
    }
  }

  /**
   * Refresh a directory recursively (incremental)
   */
  private async refreshDirectory(
    dirPath: string,
    existingFiles: Map<string, number>,
    seenFiles: Set<string>,
    stats: any,
    options: IndexOptions
  ): Promise<void> {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.rootPath, fullPath);

        // Check if path should be ignored using gitignore
        if (this.gitignore.isIgnored(relativePath)) {
          continue;
        }

        if (entry.isDirectory()) {
          // Recurse into directory
          await this.refreshDirectory(fullPath, existingFiles, seenFiles, stats, options);
        } else if (entry.isFile()) {

          // Check if file needs update
          const fileStats = statSync(fullPath);
          const mtimeMs = fileStats.mtimeMs;

          seenFiles.add(relativePath);

          const existingMtime = existingFiles.get(relativePath);

          if (existingMtime === undefined) {
            // New file
            await this.indexFile(fullPath, mtimeMs);
            stats.filesAdded++;
            stats.filesIndexed++;
          } else if (mtimeMs > existingMtime) {
            // File was modified
            await this.indexFile(fullPath, mtimeMs);
            stats.filesUpdated++;
            stats.filesIndexed++;
          } else {
            // File unchanged
            stats.filesSkipped++;
          }
        }
      }
    } catch (error) {
      stats.errors.push(`Failed to refresh directory ${dirPath}: ${error}`);
    }
  }

  /**
   * Index a single file
   */
  private async indexFile(filePath: string, mtimeMs?: number): Promise<void> {
    try {
      const relativePath = path.relative(this.rootPath, filePath);

      // Get file mtime if not provided
      if (mtimeMs === undefined) {
        const stats = statSync(filePath);
        mtimeMs = stats.mtimeMs;
      }

      // Parse file to get AST
      const astDoc = await parse(filePath);

      if (!astDoc) {
        this.stats.filesSkipped++;
        return;
      }

      // 1. Write AST JSON
      await this.astPersistence.write(relativePath, astDoc);

      // 2. Update mtime in database
      this.database.upsertFile(relativePath, mtimeMs);

      // 3. Add to hybrid index (queues for batch processing)
      await this.hybridIndex.add(relativePath, astDoc);

      // 4. Add to symbol index
      this.symbolIndex.add(relativePath, astDoc);

      this.stats.filesIndexed++;

      if (this.logger && this.stats.filesIndexed % 100 === 0) {
        this.logger.info(`Indexed ${this.stats.filesIndexed} files...`);
      }
    } catch (error) {
      this.stats.errors.push(`Failed to index ${filePath}: ${error}`);
      this.stats.filesSkipped++;
    }
  }

}
