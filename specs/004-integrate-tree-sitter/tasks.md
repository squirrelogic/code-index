# Implementation Tasks: Tree-sitter Parser Integration

**Feature**: Advanced Language Parsing with Structured Code Analysis
**Branch**: `004-integrate-tree-sitter`
**Date**: 2025-10-12
**Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

---

## Overview

This task breakdown organizes implementation by user story priority, enabling independent development and testing of each feature increment. Each phase completes a user story with its own acceptance criteria.

**Total Tasks**: 51
**User Stories**: 5 (3 P1, 2 P2, 1 P3)
**Parallel Opportunities**: 28 tasks marked [P]

---

## Task Summary by User Story

| Phase | User Story | Priority | Tasks | Testable Independently |
|-------|------------|----------|-------|------------------------|
| 1 | Setup & Infrastructure | Foundation | 5 | N/A |
| 2 | Foundational Prerequisites | Blocking | 6 | Partially |
| 3 | US1: Parse & Extract Symbols | P1 | 12 | ✅ Yes |
| 4 | US2: Import/Export Extraction | P1 | 8 | ✅ Yes |
| 5 | US3: Documentation Extraction | P2 | 7 | ✅ Yes |
| 6 | US4: Function Call Tracking | P2 | 7 | ✅ Yes |
| 7 | US5: Content Hash Generation | P3 | 4 | ✅ Yes |
| 8 | Polish & Integration | Final | 2 | N/A |

---

## Implementation Strategy

### MVP Scope
**Phase 3 only (US1)** - Parse and extract basic symbols (functions, classes, variables). This provides immediate value for code navigation and search.

### Incremental Delivery
1. **Week 1**: Phases 1-3 (Setup + Foundations + US1) = Basic symbol extraction
2. **Week 2**: Phase 4 (US2) = Add dependency tracking
3. **Week 3**: Phases 5-6 (US3-US4) = Enhanced code intelligence
4. **Week 4**: Phases 7-8 (US5 + Polish) = Optimization and production-ready

---

## Phase 1: Setup & Infrastructure

**Goal**: Install dependencies and create project scaffolding.

**Duration**: 30 minutes
**Parallelizable**: All tasks can run in parallel after T001

---

### T001: Install Core Dependencies
**File**: `package.json`
**Story**: Setup
**Description**: Install Tree-sitter and language grammar packages.

```bash
npm install tree-sitter tree-sitter-javascript tree-sitter-typescript tree-sitter-tsx tree-sitter-python @node-rs/xxhash
```

**Verification**:
- [ ] All packages in package.json dependencies
- [ ] `node_modules` contains tree-sitter binaries
- [ ] No installation errors in npm output

---

### T002: [P] Create TypeScript Interfaces
**File**: `src/models/ParseResult.ts`
**Story**: Setup
**Description**: Define all TypeScript interfaces from data-model.md.

Create interfaces for:
- `ParseResult`
- `Language` type
- `Symbol`, `SymbolKind`, `SymbolMetadata`
- `Span`
- `ImportStatement`, `ImportKind`, `ImportSpecifier`
- `ExportStatement`, `ExportKind`, `ExportSpecifier`
- `FunctionCall`, `CallKind`, `CallChain`
- `Comment`, `CommentKind`, `DocumentationBlock`, `ParamDoc`
- `SyntaxError`, `ErrorSeverity`, `ErrorRecovery`
- `ParseMetadata`

**Verification**:
- [ ] All 20+ interfaces defined
- [ ] TypeScript compiles without errors
- [ ] Exports are properly structured

---

### T003: [P] Create Parser Module Directory
**File**: `src/services/parser/`
**Story**: Setup
**Description**: Create directory structure for parser module.

```bash
mkdir -p src/services/parser
```

Create stub files:
- `index.ts` - Main export
- `TreeSitterParser.ts` - Core parser wrapper
- `LanguageLoader.ts` - Language detection and grammar loading
- `SymbolExtractor.ts` - Symbol extraction logic
- `ImportExportExtractor.ts` - Import/export extraction
- `CallGraphExtractor.ts` - Function call extraction
- `CommentExtractor.ts` - Comment extraction
- `HashGenerator.ts` - Content hash generation

**Verification**:
- [ ] All 8 files created with export stubs
- [ ] No TypeScript errors

---

### T004: [P] Create Test Directory Structure
**Files**: `tests/unit/services/parser/`, `tests/integration/`, `tests/contract/`
**Story**: Setup
**Description**: Create test directory structure matching source layout.

```bash
mkdir -p tests/unit/services/parser
mkdir -p tests/integration
mkdir -p tests/contract
```

**Verification**:
- [ ] All directories exist
- [ ] Vitest can discover test locations

---

### T005: [P] Create Test Fixtures
**File**: `tests/fixtures/parser/`
**Story**: Setup
**Description**: Create sample source files for testing each language.

Create fixtures:
- `sample.ts` - TypeScript with classes, functions, interfaces
- `sample.tsx` - TSX with JSX components
- `sample.js` - JavaScript with ES6 features
- `sample.jsx` - JSX with React components
- `sample.py` - Python with classes and functions
- `syntax-error.ts` - File with intentional syntax errors
- `large-file.ts` - Generated file with 1000+ LOC

**Verification**:
- [ ] All 7 fixture files created
- [ ] Files contain representative language patterns
- [ ] Syntax-error file has recoverable errors

---

**Phase 1 Checkpoint**: ✅ Infrastructure ready for development

---

## Phase 2: Foundational Prerequisites (BLOCKING)

**Goal**: Implement core Tree-sitter integration and language loading that ALL user stories depend on.

**Duration**: 4-6 hours
**Blocks**: All subsequent phases

**Why Foundational**: Without Tree-sitter parser initialization and language loading, no user story can extract any information. These are prerequisite capabilities.

---

