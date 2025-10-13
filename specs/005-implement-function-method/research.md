# Research: Tree-sitter Query Patterns for Function and Method Extraction

**Feature**: 005-implement-function-method
**Created**: 2025-10-13
**Research Focus**: Tree-sitter query language patterns, language-specific node types, context extraction strategies, and whitespace normalization for code chunking

## Executive Summary

This research document provides comprehensive guidance for implementing intelligent code chunking using Tree-sitter query patterns for TypeScript, JavaScript, and Python. The research covers:

1. **Tree-sitter Query Language**: Syntax, operators, and best practices for writing efficient queries
2. **Language-Specific Patterns**: Node types and query patterns for TS/JS/Python functions, methods, and documentation
3. **Context Extraction**: Strategies for navigating AST to extract enclosing class/module information
4. **Whitespace Normalization**: Approaches for generating stable content hashes

---

## 1. Tree-sitter Query Language

### Decision: Use S-expression patterns with captures and predicates

**Rationale**: Tree-sitter's query language provides a declarative, efficient way to match syntax patterns. The S-expression syntax is powerful enough for complex patterns while maintaining good performance.

### Implementation Details

#### Basic Query Syntax

Tree-sitter queries are written in `.scm` files using a Lisp-like S-expression syntax:

```scheme
; Basic pattern matching a node type
(function_declaration)

; Pattern with field names for specificity
(function_declaration
  name: (identifier) @function.name)

; Pattern matching children
(class_declaration
  name: (identifier) @class.name
  body: (class_body
    (method_definition
      name: (property_identifier) @method.name)))
```

#### Key Query Components

**1. S-expressions**: Target nodes in the syntax tree
```scheme
(node_type field_name: (child_type) @capture)
```

**2. Captures**: Mark nodes as important using `@` prefix
```scheme
(identifier) @variable.name
(function_declaration) @function.definition
```

**3. Field Names**: Add specificity by using grammar-defined field names
```scheme
(call_expression
  function: (identifier) @function.call
  arguments: (argument_list) @function.args)
```

**4. Predicates**: Filter matches using `#` prefix
```scheme
; Check for specific values
((identifier) @constant
  (#match? @constant "^[A-Z][A-Z_]*$"))

; Check for ancestor relationships
(function_declaration
  (#has-ancestor? @function class_declaration))
```

#### Query Operators

**Quantification Operators**:
- `+` : One or more repetitions
- `*` : Zero or more repetitions
- `?` : Optional (zero or one)

```scheme
; Match function with optional async keyword
(function_declaration
  (async)?
  name: (identifier) @name)

; Match multiple parameters
(parameter_list
  (parameter)+)
```

**Alternation Operator** (`[]`): Match any of several alternatives
```scheme
; Match any of these keywords
[
  "async"
  "function"
  "class"
] @keyword

; Match function or method calls
(call_expression
  function: [
    (identifier) @function
    (member_expression property: (property_identifier) @method)
  ])
```

**Anchor Operator** (`.`): Constrain matching to specific positions
```scheme
; Match first child only
(module . (comment)* . (expression_statement (string)) @module_doc)

; Match last child only
(block (statement)* . (return_statement) @last_return .)

; Match immediate siblings
(statement . (comment) . (function_declaration) @documented_function)
```

**Grouping**: Use parentheses to group patterns
```scheme
; Group multiple siblings
(array
  (number)
  ("," (number))*
)
```

#### Performance Best Practices

1. **Make patterns specific**: Use field names to narrow matches
   ```scheme
   ; Less specific (slower)
   (function_declaration (identifier))

   ; More specific (faster)
   (function_declaration name: (identifier) @name)
   ```

2. **Anchor patterns when possible**: Use `.` to limit search space
   ```scheme
   ; Match only docstrings at start of function body
   (function_definition
     body: (block . (expression_statement (string)) @docstring))
   ```

3. **Use alternations efficiently**: Group similar patterns
   ```scheme
   ; Efficient alternation
   ([(function_declaration) (method_definition)]
     name: (identifier) @name)
   ```

4. **Keep queries focused**: "A query is a path in the tree" - always define complete paths from parent to target

