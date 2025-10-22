/**
 * Code preview extraction and formatting service
 *
 * Provides utilities for extracting code previews with context lines,
 * truncating long lines, generating file anchors, and handling edge cases.
 */

import { readFileSync } from 'fs';
import type { CodeAnchor, CodePreview, PreviewConfig } from '../models/mcp-types.js';
import { defaultPreviewConfig } from '../models/mcp-types.js';
import type { Span } from '../models/ASTDoc.js';

/**
 * Extract code preview from file content at a specific line
 *
 * @param fileContent - Full file content as string
 * @param matchLine - Target line number (0-based internally)
 * @param config - Preview configuration (optional)
 * @returns Code preview with context lines
 *
 * @example
 * ```typescript
 * const preview = extractPreview(content, 42, { beforeLines: 3, afterLines: 6 });
 * console.log(preview.lines); // Array of up to 10 lines
 * console.log(preview.startLine); // 1-based line number of first line
 * ```
 */
export function extractPreview(
  fileContent: string,
  matchLine: number,
  config: Partial<PreviewConfig> = {}
): CodePreview {
  const cfg = { ...defaultPreviewConfig, ...config };
  const lines = fileContent.split('\n');

  // Ensure matchLine is within bounds
  const targetLine = Math.max(0, Math.min(matchLine, lines.length - 1));

  // Calculate preview window (ensuring max 10 lines total)
  const startLine = Math.max(0, targetLine - cfg.beforeLines);
  const endLine = Math.min(lines.length - 1, targetLine + cfg.afterLines);

  // Extract and process lines
  const previewLines = lines
    .slice(startLine, endLine + 1)
    .map((line, idx) => {
      const lineNumber = startLine + idx;
      const isMatchLine = lineNumber === targetLine;

      // Apply line truncation if needed
      const processedLine = truncateLine(
        line,
        isMatchLine ? undefined : undefined, // Position will be determined if needed
        cfg.maxLineLength
      );

      return sanitizeForTerminal(processedLine);
    });

  // Ensure we don't exceed 10 lines
  const finalLines = previewLines.slice(0, 10);

  return {
    lines: finalLines,
    startLine: startLine + 1 // Convert to 1-based for display
  };
}

/**
 * Truncate a line to maximum length with smart centering on match position
 *
 * @param line - The line to truncate
 * @param matchPosition - Optional position of match in line (for smart centering)
 * @param maxLength - Maximum line length (default: 150)
 * @returns Truncated line with ellipsis markers if needed
 *
 * @example
 * ```typescript
 * truncateLine("short line", undefined, 150); // "short line" (no truncation)
 * truncateLine("very long line...", 50, 150); // Centers on position 50
 * truncateLine("very long line...", undefined, 150); // Truncates at end
 * ```
 */
export function truncateLine(
  line: string,
  matchPosition?: number,
  maxLength: number = 150
): string {
  if (line.length <= maxLength) {
    return line;
  }

  // Center on match if provided
  if (matchPosition !== undefined) {
    const halfWindow = Math.floor(maxLength / 2);
    let start = Math.max(0, matchPosition - halfWindow);
    let end = Math.min(line.length, start + maxLength);

    // Adjust if we're at the end of the line
    if (end === line.length && end - start < maxLength) {
      start = Math.max(0, end - maxLength);
    }

    let result = line.slice(start, end);

    // Add ellipsis markers
    if (start > 0) result = '…' + result.slice(1);
    if (end < line.length) result = result.slice(0, -1) + '…';

    return result;
  }

  // No match position - truncate at end
  return line.slice(0, maxLength - 1) + '…';
}

/**
 * Generate file anchor string for VSCode compatibility
 *
 * Format: `file:line:col` or `file:line`
 * VSCode terminal auto-detects this format and makes it clickable
 *
 * @param filePath - Absolute or relative file path
 * @param line - Line number (1-based)
 * @param column - Optional column number (1-based)
 * @returns Formatted anchor string
 *
 * @example
 * ```typescript
 * generateAnchor('/path/to/file.ts', 42, 15); // "/path/to/file.ts:42:15"
 * generateAnchor('src/index.ts', 100); // "src/index.ts:100"
 * ```
 */
export function generateAnchor(
  filePath: string,
  line: number,
  column?: number
): string {
  return column !== undefined
    ? `${filePath}:${line}:${column}`
    : `${filePath}:${line}`;
}

/**
 * Create a complete CodeAnchor object
 *
 * @param filePath - Absolute or relative file path
 * @param line - Line number (1-based)
 * @param column - Optional column number (1-based)
 * @returns CodeAnchor object
 */
