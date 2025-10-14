/**
 * ChunkHashValidator - Validates chunk hash stability and detects collisions
 * Used in testing and production monitoring
 */

import { Chunk } from '../../models/Chunk.js';
import { ChunkHasher } from '../../services/chunker/ChunkHasher.js';

/**
 * Comparison result for chunk hash validation
 */
export interface HashComparisonResult {
  /** Are the hashes identical? */
  hashesMatch: boolean;
  /** Are the normalized contents identical? */
  contentsMatch: boolean;
  /** Is this a hash collision? (different content, same hash) */
  isCollision: boolean;
  /** The first hash */
  hash1: string;
  /** The second hash */
  hash2: string;
  /** Details about the comparison */
  details: string;
}

/**
 * Stability validation result
 */
export interface StabilityValidationResult {
  /** Is the hash stable across all samples? */
  isStable: boolean;
  /** Number of unique hashes found */
  uniqueHashCount: number;
  /** Total number of samples tested */
  sampleCount: number;
  /** The expected hash (if stable) */
  expectedHash: string | null;
  /** List of all hashes encountered */
  allHashes: string[];
  /** Details about instability (if any) */
  details: string;
}

/**
 * Collision detection result
 */
export interface CollisionDetectionResult {
  /** Were any collisions detected? */
  hasCollisions: boolean;
  /** Number of collisions found */
  collisionCount: number;
  /** Details about each collision */
  collisions: Array<{
    hash: string;
    chunk1: Chunk;
    chunk2: Chunk;
    reason: string;
  }>;
}

/**
 * ChunkHashValidator service
 */
export class ChunkHashValidator {
  private hasher: ChunkHasher;

  constructor() {
    this.hasher = new ChunkHasher();
  }

  /**
   * Compare two chunk hashes and detect collisions
   * @param chunk1 First chunk
   * @param chunk2 Second chunk
   * @returns Comparison result
   */
  public compareChunkHashes(chunk1: Chunk, chunk2: Chunk): HashComparisonResult {
    const hashesMatch = chunk1.chunkHash === chunk2.chunkHash;
    const contentsMatch = this.hasher.compareChunks(chunk1.content, chunk2.content);

    let isCollision = false;
    let details = '';

    if (hashesMatch && !contentsMatch) {
      // Hash collision: same hash, different content
      isCollision = true;
      details = 'COLLISION DETECTED: Same hash but different normalized content';
    } else if (!hashesMatch && contentsMatch) {
      // Hash instability: different hash, same content
      details = 'INSTABILITY DETECTED: Different hash but same normalized content';
    } else if (hashesMatch && contentsMatch) {
      details = 'Hashes match correctly - same content produces same hash';
    } else {
      details = 'Hashes differ correctly - different content produces different hash';
    }

    return {
      hashesMatch,
      contentsMatch,
      isCollision,
      hash1: chunk1.chunkHash,
      hash2: chunk2.chunkHash,
      details,
    };
  }

  /**
   * Detect hash collisions in a set of chunks
   * @param chunks Array of chunks to check
   * @returns Collision detection result
   */
  public detectCollisions(chunks: Chunk[]): CollisionDetectionResult {
    const collisions: CollisionDetectionResult['collisions'] = [];
    const hashMap = new Map<string, Chunk>();

    for (const chunk of chunks) {
      const existingChunk = hashMap.get(chunk.chunkHash);

      if (existingChunk) {
        // Found a chunk with the same hash
        const contentsMatch = this.hasher.compareChunks(
          existingChunk.content,
          chunk.content
        );

        if (!contentsMatch) {
          // This is a collision: same hash, different content
          collisions.push({
            hash: chunk.chunkHash,
            chunk1: existingChunk,
            chunk2: chunk,
            reason: `Hash collision detected: chunks "${existingChunk.name}" and "${chunk.name}" have the same hash but different content`,
          });
        }
      } else {
        hashMap.set(chunk.chunkHash, chunk);
      }
    }

    return {
      hasCollisions: collisions.length > 0,
      collisionCount: collisions.length,
      collisions,
    };
  }

