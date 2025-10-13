/**
 * Configuration options for the file watcher
 */
export interface WatcherConfig {
  /**
   * Debounce delay in milliseconds before processing changes
   * @default 500
   */
  debounceDelay: number;

  /**
   * Maximum number of files to process in a single batch
   * @default 100
   */
  batchSize: number;

  /**
   * Maximum number of events to queue before applying backpressure
   * @default 10000
   */
  maxQueueSize: number;

  /**
   * Patterns to ignore when watching files
   * @default ['node_modules/**', '.git/**', 'dist/**', 'build/**', '.codeindex/**']
   */
  ignorePatterns: string[];

  /**
   * Whether to follow symlinks
   * @default false
   */
  followSymlinks: boolean;

  /**
   * Maximum memory usage in MB before warning
   * @default 400
   */
  memoryThreshold: number;

  /**
   * Interval in seconds for memory monitoring
   * @default 30
   */
  memoryCheckInterval: number;

  /**
   * Number of retry attempts for failed operations
   * @default 3
   */
  retryAttempts: number;

  /**
   * Initial retry delay in milliseconds (exponential backoff)
   * @default 1000
   */
  retryDelay: number;

  /**
   * Whether to use .gitignore patterns
   * @default true
   */
  useGitignore: boolean;

  /**
   * Whether to watch hidden files (starting with .)
   * @default false
   */
  watchHidden: boolean;

  /**
   * Depth limit for watching directories (-1 for unlimited)
   * @default -1
   */
  depth: number;

  /**
   * Whether to enable verbose logging
   * @default false
   */
  verbose: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_WATCHER_CONFIG: WatcherConfig = {
  debounceDelay: 500,
  batchSize: 100,
  maxQueueSize: 10000,
  ignorePatterns: [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    '.codeindex/**',
    '**/*.log',
    '**/.DS_Store',
    '**/Thumbs.db'
  ],
  followSymlinks: false,
  memoryThreshold: 400,
  memoryCheckInterval: 30,
  retryAttempts: 3,
  retryDelay: 1000,
  useGitignore: true,
  watchHidden: false,
  depth: -1,
  verbose: false
};

/**
 * Creates a WatcherConfig with default values and overrides
 * @param overrides Partial configuration to override defaults
 * @returns Complete WatcherConfig
 */
export function createWatcherConfig(overrides?: Partial<WatcherConfig>): WatcherConfig {
  return {
    ...DEFAULT_WATCHER_CONFIG,
    ...overrides,
    // Merge ignore patterns instead of replacing
    ignorePatterns: overrides?.ignorePatterns
      ? [...DEFAULT_WATCHER_CONFIG.ignorePatterns, ...overrides.ignorePatterns]
      : DEFAULT_WATCHER_CONFIG.ignorePatterns
  };
}

/**
 * Validates a WatcherConfig
 * @param config Configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateWatcherConfig(config: WatcherConfig): void {
  if (config.debounceDelay < 100 || config.debounceDelay > 10000) {
    throw new Error('debounceDelay must be between 100ms and 10000ms');
  }

  if (config.batchSize < 1 || config.batchSize > 1000) {
    throw new Error('batchSize must be between 1 and 1000');
  }

  if (config.maxQueueSize < 100 || config.maxQueueSize > 100000) {
    throw new Error('maxQueueSize must be between 100 and 100000');
  }

  if (config.memoryThreshold < 50 || config.memoryThreshold > 2000) {
    throw new Error('memoryThreshold must be between 50MB and 2000MB');
  }

  if (config.retryAttempts < 0 || config.retryAttempts > 10) {
    throw new Error('retryAttempts must be between 0 and 10');
  }

  if (config.retryDelay < 100 || config.retryDelay > 60000) {
    throw new Error('retryDelay must be between 100ms and 60000ms');
  }
}