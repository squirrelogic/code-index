/**
 * Tree-sitter Parser Data Models
 *
 * TypeScript interfaces for parser output following the data model specification.
 * All entities are plain JavaScript objects for performance and simplicity.
 */

// ============================================================================
// Core Entities
// ============================================================================

/**
 * Complete analysis output for a single file
 */
export interface ParseResult {
  /** Absolute path to the parsed file */
  path: string;

  /** Detected language (js, ts, jsx, tsx, python) */
  language: Language;

  /** All symbols extracted from the file */
  symbols: Symbol[];

  /** Import and export statements */
  imports: ImportStatement[];
  exports: ExportStatement[];

  /** Function calls and method invocations */
  calls: FunctionCall[];

  /** Comments (block and inline) */
  comments: Comment[];

  /** Syntax errors encountered during parsing */
  errors: SyntaxError[];

  /** Parsing metadata */
  metadata: ParseMetadata;
}

/**
 * Supported language variants
 */
export type Language = 'javascript' | 'typescript' | 'jsx' | 'tsx' | 'python';

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
// Symbol Entity
// ============================================================================

/**
 * Represents a code element with structured information
 */
export interface Symbol {
  /** Symbol name (identifier) */
  name: string;

  /** Symbol kind/type */
  kind: SymbolKind;

  /** Location in source file */
  span: Span;

  /** Parent symbols (scoping chain, ordered from immediate to root) */
  parents: string[];

  /** Function/method signature (if applicable) */
  signature: string | null;

  /** Associated documentation */
  documentation: string | null;

  /** Content hash for change detection */
  hash: string;

  /** Additional metadata */
  metadata: SymbolMetadata;
}

/**
 * Complete taxonomy of recognized symbol types
 */
export type SymbolKind =
  | 'function'
  | 'class'
  | 'variable'
  | 'interface'
  | 'enum'
  | 'type'        // Type alias
  | 'constant'
  | 'method'
  | 'property'
  | 'module'
  | 'namespace'
  | 'parameter'
  | 'import'
  | 'export'
  | 'decorator';  // Decorator/annotation

/**
 * Location information for a code element
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

/**
 * Additional symbol information
 */
export interface SymbolMetadata {
  /** Visibility/access modifier (if applicable) */
  visibility?: 'public' | 'private' | 'protected' | 'internal';

  /** Whether symbol is exported */
  exported: boolean;

  /** Whether symbol is async (functions/methods) */
  async?: boolean;

  /** Whether symbol is static (methods/properties) */
  static?: boolean;

  /** Whether symbol is abstract (classes/methods) */
  abstract?: boolean;

  /** Type annotation (if available, not fully resolved) */
  typeAnnotation?: string;

  /** Decorators applied to symbol */
  decorators?: string[];
}

// ============================================================================
// Import/Export Entities
// ============================================================================

/**
 * Represents module import
 */
export interface ImportStatement {
  /** Source module path */
  source: string;

  /** Type of import */
  kind: ImportKind;

  /** Imported symbols */
  specifiers: ImportSpecifier[];

  /** Location in source */
  span: Span;
}

/**
 * Types of import statements
 */
export type ImportKind =
  | 'named'       // import { foo } from 'module'
  | 'default'     // import foo from 'module'
  | 'namespace'   // import * as foo from 'module'
  | 'side-effect' // import 'module'
  | 'dynamic'     // import('module')
  | 'require';    // const foo = require('module')

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
 * Represents module export
 */
export interface ExportStatement {
  /** Type of export */
  kind: ExportKind;

  /** Exported symbols */
  specifiers: ExportSpecifier[];

  /** Source module for re-exports */
  source?: string;

  /** Location in source */
  span: Span;
}

/**
 * Types of export statements
 */
export type ExportKind =
  | 'named'       // export { foo }
  | 'default'     // export default foo
  | 'namespace'   // export * from 'module'
  | 'declaration'; // export const foo = ...

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
// Function Call Entity
// ============================================================================

/**
 * Represents invocation of a function or method
 */
export interface FunctionCall {
  /** Callee name (function/method being called) */
  callee: string;

  /** Type of call */
  kind: CallKind;

  /** Object receiver for method calls */
  receiver?: string;

  /** Number of arguments */
  argumentCount: number;

  /** Location of the call site */
  span: Span;

  /** Chain context (for method chaining) */
  chain?: CallChain;
}

/**
 * Types of function calls
 */
export type CallKind =
  | 'function'    // foo()
  | 'method'      // obj.foo()
  | 'constructor' // new Foo()
  | 'super'       // super()
  | 'dynamic';    // foo[bar]()

/**
 * Context for method chaining
 */
export interface CallChain {
  /** Previous call in chain */
  previous?: string;

  /** Next call in chain */
  next?: string;

  /** Position in chain (0-indexed) */
  position: number;
}

// ============================================================================
// Comment Entity
// ============================================================================

/**
 * Represents documentation or inline comment
 */
export interface Comment {
  /** Comment text (without delimiters) */
  text: string;

  /** Type of comment */
  kind: CommentKind;

  /** Location in source */
  span: Span;

  /** Associated symbol (if documentation comment) */
  associatedSymbol?: string;

  /** Parsed documentation structure (if JSDoc/docstring) */
  documentation?: DocumentationBlock;
}

/**
 * Types of comments
 */
export type CommentKind =
  | 'line'       // Single-line comment
  | 'block'      // Multi-line block comment
  | 'jsdoc'      // JSDoc comment
  | 'docstring'; // Python docstring

/**
 * Parsed documentation structure
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
// Error Entity
// ============================================================================

/**
 * Represents parsing failure or syntax error
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
 * Error severity levels
 */
export type ErrorSeverity =
  | 'error'      // Syntax error
  | 'warning';   // Recoverable issue

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
// Hash Generation
// ============================================================================

/**
 * Input for hash calculation (semantic content only)
 */
export interface HashInput {
  /** Symbol signature (normalized) */
  signature: string;

  /** Body structure tokens (whitespace/comments removed) */
  bodyStructure: string;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if symbol is callable (function or method)
 */
export function isCallable(symbol: Symbol): boolean {
  return ['function', 'method'].includes(symbol.kind);
}

/**
 * Check if symbol is a type definition
 */
export function isType(symbol: Symbol): boolean {
  return ['interface', 'type', 'enum'].includes(symbol.kind);
}

/**
 * Check if symbol is a declaration
 */
export function isDeclaration(symbol: Symbol): boolean {
  return ['function', 'class', 'variable', 'constant'].includes(symbol.kind);
}

/**
 * Check if import has specifiers
 */
export function hasSpecifiers(importStmt: ImportStatement): boolean {
  return importStmt.kind !== 'side-effect' && importStmt.kind !== 'dynamic';
}

/**
 * Check if error is recoverable
 */
export function isRecoverable(error: SyntaxError): boolean {
  return error.recovery.recovered && error.recovery.symbolsAfterError > 0;
}
