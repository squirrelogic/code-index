# Migration Plan: Enhanced ASTDoc as Single Source of Truth

**Status:** Planning
**Created:** 2025-01-21
**Goal:** Replace ParseResult with an enhanced ASTDoc that includes all rich metadata (spans, comments, errors) while keeping the semantic grouping that makes it LLM-friendly.

---

## Executive Summary

Currently, the codebase uses `ParseResult` as the internal AST representation. While ParseResult is comprehensive, the `ASTDoc` format from the ast-index spec is better suited for:

1. **LLM Understanding** - Semantic grouping by type (functions, classes, interfaces)
2. **Call Graph Navigation** - Built-in `calls` and `called_by` relationships
3. **Cleaner APIs** - More intuitive structure for code intelligence tools

This plan enhances ASTDoc to include all the rich metadata from ParseResult (spans, comments, errors, metadata) and migrates the entire codebase to use ASTDoc as the single source of truth.

---

## Enhanced ASTDoc Schema

### Core Structure

```typescript
export type ASTDoc = {
  // File metadata
  file: string;
  mtimeMs?: number;
  bytes?: number;
  language?: string;

  // NEW: Top-level collections
  comments?: Comment[];
  syntax_errors?: SyntaxError[];
  metadata?: ParseMetadata;

  // Module structure
  imports?: ImportStatement[];
  exports?: ExportStatement[];

  // Type definitions (with enhanced metadata)
  type_aliases?: Record<string, TypeAlias>;
  interfaces?: Record<string, Interface>;

  // Code structures (with enhanced metadata)
  functions?: Record<string, Function>;
  classes?: Record<string, Class>;
  components?: Record<string, Component>;
  enums?: Record<string, Enum>;
  constants?: Record<string, Constant>;
};
```

### New Types to Add

#### 1. Span (Precise Location)

```typescript
/**
 * Precise location information for any code element
 * Includes line, column, AND byte offsets
 */
export interface Span {
  startLine: number;      // 1-indexed
  startColumn: number;    // 0-indexed
  endLine: number;
  endColumn: number;
  startByte: number;
  endByte: number;
}
```

#### 2. Comment

```typescript
/**
 * Code comment with association to symbols
 */
export interface Comment {
  text: string;
  kind: 'line' | 'block' | 'jsdoc' | 'docstring';
  span: Span;
  associatedSymbol?: string;  // Link to function/class name
  documentation?: DocumentationBlock;  // Parsed JSDoc/docstring
}

export interface DocumentationBlock {
  description: string;
  params?: Array<{ name: string; type?: string; description: string }>;
  returns?: string;
  throws?: string[];
  examples?: string[];
  tags?: Record<string, string>;
}
```

#### 3. Syntax Error

```typescript
/**
 * Parse error with recovery information
 */
export interface SyntaxError {
  message: string;
  span: Span;
  severity: 'error' | 'warning';
  recovery: {
    recovered: boolean;
    strategy: 'skip_statement' | 'skip_expression' | 'skip_to_delimiter' | 'none';
    symbolsAfterError: number;
  };
}
```

#### 4. Parse Metadata

```typescript
/**
 * Metadata about the parsing operation
 */
export interface ParseMetadata {
  parsedAt: string;       // ISO 8601 timestamp
  duration: number;       // Milliseconds
  lineCount: number;
  fileSize: number;
  incremental: boolean;
  parserVersion: string;
}
```

#### 5. Enhanced Import/Export

```typescript
/**
 * Rich import statement (not just strings)
 */
export interface ImportStatement {
  source: string;
  kind: 'named' | 'default' | 'namespace' | 'side-effect' | 'dynamic' | 'require';
  specifiers: Array<{
    imported: string;
    local: string;
    typeOnly?: boolean;
  }>;
  span: Span;
}

/**
 * Rich export statement
 */
export interface ExportStatement {
  kind: 'named' | 'default' | 'namespace' | 'declaration';
  specifiers: Array<{
    local: string;
    exported: string;
    typeOnly?: boolean;
  }>;
  source?: string;  // For re-exports
  span: Span;
}
```

### Enhanced Symbol Definitions

#### Function

```typescript
export interface Function {
  signature: string;
  span: Span;                    // ADD: Full location
  doc?: string | null;
  decorators?: string[];

  // ADD: Rich metadata
  visibility?: 'public' | 'private' | 'protected';
  async?: boolean;
  exported?: boolean;

  // Call graph (already exists)
  calls?: string[];
  called_by?: string[];
}
```

#### Class

```typescript
export interface Class {
  span: Span;                    // ADD: Full location
  inherits?: string[];
  implements?: string[];
  doc?: string | null;
  abstract?: boolean;
  exported?: boolean;            // ADD

  methods?: Record<string, Method>;
  properties?: Record<string, Property>;
  class_constants?: Record<string, unknown>;
}

export interface Method {
  signature: string;
  span: Span;                    // ADD: Full location
  doc?: string | null;
  decorators?: string[];
  static?: boolean;
  abstract?: boolean;
  private?: boolean;             // DEPRECATED: Use visibility
  async?: boolean;               // ADD
  visibility?: 'public' | 'private' | 'protected';  // ADD
}
```

#### Interface

```typescript
export interface Interface {
  span: Span;                    // ADD: Full location
  doc?: string | null;
  extends?: string[];
  exported?: boolean;            // ADD

  properties?: Record<string, Property>;
  methods?: Record<string, unknown>;
}

export interface Property {
  type: string;
  optional?: boolean;
  span?: Span;                   // ADD: Full location
}
```

