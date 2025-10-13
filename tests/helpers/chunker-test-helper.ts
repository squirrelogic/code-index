/**
 * Test helper for CodeChunker tests
 * Provides utilities for setting up CodeChunker with proper language parsers
 */

import Parser from 'tree-sitter';
import { CodeChunker } from '../../src/services/chunker/CodeChunker.js';
import { Language } from '../../src/models/ChunkTypes.js';
import { loadGrammar } from '../../src/services/parser/LanguageLoader.js';

// Cache loaded grammars
let typescriptGrammar: any = null;
let javascriptGrammar: any = null;
let pythonGrammar: any = null;

/**
 * Load and cache language grammars
 */
async function loadGrammars() {
  if (!typescriptGrammar) {
    typescriptGrammar = await loadGrammar('typescript');
  }
  if (!javascriptGrammar) {
    javascriptGrammar = await loadGrammar('javascript');
  }
  if (!pythonGrammar) {
    pythonGrammar = await loadGrammar('python');
  }
}

/**
 * Create a CodeChunker instance with proper language parsers
 * @param projectRoot Optional project root path (defaults to test directory)
 * @returns Configured CodeChunker instance
 */
export async function createTestChunker(projectRoot: string = '/test'): Promise<CodeChunker> {
  await loadGrammars();

  // The grammars from loadGrammar are Language objects that have query() method
  // Just pass them directly
  return new CodeChunker(
    { projectRoot },
    typescriptGrammar,
    javascriptGrammar,
    pythonGrammar
  );
}

/**
 * Get a configured parser for a specific language
 * @param language Language name ('typescript', 'javascript', or 'python')
 * @returns Configured Parser instance
 */
export async function getLanguageParser(language: string): Promise<Parser> {
  const parser = new Parser();
  const grammar = await loadGrammar(language);
  parser.setLanguage(grammar);
  return parser;
}

/**
 * Parse content and chunk it in one operation
 * @param filePath File path (used for language detection and module path)
 * @param content Source code content
 * @param language Language to use
 * @returns Array of chunks
 */
export async function parseAndChunk(
  filePath: string,
  content: string,
  language: Language
) {
  const chunker = await createTestChunker();

  // Parse the content
  const parser = new Parser();
  let grammar: any;

  switch (language) {
    case Language.TypeScript:
      grammar = await loadGrammar('typescript');
      break;
    case Language.JavaScript:
      grammar = await loadGrammar('javascript');
      break;
    case Language.Python:
      grammar = await loadGrammar('python');
      break;
    default:
      throw new Error(`Unsupported language: ${language}`);
  }

  parser.setLanguage(grammar);

  // Calculate appropriate buffer size (must be large enough for the source)
  // Use 64KB for files < 32KB, otherwise use double the source size
  const bufferSize = content.length < 32768 ? 65536 : content.length * 2;

  const tree = parser.parse(content, undefined, { bufferSize });

  // Generate a file ID for testing
  const fileId = 'test-file-id';

  // Chunk the file
  return chunker.chunkFile(filePath, fileId, tree, language);
}