### T006: Implement Language Detection
**File**: `src/services/parser/LanguageLoader.ts`
**Story**: Foundation
**Description**: Implement file extension → language mapping (FR-001a).

Implement:
- `detectLanguage(filePath: string): Language` - Map extension to language
- Extension mapping: `.js`/`.jsx` → javascript, `.ts` → typescript, `.tsx` → tsx, `.py` → python
- Throw error for unsupported extensions

**Verification**:
- [ ] Correctly detects all 5 supported languages
- [ ] Throws error for `.cpp`, `.rs`, etc.
- [ ] Handles uppercase extensions (`.JS`, `.TS`)

**Dependencies**: T002 (interfaces)

---

### T007: Implement Grammar Loading
**File**: `src/services/parser/LanguageLoader.ts`
**Story**: Foundation
**Description**: Load Tree-sitter grammar for detected language.

Implement:
- `loadGrammar(language: Language): TreeSitter.Language` - Load appropriate grammar package
- Lazy loading (import grammar only when needed)
- Grammar caching (single instance per language)
- Handle grammar load failures gracefully

**Verification**:
- [ ] Loads tree-sitter-javascript for JavaScript/JSX
- [ ] Loads tree-sitter-typescript for TypeScript
- [ ] Loads tree-sitter-tsx for TSX
- [ ] Loads tree-sitter-python for Python
- [ ] Caches grammars (no reload on second call)
- [ ] Throws helpful error if grammar missing

**Dependencies**: T006

---

### T008: Implement Core Parser Initialization
**File**: `src/services/parser/TreeSitterParser.ts`
**Story**: Foundation
**Description**: Initialize Tree-sitter parser and set language grammar.

Implement:
- `TreeSitterParser` class constructor
- `setLanguage(grammar: TreeSitter.Language): void` - Configure parser
- `parse(source: string): TreeSitter.Tree` - Basic parse wrapper
- Error handling for parse failures
- Memory management (tree cleanup)

**Verification**:
- [ ] Parser initializes successfully
- [ ] Can parse simple JavaScript: `const x = 1;`
- [ ] Returns Tree-sitter Tree object
- [ ] Handles syntax errors without crashing
- [ ] `tree.delete()` called appropriately

**Dependencies**: T007

---

### T009: Implement Error Recovery
**File**: `src/services/parser/TreeSitterParser.ts`
**Story**: Foundation
**Description**: Implement syntax-level error recovery (FR-008, FR-016).

Implement:
- Detect ERROR nodes in Tree-sitter tree
- Extract syntax error information (message, location)
- Continue parsing after errors (skip malformed statements)
- Track recovery strategy used
- Count symbols extracted after error

Return `SyntaxError[]` with:
- Error message from Tree-sitter
- Span (line, column, byte offsets)
- Severity (error/warning)
- Recovery info (recovered boolean, strategy, symbolsAfterError)

**Verification**:
- [ ] Parses `function valid() {} invalid syntax here function alsoValid() {}`
- [ ] Returns 2 valid symbols + 1 error
- [ ] Error has correct span
- [ ] `recovered: true` and `symbolsAfterError >= 1`

**Dependencies**: T008

---

### T010: Implement Basic Parse Method
**File**: `src/services/parser/index.ts`
**Story**: Foundation
**Description**: Implement main `parse()` method returning `ParseResult`.

Implement:
- `parse(filePath: string, options?: ParseOptions): Promise<ParseResult>`
- Read file content (or accept content parameter)
- Detect language from file path
- Load grammar and parse with Tree-sitter
- Return `ParseResult` with: path, language, empty arrays, metadata
- Measure parse duration
- Count lines and file size

**Verification**:
- [ ] `parse('test.ts')` returns ParseResult
- [ ] Language correctly detected
- [ ] Metadata has duration, lineCount, fileSize
- [ ] symbols/imports/exports/calls/comments are empty arrays (stubs)
- [ ] errors array populated if syntax errors

**Dependencies**: T008, T009

---

### T011: Write Foundational Integration Tests
**File**: `tests/integration/parser-foundation.test.ts`
**Story**: Foundation
**Description**: Test core parsing pipeline with all languages.

Test scenarios:
1. Parse valid TypeScript file → returns ParseResult
2. Parse valid JavaScript file → returns ParseResult
3. Parse valid TSX file → returns ParseResult
4. Parse valid Python file → returns ParseResult
5. Parse file with syntax error → returns ParseResult with errors
6. Unsupported extension → throws error
7. Non-existent file → throws error
8. Parse performance: 1000 LOC in < 10ms

**Verification**:
- [ ] All 8 tests pass
- [ ] Tests use fixture files from T005
- [ ] Performance test validates SC-001

**Dependencies**: T010

---

**Phase 2 Checkpoint**: ✅ Core parser operational for all languages, ready for feature extraction

---

## Phase 3: User Story 1 - Parse and Extract Symbols (P1)

**Goal**: Extract structured symbol information (functions, classes, variables, etc.) from parsed code.

**User Story**: A developer wants to extract structured information from their TypeScript, JavaScript, and Python files including symbol names, kinds, locations, and parent scope relationships.

**Independent Test**: Parse sample files and verify correct extraction of functions, classes, variables with hierarchical relationships.

**Duration**: 8-10 hours

---

### T012: Implement Symbol Node Identification
**File**: `src/services/parser/SymbolExtractor.ts`
**Story**: US1
**Description**: Identify Tree-sitter node types that represent symbols.

Implement:
- `isSymbolNode(node: TreeSitter.SyntaxNode): boolean` - Check if node is a symbol
- Node type mapping to SymbolKind:
  - `function_declaration` → 'function'
  - `class_declaration` → 'class'
  - `variable_declaration` → 'variable'
  - `interface_declaration` → 'interface'
  - `enum_declaration` → 'enum'
  - `type_alias_declaration` → 'type'
  - `method_definition` → 'method'
  - `property_definition` → 'property'
  - And 6 more kinds (14 total per FR-002)
