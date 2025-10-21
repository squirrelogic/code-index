/**
 * AST Persistence Service
 *
 * Manages storage and retrieval of ParseResult AST as JSON files.
 * Provides fast, zero-overhead access to full AST data for search results.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { ParseResult } from '../models/ParseResult.js';

/**
 * Service for persisting ParseResult AST as JSON files
 */
export class ASTPersistenceService {
  private astDir: string;

  constructor(codeIndexDir: string) {
    this.astDir = path.join(codeIndexDir, 'ast');
  }

  /**
   * Initialize the AST persistence directory
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.astDir, { recursive: true });
  }

  /**
   * Convert file path to AST JSON filename
   * Encodes the file path to avoid filesystem issues
   */
  private getAstPath(filePath: string): string {
    // Replace path separators and problematic characters with safe alternatives
    const encoded = filePath
      .replace(/\//g, '_')
      .replace(/\\/g, '_')
      .replace(/:/g, '_')
      .replace(/\.\./g, '__');

    return path.join(this.astDir, `${encoded}.json`);
  }

  /**
   * Write ParseResult to JSON file
   * @param filePath Original source file path
   * @param parseResult ParseResult to persist
   */
  async write(filePath: string, parseResult: ParseResult): Promise<void> {
    const astPath = this.getAstPath(filePath);

    // Ensure directory exists
    await fs.mkdir(path.dirname(astPath), { recursive: true });

    // Write JSON with pretty printing for debuggability
    const json = JSON.stringify(parseResult, null, 2);
    await fs.writeFile(astPath, json, 'utf-8');
  }

  /**
   * Read ParseResult from JSON file
   * @param filePath Original source file path
   * @returns ParseResult or null if not found
   */
  async read(filePath: string): Promise<ParseResult | null> {
    const astPath = this.getAstPath(filePath);

    try {
      const json = await fs.readFile(astPath, 'utf-8');
      return JSON.parse(json) as ParseResult;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete AST file for a source file
   * @param filePath Original source file path
   */
  async delete(filePath: string): Promise<void> {
    const astPath = this.getAstPath(filePath);

    try {
      await fs.unlink(astPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // Ignore if file doesn't exist
    }
  }

  /**
   * Check if AST file exists for a source file
   * @param filePath Original source file path
   * @returns True if AST exists
   */
  async exists(filePath: string): Promise<boolean> {
    const astPath = this.getAstPath(filePath);

    try {
      await fs.access(astPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all AST file paths
   * @returns Array of original source file paths
   */
  async listAll(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.astDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => {
          // Decode the filename back to original path
          return file
            .replace(/\.json$/, '')
            .replace(/__/g, '..')
            .replace(/_/g, '/');
        });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Clear all AST files
   */
  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.astDir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(this.astDir, file)))
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Get storage statistics
   * @returns Stats about AST storage
   */
  async getStats(): Promise<{
    totalFiles: number;
    totalSizeBytes: number;
    averageSizeBytes: number;
  }> {
    try {
      const files = await fs.readdir(this.astDir);
      let totalSize = 0;

      for (const file of files) {
        const stats = await fs.stat(path.join(this.astDir, file));
        totalSize += stats.size;
      }

      return {
        totalFiles: files.length,
        totalSizeBytes: totalSize,
        averageSizeBytes: files.length > 0 ? totalSize / files.length : 0,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          totalFiles: 0,
          totalSizeBytes: 0,
          averageSizeBytes: 0,
        };
      }
      throw error;
    }
  }
}
