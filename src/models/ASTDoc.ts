/**
 * Enhanced ASTDoc Type System
 *
 * Complete AST representation optimized for:
 * - LLM understanding (semantic grouping)
 * - Precise navigation (full spans)
 * - Code intelligence (call graphs, metadata)
 * - Search indexing (flat structure)
 */

// ============================================================================
// Core Location Types
// ============================================================================

/**
 * Precise location information for any code element
 * Includes line, column, AND byte offsets for exact positioning
 */
export interface Span {
  /** Starting line number (1-indexed) */
  startLine: number;
  /** Starting column number (0-indexed) */
  startColumn: number;
  /** Ending line number (1-indexed) */
  endLine: number;
  /** Ending column number (0-indexed) */
  endColumn: number;
  /** Starting byte offset in file */
  startByte: number;
  /** Ending byte offset in file */
  endByte: number;
}

// ============================================================================
// Comment and Documentation Types
// ============================================================================

/**
 * Code comment with association to symbols
 */
export interface Comment {
  /** Comment text (without delimiters) */
  text: string;
  /** Type of comment */
  kind: 'line' | 'block' | 'jsdoc' | 'docstring';
  /** Location in source */
  span: Span;
  /** Associated symbol (if documentation comment) */
  associatedSymbol?: string;
  /** Parsed documentation structure (if JSDoc/docstring) */
  documentation?: DocumentationBlock;
}

/**
 * Parsed documentation structure (JSDoc, docstring, etc.)
 */
export interface DocumentationBlock {
  /** Main description */
  description: string;
  /** Documented parameters */
  params?: ParamDoc[];
  /** Return value documentation */
  returns?: string;
  /** Throws/raises documentation */
  throws?: string[];
  /** Examples */
  examples?: string[];
  /** Additional tags */
  tags?: Record<string, string>;
}

/**
 * Parameter documentation
 */
export interface ParamDoc {
  /** Parameter name */
  name: string;
  /** Type annotation (if available) */
  type?: string;
  /** Description */
  description: string;
  /** Whether parameter is optional */
  optional?: boolean;
}

// ============================================================================
// Error Handling Types
// ============================================================================

/**
 * Error severity levels
 */
export type ErrorSeverity = 'error' | 'warning';

/**
 * Parse error with recovery information
 */
export interface SyntaxError {
  /** Error message */
  message: string;
  /** Location of error */
  span: Span;
  /** Error severity */
  severity: ErrorSeverity;
  /** Error recovery information */
  recovery: ErrorRecovery;
}

/**
 * Information about how parser recovered from error
 */
export interface ErrorRecovery {
  /** Whether parser successfully recovered */
  recovered: boolean;
  /** Recovery strategy used */
  strategy: 'skip_statement' | 'skip_expression' | 'skip_to_delimiter' | 'none';
  /** Number of valid symbols extracted after error */
  symbolsAfterError: number;
}

// ============================================================================
// Parse Metadata Types
// ============================================================================

/**
 * Metadata about the parsing operation
 */
export interface ParseMetadata {
  /** Timestamp when parsing started (ISO 8601) */
  parsedAt: string;
  /** Time taken to parse (milliseconds) */
  duration: number;
  /** Number of lines in the file */
  lineCount: number;
  /** File size in bytes */
  fileSize: number;
  /** Whether incremental parsing was used */
  incremental: boolean;
  /** Parser version (for tracking changes) */
  parserVersion: string;
}

// ============================================================================
// Import/Export Types
// ============================================================================

/**
 * Rich import statement (not just strings)
 */
export interface ImportStatement {
  /** Source module path */
  source: string;
  /** Type of import */
  kind: 'named' | 'default' | 'namespace' | 'side-effect' | 'dynamic' | 'require';
  /** Imported symbols */
  specifiers: ImportSpecifier[];
  /** Location in source */
  span: Span;
}

/**
 * Individual imported symbol
 */
export interface ImportSpecifier {
  /** Imported name from module */
  imported: string;
  /** Local binding name (may differ from imported) */
  local: string;
  /** Whether this is a type-only import */
  typeOnly?: boolean;
}

/**
 * Rich export statement
 */
export interface ExportStatement {
  /** Type of export */
  kind: 'named' | 'default' | 'namespace' | 'declaration';
  /** Exported symbols */
  specifiers: ExportSpecifier[];
  /** Source module for re-exports */
  source?: string;
  /** Location in source */
  span: Span;
}

/**
 * Individual exported symbol
 */
