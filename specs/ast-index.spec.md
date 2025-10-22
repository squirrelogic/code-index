# AST-Based Code Index Specification

## Overview

This specification defines a hybrid AST-based code indexing system that combines:
- **Dense semantic search** (optional ONNX embeddings with hash-based fallback)
- **Sparse lexical search** (character n-gram hashing)
- **Symbol indexing** (exact, prefix, substring, fuzzy matching via k-grams)
- **Static call graph** (caller/callee relationships extracted from AST)
- **Portable persistence** (file-based storage with no external database dependencies)

## Goals

1. **Offline-first**: No network dependencies for core functionality
2. **Fast symbol lookup**: Sub-millisecond exact/prefix/substring symbol search
3. **Hybrid ranking**: Combine semantic and lexical signals for code search
4. **Call graph navigation**: Query "who calls this function" and "what does this call"
5. **Incremental updates**: Support efficient re-indexing of changed files
6. **Portable storage**: Simple file-based persistence that works across systems

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Index TypeScript/JavaScript AST documents | MUST |
| FR-002 | Support hybrid dense + sparse search | MUST |
| FR-003 | Enable exact symbol name lookup | MUST |
| FR-004 | Enable prefix-based symbol search | MUST |
| FR-005 | Enable substring/partial symbol search via k-grams | MUST |
| FR-006 | Enable fuzzy symbol search with edit distance | MUST |
| FR-007 | Track function call relationships (callers/callees) | MUST |
| FR-008 | Persist index to disk in portable format | MUST |
| FR-009 | Load index from disk without rebuild | MUST |
| FR-010 | Support optional ONNX embedding models | SHOULD |
| FR-011 | Provide hash-based embedding fallback | MUST |
| FR-012 | Extract canonical text from AST structures | MUST |

### Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-001 | Symbol exact match latency | < 1ms |
| NFR-002 | Symbol prefix search latency | < 5ms |
| NFR-003 | Symbol substring search latency | < 10ms |
| NFR-004 | Hybrid search response time | < 100ms |
| NFR-005 | Index build throughput | > 100 files/sec |
| NFR-006 | Memory overhead per file | < 50KB |
| NFR-007 | Disk storage overhead | < 2x source size |

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────┐
│                     HybridWithSymbols                    │
├─────────────────────────────────────────────────────────┤
│  ┌───────────────────┐      ┌────────────────────────┐ │
│  │   HybridIndex     │      │    SymbolIndex         │ │
│  │                   │      │                        │ │
│  │ - Dense vectors   │      │ - Exact map            │ │
│  │ - Sparse vectors  │      │ - Prefix trie          │ │
│  │ - Text corpus     │      │ - K-gram posting lists │ │
│  │                   │      │ - Call graph edges     │ │
│  └───────────────────┘      └────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
            ┌──────────────────────┐
            │    IndexStore         │
            │                       │
            │ - meta.json           │
            │ - dense.f32           │
            │ - sparse.csr          │
            │ - texts.jsonl         │
            └──────────────────────┘
