/**
 * Enums for chunk types and languages
 */

/**
 * Recognized chunk type taxonomy
 */
export enum ChunkType {
  /** Regular function declaration */
  Function = 'function',

  /** Class instance method */
  Method = 'method',

  /** Class constructor/initializer */
  Constructor = 'constructor',

  /** Class property or field */
  Property = 'property',

  /** Class definition */
  Class = 'class',

  /** File/module-level content */
  Module = 'module',

  /** Async function declaration */
  AsyncFunction = 'async_function',

  /** Async class method */
  AsyncMethod = 'async_method',

  /** Generator function */
  Generator = 'generator',
}

/**
 * Supported programming languages
 */
export enum Language {
  TypeScript = 'typescript',
  JavaScript = 'javascript',
  Python = 'python',
}

/**
 * Type guard to check if a string is a valid ChunkType
 */
export function isChunkType(value: string): value is ChunkType {
  return Object.values(ChunkType).includes(value as ChunkType);
}

/**
 * Type guard to check if a string is a valid Language
 */
export function isLanguage(value: string): value is Language {
  return Object.values(Language).includes(value as Language);
}

/**
 * Get human-readable name for chunk type
 */
export function getChunkTypeName(type: ChunkType): string {
  const names: Record<ChunkType, string> = {
    [ChunkType.Function]: 'Function',
    [ChunkType.Method]: 'Method',
    [ChunkType.Constructor]: 'Constructor',
    [ChunkType.Property]: 'Property',
    [ChunkType.Class]: 'Class',
    [ChunkType.Module]: 'Module',
    [ChunkType.AsyncFunction]: 'Async Function',
    [ChunkType.AsyncMethod]: 'Async Method',
    [ChunkType.Generator]: 'Generator Function',
  };
  return names[type];
}

/**
 * Get human-readable name for language
 */
export function getLanguageName(language: Language): string {
  const names: Record<Language, string> = {
    [Language.TypeScript]: 'TypeScript',
    [Language.JavaScript]: 'JavaScript',
    [Language.Python]: 'Python',
  };
  return names[language];
}