export interface ExportSpecifier {
  /** Local name being exported */
  local: string;
  /** Exported name (may differ from local) */
  exported: string;
  /** Whether this is a type-only export */
  typeOnly?: boolean;
}

// ============================================================================
// Symbol Definition Types
// ============================================================================

/**
 * Function or standalone function declaration
 */
export interface Function {
  /** Function signature */
  signature: string;
  /** Precise location in source */
  span: Span;
  /** Documentation string */
  doc?: string | null;
  /** Decorators applied to function */
  decorators?: string[];
  /** Visibility/access modifier */
  visibility?: 'public' | 'private' | 'protected';
  /** Whether function is async */
  async?: boolean;
  /** Whether function is exported */
  exported?: boolean;
  /** Functions this calls */
  calls?: string[];
  /** Functions that call this */
  called_by?: string[];
}

/**
 * Class declaration
 */
export interface Class {
  /** Precise location in source */
  span: Span;
  /** Parent classes (inheritance) */
  inherits?: string[];
  /** Implemented interfaces */
  implements?: string[];
  /** Documentation string */
  doc?: string | null;
  /** Whether class is abstract */
  abstract?: boolean;
  /** Whether class is exported */
  exported?: boolean;
  /** Class methods */
  methods?: Record<string, Method>;
  /** Class properties */
  properties?: Record<string, Property>;
  /** Class constants */
  class_constants?: Record<string, Constant>;
}

/**
 * Method within a class
 */
export interface Method {
  /** Method signature */
  signature: string;
  /** Precise location in source */
  span: Span;
  /** Documentation string */
  doc?: string | null;
  /** Decorators applied to method */
  decorators?: string[];
  /** Whether method is static */
  static?: boolean;
  /** Whether method is abstract */
  abstract?: boolean;
  /** Whether method is async */
  async?: boolean;
  /** Visibility/access modifier */
  visibility?: 'public' | 'private' | 'protected';
  /** Functions/methods this method calls */
  calls?: string[];
  /** Functions/methods that call this method */
  called_by?: string[];
}

/**
 * Interface declaration
 */
export interface Interface {
  /** Precise location in source */
  span: Span;
  /** Documentation string */
  doc?: string | null;
  /** Extended interfaces */
  extends?: string[];
  /** Whether interface is exported */
  exported?: boolean;
  /** Interface properties */
  properties?: Record<string, Property>;
  /** Interface methods (signatures only) */
  methods?: Record<string, unknown>;
}

/**
 * Property in class or interface
 */
export interface Property {
  /** Property type */
  type: string;
  /** Whether property is optional */
  optional?: boolean;
  /** Precise location in source */
  span?: Span;
  /** Documentation string */
  doc?: string | null;
}

/**
 * Type alias declaration
 */
export interface TypeAlias {
  /** Type definition */
  type: string;
  /** Precise location in source */
  span: Span;
  /** Documentation string */
  doc?: string | null;
  /** Whether type is exported */
  exported?: boolean;
}

/**
 * Enum declaration
 */
export interface Enum {
  /** Enum values */
  values: string[];
  /** Precise location in source */
  span: Span;
  /** Documentation string */
  doc?: string | null;
  /** Whether enum is exported */
  exported?: boolean;
}

/**
 * Constant declaration
 */
export interface Constant {
  /** Type annotation (if available) */
  type?: string;
  /** Constant value */
  value: string;
  /** Precise location in source */
  span: Span;
  /** Whether constant is exported */
  exported?: boolean;
}

/**
 * Component declaration (React/Vue)
 */
export interface Component {
  /** Component signature */
  signature: string;
  /** Precise location in source */
  span: Span;
  /** Documentation string */
  doc?: string | null;
  /** Functions/hooks this calls */
  calls?: string[];
  /** Components that use this */
  called_by?: string[];
}

// ============================================================================
// Main ASTDoc Type
// ============================================================================

/**
 * Supported language variants
 */
export type Language =
  | 'javascript'
  | 'typescript'
  | 'jsx'
  | 'tsx'
  | 'python'
  | 'json'
  | 'html'
  | 'go'
  | 'rust'
  | 'java'
  | 'c'
  | 'cpp'
  | 'ruby'
  | 'csharp'
  | 'php'
  | 'bash'
  | 'haskell'
  | 'toml';

/**
 * Complete analysis output for a single file
 *
 * This is the primary AST representation used throughout the codebase.
 * It combines semantic grouping (for LLM understanding) with precise
 * location information (for IDE features).
 */
