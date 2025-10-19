/**
 * Code snippet preview generation for search results
 *
 * @module preview-generator
 */

import * as fs from 'fs';
import { Result, ok, err } from 'neverthrow';

/**
 * Generate a code snippet preview from a file and line number
 *
 * Extracts the target line plus surrounding context lines.
 * Handles edge cases like file not found, line out of range, and binary files.
 *
 * @param filePath - Absolute path to the file
 * @param lineNumber - Target line number (1-based)
 * @param contextLines - Number of lines to show before/after (default: 2)
 * @returns Result with preview string or error
 */
export function generatePreview(
  filePath: string,
  lineNumber: number,
  contextLines: number = 2
): Result<string, Error> {
  // Validate inputs
  if (!filePath || lineNumber < 1) {
    return err(new Error('Invalid file path or line number'));
  }

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return err(new Error(`File not found: ${filePath}`));
  }

  try {
    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check if file appears to be binary
    if (isBinary(content)) {
      return err(new Error('Cannot preview binary file'));
    }

    // Split into lines
    const lines = content.split('\n');

    // Validate line number
    if (lineNumber > lines.length) {
      return err(new Error(`Line ${lineNumber} out of range (file has ${lines.length} lines)`));
    }

    // Calculate range
    const targetIndex = lineNumber - 1; // Convert to 0-based
    const startLine = Math.max(0, targetIndex - contextLines);
    const endLine = Math.min(lines.length, targetIndex + contextLines + 1);

    // Extract preview lines
    const previewLines: string[] = [];

    // Add ellipsis if truncated at start
    if (startLine > 0) {
      previewLines.push('...');
    }

    // Add context lines with target highlighted
    for (let i = startLine; i < endLine; i++) {
      const lineNum = i + 1;
      const line = lines[i];
      const prefix = lineNum === lineNumber ? '→ ' : '  ';
      previewLines.push(`${prefix}${line}`);
    }

    // Add ellipsis if truncated at end
    if (endLine < lines.length) {
      previewLines.push('...');
    }

    return ok(previewLines.join('\n'));

  } catch (error) {
    if (error instanceof Error) {
      return err(new Error(`Failed to read file: ${error.message}`));
    }
    return err(new Error('Failed to read file: Unknown error'));
  }
}

/**
 * Check if content appears to be binary
 *
 * Uses heuristic: if first 8000 bytes contain null bytes or high proportion
 * of non-printable characters, consider it binary.
 *
 * @param content - File content to check
 * @returns True if content appears binary
 */
function isBinary(content: string): boolean {
  // Check first 8000 characters
  const sample = content.slice(0, 8000);

  // Check for null bytes (strong indicator of binary)
  if (sample.includes('\0')) {
    return true;
  }

  // Count non-printable characters
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    // Allow common whitespace: \t(9), \n(10), \r(13)
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      nonPrintable++;
    }
    // High Unicode range can indicate binary
    if (code > 127 && code < 160) {
      nonPrintable++;
    }
  }

  // If more than 30% non-printable, consider binary
  const ratio = nonPrintable / sample.length;
  return ratio > 0.3;
}

/**
 * Generate preview with line numbers
 *
 * Similar to generatePreview but includes line numbers in output
 *
 * @param filePath - Absolute path to the file
 * @param lineNumber - Target line number (1-based)
 * @param contextLines - Number of lines to show before/after (default: 2)
 * @returns Result with numbered preview string or error
 */
export function generateNumberedPreview(
  filePath: string,
  lineNumber: number,
  contextLines: number = 2
): Result<string, Error> {
  // Validate inputs
  if (!filePath || lineNumber < 1) {
    return err(new Error('Invalid file path or line number'));
  }

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return err(new Error(`File not found: ${filePath}`));
  }

  try {
    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check if file appears to be binary
    if (isBinary(content)) {
      return err(new Error('Cannot preview binary file'));
    }

    // Split into lines
    const lines = content.split('\n');

    // Validate line number
    if (lineNumber > lines.length) {
      return err(new Error(`Line ${lineNumber} out of range (file has ${lines.length} lines)`));
    }

    // Calculate range
    const targetIndex = lineNumber - 1; // Convert to 0-based
    const startLine = Math.max(0, targetIndex - contextLines);
    const endLine = Math.min(lines.length, targetIndex + contextLines + 1);

    // Calculate max line number width for padding
    const maxLineNum = endLine;
    const lineNumWidth = maxLineNum.toString().length;

    // Extract preview lines
    const previewLines: string[] = [];

    // Add ellipsis if truncated at start
    if (startLine > 0) {
      previewLines.push('...');
    }

    // Add context lines with line numbers
    for (let i = startLine; i < endLine; i++) {
      const lineNum = i + 1;
      const line = lines[i];
      const paddedLineNum = lineNum.toString().padStart(lineNumWidth, ' ');
      const marker = lineNum === lineNumber ? '→' : ' ';
      previewLines.push(`${paddedLineNum}${marker} ${line}`);
    }

    // Add ellipsis if truncated at end
    if (endLine < lines.length) {
      previewLines.push('...');
    }

    return ok(previewLines.join('\n'));

  } catch (error) {
    if (error instanceof Error) {
      return err(new Error(`Failed to read file: ${error.message}`));
    }
    return err(new Error('Failed to read file: Unknown error'));
  }
}