- Language-specific node type variations (TS vs JS vs Python)

**Verification**:
- [ ] Identifies all 14 symbol kinds
- [ ] Works across TypeScript, JavaScript, Python
- [ ] Ignores non-symbol nodes (expressions, statements)

**Dependencies**: T010

---

### T013: [P] Implement Symbol Name Extraction
**File**: `src/services/parser/SymbolExtractor.ts`
**Story**: US1
**Description**: Extract symbol name from Tree-sitter node.

Implement:
- `extractSymbolName(node: TreeSitter.SyntaxNode): string` - Get identifier text
- Handle named vs anonymous functions
- Handle getters/setters
- Handle constructor methods

**Verification**:
- [ ] Extracts `add` from `function add(a, b) {}`
- [ ] Extracts `MyClass` from `class MyClass {}`
- [ ] Handles `constructor` for constructors
- [ ] Returns fallback name for anonymous functions

**Dependencies**: T012

---

### T014: [P] Implement Span Extraction
**File**: `src/services/parser/SymbolExtractor.ts`
**Story**: US1
**Description**: Extract location span from Tree-sitter node (FR-002).

Implement:
- `extractSpan(node: TreeSitter.SyntaxNode): Span` - Convert node location to Span
- Map Tree-sitter position to Span interface:
  - `startPosition.row + 1` → startLine (1-indexed)
  - `startPosition.column` → startColumn (0-indexed)
  - `startByte` → startByte
  - Same for end positions
- Validate span (start < end)

**Verification**:
- [ ] Correct line numbers (1-indexed)
- [ ] Correct column numbers (0-indexed)
- [ ] Correct byte offsets
- [ ] End positions after start positions

**Dependencies**: T012

---

### T015: Implement Parent Scope Tracking
**File**: `src/services/parser/SymbolExtractor.ts`
**Story**: US1
**Description**: Track parent-child symbol relationships (FR-003).

Implement:
- `extractParents(node: TreeSitter.SyntaxNode): string[]` - Build parent chain
- Walk up Tree-sitter tree to find enclosing symbols
- Return array ordered from immediate parent to root
- Top-level symbols return empty array

**Verification**:
- [ ] Top-level function: `parents: []`
- [ ] Method in class: `parents: ['ClassName']`
- [ ] Nested function: `parents: ['OuterFunction', 'InnerFunction']`
- [ ] Python class method: `parents: ['ClassName']`

**Dependencies**: T013

---

### T016: Implement Signature Extraction
**File**: `src/services/parser/SymbolExtractor.ts`
**Story**: US1
**Description**: Extract function/method signatures with parameters (FR-004).

Implement:
- `extractSignature(node: TreeSitter.SyntaxNode): string | null` - Get full signature
- Include function name, parameters, return type
- Handle TypeScript type annotations
- Handle Python type hints
- Return null for non-callable symbols

**Verification**:
- [ ] TypeScript: `function add(a: number, b: number): number`
- [ ] JavaScript: `function add(a, b)`
- [ ] Python: `def add(a: int, b: int) -> int`
- [ ] Class declaration: `null`

**Dependencies**: T013

---

### T017: Implement Symbol Metadata Extraction
**File**: `src/services/parser/SymbolExtractor.ts`
**Story**: US1
**Description**: Extract symbol metadata (visibility, modifiers, etc.).

Implement:
- `extractMetadata(node: TreeSitter.SyntaxNode): SymbolMetadata` - Get all metadata
- Detect visibility (public/private/protected)
- Detect modifiers (static, abstract, async)
- Detect if symbol is exported
- Extract type annotations (if present)
- Extract decorators (TypeScript/Python)

**Verification**:
- [ ] `export function foo()` → `exported: true`
- [ ] `async function foo()` → `async: true`
- [ ] `static method()` → `static: true`
- [ ] `private field` → `visibility: 'private'`
- [ ] `@decorator` → `decorators: ['decorator']`

**Dependencies**: T013

---

### T018: Implement Full Symbol Extraction
**File**: `src/services/parser/SymbolExtractor.ts`
**Story**: US1
**Description**: Combine all extractors to build Symbol objects.

Implement:
- `extractSymbols(tree: TreeSitter.Tree, source: string): Symbol[]` - Main entry point
- Walk Tree-sitter tree recursively
- For each symbol node:
  - Extract name, kind, span, parents, signature, metadata
  - Add stub hash (empty string for now, US5 will implement)
  - Add stub documentation (null for now, US3 will implement)
- Return array of all symbols

**Verification**:
- [ ] Extracts all symbols from fixture files
- [ ] Correct symbol counts (functions, classes, variables)
- [ ] Parent relationships correct
- [ ] Signatures extracted for callables
- [ ] Metadata correct (exported, async, etc.)

**Dependencies**: T013, T014, T015, T016, T017

---

### T019: Integrate Symbol Extraction into Parse Method
**File**: `src/services/parser/index.ts`
**Story**: US1
**Description**: Call SymbolExtractor from main parse() method.

Modify `parse()`:
- Import SymbolExtractor
- After Tree-sitter parse, call `extractSymbols(tree, source)`
- Populate `ParseResult.symbols` array
- Handle extraction errors gracefully

**Verification**:
- [ ] `parse('test.ts')` returns ParseResult with populated symbols
- [ ] Symbol count matches expected for fixture
- [ ] No extraction errors for well-formed code
- [ ] Extraction works after syntax errors (partial parse)

**Dependencies**: T018

---

### T020: [P] Write Symbol Extraction Unit Tests
**File**: `tests/unit/services/parser/SymbolExtractor.test.ts`
**Story**: US1
**Description**: Unit tests for symbol extraction logic.