export interface ASTDoc {
  // ========================================
  // File Metadata
  // ========================================

  /** Absolute path to the file */
  file: string;
  /** Last modified time (milliseconds since epoch) */
  mtimeMs?: number;
  /** File size in bytes */
  bytes?: number;
  /** Detected language */
  language?: Language;

  // ========================================
  // Top-Level Collections
  // ========================================

  /** All comments in the file */
  comments?: Comment[];
  /** Syntax errors encountered during parsing */
  syntax_errors?: SyntaxError[];
  /** Parsing metadata */
  metadata?: ParseMetadata;

  // ========================================
  // Module Structure
  // ========================================

  /** Import statements with full details */
  imports?: ImportStatement[];
  /** Export statements with full details */
  exports?: ExportStatement[];

  // ========================================
  // Type Definitions
  // ========================================

  /** Type aliases (type Foo = ...) */
  type_aliases?: Record<string, TypeAlias>;
  /** Interface declarations */
  interfaces?: Record<string, Interface>;

  // ========================================
  // Code Structures
  // ========================================

  /** Function declarations */
  functions?: Record<string, Function>;
  /** Class declarations */
  classes?: Record<string, Class>;
  /** Component declarations (React/Vue) */
  components?: Record<string, Component>;
  /** Enum declarations */
  enums?: Record<string, Enum>;
  /** Constant declarations */
  constants?: Record<string, Constant>;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create an empty ASTDoc
 */
export function createEmptyASTDoc(filePath: string, language?: Language): ASTDoc {
  return {
    file: filePath,
    language,
    mtimeMs: Date.now(),
    bytes: 0,
    comments: [],
    syntax_errors: [],
    imports: [],
    exports: [],
    type_aliases: {},
    interfaces: {},
    functions: {},
    classes: {},
    components: {},
    enums: {},
    constants: {}
  };
}

/**
 * Check if ASTDoc has any symbols
 */
export function hasSymbols(doc: ASTDoc): boolean {
  return (
    Object.keys(doc.functions || {}).length > 0 ||
    Object.keys(doc.classes || {}).length > 0 ||
    Object.keys(doc.interfaces || {}).length > 0 ||
    Object.keys(doc.type_aliases || {}).length > 0 ||
    Object.keys(doc.enums || {}).length > 0 ||
    Object.keys(doc.constants || {}).length > 0 ||
    Object.keys(doc.components || {}).length > 0
  );
}

/**
 * Get total symbol count
 */
export function getSymbolCount(doc: ASTDoc): number {
  return (
    Object.keys(doc.functions || {}).length +
    Object.keys(doc.classes || {}).length +
    Object.keys(doc.interfaces || {}).length +
    Object.keys(doc.type_aliases || {}).length +
    Object.keys(doc.enums || {}).length +
    Object.keys(doc.constants || {}).length +
    Object.keys(doc.components || {}).length
  );
}

/**
 * Get all function names (including methods)
 */
export function getAllFunctionNames(doc: ASTDoc): string[] {
  const names: string[] = [];

  // Standalone functions
  names.push(...Object.keys(doc.functions || {}));

  // Methods in classes
  for (const [className, cls] of Object.entries(doc.classes || {})) {
    for (const methodName of Object.keys(cls.methods || {})) {
      names.push(`${className}.${methodName}`);
    }
  }

  return names;
}

/**
 * Find a symbol by name (searches all symbol types)
 */
export function findSymbol(
  doc: ASTDoc,
  name: string
): { kind: string; data: unknown } | null {
  // Check functions
  if (doc.functions?.[name]) {
    return { kind: 'function', data: doc.functions[name] };
  }

  // Check classes
  if (doc.classes?.[name]) {
    return { kind: 'class', data: doc.classes[name] };
  }

  // Check interfaces
  if (doc.interfaces?.[name]) {
    return { kind: 'interface', data: doc.interfaces[name] };
  }

  // Check type aliases
  if (doc.type_aliases?.[name]) {
    return { kind: 'type', data: doc.type_aliases[name] };
  }

  // Check enums
  if (doc.enums?.[name]) {
    return { kind: 'enum', data: doc.enums[name] };
  }

  // Check constants
  if (doc.constants?.[name]) {
    return { kind: 'constant', data: doc.constants[name] };
  }

  // Check components
  if (doc.components?.[name]) {
    return { kind: 'component', data: doc.components[name] };
  }

  return null;
}
