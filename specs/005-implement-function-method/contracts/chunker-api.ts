/**
 * Chunker API Contracts
 *
 * TypeScript interface definitions for the code chunking system.
 * These contracts define the public API for chunking services.
 *
 * Feature: 005-implement-function-method
 * Date: 2025-10-13
 */

import { SyntaxNode, Tree } from 'tree-sitter';

// ============================================================================
// Core Entities
// ============================================================================

/**
 * Programming language support
 */
export enum Language {
  TypeScript = 'typescript',
  JavaScript = 'javascript',
  Python = 'python',
}

/**
 * Chunk type taxonomy (9 recognized types)
 */
export enum ChunkType {
  Function = 'function',           // Regular function declaration
  Method = 'method',               // Class instance method
  Constructor = 'constructor',     // Class constructor/initializer
  Property = 'property',           // Class property/field
  Class = 'class',                 // Class definition
  Module = 'module',               // File/module-level content
  AsyncFunction = 'async_function', // Async function declaration
  AsyncMethod = 'async_method',     // Async class method
  Generator = 'generator',          // Generator function
}

/**
 * Enclosing scope information for a chunk
 */
export interface ChunkContext {
  /** Name of enclosing class (null for top-level functions) */
  className: string | null;

  /** Array of parent class names (inheritance chain) */
  classInheritance: string[];

  /** File path relative to project root */
  modulePath: string;

  /** Namespace/module hierarchy (e.g., "MyApp.Utils") */
  namespace: string | null;

  /** Full method signature including params (null for non-methods) */
  methodSignature: string | null;

  /** True if function/method is at top level (not nested) */
  isTopLevel: boolean;

  /** Hash of parent chunk if nested (null for top-level) */
  parentChunkHash: string | null;
}

/**
 * Code chunk entity - a logical unit of code with documentation and context
 */
export interface Chunk {
  /** Unique database identifier */
  id: string;

  /** Stable content-based hash (SHA-256, 64 hex chars) */
  chunkHash: string;

  /** Foreign key to files table */
  fileId: string;

  /** Chunk type (one of 9 recognized types) */
  chunkType: ChunkType;

  /** Function/method/class name */
  name: string;

  /** Full chunk content (code + docs) */
  content: string;

  /** Whitespace-normalized content used for hashing */
  normalizedContent: string;

  /** Starting line number in source file (1-indexed) */
  startLine: number;

  /** Ending line number in source file (1-indexed) */
  endLine: number;

  /** Starting byte offset in source file */
  startByte: number;

  /** Ending byte offset in source file */
  endByte: number;

  /** Programming language */
  language: Language;

  /** Enclosing scope information */
  context: ChunkContext;

  /** Leading documentation block (JSDoc, docstring, comments) */
  documentation: string | null;

  /** Function/method signature */
  signature: string | null;

  /** Number of lines in chunk */
  lineCount: number;

  /** Number of characters in chunk */
  characterCount: number;

  /** Timestamp when chunk was first indexed */
  createdAt: Date;

  /** Timestamp when chunk was last updated */
  updatedAt: Date;
}

/**
 * Query parameters for retrieving chunks
 */
export interface ChunkQuery {
  /** Filter by chunk types (empty array = all types) */
  chunkTypes?: ChunkType[];

  /** Filter by languages (empty array = all languages) */
  languages?: Language[];

  /** Filter by specific file ID */
  fileId?: string;

  /** Full-text search query */
  searchText?: string;

  /** Minimum line count */
  minLineCount?: number;

  /** Maximum line count */
  maxLineCount?: number;

  /** Maximum results (default: 100) */
  limit?: number;

  /** Pagination offset (default: 0) */
  offset?: number;
}

/**
 * Result set for chunk queries with pagination metadata
 */
export interface ChunkQueryResult {
  /** Array of matching chunks */
  chunks: Chunk[];

  /** Total count of matching chunks (before pagination) */
  totalCount: number;

  /** Number of results returned */
  count: number;

  /** Pagination offset */
  offset: number;

