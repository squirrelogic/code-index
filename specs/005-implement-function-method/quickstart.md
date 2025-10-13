# Quickstart: Intelligent Code Chunking

**Feature**: Function/Method-Level Code Chunking
**Audience**: Developers using code-index CLI
**Version**: 1.0.0

## Overview

Code chunking breaks down your source files into logical units centered around functions and methods. Each chunk includes:
- **Function/method code** with all nested content
- **Documentation** (JSDoc, docstrings, comments)
- **Context** (class name, inheritance, module path)
- **Stable chunk ID** based on content hash

Chunking enables more precise code search by indexing at function granularity rather than file level.

## Quick Start

### 1. Index Your Codebase with Chunking

```bash
# Index all files and generate chunks
code-index index --with-chunks

# Or refresh existing index with chunking
code-index refresh --with-chunks
```

### 2. Search at Function Level

```bash
# Search all chunks
code-index search "authentication" --chunks

# Search specific chunk types
code-index search "login" --chunks --type method

# Search by language
code-index search "async" --chunks --language typescript
```

### 3. Query by Chunk Type

```bash
# Find all constructors
code-index chunks --type constructor

# Find all async functions
code-index chunks --type async_function

# Find all generator functions
code-index chunks --type generator
```

## Supported Languages

| Language | Chunk Types Supported |
|----------|----------------------|
| **TypeScript** | function, method, constructor, property, class, module, async_function, async_method, generator |
| **JavaScript** | function, method, constructor, property, class, module, async_function, async_method, generator |
| **Python** | function, method, constructor (`__init__`), property (`@property`), class, module, async_function, async_method, generator |

## Chunk Types Explained

- **function**: Regular function declaration
- **method**: Class instance method
- **constructor**: Class constructor or `__init__`
- **property**: Class property or `@property` decorator
- **class**: Class definition
- **module**: File/module-level code
- **async_function**: Async function declaration
- **async_method**: Async class method
- **generator**: Generator function (`function*` or `yield`)

## How It Works

### Chunking Strategy

1. **Top-level only**: Only top-level functions and class methods are separate chunks
2. **Nested functions**: Inner functions stay with their parent chunk
3. **Documentation**: Leading comments, JSDoc, and docstrings are included
4. **Context**: Class name, inheritance, module path preserved

### Example: TypeScript Class

**Source Code**:
```typescript
/**
 * User authentication service
 */
class AuthService {
  /**
   * Authenticate user with credentials
   * @param username - User's username
   * @param password - User's password
   */
  async authenticate(username: string, password: string): Promise<User> {
    // Validation logic
    const validate = (input: string) => input.length > 0;

    if (!validate(username) || !validate(password)) {
      throw new Error('Invalid credentials');
    }

    return this.loginUser(username, password);
  }
}
```

**Chunks Generated**:
1. **Class chunk** (`class` type):
   - Name: `AuthService`
   - Content: Class declaration with doc comment
   - Context: Module path

2. **Method chunk** (`async_method` type):
   - Name: `authenticate`
   - Content: Full method including inner `validate` function
   - Documentation: JSDoc comment
   - Context: Class name (`AuthService`), method signature
   - Chunk Type: `async_method` (not just `method`)

### Example: Python Module

**Source Code**:
```python
def calculate_total(items: list[float]) -> float:
    """
    Calculate total price of items with tax.

    Args:
        items: List of item prices

    Returns:
        Total price including 10% tax
    """
    def apply_tax(amount: float) -> float:
        return amount * 1.10

    subtotal = sum(items)
    return apply_tax(subtotal)
```

**Chunks Generated**:
1. **Function chunk** (`function` type):
   - Name: `calculate_total`
   - Content: Full function including inner `apply_tax`
   - Documentation: Docstring
   - Context: Module path
   - Note: Inner `apply_tax` is NOT a separate chunk

## Stable Chunk IDs

Chunks have stable content-based hash IDs that remain consistent across runs:

### When Chunk ID Changes
- ✓ Code logic changes
- ✓ Documentation content changes
- ✓ Function signature changes

### When Chunk ID Stays Same
- ✓ Whitespace-only changes (indentation, spacing)
- ✓ File moved to different location (same content)
- ✓ Comments added outside function

### Example

```typescript
// Version 1
function add(a, b) {
  return a + b;
}
// Chunk ID: abc123...

// Version 2 (whitespace only - SAME ID)
function add(a, b) {
    return a + b;  // Extra spaces
}
// Chunk ID: abc123... (unchanged)

// Version 3 (documentation change - NEW ID)
/**
 * Adds two numbers
 */
function add(a, b) {
  return a + b;
}
// Chunk ID: def456... (changed)
```

## Advanced Usage

### Query Chunks Programmatically