#### Type Alias

```typescript
export interface TypeAlias {
  type: string;
  span?: Span;                   // ADD: Full location
  doc?: string | null;
  exported?: boolean;            // ADD
}
```

#### Enum

```typescript
export interface Enum {
  values: string[];
  span?: Span;                   // ADD: Full location
  doc?: string | null;
  exported?: boolean;            // ADD
}
```

#### Constant

```typescript
export interface Constant {
  type?: string;
  value: string;
  span?: Span;                   // ADD: Full location
  exported?: boolean;            // ADD
}
```

#### Component (React/Vue)

```typescript
export interface Component {
  signature: string;
  span?: Span;                   // ADD: Full location
  doc?: string | null;
  calls?: string[];
  called_by?: string[];
}
```

---

## Implementation Plan

### Phase 1: Define Enhanced ASTDoc Schema (30 minutes)

**Create:** `src/models/ASTDoc.ts`

**Tasks:**
1. Copy the complete enhanced schema from above
2. Add all new types: Span, Comment, SyntaxError, ParseMetadata
3. Update all existing interfaces to include spans
4. Add rich metadata fields (visibility, async, exported)
5. Enhance ImportStatement and ExportStatement
6. Add JSDoc comments for all types
7. Export all types

**Validation:**
- File compiles without errors
- All types properly exported
- No conflicts with existing code

---

### Phase 2: Create ASTDoc Builder (1 hour)

**Create:** `src/services/parser/ASTDocBuilder.ts`

Implement a builder pattern to construct ASTDoc incrementally during tree-sitter traversal:

```typescript
/**
 * Builder for constructing ASTDoc from tree-sitter nodes
 */
export class ASTDocBuilder {
  private doc: ASTDoc;
  private startTime: number;

  constructor(filePath: string, language: Language, fileSize: number) {
    this.startTime = Date.now();
    this.doc = {
      file: filePath,
      language,
      mtimeMs: Date.now(),
      bytes: fileSize,
      functions: {},
      classes: {},
      interfaces: {},
      type_aliases: {},
      enums: {},
      constants: {},
      components: {},
      comments: [],
      syntax_errors: [],
      imports: [],
      exports: []
    };
  }

  /**
   * Add a function to the AST
   */
  addFunction(name: string, data: {
    signature: string;
    span: Span;
    doc?: string | null;
    decorators?: string[];
    visibility?: 'public' | 'private' | 'protected';
    async?: boolean;
    exported?: boolean;
  }): void {
    this.doc.functions![name] = {
      ...data,
      calls: [],      // Populated in separate pass
      called_by: []   // Populated in separate pass
    };
  }

  /**
   * Add a class to the AST
   */
  addClass(name: string, data: {
    span: Span;
    inherits?: string[];
    implements?: string[];
    doc?: string | null;
    abstract?: boolean;
    exported?: boolean;
  }): void {
    this.doc.classes![name] = {
      ...data,
      methods: {},
      properties: {},
      class_constants: {}
    };
  }

  /**
   * Add a method to an existing class
   */
  addMethod(className: string, methodName: string, data: {
    signature: string;
    span: Span;
    doc?: string | null;
    decorators?: string[];
    static?: boolean;
    abstract?: boolean;
    async?: boolean;
    visibility?: 'public' | 'private' | 'protected';
  }): void {
    const cls = this.doc.classes![className];
    if (!cls) {
      throw new Error(`Class ${className} not found`);
    }

    if (!cls.methods) cls.methods = {};
    cls.methods[methodName] = data;
  }

  /**
   * Add an interface
   */
  addInterface(name: string, data: {
    span: Span;
    doc?: string | null;
    extends?: string[];
    exported?: boolean;
    properties?: Record<string, Property>;
  }): void {
    this.doc.interfaces![name] = {
      ...data,
      methods: {}
    };
  }

  /**
   * Add a type alias
   */
  addTypeAlias(name: string, data: {
    type: string;
    span: Span;
    doc?: string | null;
    exported?: boolean;
  }): void {
    this.doc.type_aliases![name] = data;
  }

  /**
   * Add an enum
   */
  addEnum(name: string, data: {
    values: string[];
    span: Span;
    doc?: string | null;
    exported?: boolean;
  }): void {
    this.doc.enums![name] = data;
  }

  /**
   * Add a constant
   */
  addConstant(name: string, data: {
    type?: string;
    value: string;
    span: Span;
    exported?: boolean;
  }): void {
    this.doc.constants![name] = data;
  }

  /**
   * Add a component (React/Vue)
   */
  addComponent(name: string, data: {
    signature: string;
    span: Span;
    doc?: string | null;
  }): void {
    this.doc.components![name] = {
      ...data,
      calls: [],
      called_by: []
    };
  }

  /**
   * Add a comment
   */
  addComment(comment: Comment): void {
    if (!this.doc.comments) this.doc.comments = [];
    this.doc.comments.push(comment);
  }

  /**
   * Add a syntax error
   */
  addError(error: SyntaxError): void {
    if (!this.doc.syntax_errors) this.doc.syntax_errors = [];
    this.doc.syntax_errors.push(error);
  }

  /**
   * Add an import statement
   */
  addImport(importStmt: ImportStatement): void {
    if (!this.doc.imports) this.doc.imports = [];
    this.doc.imports.push(importStmt);
  }

  /**
   * Add an export statement
   */
  addExport(exportStmt: ExportStatement): void {
    if (!this.doc.exports) this.doc.exports = [];
    this.doc.exports.push(exportStmt);
  }

  /**
   * Build call graph relationships
   * Must be called after all functions/methods are added
   */
  buildCallGraph(calls: Array<{ caller: string; callee: string }>): void {
    for (const { caller, callee } of calls) {
      // Add to caller's calls list
      const callerFunc = this.doc.functions![caller];
      if (callerFunc) {
        if (!callerFunc.calls) callerFunc.calls = [];
        callerFunc.calls.push(callee);
      }

      // Add to callee's called_by list
      const calleeFunc = this.doc.functions![callee];
      if (calleeFunc) {
        if (!calleeFunc.called_by) calleeFunc.called_by = [];
        calleeFunc.called_by.push(caller);
      }
    }
  }

  /**
   * Associate comments with symbols
   */
  associateComments(): void {
    // Implementation: Match comments to nearest symbol by span
    // This is done after all symbols are added
  }

  /**
   * Finalize and return the ASTDoc
   */
  build(lineCount: number, parserVersion: string): ASTDoc {
    const duration = Date.now() - this.startTime;

    this.doc.metadata = {
      parsedAt: new Date().toISOString(),
      duration,
      lineCount,
      fileSize: this.doc.bytes || 0,
      incremental: false,
      parserVersion
    };

    return this.doc;
  }
}
```

