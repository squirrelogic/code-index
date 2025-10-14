/**
 * Embedding configuration constants
 *
 * Centralizes all magic numbers and configuration values
 * for embedding-related functionality.
 */

/**
 * Batch Processing Configuration
 */
export const BATCH_CONFIG = {
  /** Minimum batch size for embedding processing */
  MIN_BATCH_SIZE: 1,

  /** Maximum batch size for embedding processing */
  MAX_BATCH_SIZE: 256,

  /** Default batch size for CPU-only systems */
  DEFAULT_CPU_BATCH_SIZE: 16,

  /** Default batch size for Apple Silicon (MPS) systems */
  DEFAULT_MPS_BATCH_SIZE: 32,

  /** Default batch size for NVIDIA CUDA systems */
  DEFAULT_CUDA_BATCH_SIZE: 64,

  /** Batch size reduction factor on OOM (50%) */
  BATCH_SIZE_REDUCTION_FACTOR: 0.5
} as const;

/**
 * Memory Management Configuration
 */
export const MEMORY_CONFIG = {
  /** Memory pressure threshold (80% of available) */
  MEMORY_PRESSURE_THRESHOLD: 0.8,

  /** Minimum free memory required (in bytes) - 500MB */
  MIN_FREE_MEMORY: 500 * 1024 * 1024,

  /** Files processed before triggering garbage collection hint */
  GC_HINT_INTERVAL: 100,

  /** Baseline memory usage target (in bytes) - 500MB */
  BASELINE_MEMORY_TARGET: 500 * 1024 * 1024
} as const;

/**
 * Retry and Timeout Configuration
 */
export const RETRY_CONFIG = {
  /** Number of retries for model downloads */
  MODEL_DOWNLOAD_RETRIES: 3,

  /** Base delay for exponential backoff (in ms) */
  EXPONENTIAL_BACKOFF_BASE: 1000,

  /** Maximum retry delay (in ms) - 30 seconds */
  MAX_RETRY_DELAY: 30000
} as const;

/**
 * Circuit Breaker Configuration
 */
export const CIRCUIT_BREAKER_CONFIG = {
  /** Circuit breaker timeout (in ms) - 30 seconds */
  TIMEOUT: 30000,

  /** Error threshold percentage for circuit breaker (50%) */
  ERROR_THRESHOLD: 0.5,

  /** Circuit breaker reset timeout (in ms) - 60 seconds */
  RESET_TIMEOUT: 60000,

  /** Volume threshold - minimum requests before circuit breaker activates */
  VOLUME_THRESHOLD: 10
} as const;

/**
 * Performance Targets (Success Criteria)
 */
export const PERFORMANCE_TARGETS = {
  /** Hardware detection target (in ms) - SC-001 */
  HARDWARE_DETECTION_TARGET_MS: 2000,

  /** Fallback transition target (in ms) - SC-006 */
  FALLBACK_TRANSITION_TARGET_MS: 5000,

  /** Cache retrieval performance multiplier - SC-007 */
  CACHE_SPEEDUP_MULTIPLIER: 10,

  /** Minimum throughput (files per second) for CPU */
  MIN_CPU_THROUGHPUT: 50,

  /** Minimum throughput (files per second) for GPU */
  MIN_GPU_THROUGHPUT: 100
} as const;

/**
 * Model Configuration
 */
export const MODEL_CONFIG = {
  /** Default model version */
  DEFAULT_MODEL_VERSION: 'main',

  /** Model cache directory (relative to .codeindex/) */
  MODEL_CACHE_DIR: 'models',

  /** Embedding cache directory (relative to .codeindex/) */
  EMBEDDING_CACHE_DIR: 'cache',

  /** Maximum model ID length */
  MAX_MODEL_ID_LENGTH: 500,

  /** Maximum model version length */
  MAX_MODEL_VERSION_LENGTH: 100
} as const;

/**
 * Fallback Configuration
 */
export const FALLBACK_CONFIG = {
  /** Maximum number of fallback events to store in config */
  MAX_FALLBACK_HISTORY: 10,

  /** Minimum batch size before giving up */
  MIN_FALLBACK_BATCH_SIZE: 1
} as const;

/**
 * Input Validation Limits
 */
export const INPUT_LIMITS = {
  /** Maximum profile name length */
  MAX_PROFILE_NAME_LENGTH: 50,

  /** Maximum general input length */
  MAX_INPUT_LENGTH: 1000,

  /** Maximum model ID length */
  MAX_MODEL_ID_LENGTH: 500,

  /** Maximum batch size string length */
  MAX_BATCH_SIZE_STRING_LENGTH: 10
} as const;

/**
 * File Processing Configuration
 */
export const FILE_PROCESSING_CONFIG = {
  /** Maximum files to process without failure (SC-010) */
  MAX_FILES_WITHOUT_FAILURE: 1000,

  /** Progress bar update interval (in files) */
  PROGRESS_UPDATE_INTERVAL: 10
} as const;

/**
 * Hardware Detection Configuration
 */
export const HARDWARE_CONFIG = {
  /** Command timeout for GPU detection (in ms) */
  GPU_DETECTION_TIMEOUT_MS: 5000,

  /** Command timeout for ONNX provider detection (in ms) */
  ONNX_DETECTION_TIMEOUT_MS: 3000
} as const;
