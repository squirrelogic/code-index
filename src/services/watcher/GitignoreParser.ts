/**
 * Gitignore Parser
 *
 * Reads and parses .gitignore files to integrate with ignore patterns.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { parseGitignoreContent } from './IgnorePatterns.js';
import { IgnorePatternStore, PatternType, PatternSource } from './IgnorePatternStore.js';

export class GitignoreParser {
  private projectRoot: string;
  private patternStore: IgnorePatternStore;

  constructor(projectRoot: string, patternStore: IgnorePatternStore) {
    this.projectRoot = projectRoot;
    this.patternStore = patternStore;
  }

  /**
   * Load patterns from .gitignore file
   */
  async loadGitignore(gitignorePath?: string): Promise<number> {
    const filePath = gitignorePath || path.join(this.projectRoot, '.gitignore');

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.importGitignoreContent(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // .gitignore doesn't exist, that's okay
        return 0;
      }
      throw error;
    }
  }

  /**
   * Import gitignore content and add patterns to store
   */
  importGitignoreContent(content: string): number {
    // Parse gitignore content
    const patterns = parseGitignoreContent(content);

    // Remove existing gitignore patterns
    this.patternStore.removePatternsBySource(PatternSource.GITIGNORE);

    // Add new gitignore patterns with appropriate priority (800)
    let added = 0;
    for (const pattern of patterns) {
      try {
        this.patternStore.addPattern(
          pattern,
          PatternType.GLOB,
          PatternSource.GITIGNORE,
          800 // Higher priority than config, lower than defaults
        );
        added++;
      } catch (error) {
        // Pattern might already exist from another source, skip
      }
    }

    return added;
  }

  /**
   * Reload .gitignore file
   */
  async reload(): Promise<number> {
    return this.loadGitignore();
  }

  /**
   * Check if .gitignore exists
   */
  async exists(): Promise<boolean> {
    const gitignorePath = path.join(this.projectRoot, '.gitignore');
    try {
      await fs.access(gitignorePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all patterns from .gitignore (current stored ones)
   */
  getGitignorePatterns(): string[] {
    const patterns = this.patternStore.getPatternsBySource(PatternSource.GITIGNORE);
    return patterns.map((p) => p.pattern);
  }

  /**
   * Find all .gitignore files in subdirectories
   */
  async findAllGitignoreFiles(): Promise<string[]> {
    const gitignoreFiles: string[] = [];

    async function scan(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          // Skip common ignore directories
          if (entry.isDirectory()) {
            const dirName = entry.name;
            if (
              dirName === 'node_modules' ||
              dirName === '.git' ||
              dirName === 'dist' ||
              dirName === 'build' ||
              dirName === '.codeindex'
            ) {
              continue;
            }
            await scan(fullPath);
          } else if (entry.isFile() && entry.name === '.gitignore') {
            gitignoreFiles.push(fullPath);
          }
        }
      } catch (error) {
        // Ignore permission errors
      }
    }

    await scan(this.projectRoot);
    return gitignoreFiles;
  }

  /**
   * Load all .gitignore files found in the project
   */
  async loadAllGitignoreFiles(): Promise<number> {
    const gitignoreFiles = await this.findAllGitignoreFiles();
    let totalAdded = 0;

    for (const filePath of gitignoreFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const patterns = parseGitignoreContent(content);

        for (const pattern of patterns) {
          try {
            // Make patterns from subdirectories relative to project root
            const relativeDir = path.relative(this.projectRoot, path.dirname(filePath));
            const adjustedPattern = relativeDir ? path.join(relativeDir, pattern) : pattern;

            this.patternStore.addPattern(
              adjustedPattern,
              PatternType.GLOB,
              PatternSource.GITIGNORE,
              800
            );
            totalAdded++;
          } catch (error) {
            // Pattern might already exist
          }
        }
      } catch (error) {
        // Ignore read errors for individual files
      }
    }

    return totalAdded;
  }
}
