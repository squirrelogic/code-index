/**
 * Content Hash Generation
 *
 * Generates stable semantic content hashes for symbols to enable
 * efficient change detection.
 */

import { xxh64 } from '@node-rs/xxhash';
import type { Symbol, HashInput } from '../../models/ParseResult.js';

/**
 * Extract semantic content for hashing
 *
 * @param symbol - Symbol to extract content from
 * @param source - Source code content
 * @returns Hash input with signature and body structure
 */
export function extractSemanticContent(
  symbol: Symbol,
  source: string
): HashInput {
  // Use signature if available
  const signature = symbol.signature || '';

  // Extract body content between the symbol's span
  const bodyText = source.substring(symbol.span.startByte, symbol.span.endByte);

  // Normalize body structure:
  // 1. Remove single-line comments (//)
  // 2. Remove multi-line comments (/* ... */)
  // 3. Normalize whitespace (collapse multiple spaces/newlines to single space)
  // 4. Keep structure tokens like braces, semicolons, etc.
  let normalized = bodyText
    // Remove single-line comments
    .replace(/\/\/.*$/gm, '')
    // Remove multi-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Normalize whitespace: collapse multiple spaces/tabs/newlines to single space
    .replace(/\s+/g, ' ')
    // Trim leading/trailing whitespace
    .trim();

  return {
    signature,
    bodyStructure: normalized
  };
}

/**
 * Generate hash from semantic content
 *
 * @param input - Hash input with signature and body structure
 * @returns 16-character hex hash string
 */
export function generateHash(input: HashInput): string {
  // Concatenate signature and body structure for hashing
  const contentToHash = input.signature + input.bodyStructure;

  // Convert to Buffer for hashing
  const buffer = Buffer.from(contentToHash, 'utf-8');

  // Generate XXH64 hash
  const hash = xxh64(buffer);

  // Return as 16-character hex string
  return hash.toString(16).padStart(16, '0');
}