### Alternatives Considered

- **Regex-based parsing**: Rejected due to inability to handle nested structures and lack of semantic understanding
- **Manual AST traversal only**: More flexible but less efficient and harder to maintain than declarative queries
- **Hybrid approach**: Use queries to find target nodes, then traverse programmatically for context (RECOMMENDED)

---

## 2. Language-Specific Patterns

### 2.1 TypeScript / JavaScript Patterns

**Decision**: Support all function-like constructs including async/generator variants

**Rationale**: Modern JavaScript/TypeScript has many function declaration styles. Supporting all variants ensures comprehensive code coverage.

#### Node Types Reference

Based on tree-sitter-javascript and tree-sitter-typescript grammars:

**Function-like nodes**:
- `function_declaration` - Regular function declaration
- `function_expression` - Function expression (anonymous or named)
- `arrow_function` - Arrow function `() => {}`
- `generator_function_declaration` - Generator function `function*`
- `method_definition` - Class method
- `class_declaration` - Class definition
- `lexical_declaration` - `let` or `const` declarations (for arrow functions)

**Note**: Arrow functions CANNOT be generators in JavaScript/TypeScript

#### Implementation Patterns

**1. Capture all function types**:

```scheme
; Match any function-like declaration
[
  (function_declaration
    name: (identifier) @function.name
    parameters: (formal_parameters) @function.params
    body: (statement_block) @function.body) @function.def

  (method_definition
    name: (property_identifier) @method.name
    parameters: (formal_parameters) @method.params
    body: (statement_block) @method.body) @method.def

  (arrow_function
    parameters: [
      (identifier) @arrow.param
      (formal_parameters) @arrow.params
    ]
    body: [
      (statement_block) @arrow.body
      (expression) @arrow.expr
    ]) @arrow.def
]
```

**2. Identify async functions**:

```scheme
; Async function declaration
(function_declaration
  (async) @async.keyword
  name: (identifier) @async_function.name
  body: (statement_block) @async_function.body) @async_function.def

; Async method
(method_definition
  (async) @async.keyword
  name: (property_identifier) @async_method.name
  body: (statement_block) @async_method.body) @async_method.def

; Async arrow function
(arrow_function
  (async) @async.keyword
  parameters: (formal_parameters) @async_arrow.params
  body: (statement_block) @async_arrow.body) @async_arrow.def
```

**3. Identify generator functions**:

```scheme
; Generator function
(generator_function_declaration
  name: (identifier) @generator.name
  parameters: (formal_parameters) @generator.params
  body: (statement_block) @generator.body) @generator.def

; Generator method
(method_definition
  "*" @generator.marker
  name: (property_identifier) @generator_method.name
  body: (statement_block) @generator_method.body) @generator_method.def
```

**4. Capture constructors**:

```scheme
; Constructor method in class
(class_declaration
  name: (identifier) @class.name
  body: (class_body
    (method_definition
      name: (property_identifier) @constructor.name
      (#eq? @constructor.name "constructor")
      parameters: (formal_parameters) @constructor.params
      body: (statement_block) @constructor.body) @constructor.def))
```

**5. Capture class properties** (TypeScript/modern JS):

```scheme
; Class field/property
(class_declaration
  body: (class_body
    (field_definition
      property: (property_identifier) @property.name
      value: (_)? @property.value) @property.def))

; Property with decorator
(class_declaration
  body: (class_body
    (field_definition
      (decorator)+ @property.decorators
      property: (property_identifier) @property.name) @property.def))
```

#### Documentation Extraction - JSDoc

**Challenge**: JSDoc is parsed as separate `comment` nodes that appear before the function in the tree

**Solution**: Use anchor operator to match comments immediately preceding function declarations

```scheme
; Capture JSDoc comment before function
(
  (comment)+ @function.doc .
  (function_declaration) @function.def
)

; Capture JSDoc comment before method
(class_body
  (comment)+ @method.doc .
  (method_definition) @method.def
)

; Capture multi-line comment before function
(
  (comment)+ @doc.comment .
  [
    (function_declaration)
    (method_definition)
    (arrow_function)
  ] @def
)
```