  /**
   * Validate hash stability across multiple samples of the same content
   * @param chunks Array of chunks that should have identical hashes
   * @returns Stability validation result
   */
  public validateStability(chunks: Chunk[]): StabilityValidationResult {
    if (chunks.length === 0) {
      return {
        isStable: true,
        uniqueHashCount: 0,
        sampleCount: 0,
        expectedHash: null,
        allHashes: [],
        details: 'No chunks provided',
      };
    }

    const allHashes = chunks.map((c) => c.chunkHash);
    const uniqueHashes = new Set(allHashes);
    const uniqueHashCount = uniqueHashes.size;
    const isStable = uniqueHashCount === 1;

    let details = '';
    let expectedHash: string | null = null;

    if (isStable) {
      expectedHash = allHashes[0];
      details = `Hash is stable: all ${chunks.length} samples produced the same hash`;
    } else {
      details = `Hash is unstable: ${chunks.length} samples produced ${uniqueHashCount} different hashes`;

      // Find the most common hash
      const hashCounts = new Map<string, number>();
      for (const hash of allHashes) {
        hashCounts.set(hash, (hashCounts.get(hash) || 0) + 1);
      }

      const mostCommonHash = Array.from(hashCounts.entries()).reduce((a, b) =>
        a[1] > b[1] ? a : b
      )[0];

      details += `. Most common hash: ${mostCommonHash} (${hashCounts.get(mostCommonHash)} occurrences)`;
    }

    return {
      isStable,
      uniqueHashCount,
      sampleCount: chunks.length,
      expectedHash,
      allHashes,
      details,
    };
  }

  /**
   * Validate that whitespace-only changes don't affect hash
   * @param originalChunk Original chunk
   * @param modifiedChunk Chunk with whitespace changes only
   * @returns True if hashes match (as expected)
   */
  public validateWhitespaceStability(
    originalChunk: Chunk,
    modifiedChunk: Chunk
  ): boolean {
    // For whitespace-only changes, hashes should match
    return originalChunk.chunkHash === modifiedChunk.chunkHash;
  }

  /**
   * Validate that content changes do affect hash
   * @param originalChunk Original chunk
   * @param modifiedChunk Chunk with content changes
   * @returns True if hashes differ (as expected)
   */
  public validateContentChangeSensitivity(
    originalChunk: Chunk,
    modifiedChunk: Chunk
  ): boolean {
    // For content changes, hashes should differ
    return originalChunk.chunkHash !== modifiedChunk.chunkHash;
  }

  /**
   * Validate hash format (SHA-256: 64 hex characters)
   * @param hash Hash to validate
   * @returns Validation result with details
   */
  public validateHashFormat(hash: string): { isValid: boolean; details: string } {
    const isValid = this.hasher.isValidHash(hash);

    let details = '';
    if (!isValid) {
      if (hash.length !== 64) {
        details = `Invalid hash length: expected 64 characters, got ${hash.length}`;
      } else if (!/^[0-9a-f]+$/i.test(hash)) {
        details = 'Invalid hash format: must contain only hexadecimal characters';
      } else {
        details = 'Invalid hash format';
      }
    } else {
      details = 'Hash format is valid (SHA-256: 64 hex characters)';
    }

    return { isValid, details };
  }

  /**
   * Generate a hash stability report for a set of chunks
   * @param chunks Array of chunks
   * @returns Report string
   */
  public generateStabilityReport(chunks: Chunk[]): string {
    const stability = this.validateStability(chunks);
    const collisions = this.detectCollisions(chunks);

    const lines: string[] = [
      '=== Chunk Hash Stability Report ===',
      '',
      `Total chunks: ${chunks.length}`,
      `Unique hashes: ${stability.uniqueHashCount}`,
      `Stability: ${stability.isStable ? '✓ PASS' : '✗ FAIL'}`,
      '',
      stability.details,
      '',
    ];

    if (collisions.hasCollisions) {
      lines.push('⚠️  COLLISIONS DETECTED:');
      lines.push('');
      for (const collision of collisions.collisions) {
        lines.push(`  Hash: ${collision.hash}`);
        lines.push(`  Chunk 1: ${collision.chunk1.name} (${collision.chunk1.fileId})`);
        lines.push(`  Chunk 2: ${collision.chunk2.name} (${collision.chunk2.fileId})`);
        lines.push(`  Reason: ${collision.reason}`);
        lines.push('');
      }
    } else {
      lines.push('✓ No collisions detected');
    }

    return lines.join('\n');
  }

  /**
   * Quick validation: check if all chunks in an array have valid hashes
   * @param chunks Array of chunks
   * @returns True if all hashes are valid
   */
  public validateAllHashes(chunks: Chunk[]): boolean {
    return chunks.every((chunk) => this.hasher.isValidHash(chunk.chunkHash));
  }
}
