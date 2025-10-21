/**
 * Sparse Vector Service
 *
 * Provides character n-gram based sparse vector generation for hybrid search.
 * Uses FNV-1a hashing to map n-grams to a fixed feature space.
 */

import type { ParseResult } from '../models/ParseResult.js';

/**
 * Sparse vector represented as a map of feature indices to values
 */
export interface SparseVector {
  /** Map of feature index -> value (typically TF or TF-IDF) */
  features: Map<number, number>;
  /** L2 norm for normalization */
  norm: number;
}

/**
 * Configuration for n-gram generation
 */
export interface NgramConfig {
  /** Minimum n-gram size */
  minGram: number;
  /** Maximum n-gram size */
  maxGram: number;
  /** Number of features in the hash space (must be power of 2) */
  numFeatures: number;
}

/**
 * Default n-gram configuration matching spec
 */
export const DEFAULT_NGRAM_CONFIG: NgramConfig = {
  minGram: 3,
  maxGram: 5,
  numFeatures: 262144, // 2^18
};

/**
 * FNV-1a hash constants (32-bit)
 */
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

/**
 * Convert ParseResult to searchable text representation
 * Extracts symbols, signatures, documentation, and code structure
 */
export function astToText(parseResult: ParseResult): string {
  const parts: string[] = [];

  // Add file path (for context)
  parts.push(parseResult.path);

  // Add symbols with their kinds
  for (const symbol of parseResult.symbols) {
    parts.push(symbol.name);
    parts.push(symbol.kind);

    if (symbol.signature) {
      parts.push(symbol.signature);
    }

    if (symbol.documentation) {
      parts.push(symbol.documentation);
    }

    // Add parent context (scoping)
    if (symbol.parents.length > 0) {
      parts.push(symbol.parents.join('.'));
    }
  }

  // Add import/export module names
  for (const imp of parseResult.imports) {
    parts.push(imp.source);
    for (const spec of imp.specifiers) {
      parts.push(spec.imported);
      parts.push(spec.local);
    }
  }

  for (const exp of parseResult.exports) {
    for (const spec of exp.specifiers) {
      parts.push(spec.local);
      parts.push(spec.exported);
    }
  }

  // Add function calls
  for (const call of parseResult.calls) {
    parts.push(call.callee);
    if (call.receiver) {
      parts.push(call.receiver);
    }
  }

  // Add comment text
  for (const comment of parseResult.comments) {
    if (comment.kind === 'jsdoc' || comment.kind === 'docstring') {
      parts.push(comment.text);
    }
  }

  return parts.join(' ').toLowerCase();
}

/**
 * FNV-1a hash function
 * @param str String to hash
 * @returns 32-bit hash value
 */
function fnv1aHash(str: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  // Return unsigned 32-bit integer
  return hash >>> 0;
}

/**
 * Generate character n-grams from text
 * @param text Input text
 * @param config N-gram configuration
 * @returns Array of n-grams
 */
function generateNgrams(text: string, config: NgramConfig): string[] {
  const ngrams: string[] = [];

  // Normalize whitespace
  const normalized = text.replace(/\s+/g, ' ').trim();

  for (let n = config.minGram; n <= config.maxGram; n++) {
    for (let i = 0; i <= normalized.length - n; i++) {
      ngrams.push(normalized.substring(i, i + n));
    }
  }

  return ngrams;
}

/**
 * Generate sparse vector from text using n-gram hashing
 * @param text Input text
 * @param config N-gram configuration
 * @returns Sparse vector
 */
export function ngramSparse(
  text: string,
  config: NgramConfig = DEFAULT_NGRAM_CONFIG
): SparseVector {
  const features = new Map<number, number>();
  const ngrams = generateNgrams(text, config);

  // Count n-gram frequencies (TF)
  for (const ngram of ngrams) {
    const hash = fnv1aHash(ngram);
    const index = hash % config.numFeatures;
    features.set(index, (features.get(index) || 0) + 1);
  }

  // Normalize to unit vector (L2 norm)
  let sumSquares = 0;
  for (const value of features.values()) {
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares);

  if (norm > 0) {
    for (const [index, value] of features.entries()) {
      features.set(index, value / norm);
    }
  }

  return { features, norm };
}

/**
 * Compute cosine similarity between two sparse vectors
 * @param a First sparse vector
 * @param b Second sparse vector
 * @returns Cosine similarity [0, 1]
 */
export function sparseCosine(a: SparseVector, b: SparseVector): number {
  if (a.norm === 0 || b.norm === 0) {
    return 0;
  }

  let dotProduct = 0;

  // Iterate over the smaller vector for efficiency
  const [smaller, larger] = a.features.size < b.features.size ? [a, b] : [b, a];

  for (const [index, value] of smaller.features.entries()) {
    const otherValue = larger.features.get(index);
    if (otherValue !== undefined) {
      dotProduct += value * otherValue;
    }
  }

  // Vectors are already normalized, so no need to divide by norms
  return dotProduct;
}

/**
 * Convert sparse vector to Compressed Sparse Row (CSR) format arrays
 * @param vectors Array of sparse vectors
 * @returns CSR format { values, colIndices, rowPointers }
 */
export function toCSR(vectors: SparseVector[]): {
  values: Float32Array;
  colIndices: Uint32Array;
  rowPointers: Uint32Array;
} {
  const values: number[] = [];
  const colIndices: number[] = [];
  const rowPointers: number[] = [0];

  for (const vector of vectors) {
    // Sort indices for CSR format
    const sortedEntries = Array.from(vector.features.entries()).sort((a, b) => a[0] - b[0]);

    for (const [index, value] of sortedEntries) {
      values.push(value);
      colIndices.push(index);
    }

    rowPointers.push(values.length);
  }

  return {
    values: new Float32Array(values),
    colIndices: new Uint32Array(colIndices),
    rowPointers: new Uint32Array(rowPointers),
  };
}

/**
 * Convert CSR format back to sparse vectors
 * @param csr CSR format arrays
 * @returns Array of sparse vectors
 */
export function fromCSR(csr: {
  values: Float32Array;
  colIndices: Uint32Array;
  rowPointers: Uint32Array;
}): SparseVector[] {
  const vectors: SparseVector[] = [];

  for (let i = 0; i < csr.rowPointers.length - 1; i++) {
    const start = csr.rowPointers[i];
    const end = csr.rowPointers[i + 1];

    if (start === undefined || end === undefined) continue;

    const features = new Map<number, number>();
    let sumSquares = 0;

    for (let j = start; j < end; j++) {
      const value = csr.values[j];
      const colIndex = csr.colIndices[j];
      if (value === undefined || colIndex === undefined) continue;

      features.set(colIndex, value);
      sumSquares += value * value;
    }

    vectors.push({
      features,
      norm: Math.sqrt(sumSquares),
    });
  }

  return vectors;
}