**Note**: Tree-sitter-javascript treats JSDoc as regular `comment` nodes. A separate tree-sitter-jsdoc grammar exists for parsing JSDoc content, but for chunking purposes, capturing the raw comment text is sufficient.

### 2.2 Python Patterns

**Decision**: Support functions, methods, async variants, and property decorators

**Rationale**: Python has clear syntactic distinctions between functions and methods, with first-class support for async and decorators.

#### Node Types Reference

Based on tree-sitter-python grammar:

**Function-like nodes**:
- `function_definition` - Regular function `def`
- `decorated_definition` - Function/class with decorators
- `class_definition` - Class definition
- `identifier` - Function/method/class names
- `parameters` - Function parameter list
- `block` - Function body

**Special Python features**:
- Async functions use same `function_definition` with `async` keyword
- Decorators wrap definitions in `decorated_definition` node
- Docstrings are `expression_statement` containing `string` as first statement in body

#### Implementation Patterns

**1. Capture function definitions**:

```scheme
; Regular function
(function_definition
  name: (identifier) @function.name
  parameters: (parameters) @function.params
  body: (block) @function.body) @function.def

; Async function
(function_definition
  (async) @async.keyword
  name: (identifier) @async_function.name
  parameters: (parameters) @async_function.params
  body: (block) @async_function.body) @async_function.def
```

**2. Capture methods with class context**:

```scheme
; Method within class
(class_definition
  name: (identifier) @class.name
  body: (block
    (function_definition
      name: (identifier) @method.name
      parameters: (parameters) @method.params
      body: (block) @method.body) @method.def))

; Async method
(class_definition
  name: (identifier) @class.name
  body: (block
    (function_definition
      (async) @async.keyword
      name: (identifier) @async_method.name
      body: (block) @async_method.body) @async_method.def))
```

**3. Capture constructors (`__init__`)**:

```scheme
; __init__ method
(class_definition
  name: (identifier) @class.name
  body: (block
    (function_definition
      name: (identifier) @constructor.name
      (#eq? @constructor.name "__init__")
      parameters: (parameters) @constructor.params
      body: (block) @constructor.body) @constructor.def))
```

**4. Capture property decorators**:

```scheme
; @property decorator
(decorated_definition
  (decorator
    (identifier) @decorator.name
    (#eq? @decorator.name "property")) @property.decorator
  (function_definition
    name: (identifier) @property.name
    body: (block) @property.body) @property.def)

; Multiple decorators
(decorated_definition
  (decorator)+ @decorators
  (function_definition
    name: (identifier) @method.name) @method.def)
```

**5. Capture class inheritance**:

```scheme
; Class with base classes
(class_definition
  name: (identifier) @class.name
  superclasses: (argument_list
    (identifier)+ @base.classes)
  body: (block) @class.body) @class.def

; Class without inheritance
(class_definition
  name: (identifier) @class.name
  !superclasses
  body: (block) @class.body) @class.def
```

#### Documentation Extraction - Docstrings

**Key insight**: Python docstrings are the first expression statement in a function/class body, containing a string literal.

```scheme
; Function docstring
(function_definition
  name: (identifier) @function.name
  body: (block
    . (expression_statement (string) @function.docstring)
    . (_)*)) @function.def

; Class docstring
(class_definition
  name: (identifier) @class.name
  body: (block
    . (expression_statement (string) @class.docstring)
    . (_)*)) @class.def

; Method docstring
(class_definition
  name: (identifier) @class.name
  body: (block
    (function_definition
      name: (identifier) @method.name
      body: (block
        . (expression_statement (string) @method.docstring)
        . (_)*)) @method.def))

; Module-level docstring
(module
  . (comment)* .
  (expression_statement (string)) @module.docstring)
```

**Important**: The `.` anchor ensures we only match the FIRST expression statement, not string literals elsewhere in the function.

### 2.3 Handling Inner/Nested Functions

**Decision**: Inner functions are included within the parent chunk, not extracted as separate chunks

**Rationale**: Per spec FR-010, only top-level functions and class methods are separate chunks. This simplifies chunking and maintains logical cohesion.

