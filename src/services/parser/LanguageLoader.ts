/**
 * Language Detection and Grammar Loading
 *
 * Detects source file language from extension and loads appropriate
 * Tree-sitter grammar for parsing.
 */

import type { Language } from '../../models/ASTDoc.js';

/**
 * Detect language from file path extension
 *
 * @param filePath - Path to source file
 * @returns Detected language
 * @throws Error if extension is not supported
 */
export function detectLanguage(filePath: string): Language {
  // Extract file extension
  const extension = filePath.toLowerCase().match(/\.([^.]+)$/)?.[1];

  if (!extension) {
    throw new Error(`Unable to determine file extension from path: ${filePath}`);
  }

  // Map extension to language
  const languageMap: Record<string, Language> = {
    'js': 'javascript',
    'jsx': 'javascript',  // JSX support built into javascript grammar
    'ts': 'typescript',
    'tsx': 'tsx',         // Separate TSX grammar in tree-sitter-typescript package
    'py': 'python',
    'json': 'json',
    'html': 'html',
    'htm': 'html',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'c': 'c',
    'h': 'c',             // C header files
    'cpp': 'cpp',
    'cc': 'cpp',
    'cxx': 'cpp',
    'hpp': 'cpp',
    'hh': 'cpp',
    'hxx': 'cpp',
    'rb': 'ruby',
    'cs': 'csharp',
    'php': 'php',
    'sh': 'bash',
    'bash': 'bash',
    'hs': 'haskell',
    'toml': 'toml',
  };

  const language = languageMap[extension];

  if (!language) {
    const supported = Object.keys(languageMap).join(', ');
    throw new Error(
      `Unsupported file extension: .${extension}. Supported extensions: ${supported}`
    );
  }

  return language;
}

// Grammar cache to avoid reloading
const grammarCache = new Map<Language, any>();

/**
 * Load Tree-sitter grammar for detected language
 *
 * @param language - Language to load grammar for
 * @returns Tree-sitter language grammar
 * @throws Error if grammar fails to load
 */
export async function loadGrammar(language: Language): Promise<any> {
  // Return cached grammar if available
  const cached = grammarCache.get(language);
  if (cached) {
    return cached;
  }

  try {
    let grammar: any;

    // Lazy load appropriate grammar package
    switch (language) {
      case 'javascript': {
        const JavaScript = await import('tree-sitter-javascript');
        grammar = JavaScript.default;
        break;
      }
      case 'typescript': {
        const TypeScript = (await import('tree-sitter-typescript')).default;
        grammar = TypeScript.typescript;
        break;
      }
      case 'tsx': {
        const TSX = (await import('tree-sitter-typescript')).default;
        grammar = TSX.tsx;
        break;
      }
      case 'python': {
        const Python = await import('tree-sitter-python');
        grammar = Python.default;
        break;
      }
      case 'json': {
        const JSON = await import('tree-sitter-json');
        grammar = JSON.default;
        break;
      }
      case 'html': {
        const HTML = await import('tree-sitter-html');
        grammar = HTML.default;
        break;
      }
      case 'go': {
        const Go = await import('tree-sitter-go');
        grammar = Go.default;
        break;
      }
      case 'rust': {
        const Rust = await import('tree-sitter-rust');
        grammar = Rust.default;
        break;
      }
      case 'java': {
        const Java = await import('tree-sitter-java');
        grammar = Java.default;
        break;
      }
      case 'c': {
        const C = await import('tree-sitter-c');
        grammar = C.default;
        break;
      }
      case 'cpp': {
        const CPP = await import('tree-sitter-cpp');
        grammar = CPP.default;
        break;
      }
      case 'ruby': {
        const Ruby = await import('tree-sitter-ruby');
        grammar = Ruby.default;
        break;
      }
      case 'csharp': {
        const CSharp = await import('tree-sitter-c-sharp');
        grammar = CSharp.default;
        break;
      }
      case 'php': {
        const PHP = await import('tree-sitter-php');
        grammar = PHP.default.php;
        break;
      }
      case 'bash': {
        const Bash = await import('tree-sitter-bash');
        grammar = Bash.default;
        break;
      }
      case 'haskell': {
        const Haskell = await import('tree-sitter-haskell');
        grammar = Haskell.default;
        break;
      }
      case 'toml': {
        const TOML = await import('tree-sitter-toml');
        grammar = TOML.default;
        break;
      }
      default: {
        throw new Error(`No grammar available for language: ${language}`);
      }
    }

    // Cache the grammar for future use
    grammarCache.set(language, grammar);

    return grammar;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load grammar for ${language}: ${errorMessage}. ` +
      `Ensure tree-sitter grammar package is installed.`
    );
  }
}
