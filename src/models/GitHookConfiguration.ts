/**
 * Git Hook Configuration Model
 *
 * Represents installed hooks and their triggering conditions.
 * Based on data-model.md specification.
 */

export enum GitHookType {
  POST_MERGE = 'post-merge',
  POST_CHECKOUT = 'post-checkout',
  POST_REWRITE = 'post-rewrite',
}

export interface GitHookConfiguration {
  // Hook identity
  name: GitHookType;
  path: string;

  // Installation state
  installed: boolean;
  installedAt?: number;
  version: string;

  // Configuration
  enabled: boolean;
  blocking: boolean; // Must be false per requirements
  timeout: number; // Maximum execution time (ms)

  // Execution statistics
  executionCount: number;
  lastExecuted?: number;
  averageRuntime?: number;
  failureCount: number;
}

/**
 * Factory function to create a new GitHookConfiguration with defaults
 */
export function createGitHookConfiguration(
  name: GitHookType,
  path: string
): GitHookConfiguration {
  return {
    name,
    path,
    installed: false,
    version: '1.0.0',
    enabled: true,
    blocking: false, // Always non-blocking per requirements
    timeout: 5000, // 5 seconds default
    executionCount: 0,
    failureCount: 0,
  };
}

/**
 * Validates a GitHookConfiguration object
 */
export function validateGitHookConfiguration(
  config: GitHookConfiguration
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Path must exist if installed is true
  if (config.installed && !config.path) {
    errors.push('Path must exist when hook is installed');
  }

  // Timeout must be between 1000ms and 30000ms
  if (config.timeout < 1000 || config.timeout > 30000) {
    errors.push('Timeout must be between 1000ms and 30000ms');
  }

  // Blocking must be false (non-blocking requirement)
  if (config.blocking) {
    errors.push('Hooks must be non-blocking (blocking must be false)');
  }

  // Version must follow semver format (basic check)
  const semverRegex = /^\d+\.\d+\.\d+$/;
  if (!semverRegex.test(config.version)) {
    errors.push('Version must follow semver format (e.g., 1.0.0)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
