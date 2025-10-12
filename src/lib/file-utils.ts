import { resolve, relative, basename, extname, join } from 'path';
import { statSync, readFileSync, readdirSync, existsSync, lstatSync } from 'fs';
import { createHash } from 'crypto';

/**
 * File utilities for code-index
 */

/**
 * Gets absolute path from relative path
 */
export function getAbsolutePath(path: string, projectRoot: string): string {
  return resolve(projectRoot, path);
}

/**
 * Gets relative path from absolute path
 */
export function getRelativePath(absolutePath: string, projectRoot: string): string {
  return relative(projectRoot, absolutePath);
}

/**
 * Checks if path exists
 */
export function pathExists(path: string): boolean {
  return existsSync(path);
}

/**
 * Checks if path is a directory
 */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Checks if path is a file
 */
export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Checks if path is a symbolic link
 */
export function isSymbolicLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Gets file size in bytes
 */
export function getFileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/**
 * Gets file modification time
 */
export function getModifiedTime(path: string): Date {
  try {
    return statSync(path).mtime;
  } catch {
    return new Date(0);
  }
}

/**
 * Reads file content
 */
export function readFile(path: string, encoding: BufferEncoding = 'utf8'): string {
  return readFileSync(path, encoding);
}

/**
 * Reads file as buffer
 */
export function readFileBuffer(path: string): Buffer {
  return readFileSync(path);
}

/**
 * Calculates SHA-256 hash of file content
 */
export function calculateFileHash(path: string): string {
  const buffer = readFileBuffer(path);
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Counts lines in a text file
 */
export function countLines(content: string): number {
  if (!content) return 0;
  return content.split('\n').length;
}

/**
 * Checks if content is likely text (vs binary)
 */
export function isTextContent(buffer: Buffer): boolean {
  // Check for null bytes in first 8KB
  const sampleSize = Math.min(buffer.length, 8192);

  for (let i = 0; i < sampleSize; i++) {
    const byte = buffer[i];
    if (!byte) continue; // Skip if undefined
    // Null byte indicates binary
    if (byte === 0) return false;
    // Control characters (except common ones) indicate binary
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      return false;
    }
  }

  return true;
}

/**
 * Walks directory tree recursively
 */
export interface WalkOptions {
  followSymlinks?: boolean;
  maxDepth?: number;
  filter?: (path: string, stats: any) => boolean;
}

export function* walkDirectory(
  dir: string,
  options: WalkOptions = {},
  currentDepth: number = 0
): Generator<string> {
  const { followSymlinks = false, maxDepth = Infinity, filter } = options;

  if (currentDepth >= maxDepth) return;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      // Skip if filter rejects
      if (filter && !filter(fullPath, entry)) continue;

      if (entry.isDirectory()) {
        yield* walkDirectory(fullPath, options, currentDepth + 1);
      } else if (entry.isFile()) {
        yield fullPath;
      } else if (entry.isSymbolicLink() && followSymlinks) {
        try {
          const stats = statSync(fullPath);
          if (stats.isDirectory()) {
            yield* walkDirectory(fullPath, options, currentDepth + 1);
          } else if (stats.isFile()) {
            yield fullPath;
          }
        } catch {
          // Ignore broken symlinks
        }
      }
    }
  } catch (error) {
    // Ignore directories we can't read
    console.error(`Cannot read directory ${dir}: ${error}`);
  }
}

/**
 * Gets all files in a directory (non-recursive)
 */
export function getFiles(dir: string): string[] {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile())
      .map(entry => join(dir, entry.name));
  } catch {
    return [];
  }
}

/**
 * Gets all subdirectories in a directory (non-recursive)
 */
export function getDirectories(dir: string): string[] {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => join(dir, entry.name));
  } catch {
    return [];
  }
}

/**
 * Validates file path
 */
export function isValidPath(path: string): boolean {
  // Check for null bytes
  if (path.includes('\0')) return false;

  // Check for directory traversal
  const normalized = resolve(path);
  if (normalized.includes('..')) return false;

  return true;
}

/**
 * Gets file extension (including dot)
 */
export function getExtension(filename: string): string {
  return extname(filename).toLowerCase();
}

/**
 * Gets filename without extension
 */
export function getBasename(filename: string): string {
  const ext = extname(filename);
  return basename(filename, ext);
}

/**
 * Normalizes path separators
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Checks if file is hidden (starts with dot)
 */
export function isHiddenFile(path: string): boolean {
  const name = basename(path);
  return name.startsWith('.') && name !== '.';
}

/**
 * Creates a file filter function
 */
export function createFileFilter(options: {
  minSize?: number;
  maxSize?: number;
  extensions?: string[];
  excludeHidden?: boolean;
}): (path: string) => boolean {
  return (path: string): boolean => {
    if (options.excludeHidden && isHiddenFile(path)) {
      return false;
    }

    if (options.extensions && options.extensions.length > 0) {
      const ext = getExtension(path);
      if (!options.extensions.includes(ext)) {
        return false;
      }
    }

    const size = getFileSize(path);
    if (options.minSize !== undefined && size < options.minSize) {
      return false;
    }
    if (options.maxSize !== undefined && size > options.maxSize) {
      return false;
    }

    return true;
  };
}