Test scenarios:
1. Extract function → kind='function', name correct
2. Extract class → kind='class', name correct
3. Extract method in class → kind='method', parents correct
4. Extract nested function → parents array correct
5. Extract TypeScript interface → kind='interface'
6. Extract enum → kind='enum'
7. Extract variable → kind='variable'
8. Extract constant → kind='constant'
9. Extract property → kind='property'
10. Extract async function → metadata.async=true
11. Extract exported symbol → metadata.exported=true
12. Extract static method → metadata.static=true

**Verification**:
- [ ] All 12 tests pass
- [ ] Tests cover all 14 symbol kinds
- [ ] Tests cover TypeScript, JavaScript, Python

**Dependencies**: T018

---

### T021: [P] Write Symbol Extraction Integration Tests
**File**: `tests/integration/symbol-extraction.test.ts`
**Story**: US1
**Description**: End-to-end symbol extraction tests with real files.

Test scenarios:
1. Parse TypeScript file → extract all functions, classes, interfaces
2. Parse JavaScript file → extract nested functions with correct parents
3. Parse Python file → extract class methods with signatures
4. Parse file with syntax error → extract symbols before error
5. Parse large file (1000 LOC) → performance < 1s
6. Symbol accuracy → 99% of expected symbols extracted (SC-004)

**Verification**:
- [ ] All 6 tests pass
- [ ] Uses fixture files from T005
- [ ] Validates acceptance criteria from spec US1

**Dependencies**: T019

---

### T022: [P] Write US1 Contract Tests
**File**: `tests/contract/parser-symbols.test.ts`
**Story**: US1
**Description**: Contract tests for symbol extraction API.

Test scenarios (from spec.md US1):
1. **Given** TypeScript file with classes and functions, **When** parsed, **Then** all symbols extracted with correct names, kinds, spans
2. **Given** JavaScript file with nested functions, **When** parsed, **Then** parent-child relationships correctly identified
3. **Given** Python file with classes and methods, **When** parsed, **Then** method signatures and class hierarchies extracted
4. **Given** file with syntax errors, **When** parsed, **Then** valid symbols before error still extracted

**Verification**:
- [ ] All 4 acceptance scenarios pass
- [ ] Contract matches spec.md exactly
- [ ] ParseResult structure matches data-model.md

**Dependencies**: T019

---

### T023: Write US1 Performance Benchmarks
**File**: `tests/integration/parser-performance.test.ts`
**Story**: US1
**Description**: Validate performance requirements (SC-001).

Benchmark scenarios:
1. Parse 1000 lines → duration < 1000ms (1000 L/s minimum)
2. Parse 10,000 lines → duration < 10000ms
3. Memory usage for 1MB file → < 100MB (SC-003)
4. Parse 100 files → consistent performance (SC-010)

**Verification**:
- [ ] All benchmarks pass
- [ ] Actual performance exceeds minimums
- [ ] Memory stays within bounds
- [ ] Results logged for tracking

**Dependencies**: T019

---

**Phase 3 Checkpoint**: ✅ US1 Complete - Symbol extraction functional and tested

---

## Phase 4: User Story 2 - Extract Import/Export Relationships (P1)

**Goal**: Extract import and export statements to track module dependencies.

**User Story**: A developer wants to understand module dependencies by identifying all import and export statements.

**Independent Test**: Parse files with various import/export patterns and verify correct extraction.

**Duration**: 6-8 hours

---

### T024: Implement Import Node Identification
**File**: `src/services/parser/ImportExportExtractor.ts`
**Story**: US2
**Description**: Identify Tree-sitter nodes representing imports (FR-005).

Implement:
- `isImportNode(node: TreeSitter.SyntaxNode): boolean` - Check if node is import
- Node type mapping to ImportKind:
  - `import_statement` → determine kind from structure
  - ES6 named imports → 'named'
  - ES6 default import → 'default'
  - Namespace import → 'namespace'
  - Side-effect import → 'side-effect'
  - Dynamic import → 'dynamic'
  - CommonJS require → 'require'
- Language-specific variations (JS/TS vs Python)

**Verification**:
- [ ] Identifies all 6 import kinds
- [ ] Works in JavaScript, TypeScript, Python
- [ ] Distinguishes between import types

**Dependencies**: T010

---

### T025: [P] Implement Import Extraction
**File**: `src/services/parser/ImportExportExtractor.ts`
**Story**: US2
**Description**: Extract import statement details.

Implement:
- `extractImport(node: TreeSitter.SyntaxNode): ImportStatement` - Build ImportStatement object
- Extract source module path
- Determine import kind
- Extract specifiers (imported names, local bindings)
- Handle type-only imports (TypeScript)
- Extract span

**Verification**:
- [ ] `import { foo } from 'bar'` → named import with correct specifier
- [ ] `import foo from 'bar'` → default import
- [ ] `import * as foo from 'bar'` → namespace import
- [ ] `import 'bar'` → side-effect import
- [ ] `const foo = require('bar')` → require import
- [ ] TypeScript type-only imports detected

**Dependencies**: T024

---

### T026: [P] Implement Export Node Identification
**File**: `src/services/parser/ImportExportExtractor.ts`
**Story**: US2
**Description**: Identify Tree-sitter nodes representing exports (FR-005).

Implement:
- `isExportNode(node: TreeSitter.SyntaxNode): boolean` - Check if node is export
- Node type mapping to ExportKind:
  - Named export → 'named'
  - Default export → 'default'
  - Namespace re-export → 'namespace'
  - Export declaration → 'declaration'
- Detect export modifiers on declarations

**Verification**:
- [ ] Identifies all 4 export kinds
- [ ] Detects `export` keyword on declarations
- [ ] Works in JavaScript, TypeScript

**Dependencies**: T010

---

### T027: [P] Implement Export Extraction
**File**: `src/services/parser/ImportExportExtractor.ts`
**Story**: US2
**Description**: Extract export statement details.

