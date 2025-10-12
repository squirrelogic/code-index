/**
 * Code index entry representing an indexed file
 */
export interface CodeIndexEntry {
  // Unique identifier
  id: string; // UUID v4

  // File information
  path: string; // Relative path from project root
  absolutePath: string; // Absolute path for validation
  filename: string; // Base filename
  extension: string; // File extension (e.g., '.ts', '.js')

  // Content metadata
  contentHash: string; // SHA-256 hash of file content
  size: number; // File size in bytes
  lineCount: number; // Number of lines in file
  encoding: string; // File encoding (default: 'utf8')

  // Language detection
  language: string | null; // Detected programming language
  isText: boolean; // Whether file is text (vs binary)
  isBinary: boolean; // Whether file is binary

  // Timestamps
  fileModifiedAt: Date; // File system modification time
  indexedAt: Date; // When file was indexed

  // Search optimization
  content: string | null; // Full text content (null for binary)
  tokens: string[]; // Tokenized content for search
  symbols: Symbol[]; // Extracted symbols (functions, classes, etc.)
}

/**
 * Symbol represents a code symbol (function, class, etc.)
 */
export interface Symbol {
  name: string; // Symbol name
  type: SymbolType; // Symbol type
  line: number; // Line number where symbol is defined
  column: number; // Column number where symbol starts
}

/**
 * Types of symbols that can be extracted
 */
export enum SymbolType {
  FUNCTION = 'function',
  CLASS = 'class',
  INTERFACE = 'interface',
  VARIABLE = 'variable',
  CONSTANT = 'constant',
  METHOD = 'method',
  PROPERTY = 'property',
  ENUM = 'enum',
  TYPE = 'type',
  MODULE = 'module',
  NAMESPACE = 'namespace'
}

/**
 * Language detection mapping based on file extension
 */
export const LANGUAGE_MAP: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.r': 'r',
  '.m': 'objective-c',
  '.mm': 'objective-c',
  '.pl': 'perl',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.fish': 'shell',
  '.ps1': 'powershell',
  '.lua': 'lua',
  '.vim': 'vim',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.json': 'json',
  '.xml': 'xml',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.dockerfile': 'dockerfile',
  'Dockerfile': 'dockerfile'
};

/**
 * Detects language from file extension
 */
export function detectLanguage(filename: string): string | null {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!ext) return null;
  return LANGUAGE_MAP[ext] || null;
}

/**
 * Common binary file extensions
 */
export const BINARY_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.a', '.lib',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.ico', '.webp',
  '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.ttf', '.woff', '.woff2', '.eot', '.otf',
  '.pyc', '.pyo', '.class', '.o', '.obj',
  '.db', '.sqlite', '.sqlite3'
]);

/**
 * Checks if file is likely binary based on extension
 */
export function isBinaryFile(filename: string): boolean {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!ext) return false;
  return BINARY_EXTENSIONS.has(ext);
}