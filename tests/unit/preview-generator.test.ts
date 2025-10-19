/**
 * Unit tests for preview generator
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { generatePreview, generateNumberedPreview } from '../../src/lib/preview-generator.js';

// Test fixtures
const TEST_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'preview-test');
const TEST_FILE = path.join(TEST_DIR, 'sample.ts');
const BINARY_FILE = path.join(TEST_DIR, 'binary.bin');

// Sample file content
const SAMPLE_CONTENT = `// Sample TypeScript file
import { foo } from './bar';

export function hello(name: string): string {
  return \`Hello, \${name}!\`;
}

export class Greeter {
  constructor(private name: string) {}

  greet(): string {
    return \`Hello, \${this.name}!\`;
  }
}

// End of file
`;

beforeAll(() => {
  // Create test directory and files
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(TEST_FILE, SAMPLE_CONTENT, 'utf-8');

  // Create binary file with null bytes
  const binaryBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD]);
  fs.writeFileSync(BINARY_FILE, binaryBuffer);
});

afterAll(() => {
  // Clean up test files
  if (fs.existsSync(TEST_FILE)) {
    fs.unlinkSync(TEST_FILE);
  }
  if (fs.existsSync(BINARY_FILE)) {
    fs.unlinkSync(BINARY_FILE);
  }
  if (fs.existsSync(TEST_DIR)) {
    fs.rmdirSync(TEST_DIR);
  }
});

describe('generatePreview', () => {
  it('should generate preview from middle of file', () => {
    // Line 5: return `Hello, ${name}!`;
    const result = generatePreview(TEST_FILE, 5, 2);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const preview = result.value;
      expect(preview).toContain('export function hello');
      expect(preview).toContain('→   return `Hello, ${name}!`;');
      expect(preview).toContain('}');
    }
  });

  it('should generate preview from start of file (no before context)', () => {
    // Line 1: // Sample TypeScript file
    const result = generatePreview(TEST_FILE, 1, 2);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const preview = result.value;
      expect(preview).toContain('→ // Sample TypeScript file');
      // Should not start with ellipsis (but may end with it)
      expect(preview.startsWith('...')).toBe(false);
      expect(preview.split('\n').length).toBeGreaterThan(1);
    }
  });

  it('should generate preview from end of file (no after context)', () => {
    const lines = SAMPLE_CONTENT.split('\n');
    const lastLine = lines.length;

    const result = generatePreview(TEST_FILE, lastLine, 2);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const preview = result.value;
      expect(preview).toContain('// End of file');
      // Should have ellipsis at start but not at end
      expect(preview).toContain('...');
    }
  });

  it('should handle file not found', () => {
    const result = generatePreview('/nonexistent/file.ts', 1);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('File not found');
    }
  });

  it('should handle line number out of range', () => {
    const result = generatePreview(TEST_FILE, 9999);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('out of range');
    }
  });

  it('should handle binary/non-text files', () => {
    const result = generatePreview(BINARY_FILE, 1);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('binary');
    }
  });

  it('should handle invalid line number', () => {
    const result = generatePreview(TEST_FILE, 0);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('Invalid');
    }
  });

  it('should handle empty file path', () => {
    const result = generatePreview('', 1);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('Invalid');
    }
  });

  it('should respect custom context lines', () => {
    const result = generatePreview(TEST_FILE, 5, 1);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const lines = result.value.split('\n').filter(l => !l.startsWith('...'));
      // Should have: 1 before + target + 1 after = 3 lines
      expect(lines.length).toBe(3);
    }
  });

  it('should add ellipsis for truncated content', () => {
    // Middle line with context=1
    const result = generatePreview(TEST_FILE, 8, 1);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const preview = result.value;
      // Should have ellipsis at both start and end
      const lines = preview.split('\n');
      expect(lines[0]).toBe('...');
      expect(lines[lines.length - 1]).toBe('...');
    }
  });
});

describe('generateNumberedPreview', () => {
  it('should generate preview with line numbers', () => {
    const result = generateNumberedPreview(TEST_FILE, 5, 2);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const preview = result.value;
      // Should contain line numbers
      expect(preview).toMatch(/\d+→/); // Target line has →
      expect(preview).toMatch(/\d+ /); // Context lines have space
    }
  });

  it('should pad line numbers correctly', () => {
    const result = generateNumberedPreview(TEST_FILE, 5, 2);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const preview = result.value;
      const lines = preview.split('\n').filter(l => !l.startsWith('...'));

      // Check that all line numbers are aligned
      const lineNumbers = lines.map(l => l.match(/^\s*(\d+)/)?.[1] || '');
      const widths = lineNumbers.map(n => n.length);

      // All non-empty widths should be the same
      const nonEmptyWidths = widths.filter(w => w > 0);
      const allSameWidth = nonEmptyWidths.every(w => w === nonEmptyWidths[0]);
      expect(allSameWidth).toBe(true);
    }
  });

  it('should mark target line with arrow', () => {
    const result = generateNumberedPreview(TEST_FILE, 5, 2);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const preview = result.value;
      const lines = preview.split('\n');

      // Find line with arrow
      const targetLine = lines.find(l => l.includes('→'));
      expect(targetLine).toBeDefined();
      expect(targetLine).toContain('return');
    }
  });

  it('should handle file not found', () => {
    const result = generateNumberedPreview('/nonexistent/file.ts', 1);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('File not found');
    }
  });

  it('should handle binary files', () => {
    const result = generateNumberedPreview(BINARY_FILE, 1);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('binary');
    }
  });
});