Implement:
- `extractExport(node: TreeSitter.SyntaxNode): ExportStatement` - Build ExportStatement object
- Determine export kind
- Extract specifiers (local name, exported name)
- Extract source for re-exports
- Handle type-only exports (TypeScript)
- Extract span

**Verification**:
- [ ] `export { foo }` → named export
- [ ] `export default foo` → default export
- [ ] `export * from 'bar'` → namespace export
- [ ] `export const foo = 1` → declaration export
- [ ] Re-export source captured

**Dependencies**: T026

---

### T028: Integrate Import/Export Extraction
**File**: `src/services/parser/index.ts`
**Story**: US2
**Description**: Call ImportExportExtractor from main parse() method.

Modify `parse()`:
- Import ImportExportExtractor
- After symbol extraction, call `extractImports(tree)` and `extractExports(tree)`
- Populate `ParseResult.imports` and `ParseResult.exports` arrays
- Handle extraction errors gracefully

**Verification**:
- [ ] `parse('test.ts')` returns ParseResult with populated imports/exports
- [ ] Import/export counts match expected
- [ ] No extraction errors

**Dependencies**: T025, T027

---

### T029: [P] Write Import/Export Unit Tests
**File**: `tests/unit/services/parser/ImportExportExtractor.test.ts`
**Story**: US2
**Description**: Unit tests for import/export extraction.

Test scenarios:
1. Extract ES6 named import → correct specifiers
2. Extract default import → correct kind
3. Extract namespace import → correct kind
4. Extract side-effect import → empty specifiers
5. Extract CommonJS require → correct kind and source
6. Extract Python import → correct source and specifiers
7. Extract named export → correct specifiers
8. Extract default export → correct kind
9. Extract export declaration → correct kind
10. Extract re-export → source captured

**Verification**:
- [ ] All 10 tests pass
- [ ] Tests cover all import/export kinds
- [ ] Tests cover JavaScript, TypeScript, Python

**Dependencies**: T028

---

### T030: [P] Write US2 Contract Tests
**File**: `tests/contract/parser-imports-exports.test.ts`
**Story**: US2
**Description**: Contract tests for import/export extraction API.

Test scenarios (from spec.md US2):
1. **Given** TypeScript file with ES6 imports, **When** parsed, **Then** all imported modules and symbols identified
2. **Given** JavaScript file with CommonJS requires, **When** parsed, **Then** required modules correctly extracted
3. **Given** Python file with import statements, **When** parsed, **Then** imported modules and specific imports identified
4. **Given** file exporting multiple symbols, **When** parsed, **Then** all exported symbols catalogued with types

**Verification**:
- [ ] All 4 acceptance scenarios pass
- [ ] Contract matches spec.md exactly
- [ ] 100% static dependency detection (SC-009)

**Dependencies**: T028

---

### T031: Write US2 Integration Tests
**File**: `tests/integration/import-export-integration.test.ts`
**Story**: US2
**Description**: End-to-end import/export tests.

Test scenarios:
1. Build dependency map from imports → shows which modules depend on what
2. Find circular dependencies → detects A imports B, B imports A
3. Find unused exports → symbols exported but not imported elsewhere
4. Parse project with 10+ files → complete dependency graph

**Verification**:
- [ ] All 4 tests pass
- [ ] Dependency analysis works correctly
- [ ] Performance acceptable for multi-file analysis

**Dependencies**: T028

---

**Phase 4 Checkpoint**: ✅ US2 Complete - Dependency tracking functional

---

## Phase 5: User Story 3 - Extract Documentation and Comments (P2)

**Goal**: Extract JSDoc, docstrings, and inline comments associated with symbols.

**User Story**: A developer wants to index documentation alongside code for documentation-aware search.

**Independent Test**: Parse files with various documentation formats and verify correct association.

**Duration**: 6-8 hours

---

### T032: Implement Comment Node Identification
**File**: `src/services/parser/CommentExtractor.ts`
**Story**: US3
**Description**: Identify Tree-sitter comment nodes (FR-006, FR-011).

Implement:
- `isCommentNode(node: TreeSitter.SyntaxNode): boolean` - Check if node is comment
- Node type mapping to CommentKind:
  - `comment` (line comment) → 'line'
  - `block_comment` → 'block'
  - JSDoc pattern detection → 'jsdoc'
  - Python docstring detection → 'docstring'
- Handle language-specific comment syntax

**Verification**:
- [ ] Identifies // line comments
- [ ] Identifies /* block comments */
- [ ] Identifies /** JSDoc comments */
- [ ] Identifies Python """ docstrings """
- [ ] Works across all languages

**Dependencies**: T010

---

### T033: [P] Implement Comment Text Extraction
**File**: `src/services/parser/CommentExtractor.ts`
**Story**: US3
**Description**: Extract comment text without delimiters.

