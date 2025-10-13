/**
 * ChunkValidator - Validates chunk completeness and self-containment
 * T034: Documentation completeness validator
 */

import type { Chunk } from '../../models/Chunk.js';
import { ChunkType } from '../../models/ChunkTypes.js';

/**
 * Validation result for a chunk
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * ChunkValidator service
 */
export class ChunkValidator {
  /**
   * Validate that a chunk is complete and self-contained
   * @param chunk Chunk to validate
   * @returns Validation result with errors and warnings
   */
  public validateChunk(chunk: Chunk): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!chunk.name || chunk.name.trim().length === 0) {
      errors.push('Chunk must have a non-empty name');
    }

    if (!chunk.content || chunk.content.trim().length === 0) {
      errors.push('Chunk must have non-empty content');
    }

    if (!chunk.chunkHash || chunk.chunkHash.length !== 64) {
      errors.push('Chunk must have a valid 64-character hash');
    }

    if (!chunk.context) {
      errors.push('Chunk must have context information');
    }

    // Check chunk type specific requirements
    this.validateByType(chunk, errors, warnings);

    // Check documentation completeness (SC-008: 95% self-contained)
    this.validateDocumentation(chunk, warnings);

    // Check context completeness
    this.validateContext(chunk, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate type-specific requirements
   */
  private validateByType(chunk: Chunk, errors: string[], warnings: string[]): void {
    switch (chunk.chunkType) {
      case ChunkType.Method:
      case ChunkType.AsyncMethod:
      case ChunkType.Constructor:
        // Methods should have class context
        if (!chunk.context.className) {
          warnings.push(`${chunk.chunkType} should have class context (className)`);
        }
        break;

      case ChunkType.Property:
        // Properties must have class context
        if (!chunk.context.className) {
          errors.push('Property chunks must have class context');
        }
        break;

      case ChunkType.Function:
      case ChunkType.AsyncFunction:
      case ChunkType.Generator:
        // Top-level functions should be marked as isTopLevel
        if (!chunk.context.isTopLevel) {
          warnings.push(`${chunk.chunkType} should be top-level (isTopLevel: true)`);
        }
        break;

      case ChunkType.Module:
        // Module chunks should have module path
        if (!chunk.context.modulePath) {
          warnings.push('Module chunks should have modulePath');
        }
        break;
    }
  }

  /**
   * Validate documentation completeness
   * Warns if documentation is expected but missing
   */
  private validateDocumentation(chunk: Chunk, warnings: string[]): void {
    // Documentation is optional but recommended for public functions
    const isPublicFunction =
      chunk.chunkType === ChunkType.Function ||
      chunk.chunkType === ChunkType.AsyncFunction ||
      chunk.chunkType === ChunkType.Generator;

    const isPublicMethod =
      chunk.chunkType === ChunkType.Method ||
      chunk.chunkType === ChunkType.AsyncMethod;

    // Check if function/method lacks documentation
    if ((isPublicFunction || isPublicMethod) && !chunk.documentation) {
      // Only warn if the function is likely public (not prefixed with _ or inside test)
      if (!chunk.name.startsWith('_') && !chunk.context.modulePath.includes('test')) {
        warnings.push(
          `Public ${chunk.chunkType} "${chunk.name}" lacks documentation (recommended for self-containment)`
        );
      }
    }
  }

  /**
   * Validate context completeness
   */
  private validateContext(chunk: Chunk, warnings: string[]): void {
    if (!chunk.context) {
      return; // Already reported as error
    }

    // Methods should have signatures
    if (
      (chunk.chunkType === ChunkType.Method ||
        chunk.chunkType === ChunkType.AsyncMethod ||
        chunk.chunkType === ChunkType.Function ||
        chunk.chunkType === ChunkType.AsyncFunction) &&
      !chunk.context.methodSignature
    ) {
      warnings.push(`${chunk.chunkType} "${chunk.name}" lacks method signature`);
    }

    // Module path should always be present
    if (!chunk.context.modulePath) {
      warnings.push('Chunk lacks module path context');
    }

    // Check inheritance for methods in classes
    if (
      chunk.context.className &&
      chunk.context.classInheritance.length === 0 &&
      !['Object', 'Component', 'React.Component'].some((base) =>
        chunk.content.includes(base)
      )
    ) {
      // This is just informational - not all classes extend something
      // warnings.push(`Method in class "${chunk.context.className}" has no recorded inheritance`);
    }
  }

  /**
   * Validate multiple chunks and return aggregated statistics
   * @param chunks Array of chunks to validate
   * @returns Summary of validation results
   */
  public validateChunks(chunks: Chunk[]): {
    totalChunks: number;
    validChunks: number;
    invalidChunks: number;
    chunksWithWarnings: number;
    errorCount: number;
    warningCount: number;
    results: ValidationResult[];
  } {
    const results = chunks.map((chunk) => this.validateChunk(chunk));

    const validChunks = results.filter((r) => r.isValid).length;
    const invalidChunks = results.filter((r) => !r.isValid).length;
    const chunksWithWarnings = results.filter((r) => r.warnings.length > 0).length;
    const errorCount = results.reduce((sum, r) => sum + r.errors.length, 0);
    const warningCount = results.reduce((sum, r) => sum + r.warnings.length, 0);

    return {
      totalChunks: chunks.length,
      validChunks,
      invalidChunks,
      chunksWithWarnings,
      errorCount,
      warningCount,
      results,
    };
  }

  /**
   * Check if chunk meets self-containment criteria (SC-008: 95%)
   * A chunk is self-contained if it has:
   * - Name
   * - Content
   * - Context (class, module path)
   * - Signature (for functions/methods)
   * - Documentation (optional but recommended)
   */
  public isSelfContained(chunk: Chunk): boolean {
    const result = this.validateChunk(chunk);

    // Self-contained = no errors AND minimal warnings
    // Allow missing documentation for private functions
    const criticalWarnings = result.warnings.filter(
      (w) => !w.includes('lacks documentation') || !chunk.name.startsWith('_')
    );

    return result.isValid && criticalWarnings.length === 0;
  }

  /**
   * Calculate self-containment percentage for a set of chunks (SC-008)
   * @param chunks Array of chunks to analyze
   * @returns Percentage of self-contained chunks (0-100)
   */
  public calculateSelfContainmentRate(chunks: Chunk[]): number {
    if (chunks.length === 0) {
      return 100; // Empty set is trivially complete
    }

    const selfContainedCount = chunks.filter((chunk) => this.isSelfContained(chunk)).length;

    return (selfContainedCount / chunks.length) * 100;
  }
}