  /** Maximum results per page */
  limit: number;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Main orchestrator for code chunking operations
 */
export interface ICodeChunker {
  /**
   * Extract all chunks from a source file
   *
   * @param fileId - Unique file identifier
   * @param filePath - Absolute path to source file
   * @param sourceCode - File content
   * @param language - Programming language
   * @returns Array of extracted chunks
   * @throws Error if parsing fails or language unsupported
   */
  chunkFile(
    fileId: string,
    filePath: string,
    sourceCode: string,
    language: Language
  ): Promise<Chunk[]>;

  /**
   * Extract chunks from a parsed Tree-sitter tree
   *
   * @param fileId - Unique file identifier
   * @param filePath - Absolute path to source file
   * @param tree - Parsed Tree-sitter tree
   * @param sourceCode - File content
   * @param language - Programming language
   * @returns Array of extracted chunks
   */
  chunkTree(
    fileId: string,
    filePath: string,
    tree: Tree,
    sourceCode: string,
    language: Language
  ): Promise<Chunk[]>;
}

/**
 * Extracts function/method nodes from AST
 */
export interface IFunctionExtractor {
  /**
   * Find all function/method nodes in the tree
   *
   * @param tree - Parsed Tree-sitter tree
   * @param language - Programming language
   * @returns Array of syntax nodes representing functions/methods
   */
  extractFunctionNodes(tree: Tree, language: Language): SyntaxNode[];

  /**
   * Determine the chunk type for a syntax node
   *
   * @param node - Syntax node
   * @param language - Programming language
   * @returns Chunk type classification
   */
  determineChunkType(node: SyntaxNode, language: Language): ChunkType;

  /**
   * Check if a node is top-level (not nested inside another function)
   *
   * @param node - Syntax node to check
   * @returns True if top-level, false if nested
   */
  isTopLevel(node: SyntaxNode): boolean;
}

/**
 * Extracts context information from enclosing scopes
 */
export interface IContextExtractor {
  /**
   * Extract complete context for a function/method node
   *
   * @param node - Function/method syntax node
   * @param filePath - Absolute path to source file
   * @param projectRoot - Absolute path to project root
   * @param sourceCode - File content
   * @returns Chunk context information
   */
  extractContext(
    node: SyntaxNode,
    filePath: string,
    projectRoot: string,
    sourceCode: string
  ): ChunkContext;

  /**
   * Find enclosing class node (if any)
   *
   * @param node - Starting node
   * @returns Class node or null if not in a class
   */
  findEnclosingClass(node: SyntaxNode): SyntaxNode | null;

  /**
   * Extract class inheritance chain
   *
   * @param classNode - Class syntax node
   * @param sourceCode - File content
   * @returns Array of parent class names
   */
  extractInheritance(classNode: SyntaxNode, sourceCode: string): string[];

  /**
   * Extract method signature
   *
   * @param node - Method syntax node
   * @param sourceCode - File content
   * @returns Method signature string
   */
  extractSignature(node: SyntaxNode, sourceCode: string): string;

  /**
   * Derive module path from file path
   *
   * @param filePath - Absolute file path
   * @param projectRoot - Absolute project root path
   * @returns Module path relative to project root
   */
  deriveModulePath(filePath: string, projectRoot: string): string;
}

/**
 * Links documentation to code chunks
 */
export interface IDocumentationLinker {
  /**
   * Find and extract documentation for a function/method node
   *
   * @param node - Function/method syntax node
   * @param sourceCode - File content
   * @param language - Programming language
   * @returns Documentation string or null if none found
   */
  extractDocumentation(
    node: SyntaxNode,
    sourceCode: string,
    language: Language
  ): string | null;

  /**
   * Find leading comment nodes before a function/method
   *
   * @param node - Function/method syntax node
   * @param tree - Parsed Tree-sitter tree
   * @returns Array of comment nodes
   */
  findLeadingComments(node: SyntaxNode, tree: Tree): SyntaxNode[];

