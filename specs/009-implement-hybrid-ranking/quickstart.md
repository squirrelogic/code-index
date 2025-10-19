# Quickstart: Hybrid Search Ranking

**Feature**: 009-implement-hybrid-ranking
**Audience**: Developers using code-index CLI
**Prerequisites**: code-index installed, repository indexed with both FTS5 and vector embeddings

## What is Hybrid Search?

Hybrid search combines two complementary search techniques:

1. **Lexical Search** (BM25): Finds exact keyword matches using traditional full-text search
2. **Vector Search**: Finds semantically similar code using embedding vectors and cosine similarity

By fusing results from both approaches, hybrid search delivers more relevant results than either technique alone.

## Quick Start

### Basic Hybrid Search

```bash
# Enable hybrid ranking with --hybrid flag
code-index search --hybrid "parse JSON data"
```

**Output**:
```
Searching for: "parse JSON data"
Found 42 results in 285ms

[Score: 0.487] src/services/parser.ts:145
  Lexical: 0.250 (#3), Vector: 0.220 (#5), Tie: +0.017
  function parseJSON(data: string): Result<JSONValue, ParseError> {

[Score: 0.412] src/lib/json-utils.ts:89
  Lexical: 0.180 (#7), Vector: 0.210 (#6), Tie: +0.022
  export function deserializeJSON<T>(input: string): T {

[Score: 0.385] src/models/data-parser.ts:203
  Lexical: 0.230 (#4), Vector: 0.145 (#12), Tie: +0.010
  class JSONDataParser implements DataParser {
```

**What just happened?**
- The system searched for both exact keyword matches ("parse", "JSON") and semantically similar code
- Results were ranked using Reciprocal Rank Fusion (RRF) to combine both signals
- Path diversification ensured results from multiple files
- Scores show the contribution from each ranking component

---

## Common Use Cases

### 1. Natural Language Queries

Hybrid search excels at understanding natural language descriptions:

```bash
code-index search --hybrid "find all functions that validate user input"
```

- Lexical search finds exact matches for "validate", "user", "input"
- Vector search understands the intent and finds related validation code
- Combined ranking surfaces the most relevant validation functions

### 2. Semantic Code Discovery

Find code that's conceptually similar, even without keyword matches:

```bash
code-index search --hybrid "authentication middleware"
```

Results may include:
- Functions with "authenticate" or "authorization" in their names (lexical)
- Middleware implementations even without "auth" keywords (vector)
- Session management and security-related code (semantic similarity)

### 3. API and Library Usage

Discover how APIs are used across your codebase:

```bash
code-index search --hybrid "database transaction handling"
```

Finds:
- Exact usages of database transaction APIs (lexical)
- Error handling patterns around database operations (semantic)
- Related data persistence code (vector similarity)

---

## Configuration and Tuning

### Default Weights

By default, hybrid search uses these fusion weights:
- **α (alpha) = 0.5**: Lexical search weight
- **β (beta) = 0.4**: Vector search weight
- **γ (gamma) = 0.1**: Tie-breaker weight

### Adjusting Weights for Your Query

#### Favor Exact Matches

When you need precise keyword matching:

```bash
code-index search --hybrid --alpha 0.7 --beta 0.3 "calculate total price"
```

- Increases lexical weight to prioritize exact keyword matches
- Useful for finding specific function or variable names

#### Favor Semantic Similarity

When you want conceptually related code:

```bash
code-index search --hybrid --alpha 0.3 --beta 0.7 "error handling patterns"
```

- Increases vector weight to prioritize semantic matches
- Useful for exploring architectural patterns and concepts

### Persistent Configuration

Create `.codeindex/ranking-config.json` to set custom defaults:

```json
{
  "version": "1.0",
  "fusion": {
    "alpha": 0.6,
    "beta": 0.35,
    "gamma": 0.05,
    "rrfK": 60
  },
  "diversification": {
    "enabled": true,
    "lambda": 0.7,
    "maxPerFile": 3
  }
}
```

Configuration hot-reloads automatically when the file changes.

---

## Advanced Features

### Lexical-Only or Vector-Only Search

Compare hybrid results with single-component search:

```bash
# Only lexical (BM25)
code-index search --hybrid --lexical-only "parse JSON"

# Only vector (semantic)
code-index search --hybrid --vector-only "parse JSON"

# Hybrid (both)
code-index search --hybrid "parse JSON"
```

### Detailed Score Breakdown

Understand why results are ranked the way they are:

```bash
code-index search --hybrid --explain "authentication"
```