```

### Data Flow

1. **Indexing**:
   ```
   AST → astToText() → Text
                     ├─→ Dense Embedder → Float32Array
                     └─→ N-gram Hasher → SparseVector

   AST → Symbol Extractor → SymbolIndex
                          ├─→ Exact Map
                          ├─→ Prefix Trie
                          ├─→ K-gram Index
                          └─→ Call Graph
   ```

2. **Search**:
   ```
   Query → Dense Embedder ──┐
                            ├──→ Hybrid Scorer → Ranked Results
   Query → N-gram Hasher ───┘

   Symbol Query → SymbolIndex → Filtered Results
                              ├─→ exact()
                              ├─→ prefix()
                              ├─→ substring() (k-gram)
                              └─→ fuzzy() (Levenshtein)
   ```

## Data Models

### AST Document Schema

```typescript
type ASTDoc = {
  // File metadata
  file: string;
  mtimeMs?: number;
  bytes?: number;
  language?: string;

  // Module structure
  imports?: string[];
  exports?: string[];

  // Type definitions
  type_aliases?: Record<string, {
    type: string;
    line?: number;
    doc?: string | null;
  }>;

  interfaces?: Record<string, {
    line?: number;
    doc?: string | null;
    extends?: string[];
    properties?: Record<string, {
      type: string;
      optional?: boolean;
      line?: number;
    }>;
    methods?: Record<string, unknown>;
  }>;

  // Code structures
  functions?: Record<string, {
    signature: string;
    doc?: string | null;
    decorators?: string[];
    calls?: string[];      // Callees
    called_by?: string[];  // Callers
    line?: number;
  }>;

  classes?: Record<string, {
    inherits?: string[];
    implements?: string[];
    doc?: string | null;
    abstract?: boolean;
    methods?: Record<string, {
      signature: string;
      doc?: string | null;
      decorators?: string[];
      static?: boolean;
      abstract?: boolean;
      private?: boolean;
      line?: number;
    }>;
    properties?: Record<string, unknown>;
    class_constants?: Record<string, unknown>;
    line?: number;
  }>;

  components?: Record<string, {
    signature: string;
    doc?: string | null;
    line?: number;
    calls?: string[];
    called_by?: string[];
  }>;

  enums?: Record<string, {
    values: string[];
    line?: number;
    doc?: string | null;
  }>;

  constants?: Record<string, {
    type?: string;
    value: string;
    line?: number;
  }>;
};
```

### Index Item

```typescript
type IndexItem = {
  id: string;              // Unique document identifier
  ast: ASTDoc;             // Parsed AST structure
  text?: string;           // Canonical text representation
  dense?: Float32Array;    // Dense embedding vector
  sparse?: SparseVector;   // Sparse n-gram vector
};
```

### Sparse Vector

```typescript
type SparseVector = Map<number, number>;  // feature_index → count
```

### Symbol Entry

```typescript
type SymbolEntry = {
  id: string;      // Document ID containing this symbol
  symbol: string;  // Symbol name
  kind: string;    // Symbol type (function, class, interface, etc.)
  line?: number;   // Line number in source file
};
```

## Core Components

### 1. Text Extraction

**Purpose**: Convert AST structures to canonical text for search and embedding.

**Algorithm**:
```typescript
function astToText(ast: ASTDoc): string {
  const separator = ' ⏐ ';
  const parts: string[] = [];

  // File metadata
  parts.push(`file:${ast.file}`);
  if (ast.language) parts.push(`lang:${ast.language}`);

  // Exports
  if (ast.exports?.length) {
    parts.push(`exports:${ast.exports.join(' , ')}`);
  }

  // Type aliases
  for (const [name, def] of Object.entries(ast.type_aliases ?? {})) {
    parts.push(`type ${name} := ${def.type}`);
  }

  // Interfaces
  for (const [name, def] of Object.entries(ast.interfaces ?? {})) {
    const props = Object.entries(def.properties ?? {})
      .map(([pn, pd]) => `${pn}:${pd.type}${pd.optional ? '?' : ''}`)
      .join(' ; ');
    const ext = def.extends?.length ? def.extends.join(',') : '∅';
    parts.push(`interface ${name} extends ${ext} { ${props} }`);
  }

  // Functions
  for (const [name, def] of Object.entries(ast.functions ?? {})) {
    const calls = def.calls?.length ? def.calls.join(',') : '';
    parts.push(`fn ${name}${def.signature} calls[${calls}]`);
  }

  // Classes
  for (const [name, def] of Object.entries(ast.classes ?? {})) {
    const impl = def.implements?.length ? def.implements.join(',') : '∅';
    const methods = Object.entries(def.methods ?? {})
      .map(([mn, md]) => `${mn}${md.signature}`)
      .join(' ; ');
    parts.push(`class ${name} implements ${impl} :: ${methods}`);
  }

  // Components
  for (const [name, def] of Object.entries(ast.components ?? {})) {
    parts.push(`component ${name}${def.signature}`);
  }

  // Enums
  for (const [name, def] of Object.entries(ast.enums ?? {})) {
    parts.push(`enum ${name} = [${def.values.join(', ')}]`);
  }

  // Constants
  for (const [name, def] of Object.entries(ast.constants ?? {})) {
    parts.push(`const ${name}=${def.value}`);
  }

  return parts.join(separator);
}
```

**Output Format**:
```
file:example.ts ⏐ lang:typescript ⏐ exports:createUser , UserModel ⏐ type UserID := string ⏐ interface User extends BaseUser { name:string ; email:string } ⏐ fn createUser(name, email):Promise<UserModel> calls[generateId,saveToDatabase] ⏐ class UserModel implements User :: validate() ; save()
```

### 2. Sparse N-gram Indexing

**Purpose**: Enable substring/partial matching via character-level n-grams.

**Configuration**:
- `ngramMin`: 3 (minimum n-gram size)
- `ngramMax`: 5 (maximum n-gram size)
- `nFeatures`: 262,144 (2^18 hash buckets)

**Algorithm**:
```typescript
function ngramSparse(
  text: string,
  opts: { ngramMin: number; ngramMax: number; nFeatures: number }
): SparseVector {
  const { ngramMin, ngramMax, nFeatures } = opts;

  // Split camelCase for better matching
  const cleaned = camelSplit(text);

  const sparse: SparseVector = new Map();

  // Generate n-grams of varying sizes
  for (let n = ngramMin; n <= ngramMax; n++) {
    for (let i = 0; i + n <= cleaned.length; i++) {
      const gram = cleaned.slice(i, i + n);
      const hashIdx = fnv1a32(gram) % nFeatures;
      sparse.set(hashIdx, (sparse.get(hashIdx) || 0) + 1);
    }
  }

  return sparse;
}

