/**
 * Chunk Utilities
 *
 * Provides utilities for generating stable content-based chunk identifiers
 * using SHA-256 hashing of normalized content.
 */

import { createHash } from 'crypto';

/**
 * Normalize content for consistent hashing
 * Removes leading/trailing whitespace and normalizes indentation
 *
 * @param content - Raw code content
 * @returns Normalized content string
 */
function normalizeContent(content: string): string {
	// Split into lines
	const lines = content.split('\n');

	// Remove leading and trailing empty lines
	while (lines.length > 0 && lines[0]?.trim() === '') {
		lines.shift();
	}
	while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') {
		lines.pop();
	}

	if (lines.length === 0) {
		return '';
	}

	// Find minimum indentation (excluding empty lines)
	let minIndent = Infinity;
	for (const line of lines) {
		if (line.trim() === '') continue;
		const indent = line.search(/\S/);
		if (indent !== -1 && indent < minIndent) {
			minIndent = indent;
		}
	}

	// Remove minimum indentation from all lines (dedent)
	if (minIndent !== Infinity && minIndent > 0) {
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line && line.length >= minIndent) {
				lines[i] = line.substring(minIndent);
			}
		}
	}

	// Join lines and trim final result
	return lines.join('\n').trim();
}

/**
 * Generate a stable chunk ID from content using SHA-256 hash
 *
 * The ID is deterministic: identical normalized content produces the same ID.
 * This enables deduplication of identical code chunks across the codebase.
 *
 * @param content - Code content to hash
 * @returns SHA-256 hash (64 hex characters)
 *
 * @example
 * ```typescript
 * const id1 = generateChunkId('  function foo() {\n    return 42;\n  }');
 * const id2 = generateChunkId('function foo() {\n  return 42;\n}');
 * // id1 === id2 (normalized indentation)
 * ```
 */
export function generateChunkId(content: string): string {
	// Normalize content for consistent hashing
	const normalized = normalizeContent(content);

	// Generate SHA-256 hash
	const hash = createHash('sha256');
	hash.update(normalized, 'utf8');
	return hash.digest('hex');
}

/**
 * Validate that a chunk ID is a valid SHA-256 hash
 *
 * @param chunkId - Chunk ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidChunkId(chunkId: string): boolean {
	// SHA-256 produces 64 hex characters
	return /^[a-f0-9]{64}$/.test(chunkId);
}