**Validation:**
- Builder can construct complete ASTDoc
- All methods work correctly
- Call graph builds bidirectional links

---

### Phase 3: Update Tree-Sitter Extractors (2 hours)

**Modify:**
- `src/services/parser/SymbolExtractor.ts`
- `src/services/parser/CallGraphExtractor.ts`
- `src/services/parser/CommentExtractor.ts`
- `src/services/parser/ImportExportExtractor.ts`
- `src/services/parser/index.ts`

#### 3.1 Update SymbolExtractor

Change from returning flat Symbol[] to populating ASTDocBuilder:

```typescript
/**
 * Extract all symbols from parsed tree into ASTDocBuilder
 */
export function extractSymbols(
  tree: Parser.Tree,
  source: string,
  builder: ASTDocBuilder
): void {
  function walkNode(node: Parser.SyntaxNode): void {
    if (isSymbolNode(node)) {
      const kind = getSymbolKind(node);
      if (!kind) return;

      const name = extractSymbolName(node);
      const span = extractSpan(node);
      const signature = extractSignature(node, source);
      const metadata = extractMetadata(node, source);
      const doc = extractDocumentation(node, source);

      // Add to appropriate collection in builder
      switch (kind) {
        case 'function':
          builder.addFunction(name, {
            signature: signature || '',
            span,
            doc,
            decorators: metadata.decorators,
            visibility: metadata.visibility,
            async: metadata.async,
            exported: metadata.exported
          });
          break;

        case 'class':
          builder.addClass(name, {
            span,
            doc,
            abstract: metadata.abstract,
            exported: metadata.exported
          });
          break;

        case 'method':
          // Get parent class name
          const className = getParentClassName(node);
          builder.addMethod(className, name, {
            signature: signature || '',
            span,
            doc,
            decorators: metadata.decorators,
            static: metadata.static,
            abstract: metadata.abstract,
            async: metadata.async,
            visibility: metadata.visibility
          });
          break;

        // ... handle other symbol types
      }
    }

    // Recursively walk children
    for (const child of node.children) {
      walkNode(child);
    }
  }

  walkNode(tree.rootNode);
}
```

#### 3.2 Update CallGraphExtractor

Change from returning FunctionCall[] to building call graph in ASTDocBuilder:

```typescript
/**
 * Extract function calls and build call graph
 */
export function extractCallGraph(
  tree: Parser.Tree,
  source: string,
  builder: ASTDocBuilder
): void {
  const callRelationships: Array<{ caller: string; callee: string }> = [];

  // ... extract calls from tree

  // Build bidirectional call graph
  builder.buildCallGraph(callRelationships);
}
```

#### 3.3 Update CommentExtractor

Extract comments with associations:

```typescript
/**
 * Extract comments and associate with symbols
 */
export function extractComments(
  tree: Parser.Tree,
  source: string,
  builder: ASTDocBuilder
): void {
  // Extract all comments
  // Parse JSDoc/docstrings
  // Add to builder
}
```

#### 3.4 Update ImportExportExtractor

Extract rich import/export data:

```typescript
/**
 * Extract import/export statements with full details
 */
export function extractImportsExports(
  tree: Parser.Tree,
  source: string,
  builder: ASTDocBuilder
): void {
  // Extract ImportStatement objects
  // Extract ExportStatement objects
  // Add to builder
}
```

#### 3.5 Update Parser Index

Main entry point returns ASTDoc:

```typescript
/**
 * Parse a file and return ASTDoc
 */
export function parse(filePath: string, source: string): ASTDoc {
  const language = detectLanguage(filePath);
  const loader = new LanguageLoader();
  const parser = loader.getParser(language);

  const tree = parser.parse(source);
  const builder = new ASTDocBuilder(
    filePath,
    language,
    Buffer.byteLength(source, 'utf8')
  );

  // Extract all elements
  extractSymbols(tree, source, builder);
  extractCallGraph(tree, source, builder);
  extractComments(tree, source, builder);
  extractImportsExports(tree, source, builder);

  // Handle errors
  if (tree.rootNode.hasError()) {
    extractSyntaxErrors(tree, source, builder);
  }

  // Build final ASTDoc
  const lineCount = source.split('\n').length;
  return builder.build(lineCount, '1.0.0');
}
```