function camelSplit(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function fnv1a32(str: string): number {
  let hash = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
```

**Similarity Scoring**:
```typescript
function sparseCosine(a: SparseVector, b: SparseVector): number {
  const dotProduct = sparseDot(a, b);
  const denom = sparseNorm(a) * sparseNorm(b);
  return denom === 0 ? 0 : dotProduct / denom;
}
```

### 3. Dense Embeddings

**Purpose**: Capture semantic similarity for natural language queries.

**Embedder Interface**:
```typescript
interface DenseEmbedder {
  init(): Promise<void> | void;
  embed(texts: string[]): Promise<Float32Array[]> | Float32Array[];
  dim: number;  // Embedding dimension
}
```

**Hash-Based Fallback** (default, no dependencies):
```typescript
class FastHashEmbedder implements DenseEmbedder {
  dim: number;  // Default: 384

  embed(texts: string[]): Float32Array[] {
    return texts.map(text => {
      const vector = new Float32Array(this.dim);
      const tokens = text.toLowerCase().match(/[a-z0-9_]+|[^\s]/g) || [];

      // Hash tokens to dimensions
      for (const token of tokens) {
        const idx = fnv1a32(token) % this.dim;
        vector[idx] += 1;
      }

      // L2 normalization
      const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }

      return vector;
    });
  }
}
```

**ONNX Embedder** (optional, requires `onnxruntime-node`):
```typescript
class OrtEmbedder implements DenseEmbedder {
  dim: number;
  private session: InferenceSession;

  constructor(opts: {
    modelPath: string;
    inputName: string;
    outputName: string;
  }) {
    this.dim = 384;  // Will be updated based on model output
    // ... initialization
  }

  async init(): Promise<void> {
    const ort = require('onnxruntime-node');
    this.session = await ort.InferenceSession.create(
      this.opts.modelPath,
      { executionProviders: ['cpuExecutionProvider'] }
    );
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    // Run inference for each text
    // Apply L2 normalization
    // Return normalized vectors
  }
}
```

**Similarity Scoring**:
```typescript
function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  const n = Math.min(a.length, b.length);

  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
```

### 4. Hybrid Ranking

**Purpose**: Combine dense semantic and sparse lexical scores.

**Weighting Strategy**:
- Default: 60% dense, 40% sparse
- Code-pattern queries: +15% sparse weight
  - Detects: braces, semicolons, camelCase, file extensions, function calls

**Algorithm**:
```typescript
async function search(query: string, k: number = 10) {
  // Generate query vectors
  const sparseVec = ngramSparse(query, { ngramMin, ngramMax, nFeatures });
  let denseVec: Float32Array | undefined;
  if (embedder) {
    denseVec = (await embedder.embed([query]))[0];
  }

  // Detect code patterns
  const isCodeQuery = /[{}();.:<>]|\b[A-Z][a-zA-Z0-9_]*\b|\w+\(\)|\.(ts|js|tsx|jsx)\b/.test(query);

  // Adjust weights
  const wSparse = isCodeQuery ? sparseWeight + 0.15 : sparseWeight;
  const wDense = Math.max(0, 1 - wSparse);

  // Score all items
  const scored = items.map(item => {
    const sSparse = item.sparse ? sparseCosine(sparseVec, item.sparse) : 0;
    const sDense = item.dense && denseVec ? cosine(denseVec, item.dense) : 0;

    return {
      id: item.id,
      file: item.ast.file,
      score: wDense * sDense + wSparse * sSparse
    };
  });

  // Return top-k
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
```

### 5. Symbol Index

**Purpose**: Fast exact, prefix, substring, and fuzzy symbol lookup.

**Data Structures**:
1. **Exact Map**: `Map<symbol_name, SymbolEntry[]>`
2. **Prefix Trie**: `Map<prefix, Set<symbol_name>>`
3. **K-gram Index**: Posting lists for 3-grams
4. **Call Graph**: `Map<callee, Set<caller>>` and `Map<caller, Set<callee>>`

**Symbol Extraction**:
```typescript
function addFromAST(docId: string, ast: ASTDoc): void {
  // Extract functions
  for (const [name, def] of Object.entries(ast.functions ?? {})) {
    addSymbol(name, 'function', def.line);

    // Build call graph
    for (const callee of def.calls ?? []) {
      callersMap.get(callee).add(name);  // callee → callers
      calleesMap.get(name).add(callee);  // caller → callees
    }
  }

  // Extract classes, interfaces, types, enums, constants, components...
  // Each with appropriate kind label
}

function addSymbol(symbol: string, kind: string, line?: number): void {
  // 1. Add to exact map
  exactMap.set(symbol, [...entries, { id, symbol, kind, line }]);

  // 2. Add to prefix trie
  const lower = symbol.toLowerCase();
  for (let i = 1; i <= lower.length; i++) {
    const prefix = lower.slice(0, i);
    prefixMap.get(prefix).add(symbol);
  }

  // 3. Add to k-gram index
  kgramIndex.add(symbol);

  // 4. Add tokenized variants (for camelCase)
  for (const token of tokenizeIdent(symbol)) {
    kgramIndex.add(token);
  }
}
```

**Identifier Tokenization**:
```typescript
function tokenizeIdent(name: string): string[] {
  // Original name
  const parts: string[] = [name];

  // Split camelCase and snake_case
  const spaced = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ');

  parts.push(...spaced.split(/\s+/).filter(Boolean));

  // Return unique lowercased tokens
  return [...new Set(parts.map(p => p.toLowerCase()))];
}
```

### 6. K-gram Filtering

**Purpose**: Efficiently filter symbol candidates for substring/fuzzy search.

**Algorithm**:
```typescript
class KGramIndex {
  k: number = 3;
  postings: Map<string, Set<string>> = new Map();

  add(term: string): void {
    for (const gram of this.kgrams(term.toLowerCase())) {
      if (!this.postings.has(gram)) {
        this.postings.set(gram, new Set());
      }
      this.postings.get(gram)!.add(term);
    }
  }

  candidates(fragment: string): Set<string> {
    const grams = this.kgrams(fragment.toLowerCase());
    if (grams.length === 0) return new Set();

    // Intersect posting lists
    let result: Set<string> | null = null;
    for (const gram of grams) {
      const postingList = this.postings.get(gram);
      if (!postingList) return new Set();  // No matches

      result = result
        ? intersectSets(result, postingList)
        : new Set(postingList);

      if (result.size === 0) return result;  // Early exit
    }

    return result ?? new Set();
  }

  private kgrams(s: string): string[] {
    if (s.length < this.k) return [];

    const grams: string[] = [];
    for (let i = 0; i + this.k <= s.length; i++) {
      grams.push(s.slice(i, i + this.k));
    }
    return grams;
  }
}
```

### 7. Fuzzy Matching

**Purpose**: Find symbols with small edit distances (typos, variants).

**Algorithm**: Bounded Levenshtein distance
```typescript
function levenshteinBounded(
  a: string,
  b: string,
  maxDist: number
): number {
  // Early exits
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;

  const m = a.length, n = b.length;
  const prev = new Uint16Array(n + 1);
  const curr = new Uint16Array(n + 1);

  // Initialize
  for (let j = 0; j <= n; j++) prev[j] = j;

  // Dynamic programming
  for (let i = 1; i <= m; i++) {
    curr[0] = i;

    // Diagonal band optimization
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

    // Prune if all values exceed maxDist
    if (rowMin > maxDist) return maxDist + 1;

    // Swap buffers
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}
```

## API Design

### HybridIndex

```typescript
class HybridIndex {
  constructor(opts: {
    denseWeight?: number;   // Default: 0.6
    sparseWeight?: number;  // Default: 0.4
    ngramMin?: number;      // Default: 3
    ngramMax?: number;      // Default: 5
    nFeatures?: number;     // Default: 262144
  });

  // Set embedding model
  async setDenseEmbedder(embedder: DenseEmbedder): Promise<void>;

  // Add document
  add(item: { id: string; ast: ASTDoc }): void;

  // Build index
  async build(): Promise<void>;

  // Search
  async search(
    query: string,
    k?: number
  ): Promise<Array<{ id: string; score: number; file: string }>>;
}
```

### SymbolIndex

```typescript
class SymbolIndex {
  // Add symbols from AST
  addFromAST(docId: string, ast: ASTDoc): void;

  // Exact match
  exact(symbol: string): SymbolEntry[];

  // Prefix search (e.g., "create" → "createUser", "createOrder")
  prefix(query: string, limit?: number): SymbolEntry[];

  // Substring search (e.g., "User" → "createUser", "UserModel")
  substring(query: string, limit?: number): Array<{
    symbol: string;
    entries: SymbolEntry[];
  }>;

  // Fuzzy search (e.g., "cretUser" → "createUser")
  fuzzy(query: string, maxDist?: number, limit?: number): Array<{
    symbol: string;
    dist: number;
    entries: SymbolEntry[];
  }>;

  // Call graph queries
  callers(symbol: string): string[];   // Who calls this?
  callees(symbol: string): string[];   // What does this call?
}
```

### HybridWithSymbols

```typescript
class HybridWithSymbols extends HybridIndex {
  public symbols: SymbolIndex;

  // Override add to populate symbol index
  add(item: { id: string; ast: ASTDoc }): void;
}
```

### IndexStore

```typescript
class IndexStore {
  constructor(dir?: string);  // Default: './ast_index'

  // Save index to disk
  async save(index: HybridIndex): Promise<void>;

  // Load index from disk
  async loadInto(index: HybridIndex): Promise<void>;
}
```

## Persistence Format

### Directory Structure

```
ast_index/
├── meta.json       # Index metadata
├── dense.f32       # Dense embeddings (raw Float32 array)
├── sparse.csr      # Sparse vectors (CSR format)
└── texts.jsonl     # Canonical text (one per line)
```

### meta.json

```json
{
  "version": 1,
  "dim": 384,
  "nFeatures": 262144,
  "nItems": 1523,
  "ids": [
    "src/index.ts",
    "src/parser.ts",
    "..."
  ]
}
```

**Fields**:
- `version`: Format version (currently 1)
- `dim`: Dense embedding dimension (0 if no dense embeddings)
- `nFeatures`: Sparse vector dimension
- `nItems`: Number of indexed documents
- `ids`: Document identifiers in array order

### dense.f32

**Format**: Raw binary Float32 array
- Size: `nItems × dim × 4 bytes`
- Layout: Row-major (document 0 embedding, document 1 embedding, ...)
- Empty if `dim = 0`

**Example**:
```
[doc0_dim0, doc0_dim1, ..., doc0_dim383,
 doc1_dim0, doc1_dim1, ..., doc1_dim383,
 ...]
```

### sparse.csr

**Format**: Compressed Sparse Row (CSR)
- **indptr**: `Uint32Array[nItems + 1]` - row pointers
- **indices**: `Uint32Array[nnz]` - column indices
- **data**: `Float32Array[nnz]` - values

**Layout**:
```
[indptr bytes] [indices bytes] [data bytes]
```

**Size**:
- indptr: `(nItems + 1) × 4 bytes`
- indices: `nnz × 4 bytes`
- data: `nnz × 4 bytes`

**Example**:
```javascript
// Document 0: { 42: 3.0, 1024: 1.5 }
// Document 1: { 7: 2.0 }

indptr = [0, 2, 3]
indices = [42, 1024, 7]
data = [3.0, 1.5, 2.0]
```

### texts.jsonl

**Format**: JSON Lines (newline-delimited)
- One canonical text per line
- UTF-8 encoding
- No trailing newline at end of file

**Example**:
```
file:src/index.ts ⏐ lang:typescript ⏐ fn main() calls[parseArgs,run]
file:src/parser.ts ⏐ lang:typescript ⏐ fn parseArgs(argv:string[]):Config
```

## Usage Examples

### Basic Indexing

```typescript
import {
  HybridWithSymbols,
  FastHashEmbedder,
  IndexStore,
  ASTDoc
} from './hybrid-ast-index';

// Create index
const index = new HybridWithSymbols({
  denseWeight: 0.6,
  sparseWeight: 0.4,
  ngramMin: 3,
  ngramMax: 5,
  nFeatures: 1 << 18
});

// Set embedder
await index.setDenseEmbedder(new FastHashEmbedder(384));

// Add documents
for (const ast of astDocuments) {
  index.add({ id: ast.file, ast });
}

// Build index
await index.build();
```

### Hybrid Search

```typescript
// Natural language query
const results = await index.search('function that sends email', 10);

// Code pattern query
const results = await index.search('createUser()', 10);

// Type query
const results = await index.search('interface User extends', 10);
```

**Result Format**:
```typescript
[
  { id: 'src/email.ts', score: 0.87, file: 'src/email.ts' },
  { id: 'src/user.ts', score: 0.72, file: 'src/user.ts' },
  // ...
]
```

### Symbol Lookup

```typescript
// Exact match
const entries = index.symbols.exact('createUser');
// → [{ id: 'src/user.ts', symbol: 'createUser', kind: 'function', line: 42 }]

// Prefix search
const entries = index.symbols.prefix('create', 10);
// → [{ symbol: 'createUser', ... }, { symbol: 'createOrder', ... }]

// Substring search
const results = index.symbols.substring('User', 10);
// → [
//     { symbol: 'createUser', entries: [...] },
//     { symbol: 'UserModel', entries: [...] }
//   ]

// Fuzzy search
const results = index.symbols.fuzzy('cretUser', 2, 10);
// → [{ symbol: 'createUser', dist: 1, entries: [...] }]
```

### Call Graph Navigation

```typescript
// Find who calls a function
const callers = index.symbols.callers('sendWelcomeEmail');
// → ['createUser', 'onUserSignup']

// Find what a function calls
const callees = index.symbols.callees('createUser');
// → ['generateId', 'UserModel', 'saveToDatabase', 'sendWelcomeEmail']
```

### Persistence

```typescript
// Save to disk
const store = new IndexStore('./ast_index');
await store.save(index);

// Load from disk
const loadedIndex = new HybridWithSymbols({});
await store.loadInto(loadedIndex);

// Index is ready to use (no rebuild needed)
const results = await loadedIndex.search('query', 10);
```

### ONNX Embeddings (Optional)

```typescript
import { OrtEmbedder } from './hybrid-ast-index';

// Create ONNX embedder
const embedder = new OrtEmbedder({
  modelPath: './models/all-MiniLM-L6-v2.onnx',
  inputName: 'input_ids',
  outputName: 'embeddings'
});

// Use with index
const index = new HybridWithSymbols({});
await index.setDenseEmbedder(embedder);
```

## Performance Characteristics

### Time Complexity

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Symbol exact match | O(1) | Hash map lookup |
| Symbol prefix search | O(k + m) | k = prefix length, m = matches |
| Symbol substring search | O(g × p + m log m) | g = k-grams, p = posting list size |
| Symbol fuzzy search | O(c × n × m) | c = candidates, n,m = string lengths |
| Hybrid search | O(N × (d + s)) | N = docs, d = dense dim, s = sparse dim |
| Index build | O(N × (T + d)) | T = text length, d = embedding dim |
| Call graph query | O(1) | Hash map lookup |

### Space Complexity

| Component | Space | Notes |
|-----------|-------|-------|
| Dense vectors | O(N × d × 4) bytes | d = dimension (typically 384) |
| Sparse vectors | O(N × nnz × 8) bytes | nnz = non-zero features (~200-500) |
| Symbol exact map | O(S × L) | S = symbols, L = avg name length |
| Symbol prefix trie | O(S × L²) | Worst case for all prefixes |
| K-gram index | O(S × L × k) | k = k-gram size (3) |
| Call graph | O(E) | E = number of call edges |
| Canonical texts | O(N × T) | T = avg text length (~500-1000) |

**Example for 10,000 files**:
- Dense: 10k × 384 × 4 = 15 MB
- Sparse: 10k × 300 × 8 = 24 MB
- Texts: 10k × 800 = 8 MB
- Symbols: ~2 MB (estimated)
- **Total**: ~50 MB

### Optimization Techniques

1. **Sparse Vector CSR Storage**:
   - Reduces sparse vector memory by 50-70%
   - Enables efficient disk persistence
   - Maintains fast cosine similarity computation

2. **K-gram Candidate Filtering**:
   - Reduces fuzzy search candidates by 90-99%
   - Avoids expensive Levenshtein computation on full corpus
   - Uses early-exit intersection for AND queries

3. **Bounded Levenshtein**:
   - Prunes computation when distance exceeds threshold
   - Uses diagonal band optimization
   - Reduces complexity from O(n×m) to O(k×m) for maxDist=k

4. **Code-Aware Weighting**:
   - Detects code patterns in queries via regex
   - Adjusts sparse/dense balance dynamically
   - Improves ranking for structural queries

5. **Hash-Based Embeddings**:
   - Zero network/disk I/O for fallback mode
   - Instant startup (no model loading)
   - Predictable memory usage
   - 70-80% quality vs learned embeddings

## Integration Points

### AST Parsers

The index accepts `ASTDoc` structures. Integrate with:
- **tree-sitter**: Universal parser for 40+ languages
- **TypeScript Compiler API**: Native TypeScript/JavaScript parsing
- **Babel**: JavaScript/JSX/TypeScript parsing
- **rust-analyzer**: Rust code analysis
- **Roslyn**: C# code analysis

Example tree-sitter integration:
```typescript
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

function parseToAST(source: string, filePath: string): ASTDoc {
  const parser = new Parser();
  parser.setLanguage(TypeScript);
  const tree = parser.parse(source);

  // Extract functions, classes, symbols from tree
  return {
    file: filePath,
    language: 'typescript',
    functions: extractFunctions(tree),
    classes: extractClasses(tree),
    // ...
  };
}
```

### Embedding Models

Compatible ONNX models:
- **all-MiniLM-L6-v2**: 384-dim, 23M params, fast
- **all-mpnet-base-v2**: 768-dim, 110M params, high quality
- **paraphrase-multilingual**: Multilingual support
- **code-search-net**: Code-specific embeddings

Model requirements:
- Input: tokenized text (or raw text if model includes tokenizer)
- Output: Float32 embedding vector
- Must run on CPU (no GPU dependency)

### MCP Server Integration

Expose index via Model Context Protocol:
```typescript
const server = new MCPServer({
  tools: [
    {
      name: 'code-index_search',
      description: 'Search codebase by natural language or code pattern',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', default: 10 }
        }
      }
    },
    {
      name: 'code-index_find_def',
      description: 'Find symbol definition',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string' }
        }
      }
    },
    {
      name: 'code-index_callers',
      description: 'Find who calls a function',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string' }
        }
      }
    }
  ]
});
```

## Future Enhancements

### Incremental Updates

Track file modifications and re-index only changed files:
```typescript
class IncrementalIndex extends HybridWithSymbols {
  private mtimes: Map<string, number> = new Map();