**Output**:
```
[Score: 0.487] src/auth/middleware.ts:145
  Lexical contribution: 0.250 (rank #3, BM25 score: 12.45)
  Vector contribution: 0.220 (rank #5, cosine: 0.856)
  Tie-breaker: +0.017 (symbol: function, path: src/, lang match)
  Diversification: no penalty (first result from this file)

  function authenticateRequest(req: Request): Promise<AuthResult> {
```

### Filtering Results

Combine hybrid search with filters:

```bash
# Search only TypeScript files
code-index search --hybrid --language typescript "async function"

# Search specific directories
code-index search --hybrid --include "src/**/*.ts" --exclude "**/*.test.ts" "database query"

# Multiple language filters
code-index search --hybrid --language typescript --language javascript "react component"
```

### Disable Diversification

When you want all results from a single file:

```bash
code-index search --hybrid --no-diversification "helper functions"
```

Normally, hybrid search limits results from any single file to 3 (in top-10). This flag removes that limit.

---

## Understanding Results

### Score Components

Each result shows three score components:

1. **Lexical**: Contribution from BM25 full-text search
   - Shows original rank from lexical search (e.g., "#3")
   - Higher score means better keyword match

2. **Vector**: Contribution from semantic similarity
   - Shows original rank from vector search (e.g., "#5")
   - Higher score means more semantically similar

3. **Tie-breaker**: Small adjustment for close matches
   - Based on symbol type (functions > variables > comments)
   - Path priority (src/ > lib/ > test/)
   - Language matching and identifier matches

### Interpreting Scores

- **Scores are relative**: Compare scores within a result set, not across different queries
- **Higher = more relevant**: Results are sorted by final score descending
- **Score ≠ percentage**: Scores are unbounded RRF values, not percentages

### Performance Metrics

Hybrid search displays timing information:

```
Found 42 results in 285ms
  Lexical: 95ms (200 candidates)
  Vector: 142ms (200 candidates)
  Ranking: 48ms (7 unique candidates)
```

- **Total time**: Should be <300ms for medium repositories (per SLA)
- **Component timing**: Shows which search method is slowest
- **Candidates**: Number of results from each component before fusion

---

## JSON Output for Automation

Use `--json` flag for machine-readable output:

```bash
code-index search --hybrid --json "error handling" > results.json
```

**Output structure**:
```json
{
  "query": "error handling",
  "totalFound": 42,
  "results": [
    {
      "filePath": "src/services/parser.ts",
      "lineNumber": 145,
      "snippet": "...",
      "finalScore": 0.487,
      "scoreBreakdown": {
        "lexicalContribution": 0.250,
        "vectorContribution": 0.220,
        "tieBreakerContribution": 0.017
      }
    }
  ],
  "metrics": {
    "totalTimeMs": 285,
    "lexicalSearchTimeMs": 95,
    "vectorSearchTimeMs": 142,
    "slaViolation": false
  }
}
```

### Example: Pipe to jq

```bash
# Get just file paths
code-index search --hybrid --json "query" | jq -r '.results[].filePath'

# Get top result with score
code-index search --hybrid --json "query" | jq '.results[0] | {path: .filePath, score: .finalScore}'

# Count results by language
code-index search --hybrid --json "query" | jq '.results | group_by(.language) | map({language: .[0].language, count: length})'
```

---

## Troubleshooting

### "Vector index not available"

**Problem**: Hybrid search requires both lexical and vector indices.

**Solution**:
```bash
# Check index status
code-index doctor

# Rebuild vector embeddings if needed
code-index index --vectors
```

**Workaround**: Use `--lexical-only` flag to search without vectors.

### Slow Queries (>300ms)

**Problem**: Search exceeds SLA timeout.

**Possible causes**:
- Very large repository (>100k files)
- Complex query requiring many candidates
- System resource constraints

**Solutions**:
1. Reduce candidate limit in configuration:
   ```json
   {
     "performance": {
       "candidateLimit": 100
     }
   }
   ```

2. Use more specific queries (fewer matches = faster)
3. Filter by language or file patterns to reduce search space

**Note**: System returns partial results with warning when timeout exceeded (per FR-020).

### "Weight sum exceeds 1.0"

**Problem**: Custom weights don't validate.

**Example**:
```bash
code-index search --hybrid --alpha 0.6 --beta 0.5 --gamma 0.1 "query"
# Error: Weight sum (1.2) exceeds maximum (1.0)
```

**Solution**: Ensure `alpha + beta + gamma ≤ 1.0`:
```bash
code-index search --hybrid --alpha 0.5 --beta 0.4 --gamma 0.1 "query"
```

### Extreme Weight Warning

**Situation**: Using α=0 or β=0.

```bash
code-index search --hybrid --alpha 0 --beta 1.0 "query"
# Warning: Extreme weights detected (alpha=0). This disables lexical search.
```