**Validation:**
- Parser returns valid ASTDoc
- All symbols have spans
- Call graph is bidirectional
- Comments are extracted
- Imports/exports are detailed

---

### Phase 4: Update Core Services (1.5 hours)

#### 4.1 Update AST Persistence

**Modify:** `src/services/ast-persistence.ts`

Change type from ParseResult to ASTDoc:

```typescript
/**
 * Write ASTDoc to JSON file
 */
async write(filePath: string, astDoc: ASTDoc): Promise<void> {
  // Same implementation, just different type
}

/**
 * Read ASTDoc from JSON file
 */
async read(filePath: string): Promise<ASTDoc | null> {
  // Same implementation, returns ASTDoc
}
```

#### 4.2 Update Sparse Vector Service

**Modify:** `src/services/sparse-vector.ts`

Update astToText to use ASTDoc:

```typescript
/**
 * Convert ASTDoc to searchable text representation
 */
export function astToText(astDoc: ASTDoc): string {
  const parts: string[] = [];

  // File path
  parts.push(astDoc.file);

  // Functions with signatures and calls
  for (const [name, fn] of Object.entries(astDoc.functions || {})) {
    parts.push(name);
    parts.push('function');
    if (fn.signature) parts.push(fn.signature);
    if (fn.doc) parts.push(fn.doc);
    if (fn.calls?.length) {
      parts.push(`calls[${fn.calls.join(',')}]`);
    }
  }

  // Classes with methods
  for (const [name, cls] of Object.entries(astDoc.classes || {})) {
    parts.push(name);
    parts.push('class');
    if (cls.doc) parts.push(cls.doc);
    if (cls.implements?.length) {
      parts.push(`implements ${cls.implements.join(',')}`);
    }

    // Methods
    for (const [methodName, method] of Object.entries(cls.methods || {})) {
      parts.push(methodName);
      parts.push('method');
      if (method.signature) parts.push(method.signature);
    }
  }

  // Interfaces
  for (const [name, iface] of Object.entries(astDoc.interfaces || {})) {
    parts.push(name);
    parts.push('interface');
    if (iface.doc) parts.push(iface.doc);
  }

  // Type aliases
  for (const [name, ta] of Object.entries(astDoc.type_aliases || {})) {
    parts.push(name);
    parts.push('type');
    parts.push(ta.type);
  }

  // Enums
  for (const [name, e] of Object.entries(astDoc.enums || {})) {
    parts.push(name);
    parts.push('enum');
    parts.push(e.values.join(','));
  }

  // Constants
  for (const [name, c] of Object.entries(astDoc.constants || {})) {
    parts.push(name);
    parts.push('const');
    parts.push(c.value);
  }

  // Imports
  for (const imp of astDoc.imports || []) {
    parts.push(imp.source);
    for (const spec of imp.specifiers) {
      parts.push(spec.imported);
      parts.push(spec.local);
    }
  }

  // Exports
  for (const exp of astDoc.exports || []) {
    for (const spec of exp.specifiers) {
      parts.push(spec.local);
      parts.push(spec.exported);
    }
  }

  // Comments (JSDoc/docstrings)
  for (const comment of astDoc.comments || []) {
    if (comment.kind === 'jsdoc' || comment.kind === 'docstring') {
      parts.push(comment.text);
    }
  }

  return parts.join(' ').toLowerCase();
}
```

#### 4.3 Update Hybrid Index

**Modify:** `src/services/hybrid-index.ts`

Change method signature:

```typescript
/**
 * Add a file to the index (queues for batch processing)
 */
async add(filePath: string, astDoc: ASTDoc): Promise<void> {
  const text = astToText(astDoc);
  const sparseVector = ngramSparse(text, this.config.ngram);
  this.pendingItems.push({ filePath, text, sparseVector });

  if (this.pendingItems.length >= this.batchSize) {
    await this.processPending();
  }
}
```

#### 4.4 Update Indexer Service

**Modify:** `src/services/indexer.ts`

Use ASTDoc throughout:

```typescript
/**
 * Index a single file
 */
private async indexFile(filePath: string): Promise<void> {
  try {
    const source = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);

    // Parse to ASTDoc (not ParseResult)
    const astDoc = parse(filePath, source);

    // Update database
    this.database.upsertFile(filePath, stats.mtimeMs);

    // Add to hybrid index
    await this.hybridIndex.add(filePath, astDoc);

    // Persist AST
    await this.astPersistence.write(filePath, astDoc);

    this.stats.filesIndexed++;
  } catch (error) {
    this.stats.errors.push(`${filePath}: ${error}`);
  }
}
```

**Validation:**
- Indexing works end-to-end with ASTDoc
- Hybrid search produces correct results
- AST persistence saves/loads ASTDoc correctly

---

### Phase 5: Update Search Service (1 hour)

**Modify:** `src/services/searcher.ts`

Update all search methods to work with ASTDoc:

```typescript
/**
 * Search result with full ASTDoc
 */
export interface EnrichedSearchResult extends HybridSearchResult {
  astDoc: ASTDoc | null;  // Changed from ParseResult
  anchor: string;
}

/**
 * Search the codebase using hybrid search
 */
async search(query: string, options: SearchOptions = {}): Promise<EnrichedSearchResult[]> {
  const { limit = 10, denseWeight, sparseWeight, includeAst = true } = options;

  const hybridResults = await this.hybridIndex.search(query, {
    limit,
    denseWeight,
    sparseWeight,
  });

  const enrichedResults: EnrichedSearchResult[] = [];

  for (const result of hybridResults) {
    let astDoc: ASTDoc | null = null;

    if (includeAst) {
      astDoc = await this.astPersistence.read(result.filePath);
    }

    enrichedResults.push({
      ...result,
      astDoc,
      anchor: this.createAnchor(result.filePath, astDoc),
    });
  }

  return enrichedResults;
}

/**
 * Find all references to a symbol
 */
async findReferences(symbolName: string, limit: number = 50): Promise<EnrichedSearchResult[]> {
  const results = await this.search(symbolName, { limit: limit * 2, includeAst: true });

  return results.filter(result => {
    if (!result.astDoc) return false;

    // Check if symbol appears in functions
    const inFunctions = Object.keys(result.astDoc.functions || {}).includes(symbolName);

    // Check if symbol is called
    const isCalled = Object.values(result.astDoc.functions || {}).some(
      fn => fn.calls?.includes(symbolName)
    );

    // Check in classes
    const inClasses = Object.keys(result.astDoc.classes || {}).includes(symbolName);

    // Check in imports
    const inImports = (result.astDoc.imports || []).some(
      imp => imp.specifiers.some(
        spec => spec.imported === symbolName || spec.local === symbolName
      )
    );

    // Check in exports
    const inExports = (result.astDoc.exports || []).some(
      exp => exp.specifiers.some(
        spec => spec.local === symbolName || spec.exported === symbolName
      )
    );

    return inFunctions || isCalled || inClasses || inImports || inExports;
  }).slice(0, limit);
}

/**
 * Find all callers of a function (using built-in call graph)
 */
async findCallers(functionName: string, limit: number = 50): Promise<EnrichedSearchResult[]> {
  const results = await this.search(functionName, { limit: limit * 2, includeAst: true });

  return results.filter(result => {
    if (!result.astDoc) return false;

    const func = result.astDoc.functions?.[functionName];
    return func && func.called_by && func.called_by.length > 0;
  }).slice(0, limit);
}

/**
 * Find all callees of a function (using built-in call graph)
 */
async findCallees(functionName: string): Promise<string[]> {
  const results = await this.search(functionName, { limit: 10, includeAst: true });

  for (const result of results) {
    if (!result.astDoc) continue;

    const func = result.astDoc.functions?.[functionName];
    if (func && func.calls) {
      return func.calls;
    }
  }

  return [];
}

/**
 * Create anchor for referencing (file:line:column)
 */
private createAnchor(filePath: string, astDoc: ASTDoc | null): string {
  if (!astDoc) return filePath;

  // Find first function or class with a span
  const firstFunc = Object.values(astDoc.functions || {})[0];
  if (firstFunc?.span) {
    return `${filePath}:${firstFunc.span.startLine}:${firstFunc.span.startColumn}`;
  }

  const firstClass = Object.values(astDoc.classes || {})[0];
  if (firstClass?.span) {
    return `${filePath}:${firstClass.span.startLine}:${firstClass.span.startColumn}`;
  }

  return filePath;
}
```

**Validation:**
- All search methods work with ASTDoc
- Call graph queries use built-in calls/called_by
- Anchors include line:column from spans

---

### Phase 6: Add SymbolIndex Service (2 hours)

**Create:** `src/services/symbol-index.ts`

Implement fast symbol search with k-gram filtering and fuzzy matching:

```typescript
/**
 * Symbol entry in the index
 */
export interface SymbolEntry {
  id: string;         // Document/file ID
  symbol: string;     // Symbol name
  kind: string;       // Symbol type (function, class, etc.)
  span?: Span;        // Location in file
}

/**
 * K-gram index for substring search
 */
class KGramIndex {
  private k: number = 3;
  private postings = new Map<string, Set<string>>();

  add(term: string): void {
    const grams = this.kgrams(term.toLowerCase());
    for (const gram of grams) {
      if (!this.postings.has(gram)) {
        this.postings.set(gram, new Set());
      }
      this.postings.get(gram)!.add(term);
    }
  }

  candidates(fragment: string): Set<string> {
    const grams = this.kgrams(fragment.toLowerCase());
    if (grams.length === 0) return new Set();

    let result: Set<string> | null = null;

    for (const gram of grams) {
      const postingList = this.postings.get(gram);
      if (!postingList) return new Set();

      result = result
        ? this.intersect(result, postingList)
        : new Set(postingList);

      if (result.size === 0) return result;
    }

    return result || new Set();
  }

  private kgrams(s: string): string[] {
    if (s.length < this.k) return [];

    const grams: string[] = [];
    for (let i = 0; i + this.k <= s.length; i++) {
      grams.push(s.slice(i, i + this.k));
    }
    return grams;
  }

  private intersect<T>(a: Set<T>, b: Set<T>): Set<T> {
    const result = new Set<T>();
    const [smaller, larger] = a.size < b.size ? [a, b] : [b, a];

    for (const item of smaller) {
      if (larger.has(item)) {
        result.add(item);
      }
    }

    return result;
  }
}

/**
 * Levenshtein distance with early termination
 */
function levenshteinBounded(a: string, b: string, maxDist: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;

  const m = a.length;
  const n = b.length;
  const prev = new Uint16Array(n + 1);
  const curr = new Uint16Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;

    const from = Math.max(1, i - maxDist);
    const to = Math.min(n, i + maxDist);
    let rowMin = curr[0];

    for (let j = from; j <= to; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const deletion = prev[j] + 1;
      const insertion = curr[j - 1] + 1;
      const substitution = prev[j - 1] + cost;

      curr[j] = Math.min(deletion, insertion, substitution);
      rowMin = Math.min(rowMin, curr[j]);
    }

    if (rowMin > maxDist) return maxDist + 1;

    // Swap buffers
    for (let j = 0; j <= n; j++) {
      prev[j] = curr[j];
      curr[j] = 0;
    }
  }

  return prev[n];
}

/**
 * Tokenize identifier for k-gram indexing
 * Handles camelCase, snake_case, kebab-case
 */
function tokenizeIdent(name: string): string[] {
  const base = name.toLowerCase();

  // Split on case boundaries and separators
  const spaced = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ');

  const parts = spaced.toLowerCase().split(/\s+/).filter(Boolean);

  return [...new Set([base, ...parts])];
}

/**
 * Fast symbol index with exact, prefix, substring, and fuzzy search
 */
export class SymbolIndex {
  private exactMap = new Map<string, SymbolEntry[]>();
  private prefixTrie = new Map<string, Set<string>>();
  private kgramIndex = new KGramIndex();

  // Call graph
  private callersMap = new Map<string, Set<string>>();
  private calleesMap = new Map<string, Set<string>>();

  /**
   * Build index from ASTDoc
   */
  buildFromASTDoc(docId: string, astDoc: ASTDoc): void {
    // Helper to add a symbol
    const addSymbol = (symbol: string, kind: string, span?: Span) => {
      if (!symbol) return;

      const entry: SymbolEntry = { id: docId, symbol, kind, span };

      // Exact map
      if (!this.exactMap.has(symbol)) {
        this.exactMap.set(symbol, []);
      }
      this.exactMap.get(symbol)!.push(entry);

      // Prefix trie
      const lower = symbol.toLowerCase();
      for (let i = 1; i <= Math.min(lower.length, 64); i++) {
        const prefix = lower.slice(0, i);
        if (!this.prefixTrie.has(prefix)) {
          this.prefixTrie.set(prefix, new Set());
        }
        this.prefixTrie.get(prefix)!.add(symbol);
      }

      // K-gram index
      this.kgramIndex.add(symbol);

      // Tokenized variants
      for (const token of tokenizeIdent(symbol)) {
        this.kgramIndex.add(token);
      }
    };

    // Extract from functions
    for (const [name, fn] of Object.entries(astDoc.functions || {})) {
      addSymbol(name, 'function', fn.span);

      // Build call graph
      for (const callee of fn.calls || []) {
        if (!this.calleesMap.has(name)) {
          this.calleesMap.set(name, new Set());
        }
        this.calleesMap.get(name)!.add(callee);

        if (!this.callersMap.has(callee)) {
          this.callersMap.set(callee, new Set());
        }
        this.callersMap.get(callee)!.add(name);
      }
    }

    // Extract from classes
    for (const [name, cls] of Object.entries(astDoc.classes || {})) {
      addSymbol(name, 'class', cls.span);

      // Methods
      for (const [methodName, method] of Object.entries(cls.methods || {})) {
        addSymbol(`${name}.${methodName}`, 'method', method.span);
      }
    }

    // Extract from interfaces
    for (const [name, iface] of Object.entries(astDoc.interfaces || {})) {
      addSymbol(name, 'interface', iface.span);
    }

    // Extract from type aliases
    for (const [name, ta] of Object.entries(astDoc.type_aliases || {})) {
      addSymbol(name, 'type', ta.span);
    }

    // Extract from enums
    for (const [name, e] of Object.entries(astDoc.enums || {})) {
      addSymbol(name, 'enum', e.span);

      // Enum values
      for (const value of e.values) {
        addSymbol(String(value), 'enum_value');
      }
    }

    // Extract from constants
    for (const [name, c] of Object.entries(astDoc.constants || {})) {
      addSymbol(name, 'const', c.span);
    }

    // Extract from components
    for (const [name, comp] of Object.entries(astDoc.components || {})) {
      addSymbol(name, 'component', comp.span);
    }

    // Extract from exports
    for (const exp of astDoc.exports || []) {
      for (const spec of exp.specifiers) {
        addSymbol(spec.exported, 'export');
      }
    }
  }

  /**
   * Exact symbol match (O(1))
   */
  exact(symbol: string): SymbolEntry[] {
    return this.exactMap.get(symbol) || [];
  }

  /**
   * Prefix search (O(k + m) where k = prefix length, m = matches)
   */
  prefix(query: string, limit: number = 50): SymbolEntry[] {
    const candidates = this.prefixTrie.get(query.toLowerCase());
    if (!candidates) return [];

    const results: SymbolEntry[] = [];

    for (const symbol of candidates) {
      const entries = this.exactMap.get(symbol) || [];
      results.push(...entries);

      if (results.length >= limit) break;
    }

    return results.slice(0, limit);
  }

  /**
   * Substring search with k-gram filtering (O(g × p + m log m))
   */
  substring(query: string, limit: number = 50): Array<{
    symbol: string;
    entries: SymbolEntry[];
  }> {
    const candidates = this.kgramIndex.candidates(query.toLowerCase());

    // Rank by match quality
    const ranked: Array<[string, number]> = [];

    for (const symbol of candidates) {
      const lower = symbol.toLowerCase();
      const score = lower.includes(query.toLowerCase()) ? 1 : 0.5;
      ranked.push([symbol, score]);
    }

    ranked.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    const results: Array<{ symbol: string; entries: SymbolEntry[] }> = [];

    for (const [symbol] of ranked) {
      const entries = this.exactMap.get(symbol) || [];
      if (entries.length > 0) {
        results.push({ symbol, entries });
      }

      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Fuzzy search with bounded Levenshtein (O(c × n × m))
   */
  fuzzy(query: string, maxDist: number = 2, limit: number = 50): Array<{
    symbol: string;
    dist: number;
    entries: SymbolEntry[];
  }> {
    const candidates = this.kgramIndex.candidates(query.toLowerCase());

    const scored: Array<[string, number]> = [];

    for (const symbol of candidates) {
      const dist = levenshteinBounded(
        query.toLowerCase(),
        symbol.toLowerCase(),
        maxDist
      );

      if (dist <= maxDist) {
        scored.push([symbol, dist]);
      }
    }

    scored.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));

    const results: Array<{ symbol: string; dist: number; entries: SymbolEntry[] }> = [];

    for (const [symbol, dist] of scored) {
      const entries = this.exactMap.get(symbol) || [];
      if (entries.length > 0) {
        results.push({ symbol, dist, entries });
      }

      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Find who calls a function
   */
  callers(symbol: string): string[] {
    return Array.from(this.callersMap.get(symbol) || []);
  }

  /**
   * Find what a function calls
   */
  callees(symbol: string): string[] {
    return Array.from(this.calleesMap.get(symbol) || []);
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.exactMap.clear();
    this.prefixTrie.clear();
    this.kgramIndex = new KGramIndex();
    this.callersMap.clear();
    this.calleesMap.clear();
  }

  /**
   * Get statistics
   */
  getStats(): {
    symbolCount: number;
    prefixCount: number;
    callGraphEdges: number;
  } {
    return {
      symbolCount: this.exactMap.size,
      prefixCount: this.prefixTrie.size,
      callGraphEdges:
        Array.from(this.callersMap.values()).reduce((sum, s) => sum + s.size, 0)
    };
  }
}
```