  async update(ast: ASTDoc): Promise<void> {
    const existing = this.items.findIndex(it => it.id === ast.file);

    if (existing !== -1) {
      // Remove old entry
      this.items.splice(existing, 1);
      this.symbols.remove(ast.file);
    }

    // Add new entry
    this.add({ id: ast.file, ast });
    this.mtimes.set(ast.file, ast.mtimeMs ?? Date.now());

    // Incremental rebuild
    await this.buildIncremental();
  }
}
```

### Multi-Language Support

Extend `ASTDoc` schema to support language-specific constructs:
- **Python**: decorators, generators, async functions
- **Java**: annotations, generics, packages
- **Go**: interfaces, goroutines, channels
- **Rust**: traits, lifetimes, macros

### Semantic Code Search

Enhance query understanding:
- Parse code snippets in queries
- Extract structural patterns (e.g., "class that implements X")
- Support negation ("functions that don't call Y")
- Range queries (complexity, size, lines)

### Cross-Repository Search

Federate multiple indexes:
```typescript
class FederatedIndex {
  private indexes: Map<string, HybridWithSymbols> = new Map();

  async search(query: string, k: number): Promise<FederatedResult[]> {
    const results = await Promise.all(
      Array.from(this.indexes.entries()).map(async ([repo, idx]) => ({
        repo,
        results: await idx.search(query, k)
      }))
    );

    // Merge and re-rank
    return mergeResults(results, k);
  }
}
```

### LSP Integration

Provide Language Server Protocol features:
- **Hover**: Show symbol info from index
- **Go to Definition**: Jump to symbol location
- **Find References**: Show all symbol usages
- **Call Hierarchy**: Visualize call graph
- **Symbol Search**: Workspace symbol provider

## Appendix

### Sample AST Document

```json
{
  "file": "src/user.ts",
  "mtimeMs": 1755656615000,
  "bytes": 2257,
  "language": "typescript",
  "imports": [],
  "exports": ["createUser", "UserModel", "Role"],
  "type_aliases": {
    "UserID": { "type": "string", "line": 6 }
  },
  "interfaces": {
    "User": {
      "line": 15,
      "properties": {
        "name": { "type": "string", "optional": false, "line": 16 },
        "email": { "type": "string", "optional": false, "line": 17 }
      }
    }
  },
  "functions": {
    "createUser": {
      "signature": "(name: string, email: string): Promise<UserModel>",
      "doc": "Creates a new user",
      "line": 77,
      "calls": ["generateId", "saveToDatabase", "sendWelcomeEmail"]
    },
    "sendWelcomeEmail": {
      "signature": "(user: UserModel): void",
      "line": 102,
      "calls": ["log"]
    }
  },
  "classes": {
    "UserModel": {
      "implements": ["User"],
      "line": 44,
      "methods": {
        "validate": {
          "signature": "()",
          "doc": "Validate the user model",
          "line": 65
        }
      }
    }
  },
  "enums": {
    "Role": {
      "values": ["ADMIN", "USER", "GUEST"],
      "line": 22
    }
  },
  "constants": {
    "API_VERSION": { "value": "\"1.0.0\"", "line": 29 }
  }
}
```

### Reference Implementation

A complete TypeScript reference implementation is available demonstrating:
- All core algorithms (n-gram hashing, k-gram indexing, Levenshtein)
- Both hash-based and ONNX embedders
- CSR persistence format
- Symbol index with all search modes
- Call graph extraction and query

The implementation is provided as a single-file module (~250 lines) with no external dependencies (except optional `onnxruntime-node`).

### Bibliography

- **N-gram Language Models**: Statistical language modeling for IR
- **FNV-1a Hash**: Fast non-cryptographic hash function
- **CSR Format**: Compressed Sparse Row matrix storage
- **Levenshtein Distance**: Edit distance algorithm
- **K-gram Indexing**: Approximate string matching (Navarro & Baeza-Yates, 1998)
- **ONNX Runtime**: Cross-platform ML inference
- **Sentence Transformers**: Pre-trained embedding models

---

*Version: 1.0*
*Last Updated: 2025-01-21*
