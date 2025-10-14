/**
 * Security utilities for input validation and sanitization
 */

import { resolve, isAbsolute, normalize } from 'path';

/**
 * Validates a model ID to prevent path traversal attacks
 *
 * Valid formats:
 * - Hugging Face ID: org/model (e.g., Xenova/all-MiniLM-L6-v2)
 * - Local absolute path: /absolute/path/to/model
 * - Local relative path: ./relative/path or ../relative/path
 *
 * @param modelId - The model ID to validate
 * @param projectRoot - The project root directory for resolving relative paths
 * @returns Validation result with sanitized path if valid
 */
export function validateModelId(
  modelId: string,
  projectRoot?: string
): { valid: boolean; sanitized?: string; error?: string } {
  // Check for empty or whitespace-only input
  if (!modelId || modelId.trim().length === 0) {
    return { valid: false, error: 'Model ID cannot be empty' };
  }

  const trimmed = modelId.trim();

  // Check for path traversal patterns
  if (trimmed.includes('..\\') || trimmed.includes('../')) {
    // Allow relative paths but validate them
    if (projectRoot) {
      try {
        const resolvedPath = resolve(projectRoot, trimmed);
        const normalizedProject = normalize(projectRoot);

        // Ensure resolved path is within or equal to project root
        if (!resolvedPath.startsWith(normalizedProject)) {
          return {
            valid: false,
            error: 'Path traversal detected: model path must be within project directory'
          };
        }

        return { valid: true, sanitized: resolvedPath };
      } catch (error: any) {
        return {
          valid: false,
          error: `Invalid path: ${error.message}`
        };
      }
    }
  }

  // Check for null bytes (security issue in some file systems)
  if (trimmed.includes('\0')) {
    return { valid: false, error: 'Null bytes not allowed in model ID' };
  }

  // Check for dangerous characters
  const dangerousChars = ['<', '>', '|', '"', '?', '*'];
  for (const char of dangerousChars) {
    if (trimmed.includes(char)) {
      return {
        valid: false,
        error: `Invalid character "${char}" in model ID`
      };
    }
  }

  // Validate Hugging Face ID format (org/model)
  if (trimmed.includes('/')) {
    // Check if it's a Hugging Face ID (not a path)
    if (!trimmed.startsWith('/') && !trimmed.startsWith('./') && !isAbsolute(trimmed)) {
      const parts = trimmed.split('/');

      // Hugging Face IDs should have exactly 2 parts: org/model
      if (parts.length !== 2) {
        return {
          valid: false,
          error: 'Hugging Face model ID must be in format: organization/model'
        };
      }

      // Validate org and model names (alphanumeric, hyphens, underscores)
      const validPattern = /^[a-zA-Z0-9_-]+$/;
      if (!validPattern.test(parts[0]) || !validPattern.test(parts[1])) {
        return {
          valid: false,
          error: 'Hugging Face model ID contains invalid characters (allowed: a-z, A-Z, 0-9, -, _)'
        };
      }

      return { valid: true, sanitized: trimmed };
    }
  }

  // Validate local path
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || isAbsolute(trimmed)) {
    try {
      const normalizedPath = normalize(trimmed);

      // Additional check: if projectRoot provided, ensure path is safe
      if (projectRoot && !isAbsolute(normalizedPath)) {
        const resolvedPath = resolve(projectRoot, normalizedPath);
        return { valid: true, sanitized: resolvedPath };
      }

      return { valid: true, sanitized: normalizedPath };
    } catch (error: any) {
      return {
        valid: false,
        error: `Invalid path: ${error.message}`
      };
    }
  }

  // If we get here, it's not a recognized format
  return {
    valid: false,
    error: 'Model ID must be either a Hugging Face ID (org/model) or a valid file path'
  };
}

/**
 * Sanitizes a CLI string input by removing dangerous characters
 *
 * @param input - The input string to sanitize
 * @param maxLength - Maximum allowed length (default: 1000)
 * @returns Sanitized string
 */
export function sanitizeInput(input: string, maxLength: number = 1000): string {
  if (!input) return '';

  // Trim whitespace
  let sanitized = input.trim();

  // Enforce maximum length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Remove control characters except newline and tab
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized;
}

/**
 * Validates a profile name
 *
 * @param profileName - The profile name to validate
 * @returns Validation result
 */
export function validateProfileName(profileName: string): { valid: boolean; error?: string } {
  if (!profileName || profileName.trim().length === 0) {
    return { valid: false, error: 'Profile name cannot be empty' };
  }

  const trimmed = profileName.trim();

  // Check length
  if (trimmed.length > 50) {
    return { valid: false, error: 'Profile name must be 50 characters or less' };
  }

  // Check for valid characters (alphanumeric, hyphens, underscores)
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(trimmed)) {
    return {
      valid: false,
      error: 'Profile name can only contain letters, numbers, hyphens, and underscores'
    };
  }

  return { valid: true };
}

/**
 * Validates a batch size value
 *
 * @param batchSize - The batch size to validate
 * @param min - Minimum allowed value (default: 1)
 * @param max - Maximum allowed value (default: 256)
 * @returns Validation result
 */
export function validateBatchSize(
  batchSize: number,
  min: number = 1,
  max: number = 256
): { valid: boolean; error?: string } {
  if (!Number.isInteger(batchSize)) {
    return { valid: false, error: 'Batch size must be an integer' };
  }

  if (batchSize < min || batchSize > max) {
    return {
      valid: false,
      error: `Batch size must be between ${min} and ${max}`
    };
  }

  return { valid: true };
}

/**
 * Validates a directory path for caching
 *
 * @param dirPath - The directory path to validate
 * @param projectRoot - The project root directory
 * @returns Validation result with sanitized path
 */
export function validateCacheDir(
  dirPath: string,
  projectRoot: string
): { valid: boolean; sanitized?: string; error?: string } {
  if (!dirPath || dirPath.trim().length === 0) {
    return { valid: false, error: 'Cache directory path cannot be empty' };
  }

  const trimmed = dirPath.trim();

  // Check for null bytes
  if (trimmed.includes('\0')) {
    return { valid: false, error: 'Null bytes not allowed in path' };
  }

  // Check for dangerous characters
  const dangerousChars = ['<', '>', '|', '"', '?', '*'];
  for (const char of dangerousChars) {
    if (trimmed.includes(char)) {
      return {
        valid: false,
        error: `Invalid character "${char}" in path`
      };
    }
  }

  try {
    // Resolve path relative to project root
    const resolvedPath = isAbsolute(trimmed) ? trimmed : resolve(projectRoot, trimmed);
    const normalizedPath = normalize(resolvedPath);

    // For relative paths, ensure they stay within project
    if (!isAbsolute(trimmed)) {
      const normalizedProject = normalize(projectRoot);
      if (!normalizedPath.startsWith(normalizedProject)) {
        return {
          valid: false,
          error: 'Cache directory must be within project directory'
        };
      }
    }

    return { valid: true, sanitized: normalizedPath };
  } catch (error: any) {
    return {
      valid: false,
      error: `Invalid path: ${error.message}`
    };
  }
}
