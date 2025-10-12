import { default as ignore, Ignore } from 'ignore';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

/**
 * Service for managing gitignore patterns and file exclusion
 */
export class GitignoreService {
  private ig: Ignore;
  private rootPath: string;
  private additionalPatterns: string[] = [
    '.codeindex/',
    '.git/',
    'node_modules/',
    '.DS_Store',
    'Thumbs.db',
    '*.log',
    '*.tmp',
    '*.swp'
  ];

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.ig = ignore.default();
    this.loadPatterns();
  }

  /**
   * Load gitignore patterns from .gitignore file and additional patterns
   */
  private loadPatterns(): void {
    // Add default patterns
    this.ig.add(this.additionalPatterns);

    // Load .gitignore if it exists
    const gitignorePath = path.join(this.rootPath, '.gitignore');
    if (existsSync(gitignorePath)) {
      try {
        const content = readFileSync(gitignorePath, 'utf-8');
        const patterns = content
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));

        if (patterns.length > 0) {
          this.ig.add(patterns);
        }
      } catch (error) {
        // Continue without gitignore if unable to read
        console.error('Warning: Could not read .gitignore:', error);
      }
    }

    // Load .codeindexignore if it exists (project-specific patterns)
    const codeindexignorePath = path.join(this.rootPath, '.codeindexignore');
    if (existsSync(codeindexignorePath)) {
      try {
        const content = readFileSync(codeindexignorePath, 'utf-8');
        const patterns = content
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));

        if (patterns.length > 0) {
          this.ig.add(patterns);
        }
      } catch (error) {
        console.error('Warning: Could not read .codeindexignore:', error);
      }
    }
  }

  /**
   * Check if a file or directory should be ignored
   * @param relativePath The path relative to the root directory
   * @returns true if the file/directory should be ignored
   */
  public isIgnored(relativePath: string): boolean {
    // Normalize path separators for cross-platform compatibility
    const normalizedPath = relativePath.replace(/\\/g, '/');
    return this.ig.ignores(normalizedPath);
  }

  /**
   * Filter an array of relative paths to exclude ignored files
   * @param relativePaths Array of paths relative to the root directory
   * @returns Array of paths that are not ignored
   */
  public filterPaths(relativePaths: string[]): string[] {
    const normalizedPaths = relativePaths.map(p => p.replace(/\\/g, '/'));
    return this.ig.filter(normalizedPaths).map(p => p.replace(/\//g, path.sep));
  }

  /**
   * Add additional patterns at runtime
   * @param patterns Additional patterns to ignore
   */
  public addPatterns(patterns: string[]): void {
    this.ig.add(patterns);
  }

  /**
   * Get the current ignore patterns (for debugging/inspection)
   * @returns Array of active ignore patterns
   */
  public getPatterns(): string[] {
    return [...this.additionalPatterns];
  }
}