#### Implementation Strategy

**For top-level detection**:

```scheme
; TypeScript/JavaScript - top-level function
(program
  (function_declaration
    name: (identifier) @top_level_function.name) @top_level_function.def)

; TypeScript/JavaScript - class method (always top-level in class scope)
(class_declaration
  body: (class_body
    (method_definition) @class_method.def))

; Python - top-level function (not nested in another function)
(module
  (function_definition
    name: (identifier) @top_level_function.name) @top_level_function.def)

; Python - class method
(class_definition
  body: (block
    (function_definition) @class_method.def))
```

**For excluding inner functions** - use `#has-ancestor?` predicate:

```scheme
; Python - exclude nested functions
(function_definition
  name: (identifier) @function.name
  (#not-has-ancestor? @function function_definition)) @top_level.function

; Note: This captures functions that don't have another function_definition as ancestor
```

---

## 3. Context Extraction Strategies

### Decision: Use hybrid approach - queries for target nodes, programmatic traversal for context

**Rationale**: While Tree-sitter queries excel at finding specific patterns, extracting complete context (class hierarchies, module paths, type signatures) requires programmatic traversal. The hybrid approach leverages the strengths of both.

### Implementation Details

#### 3.1 Navigating Up the AST

**Node.js Tree-sitter API provides**:
- `node.parent` - Get immediate parent node
- `node.type` - Get node type as string
- `node.children` - Get array of child nodes
- `node.childForFieldName(name)` - Get specific field child
- `node.text` - Get source text for node

**Strategy**: Walk up from function/method node until reaching class or module root

```typescript
function extractEnclosingContext(node: Parser.SyntaxNode): ChunkContext {
  const context: ChunkContext = {
    className: null,
    inheritance: [],
    modulePath: null,
    namespace: []
  };

  let current = node.parent;

  while (current) {
    if (current.type === 'class_declaration') {
      // Extract class name
      const nameNode = current.childForFieldName('name');
      if (nameNode) {
        context.className = nameNode.text;
      }

      // Extract inheritance (Python)
      const superclassesNode = current.childForFieldName('superclasses');
      if (superclassesNode) {
        context.inheritance = extractInheritanceChain(superclassesNode);
      }

      // Extract inheritance (TypeScript)
      const heritageNode = current.childForFieldName('heritage');
      if (heritageNode) {
        context.inheritance = extractTypeScriptInheritance(heritageNode);
      }
    }

    if (current.type === 'module' || current.type === 'program') {
      // Reached top level - extract module path from file path
      context.modulePath = extractModulePath(current);
      break;
    }

    current = current.parent;
  }

  return context;
}
```

#### 3.2 Extracting Class Inheritance

**Python inheritance** - from `argument_list` in `superclasses` field:

```typescript
function extractInheritanceChain(superclassesNode: Parser.SyntaxNode): string[] {
  const inheritance: string[] = [];

  // superclasses is an argument_list containing identifiers or attribute access
  for (const child of superclassesNode.children) {
    if (child.type === 'identifier') {
      inheritance.push(child.text);
    } else if (child.type === 'attribute') {
      // Handle module.ClassName syntax
      inheritance.push(child.text);
    }
  }

  return inheritance;
}
```

**TypeScript inheritance** - from `heritage_clause`:

```typescript
function extractTypeScriptInheritance(heritageNode: Parser.SyntaxNode): string[] {
  const inheritance: string[] = [];

  for (const clause of heritageNode.children) {
    if (clause.type === 'extends_clause' || clause.type === 'implements_clause') {
      // Extract type references from clause
      for (const child of clause.children) {
        if (child.type === 'identifier' || child.type === 'type_identifier') {
          inheritance.push(child.text);
        }
      }
    }
  }

  return inheritance;
}
```

#### 3.3 Extracting Method Signatures

**Strategy**: Capture parameter names, types, and return type

