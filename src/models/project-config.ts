/**
 * Project configuration for code-index
 */
export interface ProjectConfiguration {
  // Unique identifier
  id: string; // UUID v4

  // Project metadata
  projectRoot: string; // Absolute path to project root
  name: string; // Project name (derived from package.json or directory name)
  version: string; // Configuration version (semver)

  // Index settings
  indexVersion: number; // Index schema version for migrations
  createdAt: Date; // ISO 8601 timestamp
  lastIndexedAt: Date | null; // ISO 8601 timestamp or null if never indexed
  lastRefreshedAt: Date | null; // ISO 8601 timestamp or null if never refreshed

  // Preferences
  ignorePatterns: string[]; // Additional patterns beyond .gitignore
  includePatterns: string[]; // Explicit include patterns (overrides ignores)
  maxFileSize: number; // Maximum file size in bytes (default: 10MB)
  followSymlinks: boolean; // Whether to follow symbolic links (default: false)

  // Performance settings
  batchSize: number; // Files to process per transaction (default: 100)
  concurrency: number; // Parallel file readers (default: 4)
}

/**
 * Default project configuration values
 */
export const DEFAULT_PROJECT_CONFIG: Partial<ProjectConfiguration> = {
  version: '1.0.0',
  indexVersion: 1,
  ignorePatterns: [],
  includePatterns: [],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  followSymlinks: false,
  batchSize: 100,
  concurrency: 4,
  lastIndexedAt: null,
  lastRefreshedAt: null
};

/**
 * Validates project configuration
 */
export function validateProjectConfig(config: Partial<ProjectConfiguration>): string[] {
  const errors: string[] = [];

  if (config.maxFileSize !== undefined) {
    if (config.maxFileSize <= 0) {
      errors.push('maxFileSize must be a positive integer');
    }
    if (config.maxFileSize > 100 * 1024 * 1024) { // 100MB
      errors.push('maxFileSize must not exceed 100MB');
    }
  }

  if (config.batchSize !== undefined) {
    if (config.batchSize < 1 || config.batchSize > 1000) {
      errors.push('batchSize must be between 1 and 1000');
    }
  }

  if (config.concurrency !== undefined) {
    if (config.concurrency < 1 || config.concurrency > 16) {
      errors.push('concurrency must be between 1 and 16');
    }
  }

  if (config.version !== undefined && !isValidSemver(config.version)) {
    errors.push('version must follow semver format');
  }

  return errors;
}

/**
 * Simple semver validation
 */
function isValidSemver(version: string): boolean {
  const semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
  return semverRegex.test(version);
}