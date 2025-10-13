/**
 * CodeChunker - Main orchestrator for chunking code files
 * Coordinates all chunking services to break down files into function/method chunks
 */

import Parser from 'tree-sitter';
import { Chunk, type ChunkContext } from '../../models/Chunk.js';
import { ChunkType, Language } from '../../models/ChunkTypes.js';
import { FunctionExtractor, type ExtractedFunction } from './FunctionExtractor.js';
import { ContextExtractor } from './ContextExtractor.js';
import { DocumentationLinker } from './DocumentationLinker.js';
import { ChunkHasher } from './ChunkHasher.js';
import { ChunkRepository } from '../database/ChunkRepository.js';
import { randomUUID } from 'crypto';

/**
 * CodeChunker configuration
 */
export interface CodeChunkerConfig {
  /** Project root path for module path calculation */
  projectRoot: string;

  /** Warn when chunks exceed this line count */
  largeChunkThreshold?: number;
}

/**
 * CodeChunker service - main orchestrator
 */
export class CodeChunker {
  private functionExtractor: FunctionExtractor;
  private contextExtractor: ContextExtractor;
  private documentationLinker: DocumentationLinker;
  private chunkHasher: ChunkHasher;
  private config: Required<CodeChunkerConfig>;
  private chunkRepository?: ChunkRepository;

  constructor(
    config: CodeChunkerConfig,
    typescriptLanguage: any,
    javascriptLanguage: any,
    pythonLanguage: any,
    chunkRepository?: ChunkRepository
  ) {
    this.config = {
      ...config,
      largeChunkThreshold: config.largeChunkThreshold ?? 5000,
    };

    this.functionExtractor = new FunctionExtractor(
      typescriptLanguage,
      javascriptLanguage,
      pythonLanguage
    );
    this.contextExtractor = new ContextExtractor();
    this.documentationLinker = new DocumentationLinker();
    this.chunkHasher = new ChunkHasher();
    this.chunkRepository = chunkRepository;
  }

  /**
   * Chunk a file into function/method chunks
   * @param filePath Absolute file path
   * @param fileId Database file ID
   * @param tree Parsed syntax tree
   * @param language Source language
   * @returns Array of chunks
   */
  public chunkFile(
    filePath: string,
    fileId: string,
    tree: Parser.Tree,
    language: Language
  ): Chunk[] {
    return this.chunkTree(filePath, fileId, tree, language);
  }

  /**
   * Chunk a syntax tree into function/method chunks
   * @param filePath Absolute file path
   * @param fileId Database file ID
   * @param tree Parsed syntax tree
   * @param language Source language
   * @returns Array of chunks
   */
  public chunkTree(
    filePath: string,
    fileId: string,
    tree: Parser.Tree,
    language: Language
  ): Chunk[] {
    // Step 1: Extract function/method nodes using queries
    const extractedFunctions = this.functionExtractor.extractFunctionNodes(tree, language);

    // Note: extractedFunctions already excludes nested functions within functions
    // but includes methods within classes (which are not considered "top-level")
    // We want both top-level functions AND class methods, just not nested functions

    // Step 2: Create chunks from extracted functions
    const chunks: Chunk[] = [];

    for (const func of extractedFunctions) {
      try {
        const chunk = this.createChunk(func, filePath, fileId, tree, language);
        chunks.push(chunk);

        // Warn about large chunks
        if (chunk.lineCount > this.config.largeChunkThreshold) {
          console.warn(
            `Large chunk detected: ${chunk.name} in ${filePath} has ${chunk.lineCount} lines (threshold: ${this.config.largeChunkThreshold})`
          );
        }
      } catch (error) {
        console.error(`Failed to create chunk for ${func.name} in ${filePath}:`, error);
        // Continue with other chunks
      }
    }

    return chunks;
  }

  /**
   * Create a chunk from an extracted function
   */
  private createChunk(
    extracted: ExtractedFunction,
    filePath: string,
    fileId: string,
    _tree: Parser.Tree,
    language: Language
  ): Chunk {
    const node = extracted.node;

    // Extract content
    const content = node.text;

    // Extract context (class, module, inheritance)
    const context = this.contextExtractor.extractContext(
      node,
      language,
      filePath,
      this.config.projectRoot
    );

    // Extract documentation
    const documentation = this.documentationLinker.extractDocumentation(
      node,
      extracted.documentation,
      language
    );

    // Extract signature
    const signature = this.contextExtractor.extractSignature(node, language);

    // Calculate positions
    const startLine = node.startPosition.row + 1; // Tree-sitter is 0-indexed
    const endLine = node.endPosition.row + 1;
    const startByte = node.startIndex;
    const endByte = node.endIndex;
    const lineCount = endLine - startLine + 1;
    const characterCount = content.length;

    // Generate normalized content for hashing
    const normalizedContent = this.chunkHasher.normalizeWhitespace(content);

    // Generate chunk hash from content + docs
    const chunkHash = this.chunkHasher.generateHashFromParts(
      documentation,
      signature,
      content
    );

    // Create chunk entity
    const chunk = new Chunk(
      randomUUID(),
      chunkHash,
      fileId,
      extracted.chunkType,
      extracted.name,
      content,
      normalizedContent,
      startLine,
      endLine,
      startByte,
      endByte,
      language,
      context,
      documentation,
      signature,
      lineCount,
      characterCount,
      new Date(),
      new Date()
    );

    return chunk;
  }

  /**
   * Save chunks to the database
   * @param chunks Array of chunks to save
   * @returns Array of saved chunks
   */
  public saveChunks(chunks: Chunk[]): Chunk[] {
    if (!this.chunkRepository) {
      throw new Error('ChunkRepository not configured - cannot save chunks');
    }

    const savedChunks: Chunk[] = [];

    for (const chunk of chunks) {
      try {
        const saved = this.chunkRepository.saveChunk(chunk);
        savedChunks.push(saved);
      } catch (error) {
        console.error(`Failed to save chunk ${chunk.name} (${chunk.id}):`, error);
        // Continue with other chunks
      }
    }

    return savedChunks;
  }

  /**
   * Create a module-level chunk for files without functions
   * This is used when a file has no extractable functions
   */
  public createModuleChunk(
    filePath: string,
    fileId: string,
    tree: Parser.Tree,
    language: Language
  ): Chunk {
    const content = tree.rootNode.text;
    const normalizedContent = this.chunkHasher.normalizeWhitespace(content);
    const chunkHash = this.chunkHasher.generateChunkHash(content, tree);

    // Extract module-level documentation
    let documentation: string | null = null;
    if (language === Language.Python) {
      // Look for module docstring
      const firstChild = tree.rootNode.children[0];
      if (firstChild && firstChild.type === 'expression_statement') {
        const stringNode = firstChild.children.find((c) => c.type === 'string');
        if (stringNode) {
          documentation = this.documentationLinker.extractDocumentation(
            tree.rootNode,
            stringNode,
            language
          );
        }
      }
    }

    const context: ChunkContext = {
      className: null,
      classInheritance: [],
      modulePath: this.contextExtractor.deriveModulePath(filePath, this.config.projectRoot),
      namespace: null,
      methodSignature: null,
      isTopLevel: true,
      parentChunkHash: null,
    };

    const lineCount = tree.rootNode.endPosition.row - tree.rootNode.startPosition.row + 1;

    return new Chunk(
      randomUUID(),
      chunkHash,
      fileId,
      ChunkType.Module,
      'module',
      content,
      normalizedContent,
      1,
      lineCount,
      0,
      content.length,
      language,
      context,
      documentation,
      null,
      lineCount,
      content.length,
      new Date(),
      new Date()
    );
  }
}