```typescript
function extractMethodSignature(node: Parser.SyntaxNode, language: string): MethodSignature {
  const signature: MethodSignature = {
    name: '',
    parameters: [],
    returnType: null,
    isAsync: false,
    isGenerator: false
  };

  // Extract name
  const nameNode = node.childForFieldName('name');
  if (nameNode) {
    signature.name = nameNode.text;
  }

  // Check for async
  for (const child of node.children) {
    if (child.type === 'async') {
      signature.isAsync = true;
    }
  }

  // Extract parameters
  const paramsNode = node.childForFieldName('parameters');
  if (paramsNode) {
    signature.parameters = extractParameters(paramsNode, language);
  }

  // Extract return type (TypeScript only)
  if (language === 'typescript') {
    const returnTypeNode = node.childForFieldName('return_type');
    if (returnTypeNode) {
      signature.returnType = returnTypeNode.text;
    }
  }

  return signature;
}

function extractParameters(paramsNode: Parser.SyntaxNode, language: string): Parameter[] {
  const parameters: Parameter[] = [];

  for (const child of paramsNode.children) {
    if (child.type === 'identifier') {
      // Simple parameter (JS/Python)
      parameters.push({
        name: child.text,
        type: null,
        defaultValue: null
      });
    } else if (child.type === 'required_parameter' || child.type === 'optional_parameter') {
      // TypeScript parameter with type
      const paramName = child.childForFieldName('pattern')?.text || '';
      const paramType = child.childForFieldName('type')?.text || null;
      const defaultVal = child.childForFieldName('value')?.text || null;

      parameters.push({
        name: paramName,
        type: paramType,
        defaultValue: defaultVal
      });
    } else if (child.type === 'default_parameter') {
      // Python default parameter
      const paramName = child.childForFieldName('name')?.text || '';
      const defaultVal = child.childForFieldName('value')?.text || null;

      parameters.push({
        name: paramName,
        type: null, // Python doesn't require type hints
        defaultValue: defaultVal
      });
    }
  }

  return parameters;
}
```

#### 3.4 Module Path Determination

**Strategy**: Derive from file path relative to project root

```typescript
function extractModulePath(filePath: string, projectRoot: string): string {
  // Make path relative to project root
  const relativePath = path.relative(projectRoot, filePath);

  // Remove file extension
  const withoutExt = relativePath.replace(/\.(ts|js|py)$/, '');

  // Convert path separators to module notation
  // e.g., "src/services/parser.ts" -> "src.services.parser"
  const modulePath = withoutExt.replace(/\//g, '.');

  return modulePath;
}
```

### 3.5 Query Predicates for Context

**Available predicates** (may vary by Tree-sitter version):
- `#eq?` - Test equality
- `#match?` - Test regex match
- `#has-ancestor?` - Check if node has ancestor of given type(s)
- `#has-parent?` - Check if node's immediate parent matches type

**Usage example**:

```scheme
; Match only methods (functions inside classes)
(function_definition
  name: (identifier) @method.name
  (#has-ancestor? @method.name class_definition)) @method.def

; Match top-level functions only
(function_definition
  name: (identifier) @function.name
  (#not-has-ancestor? @function.name class_definition)
  (#not-has-ancestor? @function.name function_definition)) @function.def
```

### Alternatives Considered

- **Query-only approach**: Insufficient for complex context like inheritance chains and full signatures
- **Full programmatic traversal**: Works but slower and less maintainable than hybrid approach
- **Regex post-processing**: Unreliable for extracting structured information

---

## 4. Whitespace Normalization for Content Hashing

### Decision: Normalize whitespace to single spaces while preserving logical structure

**Rationale**: Per spec FR-007, chunk IDs must remain stable for whitespace-only changes. However, documentation CONTENT changes should trigger new IDs. Normalization achieves this by treating formatting as insignificant while preserving semantic content.

### Implementation Details

#### 4.1 Normalization Strategy

**Normalize**:
- Multiple spaces → single space
- Tabs → single space
- Multiple newlines → single newline
- Leading/trailing whitespace on lines → removed
- Indentation → removed

**Preserve**:
- Logical line breaks (separate statements)
- String literal content (unchanged)
- Comment text content (only normalize between comments)

