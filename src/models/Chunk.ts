/**
 * Chunk model - Represents a logical unit of code (function/method)
 * with documentation, context, and metadata
 */

import { ChunkType, Language } from './ChunkTypes.js';

/**
 * Context information for a chunk (enclosing scope)
 */
export interface ChunkContext {
  /** Name of enclosing class (for methods) */
  className: string | null;

  /** Array of parent class names (for methods) */
  classInheritance: string[];

  /** File path relative to project root */
  modulePath: string;

  /** Namespace/module hierarchy (e.g., "MyApp.Utils") */
  namespace: string | null;

  /** Full method signature including params (for methods) */
  methodSignature: string | null;

  /** True if function/method is at top level (not nested) */
  isTopLevel: boolean;

  /** Hash of parent chunk if nested (for reference) */
  parentChunkHash: string | null;
}

/**
 * Chunk entity - A logical unit of code with all metadata
 */
export class Chunk {
  constructor(
    /** Unique database identifier (UUID) */
    public id: string,

    /** Stable content-based hash (SHA-256, 64 hex chars) */
    public chunkHash: string,

    /** Foreign key to files table */
    public fileId: string,

    /** One of 9 recognized chunk types */
    public chunkType: ChunkType,

    /** Function/method/class name */
    public name: string,

    /** Full chunk content (code + docs) */
    public content: string,

    /** Whitespace-normalized content used for hashing */
    public normalizedContent: string,

    /** Starting line number in source file (1-indexed) */
    public startLine: number,

    /** Ending line number in source file (1-indexed) */
    public endLine: number,

    /** Starting byte offset in source file */
    public startByte: number,

    /** Ending byte offset in source file */
    public endByte: number,

    /** TypeScript, JavaScript, or Python */
    public language: Language,

    /** Enclosing scope information */
    public context: ChunkContext,

    /** Leading documentation block */
    public documentation: string | null,

    /** Function/method signature */
    public signature: string | null,

    /** Number of lines in chunk */
    public lineCount: number,

    /** Number of characters in chunk */
    public characterCount: number,

    /** Timestamp when chunk was first indexed */
    public createdAt: Date,

    /** Timestamp when chunk was last updated */
    public updatedAt: Date
  ) {
    this.validate();
  }

  /**
   * Validate chunk properties
   * @throws Error if validation fails
   */
  private validate(): void {
    if (!/^[0-9a-f]{64}$/i.test(this.chunkHash)) {
      throw new Error(`Invalid chunk hash: must be exactly 64 hex characters (got ${this.chunkHash})`);
    }

    if (this.startLine > this.endLine) {
      throw new Error(`Invalid line range: startLine (${this.startLine}) > endLine (${this.endLine})`);
    }

    if (this.startByte > this.endByte) {
      throw new Error(`Invalid byte range: startByte (${this.startByte}) > endByte (${this.endByte})`);
    }

    const expectedLineCount = this.endLine - this.startLine + 1;
    if (this.lineCount !== expectedLineCount) {
      throw new Error(
        `Invalid line count: expected ${expectedLineCount} (from ${this.startLine}-${this.endLine}), got ${this.lineCount}`
      );
    }

    if (!this.name || this.name.trim().length === 0) {
      throw new Error('Chunk name must not be empty');
    }
  }

  /**
   * Check if this chunk is a method (has enclosing class)
   */
  public isMethod(): boolean {
    return this.context.className !== null;
  }

  /**
   * Check if this chunk is a top-level function
   */
  public isTopLevel(): boolean {
    return this.context.isTopLevel;
  }

  /**
   * Check if this chunk is large (>5,000 lines)
   */
  public isLarge(): boolean {
    return this.lineCount > 5000;
  }

  /**
   * Get fully qualified name (includes class if method)
   */
  public getFullyQualifiedName(): string {
    if (this.context.className) {
      return `${this.context.className}.${this.name}`;
    }
    if (this.context.namespace) {
      return `${this.context.namespace}.${this.name}`;
    }
    return this.name;
  }

  /**
   * Convert to plain object for serialization
   */
  public toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      chunkHash: this.chunkHash,
      fileId: this.fileId,
      chunkType: this.chunkType,
      name: this.name,
      content: this.content,
      normalizedContent: this.normalizedContent,
      startLine: this.startLine,
      endLine: this.endLine,
      startByte: this.startByte,
      endByte: this.endByte,
      language: this.language,
      context: this.context,
      documentation: this.documentation,
      signature: this.signature,
      lineCount: this.lineCount,
      characterCount: this.characterCount,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }

  /**
   * Create Chunk from database row
   */
  public static fromRow(row: Record<string, unknown>): Chunk {
    return new Chunk(
      row.id as string,
      row.chunk_hash as string,
      row.file_id as string,
      row.chunk_type as ChunkType,
      row.name as string,
      row.content as string,
      row.normalized_content as string,
      row.start_line as number,
      row.end_line as number,
      row.start_byte as number,
      row.end_byte as number,
      row.language as Language,
      JSON.parse(row.context as string) as ChunkContext,
      (row.documentation as string) || null,
      (row.signature as string) || null,
      row.line_count as number,
      row.character_count as number,
      new Date(row.created_at as string),
      new Date(row.updated_at as string)
    );
  }
}
