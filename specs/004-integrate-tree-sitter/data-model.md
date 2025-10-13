# Data Model: Tree-sitter Parser

**Feature**: Advanced Language Parsing with Structured Code Analysis
**Branch**: `004-integrate-tree-sitter`
**Date**: 2025-10-12

## Overview

This document defines the TypeScript interfaces and data structures for the Tree-sitter parser module. All entities are plain JavaScript objects matching TypeScript interfaces (per clarification decision).

---

## Core Entities

### ParseResult

Complete analysis output for a single file.

```typescript
interface ParseResult {
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
```

### Language

Supported language variants.

```typescript
type Language = 'javascript' | 'typescript' | 'jsx' | 'tsx' | 'python';
```

### ParseMetadata

Metadata about the parsing operation.

```typescript
interface ParseMetadata {
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
```

---

## Symbol Entity

Represents a code element with structured information.

```typescript
interface Symbol {
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
```

### SymbolKind

Complete taxonomy of recognized symbol types (per clarification decision).

```typescript
type SymbolKind =
  | 'function'
  | 'class'
  | 'variable'
  | 'interface'
  | 'enum'
  | 'type'           // Type alias
  | 'constant'
  | 'method'
  | 'property'
  | 'module'
  | 'namespace'
  | 'parameter'
  | 'import'
  | 'export'
  | 'decorator';     // Decorator/annotation
```

### Span

Location information for a code element.

```typescript
interface Span {
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
```

### SymbolMetadata

Additional symbol information.

```typescript
interface SymbolMetadata {
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
```

---

## Import/Export Entities

### ImportStatement

Represents module import.

```typescript
interface ImportStatement {
  /** Source module path */
  source: string;

  /** Type of import */
  kind: ImportKind;

  /** Imported symbols */
  specifiers: ImportSpecifier[];

  /** Location in source */
  span: Span;
}
```

### ImportKind

```typescript
type ImportKind =
  | 'named'       // import { foo } from 'module'
  | 'default'     // import foo from 'module'
  | 'namespace'   // import * as foo from 'module'
  | 'side-effect' // import 'module'
  | 'dynamic'     // import('module')
  | 'require';    // const foo = require('module')
```

### ImportSpecifier

```typescript
interface ImportSpecifier {
  /** Imported name from module */
  imported: string;

  /** Local binding name (may differ from imported) */
  local: string;

  /** Whether this is a type-only import */
  typeOnly?: boolean;
}
```

### ExportStatement

Represents module export.

```typescript
interface ExportStatement {
  /** Type of export */
  kind: ExportKind;

  /** Exported symbols */
  specifiers: ExportSpecifier[];

  /** Source module for re-exports */
  source?: string;

  /** Location in source */
  span: Span;
}
```

### ExportKind

```typescript
type ExportKind =
  | 'named'      // export { foo }
  | 'default'    // export default foo
  | 'namespace'  // export * from 'module'
  | 'declaration'; // export const foo = ...
```

### ExportSpecifier

```typescript
interface ExportSpecifier {
  /** Local name being exported */
  local: string;

  /** Exported name (may differ from local) */
  exported: string;

  /** Whether this is a type-only export */
  typeOnly?: boolean;
}
```

---

## Function Call Entity

Represents invocation of a function or method.

```typescript
interface FunctionCall {
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
```

### CallKind

```typescript
type CallKind =
  | 'function'   // foo()
  | 'method'     // obj.foo()
  | 'constructor'// new Foo()
  | 'super'      // super()
  | 'dynamic';   // foo[bar]()
```

### CallChain

Context for method chaining.

```typescript
interface CallChain {
  /** Previous call in chain */
  previous?: string;

  /** Next call in chain */
  next?: string;

  /** Position in chain (0-indexed) */
  position: number;
}
```

---

## Comment Entity

Represents documentation or inline comment.

```typescript
interface Comment {
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
```