```typescript
function normalizeWhitespace(code: string): string {
  const lines = code.split('\n');
  const normalized: string[] = [];

  for (const line of lines) {
    // Trim leading/trailing whitespace
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed.length === 0) {
      continue;
    }

    // Normalize multiple spaces to single space
    const spacesNormalized = trimmed.replace(/\s+/g, ' ');

    normalized.push(spacesNormalized);
  }

  // Join with single newline
  return normalized.join('\n');
}
```

#### 4.2 Handling String Literals and Comments

**Challenge**: String literals and comment text should preserve their content but not their formatting

**Solution**: Use Tree-sitter to identify strings and comments, then normalize only non-literal parts

```typescript
function normalizeCodePreservingLiterals(
  code: string,
  tree: Parser.Tree
): string {
  const chunks: string[] = [];
  let lastIndex = 0;

  // Query for string literals and comments
  const query = tree.language.query(`
    [
      (string) @string
      (comment) @comment
    ]
  `);

  const captures = query.captures(tree.rootNode);

  for (const capture of captures) {
    const node = capture.node;

    // Add normalized code before this literal
    if (node.startIndex > lastIndex) {
      const before = code.substring(lastIndex, node.startIndex);
      chunks.push(normalizeWhitespace(before));
    }

    // Add the literal/comment with minimal normalization
    const literalText = node.text;

    if (capture.name === 'string') {
      // Preserve string literals exactly
      chunks.push(literalText);
    } else if (capture.name === 'comment') {
      // Normalize whitespace within comment but preserve structure
      const commentNormalized = literalText.replace(/\s+/g, ' ');
      chunks.push(commentNormalized);
    }

    lastIndex = node.endIndex;
  }

  // Add any remaining code
  if (lastIndex < code.length) {
    const after = code.substring(lastIndex);
    chunks.push(normalizeWhitespace(after));
  }

  return chunks.join('');
}
```

#### 4.3 Hash Generation

**Use crypto-stable hashing**:

```typescript
import { createHash } from 'crypto';

function generateChunkId(normalizedContent: string): string {
  // Use SHA-256 for stable, collision-resistant hashing
  const hash = createHash('sha256');
  hash.update(normalizedContent, 'utf8');

  // Return hex digest (64 characters)
  // For shorter IDs, could use base64 or truncate to 16 chars
  return hash.digest('hex');
}

// Alternative: shorter base64 ID
function generateShortChunkId(normalizedContent: string): string {
  const hash = createHash('sha256');
  hash.update(normalizedContent, 'utf8');

  // Base64 encoding is shorter (44 chars vs 64 hex chars)
  // Could further truncate to first 16 chars for 2^64 uniqueness
  return hash.digest('base64').substring(0, 16);
}
```

#### 4.4 What to Include in Hash

**Include**:
- Function/method signature (name, parameters, return type)
- Function body (normalized)
- Documentation content (normalized)
- Decorators/annotations (normalized)

**Exclude**:
- Enclosing class name (same method can appear in different classes)
- File path (same function can exist in different files)
- Line numbers
- Contextual information (module path, inheritance)

**Rationale**: Chunk ID identifies the CONTENT of the chunk, not its location or context. This enables deduplication of identical functions across the codebase.

```typescript
function getChunkContentForHashing(chunk: CodeChunk): string {
  const parts: string[] = [];

  // Include documentation (content, not formatting)
  if (chunk.documentation) {
    parts.push(normalizeWhitespace(chunk.documentation));
  }

  // Include any decorators/annotations
  if (chunk.decorators && chunk.decorators.length > 0) {
    parts.push(chunk.decorators.map(d => normalizeWhitespace(d)).join('\n'));
  }

  // Include function signature
  parts.push(normalizeWhitespace(chunk.signature));

  // Include function body
  parts.push(normalizeWhitespace(chunk.body));

  return parts.join('\n');
}
```

### 4.5 Testing Stability

**Test cases for hash stability**:

1. **Identical content, different formatting** → Same hash
   ```typescript
   const code1 = "function foo() {\n  return 42;\n}";
   const code2 = "function foo() { return 42; }";
   // Should produce identical hash
   ```