  /**
   * Extract docstring from Python function (first string in body)
   *
   * @param node - Python function node
   * @param sourceCode - File content
   * @returns Docstring or null
   */
  extractPythonDocstring(node: SyntaxNode, sourceCode: string): string | null;
}

/**
 * Generates stable chunk IDs via content hashing
 */
export interface IChunkHasher {
  /**
   * Generate stable chunk hash from normalized content
   *
   * @param content - Chunk content (code + documentation)
   * @param documentation - Documentation block
   * @param signature - Function/method signature
   * @returns SHA-256 hash (64 hex characters)
   */
  generateChunkHash(
    content: string,
    documentation: string | null,
    signature: string | null
  ): string;

  /**
   * Normalize whitespace while preserving semantic content
   *
   * @param content - Raw content
   * @returns Normalized content for hashing
   */
  normalizeWhitespace(content: string): string;

  /**
   * Validate chunk hash format
   *
   * @param hash - Hash to validate
   * @returns True if valid SHA-256 hex string
   */
  isValidHash(hash: string): boolean;
}

/**
 * Database repository for chunk persistence
 */
export interface IChunkRepository {
  /**
   * Insert or update a chunk
   *
   * @param chunk - Chunk entity to save
   * @returns Saved chunk with generated ID
   */
  saveChunk(chunk: Omit<Chunk, 'id' | 'createdAt' | 'updatedAt'>): Promise<Chunk>;

  /**
   * Find chunk by hash
   *
   * @param chunkHash - Chunk hash to find
   * @returns Chunk entity or null if not found
   */
  findByHash(chunkHash: string): Promise<Chunk | null>;

  /**
   * Find all chunks for a file
   *
   * @param fileId - File identifier
   * @returns Array of chunks
   */
  findByFileId(fileId: string): Promise<Chunk[]>;

  /**
   * Query chunks with filtering and pagination
   *
   * @param query - Query parameters
   * @returns Query result with chunks and pagination metadata
   */
  query(query: ChunkQuery): Promise<ChunkQueryResult>;

  /**
   * Delete all chunks for a file
   *
   * @param fileId - File identifier
   * @returns Number of chunks deleted
   */
  deleteByFileId(fileId: string): Promise<number>;

  /**
   * Delete chunk by ID
   *
   * @param id - Chunk identifier
   * @returns True if deleted, false if not found
   */
  deleteById(id: string): Promise<boolean>;

  /**
   * Get chunk statistics
   *
   * @returns Aggregate statistics
   */
  getStatistics(): Promise<ChunkStatistics>;
}

/**
 * Aggregate chunk statistics
 */
export interface ChunkStatistics {
  /** Total number of chunks indexed */
  totalChunks: number;

  /** Chunks grouped by language */
  chunksByLanguage: Record<Language, number>;

  /** Chunks grouped by type */
  chunksByType: Record<ChunkType, number>;

  /** Average chunk size in lines */
  avgChunkSize: number;

  /** Number of chunks exceeding 5,000 lines */
  largeChunksCount: number;

  /** Timestamp of last update */
  lastUpdated: Date;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Chunker configuration options
 */
export interface ChunkerConfig {
  /** Warn when chunk exceeds this line count (default: 5000) */
  largeChunkThreshold: number;

  /** Enable incremental parsing for performance (default: true) */
  incrementalParsing: boolean;

  /** Batch size for parallel processing (default: 10) */
  batchSize: number;

  /** Absolute path to project root */
  projectRoot: string;

  /** Enable verbose logging (default: false) */
  verbose: boolean;
}

/**
 * Chunking result with warnings
 */
export interface ChunkingResult {
  /** Successfully extracted chunks */
  chunks: Chunk[];

  /** Warning messages (e.g., large chunks) */
  warnings: string[];

  /** Error messages (non-fatal) */
  errors: string[];

  /** Processing duration in milliseconds */
  durationMs: number;
}

// ============================================================================
// Events
// ============================================================================

/**
 * Event emitted when a large chunk is detected
 */
export interface LargeChunkEvent {
  fileId: string;
  chunkName: string;
  lineCount: number;
  threshold: number;
}

/**
 * Event emitted when chunking completes
 */
export interface ChunkingCompleteEvent {
  fileId: string;
  chunksExtracted: number;
  durationMs: number;
}
