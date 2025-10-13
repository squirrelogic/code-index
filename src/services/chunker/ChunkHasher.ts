/**
 * ChunkHasher - Generates stable content-based hashes for chunks
 */

import { createHash } from 'crypto';
import Parser from 'tree-sitter';

/**
 * ChunkHasher service
 */
export class ChunkHasher {
  /**
   * Generate stable chunk hash from normalized content
   * @param content Full chunk content (signature + body + docs)
   * @param tree Optional: parsed tree for smarter normalization
   * @returns SHA-256 hash (64 hex characters)
   */
  public generateChunkHash(content: string, _tree?: Parser.Tree): string {
    // Normalize whitespace
    const normalized = this.normalizeWhitespace(content);

    // Generate SHA-256 hash
    const hash = createHash('sha256');
    hash.update(normalized, 'utf8');

    return hash.digest('hex');
  }

  /**
   * Normalize whitespace while preserving logical structure
   * This ensures that formatting changes don't affect the hash
   */
  public normalizeWhitespace(code: string): string {
    const lines = code.split('\n');
    const normalized: string[] = [];

    for (const line of lines) {
      // Trim leading/trailing whitespace
      const trimmed = line.trim();

      // Skip empty lines
      if (trimmed.length === 0) {
        continue;
      }

      // Normalize multiple spaces to single space
      // This handles both spaces and tabs
      const spacesNormalized = trimmed.replace(/\s+/g, ' ');

      normalized.push(spacesNormalized);
    }

    // Join with single newline
    return normalized.join('\n');
  }

  /**
   * Validate that a string is a valid chunk hash
   * @param hash Hash to validate
   * @returns True if valid SHA-256 hash
   */
  public isValidHash(hash: string): boolean {
    // SHA-256 produces 64 hex characters
    return /^[0-9a-f]{64}$/i.test(hash);
  }

  /**
   * Compare two chunks for content equality
   * Useful for detecting hash collisions
   */
  public compareChunks(content1: string, content2: string): boolean {
    const normalized1 = this.normalizeWhitespace(content1);
    const normalized2 = this.normalizeWhitespace(content2);

    return normalized1 === normalized2;
  }

  /**
   * Generate hash from multiple content parts
   * Useful for hashing signature + body + docs separately
   */
  public generateHashFromParts(...parts: (string | null)[]): string {
    const combined = parts
      .filter((part): part is string => part !== null && part !== undefined)
      .map((part) => this.normalizeWhitespace(part))
      .join('\n');

    const hash = createHash('sha256');
    hash.update(combined, 'utf8');

    return hash.digest('hex');
  }
}