export function createAnchor(
  filePath: string,
  line: number,
  column?: number
): CodeAnchor {
  return {
    file: filePath,
    line,
    column
  };
}

/**
 * Sanitize line for terminal display by removing control characters
 *
 * @param line - Line to sanitize
 * @returns Sanitized line safe for terminal display
 */
export function sanitizeForTerminal(line: string): string {
  return line
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars except \n
    .replace(/\t/g, '  '); // Replace tabs with 2 spaces
}

/**
 * Detect if file content appears to be binary
 *
 * @param content - File content as Buffer
 * @returns true if binary file detected, false otherwise
 */
export function isBinaryFile(content: Buffer): boolean {
  const checkLength = Math.min(8192, content.length);

  for (let i = 0; i < checkLength; i++) {
    if (content[i] === 0) {
      return true; // NUL byte detection
    }
  }

  return false;
}

/**
 * Read file and extract preview at specific line
 *
 * @param filePath - Absolute file path
 * @param line - Target line number (1-based)
 * @param contextLines - Number of context lines around target (default: 10)
 * @returns CodePreview with file content at specified line
 * @throws Error if file doesn't exist or is binary
 *
 * @example
 * ```typescript
 * const preview = extractPreviewFromFile('/path/to/file.ts', 42, 10);
 * console.log(preview.lines); // Up to 10 lines of context
 * ```
 */
export function extractPreviewFromFile(
  filePath: string,
  line: number,
  contextLines: number = 10
): CodePreview {
  // Read file content
  const content = readFileSync(filePath);

  // Check if binary
  if (isBinaryFile(content)) {
    throw new Error(`Cannot extract preview from binary file: ${filePath}`);
  }

  const fileContent = content.toString('utf-8');

  // Calculate before/after lines to stay within contextLines limit
  const beforeLines = Math.floor(contextLines / 2);
  const afterLines = contextLines - beforeLines - 1; // -1 for the target line itself

  // Convert to 0-based for internal processing
  const targetLine = line - 1;

  return extractPreview(fileContent, targetLine, {
    beforeLines: Math.max(0, Math.min(beforeLines, 3)), // Cap at 3 before
    afterLines: Math.max(0, Math.min(afterLines, 6)),   // Cap at 6 after
    maxLineLength: 150,
    highlightMatch: false
  });
}

/**
 * Extract preview from file content with file path and line number
 *
 * @param filePath - File path for anchor
 * @param fileContent - Full file content
 * @param line - Target line number (1-based)
 * @param column - Optional column number (1-based)
 * @param contextLines - Number of context lines (default: 10)
 * @returns Object with anchor and preview
 */
export function extractPreviewWithAnchor(
  filePath: string,
  fileContent: string,
  line: number,
  column?: number,
  contextLines: number = 10
): { anchor: CodeAnchor; preview: CodePreview } {
  const beforeLines = Math.floor(contextLines / 2);
  const afterLines = contextLines - beforeLines - 1;

  const preview = extractPreview(fileContent, line - 1, {
    beforeLines: Math.max(0, Math.min(beforeLines, 3)),
    afterLines: Math.max(0, Math.min(afterLines, 6)),
    maxLineLength: 150,
    highlightMatch: false
  });

  const anchor = createAnchor(filePath, line, column);

  return { anchor, preview };
}

/**
 * Extract code content from a file using span information
 *
 * @param filePath - Absolute file path
 * @param span - Span object with line and column information
 * @returns Extracted code as a string
 * @throws Error if file doesn't exist or is binary
 *
 * @example
 * ```typescript
 * const code = extractCodeBySpan('/path/to/file.ts', {
 *   startLine: 77,
 *   endLine: 87,
 *   startColumn: 0,
 *   endColumn: 1,
 *   startByte: 0,
 *   endByte: 0
 * });
 * console.log(code); // Full function/class/symbol code
 * ```
 */
export function extractCodeBySpan(filePath: string, span: Span): string {
  // Read file content
  const content = readFileSync(filePath);

  // Check if binary
  if (isBinaryFile(content)) {
    throw new Error(`Cannot extract code from binary file: ${filePath}`);
  }

  const fileContent = content.toString('utf-8');
  const lines = fileContent.split('\n');

  // Ensure span is within bounds (convert to 0-based for array access)
  const startLine = Math.max(0, span.startLine - 1);
  const endLine = Math.min(lines.length - 1, span.endLine - 1);

  // Extract lines from startLine to endLine (inclusive)
  const codeLines = lines.slice(startLine, endLine + 1);

  // Join and return
  return codeLines.join('\n');
}
