import { promises as fs, constants } from 'fs';
import path from 'path';
import { FileAccessError } from './errors/WatcherErrors.js';

/**
 * File system type enumeration
 */
export enum FileSystemType {
  LOCAL = 'local',
  NETWORK = 'network',
  UNKNOWN = 'unknown'
}

/**
 * File access permissions
 */
export interface FileAccessInfo {
  readable: boolean;
  writable: boolean;
  executable: boolean;
  exists: boolean;
}

/**
 * Gets the canonical path by resolving symlinks
 * @param filePath The path to resolve
 * @returns The canonical absolute path
 */
export async function getCanonicalPath(filePath: string): Promise<string> {
  try {
    // Resolve to absolute path first
    const absolutePath = path.resolve(filePath);

    // Check if path exists
    try {
      await fs.access(absolutePath);
    } catch {
      // Path doesn't exist, return normalized absolute path
      return path.normalize(absolutePath);
    }

    // Resolve symlinks to get canonical path
    const realPath = await fs.realpath(absolutePath);
    return path.normalize(realPath);
  } catch (error) {
    throw new FileAccessError(filePath, 'resolve canonical path', error as Error);
  }
}

/**
 * Synchronous version of getCanonicalPath
 * @param filePath The path to resolve
 * @returns The canonical absolute path
 */
export function getCanonicalPathSync(filePath: string): string {
  const fsSync = require('fs');
  try {
    // Resolve to absolute path first
    const absolutePath = path.resolve(filePath);

    // Check if path exists
    try {
      fsSync.accessSync(absolutePath);
    } catch {
      // Path doesn't exist, return normalized absolute path
      return path.normalize(absolutePath);
    }

    // Resolve symlinks to get canonical path
    const realPath = fsSync.realpathSync(absolutePath);
    return path.normalize(realPath);
  } catch (error) {
    throw new FileAccessError(filePath, 'resolve canonical path', error as Error);
  }
}

/**
 * Checks file access permissions
 * @param filePath The path to check
 * @returns File access information
 */
export async function checkFileAccess(filePath: string): Promise<FileAccessInfo> {
  const info: FileAccessInfo = {
    readable: false,
    writable: false,
    executable: false,
    exists: false
  };

  try {
    // Check if file exists
    await fs.access(filePath, constants.F_OK);
    info.exists = true;

    // Check read permission
    try {
      await fs.access(filePath, constants.R_OK);
      info.readable = true;
    } catch {}

    // Check write permission
    try {
      await fs.access(filePath, constants.W_OK);
      info.writable = true;
    } catch {}

    // Check execute permission
    try {
      await fs.access(filePath, constants.X_OK);
      info.executable = true;
    } catch {}
  } catch {}

  return info;
}

/**
 * Detects the file system type for a given path
 * @param filePath The path to check
 * @returns The detected file system type
 */
export async function detectFilesystemType(filePath: string): Promise<FileSystemType> {
  try {
    const resolvedPath = await getCanonicalPath(filePath);

    // Check for network path patterns
    if (process.platform === 'win32') {
      // Windows UNC paths
      if (resolvedPath.startsWith('\\\\')) {
        return FileSystemType.NETWORK;
      }
    } else {
      // Unix-like systems - check if mount point is network
      // This is a simplified check - real implementation would check mount table
      if (resolvedPath.startsWith('/mnt/') ||
          resolvedPath.startsWith('/media/') ||
          resolvedPath.startsWith('/net/')) {
        return FileSystemType.NETWORK;
      }
    }

    return FileSystemType.LOCAL;
  } catch {
    return FileSystemType.UNKNOWN;
  }
}

/**
 * Checks if a path is a symlink
 * @param filePath The path to check
 * @returns True if the path is a symlink
 */
export async function isSymlink(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(filePath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Gets the target of a symlink
 * @param symlinkPath The symlink path
 * @returns The target path or null if not a symlink
 */
export async function getSymlinkTarget(symlinkPath: string): Promise<string | null> {
  try {
    if (await isSymlink(symlinkPath)) {
      return await fs.readlink(symlinkPath);
    }
  } catch {}
  return null;
}

/**
 * Checks if a path is a directory
 * @param filePath The path to check
 * @returns True if the path is a directory
 */
export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Synchronous version of isDirectory
 * @param filePath The path to check
 * @returns True if the path is a directory
 */
export function isDirectorySync(filePath: string): boolean {
  const fsSync = require('fs');
  try {
    const stats = fsSync.statSync(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Gets file size in bytes
 * @param filePath The path to check
 * @returns File size in bytes or -1 if error
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return -1;
  }
}

/**
 * Gets the last modified time of a file
 * @param filePath The path to check
 * @returns Unix timestamp in milliseconds or -1 if error
 */
export async function getLastModified(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtimeMs;
  } catch {
    return -1;
  }
}

/**
 * Normalizes a file path for consistent comparison
 * @param filePath The path to normalize
 * @returns Normalized path
 */
export function normalizePath(filePath: string): string {
  // Normalize path separators and remove trailing slashes
  let normalized = path.normalize(filePath);

  // Convert to forward slashes for consistency
  if (process.platform === 'win32') {
    normalized = normalized.replace(/\\/g, '/');
  }

  // Remove trailing slash unless it's the root
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Converts an absolute path to a relative path from a base directory
 * @param absolutePath The absolute path
 * @param basePath The base directory path
 * @returns Relative path
 */
export function toRelativePath(absolutePath: string, basePath: string): string {
  const normalizedAbsolute = normalizePath(absolutePath);
  const normalizedBase = normalizePath(basePath);

  let relative = path.relative(normalizedBase, normalizedAbsolute);

  // Convert to forward slashes for consistency
  if (process.platform === 'win32') {
    relative = relative.replace(/\\/g, '/');
  }

  return relative;
}

/**
 * Checks if a path is within a base directory
 * @param targetPath The path to check
 * @param basePath The base directory
 * @returns True if targetPath is within basePath
 */
export function isPathWithin(targetPath: string, basePath: string): boolean {
  const normalizedTarget = normalizePath(path.resolve(targetPath));
  const normalizedBase = normalizePath(path.resolve(basePath));

  return normalizedTarget.startsWith(normalizedBase + '/') ||
         normalizedTarget === normalizedBase;
}

/**
 * Creates a directory recursively if it doesn't exist
 * @param dirPath The directory path to create
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new FileAccessError(dirPath, 'create directory', error as Error);
  }
}

/**
 * Checks if a file path matches any of the given patterns
 * @param filePath The file path to check
 * @param patterns Array of glob patterns
 * @returns True if the path matches any pattern
 */
export function matchesPatterns(filePath: string, patterns: string[]): boolean {
  const normalized = normalizePath(filePath);

  for (const pattern of patterns) {
    // Simple glob matching (can be enhanced with a proper glob library)
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\//g, '\\/');

    const regex = new RegExp(`^${regexPattern}$`);
    if (regex.test(normalized)) {
      return true;
    }
  }

  return false;
}