```typescript
import { ChunkRepository, ChunkQuery, ChunkType, Language } from '@squirrelogic/code-index';

// Create query
const query: ChunkQuery = {
  chunkTypes: [ChunkType.AsyncFunction, ChunkType.AsyncMethod],
  languages: [Language.TypeScript],
  minLineCount: 10,
  maxLineCount: 500,
  limit: 50
};

// Execute query
const result = await chunkRepository.query(query);

console.log(`Found ${result.totalCount} chunks`);
result.chunks.forEach(chunk => {
  console.log(`${chunk.name} (${chunk.chunkType}) - ${chunk.lineCount} lines`);
});
```

### Filter by Context

```typescript
// Find all methods in a specific class
const chunks = await chunkRepository.findByFileId(fileId);
const authMethods = chunks.filter(chunk =>
  chunk.context.className === 'AuthService' &&
  chunk.chunkType === ChunkType.Method
);
```

### Monitor Large Chunks

```bash
# Find functions/methods over 5,000 lines
code-index chunks --min-lines 5000

# These trigger warnings during indexing
```

## Performance

### Indexing Performance
- **Target**: 10,000 functions per minute
- **Memory**: <200MB for 100,000 functions
- **Incremental**: 10x faster than full reindex

### Query Performance
- **Target**: <100ms for codebases up to 1 million chunks
- **Indexes**: Optimized for type, language, file, hash queries
- **Full-text search**: FTS5 index for fast content search

## Best Practices

### 1. Run Incremental Updates

```bash
# Only rechunk changed files
code-index refresh --with-chunks
```

### 2. Filter Queries

```bash
# Narrow down by type and language for faster results
code-index search "payment" --chunks --type method --language typescript
```

### 3. Monitor Warnings

Watch for large chunk warnings (>5,000 lines) which may indicate refactoring opportunities:

```bash
code-index chunks --min-lines 5000 --output json
```

### 4. Use Chunk Hashes for Deduplication

Identical functions across files share the same chunk hash:

```bash
# Find duplicate functions
code-index chunks --group-by hash | grep "count > 1"
```

## Limitations

### Nested Functions
Inner functions are included in their parent chunk, not separate:

```python
def outer():
    def inner():  # Included in 'outer' chunk
        pass
```

### Anonymous Functions
Lambda/arrow functions without names are not chunked separately:

```typescript
const handlers = [
  (x) => x * 2,  // Part of module chunk
  (x) => x + 1   // Part of module chunk
];
```

### Malformed Code
Syntax errors may prevent chunking:

```bash
# Check for parsing errors
code-index doctor --check-parseable
```

## Troubleshooting

### No Chunks Generated

**Symptom**: `code-index chunks` returns empty
**Solution**: Ensure files are indexed with `--with-chunks` flag

```bash
code-index index --with-chunks
```

### Unexpected Chunk Boundaries

**Symptom**: Inner functions appear as separate chunks
**Solution**: This indicates a bug - inner functions should be included in parent. Report issue with example.

### Chunk ID Instability

**Symptom**: Chunk hash changes when only whitespace modified
**Solution**: This indicates a bug in normalization. Report with example showing whitespace-only change.

### Performance Issues

**Symptom**: Chunking takes too long
**Solution**: Check for extremely large functions (>10,000 lines)

```bash
# Find problem files
code-index chunks --min-lines 10000
```

## FAQ

**Q: Can I chunk other languages besides TS/JS/Python?**
A: Not currently. Tree-sitter parsers exist for many languages, but chunk extraction logic is language-specific.

**Q: Are chunks stored separately from files in the database?**
A: Yes. Chunks have their own table with foreign keys to files. Deleting a file cascades to its chunks.

**Q: Can I search chunk documentation only?**
A: Yes, use FTS query with field specifier: `code-index search "documentation:authentication" --chunks`

**Q: What happens to chunks when I rename a function?**
A: New chunk created with new name. Old chunk deleted. Chunk hash changes because name is part of content.

**Q: Do comments inside functions affect chunk hash?**
A: Yes. Only leading documentation comments are normalized separately. Inline comments are part of content.

**Q: Can I export chunks as JSON?**
A: Yes: `code-index chunks --output json > chunks.json`

## Next Steps

- **Query Language**: Learn advanced search syntax in [Search Guide](./search-guide.md)
- **API Reference**: See [Chunker API](./contracts/chunker-api.ts) for programmatic access
- **Performance Tuning**: Read [Performance Guide](./performance.md) for optimization tips

## Support

- **Issues**: Report bugs at https://github.com/squirrelogic/code-index/issues
- **Discussions**: Ask questions at https://github.com/squirrelogic/code-index/discussions
- **Documentation**: Full docs at https://docs.code-index.dev