**Explanation**: This is intentional for testing, but note you're effectively doing vector-only search. Use `--vector-only` flag instead for clarity.

---

## Tips and Best Practices

### 1. Start with Default Weights

Don't tune weights until you understand how default hybrid search works:
```bash
code-index search --hybrid "your query"
```

### 2. Use --explain to Understand Rankings

Before adjusting weights, see which component dominates:
```bash
code-index search --hybrid --explain "your query"
```

If lexical ranks are consistently better, increase `--alpha`.
If vector ranks are consistently better, increase `--beta`.

### 3. Natural Language Works Best with Higher Beta

For descriptive queries, favor vector search:
```bash
code-index search --hybrid --beta 0.6 "functions that handle user authentication"
```

### 4. Exact Names Work Best with Higher Alpha

For specific identifiers, favor lexical search:
```bash
code-index search --hybrid --alpha 0.7 "getUserById"
```

### 5. Compare Single-Component Results

Understand what each component contributes:
```bash
code-index search --hybrid --lexical-only "query"
code-index search --hybrid --vector-only "query"
code-index search --hybrid "query"  # See how fusion improves results
```

### 6. Use Filters to Narrow Search Scope

Combine hybrid ranking with filters for precision:
```bash
code-index search --hybrid \
  --language typescript \
  --include "src/**/*.ts" \
  --exclude "**/*.test.ts" \
  "database transactions"
```

### 7. Save Common Configurations

Create project-specific configurations in `.codeindex/ranking-config.json`:

```json
{
  "version": "1.0",
  "fusion": {
    "alpha": 0.6,    // Your codebase favors exact matches
    "beta": 0.35,
    "gamma": 0.05
  }
}
```

### 8. Monitor Performance

Watch timing metrics to ensure SLA compliance:
```bash
code-index search --hybrid "query"
# Look for "Found N results in Xms" - should be <300ms
```

If consistently slow:
- Reduce `candidateLimit` in config
- Use file filters to narrow search space
- Consider indexing strategy (exclude generated files)

---

## Examples by Use Case

### Finding Security Vulnerabilities

```bash
code-index search --hybrid "SQL injection prevention"
code-index search --hybrid "XSS sanitization"
code-index search --hybrid "authentication bypass"
```

### Refactoring and Code Cleanup

```bash
code-index search --hybrid "deprecated API usage"
code-index search --hybrid "TODO comments"
code-index search --hybrid "error handling anti-patterns"
```

### Learning Codebase Patterns

```bash
code-index search --hybrid "dependency injection examples"
code-index search --hybrid "factory pattern implementation"
code-index search --hybrid "async error handling"
```

### API Documentation Generation

```bash
code-index search --hybrid --json "public API endpoints" | \
  jq -r '.results[] | {path: .filePath, symbol: .symbolName}' | \
  # Process for documentation
```

---

## Next Steps

1. **Try basic hybrid search** on your codebase
2. **Compare with lexical-only** to see the improvement
3. **Use --explain** to understand score components
4. **Experiment with weights** to optimize for your queries
5. **Create a config file** for persistent tuning

For more information:
- See `data-model.md` for technical details on ranking algorithms
- See `research.md` for rationale behind design decisions
- See `contracts/hybrid-search-cli.yaml` for complete CLI specification

---

## FAQ

**Q: When should I use hybrid vs. regular search?**

A: Use hybrid search when:
- Query is natural language or conceptual ("find authentication code")
- You want results beyond exact keyword matches
- You're exploring unfamiliar code
- You need semantic similarity (finding related code)

Use regular lexical search when:
- Query is a specific identifier or symbol name
- You want only exact matches
- Speed is critical (lexical is faster)

**Q: Why are scores sometimes >1.0?**

A: RRF scores are unbounded. They're relative within a result set, not absolute percentages. Compare scores within results, not across different queries.

**Q: Can I use hybrid search without vector embeddings?**

A: Yes - the system falls back to lexical-only search automatically if vector index is unavailable. You'll see a warning message.

**Q: How much slower is hybrid vs. lexical search?**

A: Hybrid search targets <300ms (same as lexical-only). The parallel retrieval and efficient fusion keep overhead low (~50-100ms additional).

**Q: Do weight changes take effect immediately?**

A: Yes - both CLI flag overrides (`--alpha`, `--beta`) and config file changes apply immediately without restart (per FR-010).

**Q: What's the difference between --vector-only and high --beta?**

A: `--vector-only` disables lexical search entirely. High `--beta` (e.g., 0.7) still considers lexical results but weights vector higher. For pure semantic search, use `--vector-only`.