2. **Whitespace-only changes** → Same hash
   ```typescript
   const code1 = "def foo():\n    return 42";
   const code2 = "def foo():\n        return 42"; // Extra indent
   // Should produce identical hash
   ```

3. **Documentation content change** → Different hash
   ```typescript
   const code1 = "/** Returns 42 */ function foo() { return 42; }";
   const code2 = "/** Returns forty-two */ function foo() { return 42; }";
   // Should produce DIFFERENT hashes
   ```

4. **Code logic change** → Different hash
   ```typescript
   const code1 = "function foo() { return 42; }";
   const code2 = "function foo() { return 43; }";
   // Should produce DIFFERENT hashes
   ```

### Alternatives Considered

- **No normalization**: Rejected - too many false positives from formatting differences
- **Complete whitespace removal**: Rejected - loses logical structure
- **Line-by-line hashing**: Rejected - too sensitive to insignificant changes
- **AST-based hashing**: Considered - would be ideal but complex to implement; normalization is simpler and sufficient

---

## 5. Performance Optimization Recommendations

### 5.1 Query Efficiency

1. **Compile queries once, reuse**: Tree-sitter queries should be compiled at initialization and reused
   ```typescript
   class LanguageParser {
     private functionQuery: Parser.Query;

     constructor(language: any) {
       this.functionQuery = language.query(FUNCTION_QUERY_SOURCE);
     }

     extractFunctions(tree: Parser.Tree): Capture[] {
       return this.functionQuery.captures(tree.rootNode);
     }
   }
   ```

2. **Use `captures()` for single pattern, `matches()` for grouped captures**:
   ```typescript
   // For independent captures
   const captures = query.captures(rootNode);

   // For related captures that should be processed together
   const matches = query.matches(rootNode);
   for (const match of matches) {
     // All captures in match are related
   }
   ```

3. **Limit query scope when possible**:
   ```typescript
   // Query specific subtree instead of entire tree
   const classNode = findClassNode(tree);
   const methodCaptures = query.captures(classNode); // Faster
   ```

### 5.2 Incremental Processing

**Use Tree-sitter's incremental parsing**:

```typescript
class ChunkCache {
  private trees: Map<string, Parser.Tree> = new Map();

  rechunkFile(filePath: string, newContent: string, edits: Edit[]): CodeChunk[] {
    const oldTree = this.trees.get(filePath);

    if (oldTree && edits.length > 0) {
      // Use incremental parsing (10x+ faster)
      const newTree = parser.parseIncremental(newContent, oldTree, edits);
      this.trees.set(filePath, newTree);

      // Only re-extract chunks affected by edits
      return this.extractAffectedChunks(newTree, edits);
    } else {
      // Full reparse needed
      const newTree = parser.parse(newContent);
      this.trees.set(filePath, newTree);
      return this.extractAllChunks(newTree);
    }
  }
}
```

### 5.3 Memory Management

1. **Release parse trees**: Don't hold references to old trees
2. **Stream large files**: For huge files, process in chunks rather than loading entire AST
3. **Cache chunk IDs**: Store computed hashes to avoid recomputation

### 5.4 Parallel Processing

**Process multiple files concurrently**:

```typescript
async function chunkProject(files: string[]): Promise<Map<string, CodeChunk[]>> {
  const results = new Map();

  // Process files in batches
  const BATCH_SIZE = 10;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(file => chunkFile(file))
    );

    batch.forEach((file, idx) => {
      results.set(file, batchResults[idx]);
    });
  }

  return results;
}
```

---

## 6. Integration Architecture