### CommentKind

```typescript
type CommentKind =
  | 'line'       // Single-line comment
  | 'block'      // Multi-line block comment
  | 'jsdoc'      // JSDoc comment
  | 'docstring'; // Python docstring
```

### DocumentationBlock

Parsed documentation structure.

```typescript
interface DocumentationBlock {
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
```

### ParamDoc

```typescript
interface ParamDoc {
  /** Parameter name */
  name: string;

  /** Type annotation (if available) */
  type?: string;

  /** Description */
  description: string;

  /** Whether parameter is optional */
  optional?: boolean;
}
```

---

## Error Entity

Represents parsing failure or syntax error.

```typescript
interface SyntaxError {
  /** Error message */
  message: string;

  /** Location of error */
  span: Span;

  /** Error severity */
  severity: ErrorSeverity;

  /** Error recovery information */
  recovery: ErrorRecovery;
}
```

### ErrorSeverity

```typescript
type ErrorSeverity =
  | 'error'      // Syntax error
  | 'warning';   // Recoverable issue
```

### ErrorRecovery

Information about how parser recovered from error.

```typescript
interface ErrorRecovery {
  /** Whether parser successfully recovered */
  recovered: boolean;

  /** Recovery strategy used */
  strategy: 'skip_statement' | 'skip_expression' | 'skip_to_delimiter' | 'none';

  /** Number of valid symbols extracted after error */
  symbolsAfterError: number;
}
```

---

## Hash Generation

### Hash Input

Per clarification decision, hash is calculated from semantic content only.

```typescript
interface HashInput {
  /** Symbol signature (normalized) */
  signature: string;

  /** Body structure tokens (whitespace/comments removed) */
  bodyStructure: string;
}
```

### Hash Algorithm

- **Algorithm**: xxHash (XXH64)
- **Library**: `@node-rs/xxhash`
- **Output format**: 16-character hexadecimal string
- **Collision probability**: 0.033% at 100k symbols

---

## Validation Rules

### Symbol Validation
- `name`: Non-empty string, valid identifier
- `kind`: Must be one of defined SymbolKind values
- `span`: startLine ≤ endLine, startByte < endByte
- `parents`: Array may be empty for top-level symbols
- `hash`: 16-character hex string (xxHash64 output)

### Span Validation
- Lines are 1-indexed (startLine ≥ 1)
- Columns are 0-indexed (startColumn ≥ 0)
- Byte offsets are 0-indexed (startByte ≥ 0)
- End positions must be after start positions

### Import/Export Validation
- `source`: Non-empty string for imports with source
- `specifiers`: At least one specifier for named imports/exports
- `local` and `exported`: Valid identifiers

---

## Relationships

### Symbol Hierarchy
```
Symbol (parent)
  ├─ Symbol (child method/property)
  ├─ Symbol (child method/property)
  └─ Symbol (nested class/function)
```

**Representation**: `parents` array contains chain from immediate parent to root
- Top-level: `parents: []`
- Method in class: `parents: ['ClassName']`
- Nested function: `parents: ['OuterFunction', 'MiddleFunction']`

### Import → Symbol
- Imported symbols may be referenced in FunctionCall entities
- Not explicitly linked in data model (requires analysis phase)

### Export → Symbol
- Exported symbols reference local Symbol by name
- Symbols have `metadata.exported` flag

### Comment → Symbol
- Documentation comments have `associatedSymbol` pointing to symbol name
- Symbol has `documentation` field with comment text

---

## State Transitions

### Symbol Lifecycle
1. **Discovered**: Symbol extracted from parse tree
2. **Hashed**: Content hash generated
3. **Indexed**: Stored in database
4. **Modified**: File changed, symbol reparsed
5. **Deleted**: Symbol no longer present in file

### Hash Stability
- Hash remains stable when:
  - Whitespace changes
  - Comment changes
  - Formatting changes