**Validation:**
- Exact match < 1ms
- Prefix search < 5ms for 10k symbols
- Substring search < 10ms with k-gram filtering
- Fuzzy search < 50ms

---

### Phase 7: Integrate SymbolIndex (1 hour)

#### 7.1 Update Indexer

**Modify:** `src/services/indexer.ts`

Add SymbolIndex building during indexing:

```typescript
export class IndexerService {
  private symbolIndex: SymbolIndex;

  constructor(...) {
    // ...
    this.symbolIndex = new SymbolIndex();
  }

  async indexProject(options: IndexOptions = {}): Promise<IndexResult> {
    // ...

    // Clear symbol index
    this.symbolIndex.clear();

    // Index files...

    // Rebuild hybrid index AND build symbol index
    await this.hybridIndex.rebuild();

    // Symbol index is built incrementally during file indexing

    // Persist symbol index
    await this.indexStore.saveSymbolIndex(this.symbolIndex);
  }

  private async indexFile(filePath: string): Promise<void> {
    // ...
    const astDoc = parse(filePath, source);

    // Build symbol index
    this.symbolIndex.buildFromASTDoc(filePath, astDoc);

    // ... rest of indexing
  }
}
```

#### 7.2 Update SearchService

**Modify:** `src/services/searcher.ts`

Add symbol search methods:

```typescript
export class SearchService {
  private symbolIndex: SymbolIndex;

  constructor(hybridIndex: HybridIndex, astPersistence: ASTPersistenceService, symbolIndex: SymbolIndex) {
    this.hybridIndex = hybridIndex;
    this.astPersistence = astPersistence;
    this.symbolIndex = symbolIndex;
  }

  /**
   * Exact symbol match
   */
  exactSymbol(name: string): SymbolEntry[] {
    return this.symbolIndex.exact(name);
  }

  /**
   * Prefix search (autocomplete)
   */
  prefixSearch(prefix: string, limit?: number): SymbolEntry[] {
    return this.symbolIndex.prefix(prefix, limit);
  }

  /**
   * Substring search
   */
  substringSearch(fragment: string, limit?: number): Array<{
    symbol: string;
    entries: SymbolEntry[];
  }> {
    return this.symbolIndex.substring(fragment, limit);
  }

  /**
   * Fuzzy search (typo tolerance)
   */
  fuzzySearch(query: string, maxDist?: number, limit?: number): Array<{
    symbol: string;
    dist: number;
    entries: SymbolEntry[];
  }> {
    return this.symbolIndex.fuzzy(query, maxDist, limit);
  }
}
```

#### 7.3 Update MCP Server

**Modify:** `src/services/mcp-server.ts`

Add symbol search tools:

```typescript
// Add to ListToolsRequestSchema handler:
{
  name: 'symbol_exact',
  description: 'Find exact symbol match',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Symbol name' }
    },
    required: ['symbol']
  }
},
{
  name: 'symbol_prefix',
  description: 'Search symbols by prefix (autocomplete)',
  inputSchema: {
    type: 'object',
    properties: {
      prefix: { type: 'string', description: 'Symbol prefix' },
      limit: { type: 'number', default: 20 }
    },
    required: ['prefix']
  }
},
{
  name: 'symbol_substring',
  description: 'Search symbols by substring',
  inputSchema: {
    type: 'object',
    properties: {
      fragment: { type: 'string', description: 'Symbol fragment' },
      limit: { type: 'number', default: 20 }
    },
    required: ['fragment']
  }
},
{
  name: 'symbol_fuzzy',
  description: 'Fuzzy symbol search (typo tolerance)',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Symbol query (may have typos)' },
      maxDist: { type: 'number', default: 2, description: 'Maximum edit distance' },
      limit: { type: 'number', default: 20 }
    },
    required: ['query']
  }
}

// Add handlers in CallToolRequestSchema:
case 'symbol_exact':
  const exactResults = this.searchService.exactSymbol(params.symbol);
  return { content: [{ type: 'text', text: JSON.stringify(exactResults, null, 2) }] };

case 'symbol_prefix':
  const prefixResults = this.searchService.prefixSearch(params.prefix, params.limit);
  return { content: [{ type: 'text', text: JSON.stringify(prefixResults, null, 2) }] };

case 'symbol_substring':
  const substringResults = this.searchService.substringSearch(params.fragment, params.limit);
  return { content: [{ type: 'text', text: JSON.stringify(substringResults, null, 2) }] };

case 'symbol_fuzzy':
  const fuzzyResults = this.searchService.fuzzySearch(params.query, params.maxDist, params.limit);
  return { content: [{ type: 'text', text: JSON.stringify(fuzzyResults, null, 2) }] };
```

**Validation:**
- All symbol search tools work via MCP
- Results include spans and file locations
- Performance meets targets

---

### Phase 8: Delete ParseResult (5 minutes)

**Tasks:**
1. Search codebase for all `ParseResult` imports
2. Verify no remaining references
3. Delete `src/models/ParseResult.ts`
4. Run TypeScript compiler to verify no errors
5. Run all tests

**Commands:**
```bash
# Find remaining references
grep -r "ParseResult" src/

# Delete the file
rm src/models/ParseResult.ts

# Verify compilation
npm run build

# Run tests
npm test
```

**Validation:**
- No ParseResult references remain
- All code compiles
- All tests pass

---

## Benefits Summary

### 1. Single Source of Truth
- One AST format throughout the codebase
- No conversion layers needed
- Simpler mental model

### 2. LLM-Friendly Structure
- Semantic grouping (functions, classes, interfaces)
- Clear relationships (calls, called_by, implements)
- Natural text representation

### 3. Complete Metadata
- Full spans (line, column, byte offsets)
- Comments with associations
- Syntax errors and recovery
- Parse metadata (timing, line count)

### 4. Fast Symbol Search
- Exact match: O(1) - < 1ms
- Prefix search: O(k + m) - < 5ms
- Substring: O(g × p + m log m) - < 10ms
- Fuzzy: O(c × n × m) - < 50ms

### 5. Built-in Call Graph
- Bidirectional: calls ↔ called_by
- No reconstruction needed
- Instant caller/callee queries

### 6. Rich MCP Tools
- 4 new symbol search methods
- Better code navigation
- Improved AI assistant capabilities

---

## Validation Checklist

### Functional
- [ ] Full index/search cycle works end-to-end
- [ ] All spans have correct line/column/byte offsets
- [ ] Comments correctly associated with symbols
- [ ] Syntax errors tracked and recoverable
- [ ] Call graph is bidirectional (calls ↔ called_by)
- [ ] Imports/exports have full details (specifiers, spans)
- [ ] All symbol types extracted (functions, classes, interfaces, types, enums, constants)

### Performance
- [ ] Symbol exact match < 1ms
- [ ] Symbol prefix search < 5ms for 10k symbols
- [ ] Symbol substring search < 10ms
- [ ] Symbol fuzzy search < 50ms
- [ ] Indexing throughput > 100 files/sec
- [ ] Memory usage < 50KB per file

### Integration
- [ ] MCP tools return correct ASTDoc format
- [ ] Search results include proper spans
- [ ] AST persistence saves/loads ASTDoc correctly
- [ ] Hybrid search works with ASTDoc text
- [ ] SymbolIndex builds correctly from ASTDoc

### Code Quality
- [ ] No ParseResult references remain
- [ ] All TypeScript code compiles
- [ ] All tests pass
- [ ] No eslint errors
- [ ] Documentation updated

---

## Rollback Plan

If issues arise during migration:

1. **Git branching**: Do all work on `feature/astdoc-migration` branch
2. **Incremental commits**: Commit after each phase
3. **Keep ParseResult temporarily**: Don't delete until Phase 8
4. **Dual mode**: Support both formats during transition if needed
5. **Rollback command**: `git checkout main` to revert

---

## Timeline Estimate

| Phase | Time | Cumulative |
|-------|------|------------|
| 1. Schema Definition | 30 min | 30 min |
| 2. ASTDocBuilder | 1 hour | 1.5 hours |
| 3. Update Extractors | 2 hours | 3.5 hours |
| 4. Update Core Services | 1.5 hours | 5 hours |
| 5. Update Search Service | 1 hour | 6 hours |
| 6. Add SymbolIndex | 2 hours | 8 hours |
| 7. Integrate SymbolIndex | 1 hour | 9 hours |
| 8. Delete ParseResult | 5 min | ~9 hours |
| **Testing & Validation** | 1 hour | **10 hours** |

**Total: ~10 hours** (1-2 days of focused work)

---

## Next Steps

1. Review this plan
2. Create feature branch: `git checkout -b feature/astdoc-migration`
3. Start with Phase 1: Define Enhanced ASTDoc Schema
4. Test incrementally after each phase
5. Keep detailed notes of any issues or deviations
6. Update this document as you progress

---

**End of Implementation Plan**