Implement:
- `extractCommentText(node: TreeSitter.SyntaxNode): string` - Get comment content
- Strip comment delimiters (//, /*, */, etc.)
- Preserve internal whitespace and structure
- Handle multi-line comments
- Trim leading/trailing whitespace

**Verification**:
- [ ] `// foo` → `"foo"`
- [ ] `/* foo */` → `"foo"`
- [ ] Multi-line comment preserved correctly
- [ ] Python docstring content extracted

**Dependencies**: T032

---

### T034: [P] Implement Symbol Association
**File**: `src/services/parser/CommentExtractor.ts`
**Story**: US3
**Description**: Associate documentation comments with symbols.

Implement:
- `findAssociatedSymbol(comment: Comment, symbols: Symbol[]): string | undefined` - Find symbol
- Match comments immediately preceding symbols
- Use span information to determine proximity
- Handle JSDoc comments before functions
- Handle Python docstrings after function/class definition

**Verification**:
- [ ] JSDoc before function → associated with function
- [ ] Python docstring after def → associated with function
- [ ] Inline comment not associated with symbol
- [ ] Comment between symbols not associated

**Dependencies**: T033, T018 (needs symbols)

---

### T035: [P] Implement JSDoc Parsing
**File**: `src/services/parser/CommentExtractor.ts`
**Story**: US3
**Description**: Parse JSDoc structure into DocumentationBlock.

Implement:
- `parseJSDoc(text: string): DocumentationBlock` - Parse JSDoc tags
- Extract description
- Extract @param tags → ParamDoc[]
- Extract @returns tag
- Extract @throws tags
- Extract @example tags
- Extract other tags into tags map

**Verification**:
- [ ] Description extracted correctly
- [ ] @param tags parsed with name, type, description
- [ ] @returns parsed
- [ ] @example blocks preserved
- [ ] 95% of JSDoc content captured (SC-008)

**Dependencies**: T033

---

### T036: Integrate Comment Extraction
**File**: `src/services/parser/index.ts`
**Story**: US3
**Description**: Call CommentExtractor from main parse() method.

Modify `parse()`:
- Import CommentExtractor
- After symbol extraction, call `extractComments(tree, source, symbols)`
- Associate comments with symbols
- Parse JSDoc/docstrings
- Populate `ParseResult.comments` array
- Update `Symbol.documentation` field for associated comments

**Verification**:
- [ ] `parse('test.ts')` returns ParseResult with populated comments
- [ ] Symbol.documentation set for symbols with JSDoc
- [ ] Comment count matches expected
- [ ] No extraction errors

**Dependencies**: T034, T035

---

### T037: [P] Write Comment Extraction Unit Tests
**File**: `tests/unit/services/parser/CommentExtractor.test.ts`
**Story**: US3
**Description**: Unit tests for comment extraction.

Test scenarios:
1. Extract line comment → kind='line', text correct
2. Extract block comment → kind='block', text correct
3. Extract JSDoc → kind='jsdoc', documentation parsed
4. Extract Python docstring → kind='docstring'
5. Associate JSDoc with function → associatedSymbol set
6. Parse JSDoc @param → ParamDoc correct
7. Parse JSDoc @returns → returns field set
8. Inline comment not associated → associatedSymbol null

**Verification**:
- [ ] All 8 tests pass
- [ ] Tests cover all comment kinds
- [ ] JSDoc parsing comprehensive

**Dependencies**: T036

---

### T038: [P] Write US3 Contract Tests
**File**: `tests/contract/parser-documentation.test.ts`
**Story**: US3
**Description**: Contract tests for documentation extraction API.

Test scenarios (from spec.md US3):
1. **Given** TypeScript function with JSDoc, **When** parsed, **Then** documentation extracted and linked to function
2. **Given** Python class with docstrings, **When** parsed, **Then** class and method documentation correctly extracted
3. **Given** inline comments throughout code, **When** parsed, **Then** comments captured with line locations
4. **Given** malformed documentation, **When** parsed, **Then** parser continues without failing

**Verification**:
- [ ] All 4 acceptance scenarios pass
- [ ] 95% documentation capture rate (SC-008)
- [ ] Contract matches spec.md exactly

**Dependencies**: T036

---

**Phase 5 Checkpoint**: ✅ US3 Complete - Documentation extraction functional

---

## Phase 6: User Story 4 - Track Function Calls and Usage (P2)

**Goal**: Extract function calls and method invocations for usage tracking.

**User Story**: A developer wants to understand how functions are used by tracking call sites.

**Independent Test**: Parse files with function calls and verify call site identification.

**Duration**: 6-8 hours

---

### T039: Implement Call Node Identification
**File**: `src/services/parser/CallGraphExtractor.ts`
**Story**: US4
**Description**: Identify Tree-sitter nodes representing function calls (FR-007).

Implement:
- `isCallNode(node: TreeSitter.SyntaxNode): boolean` - Check if node is call
- Node type mapping to CallKind:
  - `call_expression` → 'function'
  - `member_expression` + call → 'method'
  - `new_expression` → 'constructor'
  - `super` call → 'super'
  - Computed property call → 'dynamic'
- Language-specific call patterns

**Verification**:
- [ ] Identifies all 5 call kinds
- [ ] Works across JavaScript, TypeScript, Python
- [ ] Distinguishes function vs method calls

**Dependencies**: T010

---

### T040: [P] Implement Callee Name Extraction
**File**: `src/services/parser/CallGraphExtractor.ts`
**Story**: US4
**Description**: Extract function/method name being called.

Implement:
- `extractCalleeName(node: TreeSitter.SyntaxNode): string` - Get callee identifier
- Handle simple function calls: `foo()`
- Handle member expressions: `obj.foo()`
- Handle chained calls: `obj.foo().bar()`
- Handle constructor calls: `new Foo()`

**Verification**:
- [ ] `foo()` → callee='foo'
- [ ] `obj.method()` → callee='method', receiver='obj'
- [ ] `new Foo()` → callee='Foo'
- [ ] `obj.foo().bar()` → detects chain

**Dependencies**: T039

---

### T041: [P] Implement Call Chain Tracking
**File**: `src/services/parser/CallGraphExtractor.ts`
**Story**: US4
**Description**: Track method chaining context.

Implement:
- `extractCallChain(node: TreeSitter.SyntaxNode): CallChain | undefined` - Build chain context
- Detect if call is part of chain
- Track previous and next calls
- Assign position in chain (0-indexed)

**Verification**:
- [ ] `obj.foo().bar()` → foo has chain.next='bar', bar has chain.previous='foo'
- [ ] Chain positions: foo=0, bar=1
- [ ] Single call has no chain context

**Dependencies**: T040

---

### T042: Integrate Call Graph Extraction
**File**: `src/services/parser/index.ts`
**Story**: US4
**Description**: Call CallGraphExtractor from main parse() method.

Modify `parse()`:
- Import CallGraphExtractor
- After symbol extraction, call `extractCalls(tree, source)`
- Populate `ParseResult.calls` array
- Handle extraction errors gracefully

**Verification**:
- [ ] `parse('test.ts')` returns ParseResult with populated calls
- [ ] Call count matches expected
- [ ] Method chaining tracked correctly
- [ ] No extraction errors

**Dependencies**: T040, T041

---

### T043: [P] Write Call Graph Unit Tests
**File**: `tests/unit/services/parser/CallGraphExtractor.test.ts`
**Story**: US4
**Description**: Unit tests for call graph extraction.

Test scenarios:
1. Extract function call → kind='function', callee correct
2. Extract method call → kind='method', receiver correct
3. Extract constructor call → kind='constructor'
4. Extract super call → kind='super'
5. Extract chained calls → chain context correct
6. Extract dynamic call → kind='dynamic'
7. Count arguments → argumentCount correct

**Verification**:
- [ ] All 7 tests pass
- [ ] Tests cover all call kinds
- [ ] Chain tracking works correctly

**Dependencies**: T042

---

### T044: [P] Write US4 Contract Tests
**File**: `tests/contract/parser-calls.test.ts`
**Story**: US4
**Description**: Contract tests for call tracking API.

Test scenarios (from spec.md US4):
1. **Given** file with function calls, **When** parsed, **Then** all call sites identified with called function names
2. **Given** method chaining in JavaScript, **When** parsed, **Then** entire call chain correctly extracted
3. **Given** Python method calls, **When** parsed, **Then** object methods and static calls distinguished
4. **Given** dynamic or computed calls, **When** parsed, **Then** parser handles gracefully without failing

**Verification**:
- [ ] All 4 acceptance scenarios pass
- [ ] Contract matches spec.md exactly
- [ ] Call tracking comprehensive

**Dependencies**: T042

---

### T045: Write Call Graph Integration Tests
**File**: `tests/integration/call-graph-integration.test.ts`
**Story**: US4
**Description**: End-to-end call graph tests.

Test scenarios:
1. Build usage map → shows which functions call which
2. Find unused functions → symbols never called
3. Find call hierarchy → trace from entry point to leaf functions
4. Parse file with 100+ calls → performance acceptable

**Verification**:
- [ ] All 4 tests pass
- [ ] Call graph analysis works correctly
- [ ] Performance acceptable

**Dependencies**: T042

---

**Phase 6 Checkpoint**: ✅ US4 Complete - Call tracking functional

---

## Phase 7: User Story 5 - Generate Content Hashes (P3)

**Goal**: Generate stable content hashes for change detection.

**User Story**: A developer wants to efficiently detect code changes via content hashes.

**Independent Test**: Parse files, modify symbols, verify hash changes correctly.

**Duration**: 4-6 hours

---

### T046: Implement Semantic Content Extraction
**File**: `src/services/parser/HashGenerator.ts`
**Story**: US5
**Description**: Extract semantic content for hashing (FR-009).

Implement:
- `extractSemanticContent(symbol: Symbol, source: string): HashInput` - Get hashable content
- Extract signature (already have from symbol)
- Extract body structure tokens:
  - Remove whitespace (preserve structure tokens like `{`, `}`, `;`)
  - Remove comments
  - Normalize formatting
- Return HashInput interface

**Verification**:
- [ ] Same code with different whitespace → same HashInput
- [ ] Same code with different comments → same HashInput
- [ ] Different code → different HashInput
- [ ] Signature and body structure both included

**Dependencies**: T018 (needs symbols)

---

### T047: [P] Implement xxHash Integration
**File**: `src/services/parser/HashGenerator.ts`
**Story**: US5
**Description**: Use xxHash to generate content hashes.

Implement:
- `generateHash(input: HashInput): string` - Create hash from semantic content
- Use `@node-rs/xxhash` XXH64
- Concatenate signature and body structure
- Convert to Buffer
- Hash with XXH64
- Return 16-character hex string

**Verification**:
- [ ] Produces 16-character hex string
- [ ] Same input → same hash (deterministic)
- [ ] Different input → different hash
- [ ] Hash stable across platforms

**Dependencies**: T046

---

### T048: Integrate Hash Generation
**File**: `src/services/parser/index.ts`
**Story**: US5
**Description**: Generate hashes for all symbols.

Modify `parse()`:
- Import HashGenerator
- After symbol extraction, for each symbol:
  - Extract semantic content
  - Generate hash
  - Set `symbol.hash` field
- Measure hash generation overhead
- Validate <5% overhead (SC-007)

**Verification**:
- [ ] All symbols have hash field populated
- [ ] Hashes are 16-char hex strings
- [ ] Hash generation adds <5% to parse time
- [ ] No hash generation errors

**Dependencies**: T047, T019 (needs symbols in parse)

---

### T049: [P] Write Hash Generation Tests
**File**: `tests/unit/services/parser/HashGenerator.test.ts`
**Story**: US5
**Description**: Unit tests for hash generation.

Test scenarios:
1. Same code → same hash (stability)
2. Different whitespace → same hash
3. Different comments → same hash
4. Modified signature → different hash
5. Modified body → different hash
6. Hash format → 16-char hex
7. Hash performance → <5% overhead

**Verification**:
- [ ] All 7 tests pass
- [ ] Hash stability verified
- [ ] Performance requirement met

**Dependencies**: T048

---

### T050: [P] Write US5 Contract Tests
**File**: `tests/contract/parser-hashes.test.ts`
**Story**: US5
**Description**: Contract tests for content hash generation.

Test scenarios (from spec.md US5):
1. **Given** parsed file, **When** symbol semantic content unchanged, **Then** hash remains stable across parses
2. **Given** function body modification, **When** reparsed, **Then** only that function's hash changes
3. **Given** whitespace or comment changes only, **When** reparsed, **Then** symbol hashes remain unchanged
4. **Given** identical semantic content in different files, **When** parsed, **Then** equivalent symbols have same hashes

**Verification**:
- [ ] All 4 acceptance scenarios pass
- [ ] Hash stability validated
- [ ] Contract matches spec.md exactly

**Dependencies**: T048

---

**Phase 7 Checkpoint**: ✅ US5 Complete - Change detection via hashing functional

---

## Phase 8: Polish & Integration

**Goal**: Production readiness and cross-cutting improvements.

**Duration**: 4-6 hours

---

### T051: Implement Incremental Parsing Support
**File**: `src/services/parser/TreeSitterParser.ts`
**Story**: Polish
**Description**: Add incremental parsing for performance (FR-017, SC-006).

Implement:
- `parseIncremental(source: string, oldTree: TreeSitter.Tree, edits: Edit[]): TreeSitter.Tree` - Incremental parse
- Apply edits to old tree via `tree.edit()`
- Reparse with tree hint
- Measure speedup vs full reparse
- Validate 10x speedup for small changes

**Verification**:
- [ ] Incremental parse faster than full parse
- [ ] Small edits achieve 10x+ speedup (SC-006)
- [ ] Large edits still performant
- [ ] Results identical to full parse

**Dependencies**: T010

---

### T052: Write End-to-End Integration Tests
**File**: `tests/integration/full-parser-integration.test.ts`
**Story**: Polish
**Description**: Comprehensive integration tests for entire parser.

Test scenarios:
1. Parse real project files → all features work together
2. Parse multiple files in batch → consistent results
3. Error recovery across all features → no crashes
4. Memory usage monitoring → stays under limits
5. Performance regression → all benchmarks pass
6. Cross-language consistency → all languages work equally well

**Verification**:
- [ ] All 6 tests pass
- [ ] Tests use real fixture files
- [ ] All success criteria validated
- [ ] Production readiness confirmed

**Dependencies**: T048, T051 (all features complete)

---

**Phase 8 Checkpoint**: ✅ Parser production-ready and fully integrated

---

## Dependencies and Parallel Execution

### Critical Path
```
T001 → T002 → T006 → T007 → T008 → T009 → T010 → T011 (Foundation)
  → T012 → T018 → T019 → T022 (US1 Critical)
  → T024 → T028 → T030 (US2 Critical)
  → T032 → T036 → T038 (US3 Critical)
  → T039 → T042 → T044 (US4 Critical)
  → T046 → T048 → T050 (US5 Critical)
  → T051 → T052 (Polish)
```

### Parallel Execution Opportunities

**Phase 1 (Setup)**: After T001
- T002, T003, T004, T005 run in parallel (4 tasks)

**Phase 3 (US1)**: After T012
- T013, T014 run in parallel (2 tasks)
- After T018: T020, T021, T022, T023 run in parallel (4 tasks)

**Phase 4 (US2)**: After T024
- T025, T026 run in parallel (2 tasks)
- After T028: T029, T030, T031 run in parallel (3 tasks)

**Phase 5 (US3)**: After T032
- T033, T035 run in parallel (2 tasks)
- After T036: T037, T038 run in parallel (2 tasks)

**Phase 6 (US4)**: After T039
- T040, T041 run in parallel (2 tasks)
- After T042: T043, T044, T045 run in parallel (3 tasks)

**Phase 7 (US5)**: After T046
- T047, T049 run in parallel (2 tasks)
- After T048: T049, T050 run in parallel (2 tasks)

**Total Parallelizable**: 28 tasks across 8 parallel groups

---

## Validation Checklist

### User Story Completion

- [ ] US1 (P1): All 4 acceptance scenarios pass
- [ ] US2 (P1): All 4 acceptance scenarios pass
- [ ] US3 (P2): All 4 acceptance scenarios pass
- [ ] US4 (P2): All 4 acceptance scenarios pass
- [ ] US5 (P3): All 4 acceptance scenarios pass

### Success Criteria

- [ ] SC-001: 1,000 lines/sec parsing throughput
- [ ] SC-002: 95% error recovery rate
- [ ] SC-003: <100MB memory for 1MB files
- [ ] SC-004: 99% symbol extraction accuracy
- [ ] SC-005: 90% real-world pattern coverage
- [ ] SC-006: 10x incremental parsing speedup
- [ ] SC-007: <5% hash generation overhead
- [ ] SC-008: 95% documentation capture rate
- [ ] SC-009: 100% static dependency detection
- [ ] SC-010: Consistent cross-language performance

### Functional Requirements

- [ ] FR-001: All 5 languages supported (JS, TS, JSX, TSX, Python)
- [ ] FR-001a: Language detection from file extension
- [ ] FR-002: All 14 symbol kinds extracted
- [ ] FR-003: Parent-child relationships tracked
- [ ] FR-004: Signatures extracted with parameters
- [ ] FR-005: Import/export statements extracted
- [ ] FR-006: Documentation comments associated
- [ ] FR-007: Function calls identified
- [ ] FR-008: Syntax-level error recovery
- [ ] FR-009: Stable semantic content hashes
- [ ] FR-010: File path and language in result
- [ ] FR-011: Block and inline comments extracted
- [ ] FR-012: Reasonable parse time limits
- [ ] FR-013: Files up to 10MB handled
- [ ] FR-014: Plain JavaScript objects returned
- [ ] FR-015: No type checking attempted
- [ ] FR-016: Fast error handling
- [ ] FR-017: Incremental parsing supported

---

## Next Steps

1. **Review tasks**: Ensure all user stories covered
2. **Estimate effort**: Assign time estimates per task
3. **Assign tasks**: Distribute to team members
4. **Track progress**: Update task status as work progresses
5. **Run tests**: Validate acceptance criteria after each phase

**Command to start implementation**:
```
/speckit.implement
```

---

**Tasks Generation Complete** ✅
**Ready for Implementation**: Phase-by-phase delivery starting with MVP (US1)