- Hash changes when:
  - Signature modified (parameters, return type)
  - Body structure modified (statements, expressions)
  - Symbol renamed

---

## Data Volume Considerations

### Expected Scale (per file)
- **Symbols**: 10-1000 per file (typical: 50-200)
- **Imports**: 5-50 per file (typical: 10-20)
- **Exports**: 1-20 per file (typical: 5-10)
- **Calls**: 10-5000 per file (varies widely)
- **Comments**: 5-500 per file (documentation + inline)
- **Errors**: 0-10 per file (typically 0 for well-formed code)

### Memory Estimates
- **Symbol**: ~500 bytes each (with metadata)
- **ParseResult**: 50-500 KB per file (typical)
- **Large file (10MB)**: ~5-10 MB ParseResult

---

## Integration Points

### Database Storage (SQLite)
ParseResult entities will be stored in SQLite via better-sqlite3:
- Symbols table with indexes on name, kind, hash
- Imports/Exports tables for dependency analysis
- FunctionCalls table for call graph
- Comments table for documentation search

### Indexer Service
Parser service consumed by existing indexer service:
```typescript
// Indexer uses parser
const parseResult = await parser.parse(filePath);
await database.storeParseResult(parseResult);
```

### CLI Commands
Parse results support search/navigation commands:
- `code-index search <query>` - Search symbols, comments
- `code-index refresh` - Reparse changed files (incremental)

---

## TypeScript Type Guards

```typescript
// Symbol kind type guards
function isCallable(symbol: Symbol): boolean {
  return ['function', 'method'].includes(symbol.kind);
}

function isType(symbol: Symbol): boolean {
  return ['interface', 'type', 'enum'].includes(symbol.kind);
}

function isDeclaration(symbol: Symbol): boolean {
  return ['function', 'class', 'variable', 'constant'].includes(symbol.kind);
}

// Import kind type guards
function hasSpecifiers(importStmt: ImportStatement): boolean {
  return importStmt.kind !== 'side-effect' && importStmt.kind !== 'dynamic';
}

// Error recovery check
function isRecoverable(error: SyntaxError): boolean {
  return error.recovery.recovered && error.recovery.symbolsAfterError > 0;
}
```

---

## Example Data

### TypeScript Function Symbol

```typescript
const exampleSymbol: Symbol = {
  name: 'calculateTotal',
  kind: 'function',
  span: {
    startLine: 15,
    startColumn: 0,
    endLine: 20,
    endColumn: 1,
    startByte: 450,
    endByte: 580
  },
  parents: [],
  signature: 'function calculateTotal(items: Item[], tax: number): number',
  documentation: 'Calculates the total cost including tax',
  hash: '3a4f5c9d2b8e7a1f',
  metadata: {
    exported: true,
    async: false,
    typeAnnotation: '(items: Item[], tax: number) => number',
    decorators: []
  }
};
```

### Import Statement

```typescript
const exampleImport: ImportStatement = {
  source: './utils',
  kind: 'named',
  specifiers: [
    { imported: 'calculateTotal', local: 'calculateTotal', typeOnly: false },
    { imported: 'formatCurrency', local: 'format', typeOnly: false }
  ],
  span: {
    startLine: 1,
    startColumn: 0,
    endLine: 1,
    endColumn: 60,
    startByte: 0,
    endByte: 60
  }
};
```

---

## Future Extensions

### Potential Additions (Out of Scope for This Feature)
- **Type resolution**: Full type inference (beyond annotations)
- **Control flow**: CFG nodes and edges
- **Data flow**: Variable assignments and usage
- **Complexity metrics**: Cyclomatic complexity, nesting depth
- **References**: Cross-file symbol references

These extensions would require additional analysis passes beyond Tree-sitter parsing.

---

**Data Model Status**: ✅ Complete
**Entities Defined**: 20+ interfaces and types
**Ready for**: Contract generation and implementation