### Recommended Implementation Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. File Processing                                           │
│    • Read source file                                        │
│    • Detect language                                         │
│    • Load appropriate Tree-sitter grammar                    │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Parsing                                                   │
│    • Parse file into AST (incremental if possible)           │
│    • Extract syntax errors if any                            │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Query Execution                                           │
│    • Execute language-specific queries                       │
│    • Identify all function/method nodes                      │
│    • Capture documentation nodes                             │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Context Extraction (for each function/method)             │
│    • Navigate up to find enclosing class                     │
│    • Extract class name, inheritance                         │
│    • Extract method signature                                │
│    • Determine module path                                   │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Content Normalization                                     │
│    • Extract chunk content (doc + signature + body)          │
│    • Normalize whitespace                                    │
│    • Preserve string/comment content                         │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Hash Generation                                           │
│    • Hash normalized content                                 │
│    • Generate stable chunk ID                                │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Chunk Assembly                                            │
│    • Create CodeChunk objects                                │
│    • Include context, metadata, chunk ID                     │
│    • Return array of chunks                                  │
└─────────────────────────────────────────────────────────────┘
```

### Recommended Service Structure

```
src/services/chunking/
├── ChunkExtractor.ts          # Main orchestrator
├── queries/
│   ├── typescript.scm         # TypeScript query patterns
│   ├── javascript.scm         # JavaScript query patterns
│   └── python.scm             # Python query patterns
├── ContextExtractor.ts        # AST navigation for context
├── ContentNormalizer.ts       # Whitespace normalization
├── HashGenerator.ts           # Chunk ID generation (ALREADY EXISTS)
└── ChunkTypes.ts              # Type definitions
```

---

## 7. Key Takeaways & Action Items

### Critical Decisions

1. **Query Language**: Use Tree-sitter queries for pattern matching, programmatic traversal for context
2. **Language Support**: Comprehensive support for TS/JS/Python including async, generators, decorators
3. **Documentation**: Use anchor operators to capture leading comments/docstrings
4. **Context**: Navigate up AST programmatically to extract class/module information
5. **Normalization**: Remove formatting while preserving semantic content and logical structure
6. **Hashing**: SHA-256 of normalized content (doc + signature + body) for stable chunk IDs

### Implementation Priorities

**Phase 1 - Core Functionality**:
- [ ] Implement query patterns for TS/JS/Python function extraction
- [ ] Build AST navigation for context extraction
- [ ] Create whitespace normalization function
- [ ] Integrate with existing HashGenerator service

**Phase 2 - Edge Cases**:
- [ ] Handle decorators and annotations
- [ ] Support complex inheritance chains
- [ ] Handle malformed/partial syntax trees

**Phase 3 - Optimization**:
- [ ] Implement incremental processing
- [ ] Add parallel file processing
- [ ] Cache compiled queries and chunk IDs

### Testing Requirements

- Unit tests for normalization (identical content → identical hash)
- Integration tests for each language's query patterns
- Performance tests (target: 10,000 functions/minute)
- Edge case tests (large functions, nested functions, malformed syntax)

---

## References

### Documentation
- [Tree-sitter Query Syntax](https://tree-sitter.github.io/tree-sitter/using-parsers/queries/1-syntax.html)
- [Tree-sitter Query Operators](https://tree-sitter.github.io/tree-sitter/using-parsers/queries/2-operators.html)
- [Node Tree-sitter API](https://tree-sitter.github.io/node-tree-sitter/)

### Grammars
- [tree-sitter-javascript](https://github.com/tree-sitter/tree-sitter-javascript)
- [tree-sitter-typescript](https://github.com/tree-sitter/tree-sitter-typescript)
- [tree-sitter-python](https://github.com/tree-sitter/tree-sitter-python)
- [tree-sitter-jsdoc](https://github.com/tree-sitter/tree-sitter-jsdoc)

### Practical Resources
- [Knee Deep in tree-sitter Queries](https://parsiya.net/blog/knee-deep-tree-sitter-queries/)
- [Tips for using tree-sitter queries](https://cycode.com/blog/tips-for-using-tree-sitter-queries/)
- [Tree-sitter Highlights SCM examples](https://github.com/tree-sitter/tree-sitter-python/blob/master/queries/highlights.scm)

### Research Articles
- "cAST: Enhancing Code Retrieval with Structural Chunking via Abstract Syntax Tree" (arXiv:2506.15655v1)
- "Mastering Code Chunking for Retrieval Augmented Generation" (Medium article by Joe Shamon)

---

**Document Status**: Complete
**Last Updated**: 2025-10-13
**Next Step**: Review research findings and proceed to task breakdown (`/speckit.tasks`)
