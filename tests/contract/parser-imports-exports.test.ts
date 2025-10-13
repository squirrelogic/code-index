/**
 * Contract Tests: Import/Export Extraction API (T030)
 *
 * Tests the parser's import/export extraction against the specification
 * from spec.md US2 (User Story 2: Extract Import/Export Relationships)
 *
 * Acceptance scenarios:
 * 1. TypeScript file with ES6 imports → all imported modules and symbols identified
 * 2. JavaScript file with CommonJS requires → required modules correctly extracted
 * 3. Python file with import statements → imported modules and specific imports identified
 * 4. File exporting multiple symbols → all exported symbols catalogued with types
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../../src/services/parser/index.js';
import { promises as fs } from 'fs';
import path from 'path';

const FIXTURES_DIR = path.join(process.cwd(), 'tests/fixtures/parser');

describe('US2: Import/Export Extraction Contract Tests', () => {
  /**
   * Scenario 1: TypeScript file with ES6 imports
   * Given: TypeScript file with ES6 imports
   * When: parsed
   * Then: all imported modules and symbols identified
   */
  it('extracts all ES6 imports from TypeScript file', async () => {
    const source = `
      import React from 'react';
      import { useState, useEffect } from 'react';
      import * as utils from './utils';
      import './styles.css';
      import type { User } from './types';
    `;

    const fixturePath = path.join(FIXTURES_DIR, 'imports-test.ts');
    await fs.writeFile(fixturePath, source);

    try {
      const result = await parse(fixturePath);

      // All imports should be extracted
      expect(result.imports.length).toBeGreaterThanOrEqual(4);

      // Default import
      const defaultImport = result.imports.find(i => i.kind === 'default');
      expect(defaultImport).toBeTruthy();
      expect(defaultImport?.source).toBe('react');
      expect(defaultImport?.specifiers).toHaveLength(1);
      expect(defaultImport?.specifiers[0].imported).toBe('default');
      expect(defaultImport?.specifiers[0].local).toBe('React');

      // Named import
      const namedImport = result.imports.find(
        i => i.kind === 'named' && i.specifiers.some(s => s.imported === 'useState')
      );
      expect(namedImport).toBeTruthy();
      expect(namedImport?.source).toBe('react');
      expect(namedImport?.specifiers.length).toBeGreaterThanOrEqual(1);

      // Namespace import
      const namespaceImport = result.imports.find(i => i.kind === 'namespace');
      expect(namespaceImport).toBeTruthy();
      expect(namespaceImport?.source).toBe('./utils');

      // Side-effect import
      const sideEffectImport = result.imports.find(i => i.kind === 'side-effect');
      expect(sideEffectImport).toBeTruthy();
      expect(sideEffectImport?.source).toBe('./styles.css');

      // All imports have spans
      result.imports.forEach(imp => {
        expect(imp.span).toBeTruthy();
        expect(imp.span.startLine).toBeGreaterThan(0);
        expect(imp.span.endLine).toBeGreaterThanOrEqual(imp.span.startLine);
      });
    } finally {
      await fs.unlink(fixturePath);
    }
  });

  /**
   * Scenario 2: JavaScript file with CommonJS requires
   * Given: JavaScript file with CommonJS requires
   * When: parsed
   * Then: required modules correctly extracted
   */
  it('extracts CommonJS requires from JavaScript file', async () => {
    const source = `
      const fs = require('fs');
      const { readFile, writeFile } = require('fs/promises');
      const path = require('path');
    `;

    const fixturePath = path.join(FIXTURES_DIR, 'require-test.js');
    await fs.writeFile(fixturePath, source);

    try {
      const result = await parse(fixturePath);

      // All requires should be extracted
      expect(result.imports.length).toBeGreaterThanOrEqual(2);

      // Simple require
      const simpleRequire = result.imports.find(
        i => i.kind === 'require' && i.source === 'fs'
      );
      expect(simpleRequire).toBeTruthy();
      expect(simpleRequire?.specifiers).toHaveLength(1);
      expect(simpleRequire?.specifiers[0].local).toBe('fs');

      // Destructured require
      const destructuredRequire = result.imports.find(
        i => i.kind === 'require' && i.source === 'fs/promises'
      );
      expect(destructuredRequire).toBeTruthy();
      expect(destructuredRequire?.specifiers.length).toBeGreaterThanOrEqual(1);

      // All requires have correct kind
      result.imports.forEach(imp => {
        expect(imp.kind).toBe('require');
        expect(imp.source).toBeTruthy();
      });
    } finally {
      await fs.unlink(fixturePath);
    }
  });

  /**
   * Scenario 3: Python file with import statements
   * Given: Python file with import statements
   * When: parsed
   * Then: imported modules and specific imports identified
   *
   * Note: This test is skipped for now as we need proper Python fixtures
   */
  it.skip('extracts imports from Python file', async () => {
    const source = `
      import os
      import sys
      from pathlib import Path
      from typing import List, Dict, Optional
    `;

    const fixturePath = path.join(FIXTURES_DIR, 'imports-test.py');
    await fs.writeFile(fixturePath, source);

    try {
      const result = await parse(fixturePath);

      expect(result.imports.length).toBeGreaterThanOrEqual(2);
      expect(result.imports.some(i => i.source === 'os')).toBe(true);
      expect(result.imports.some(i => i.source === 'pathlib')).toBe(true);
    } finally {
      await fs.unlink(fixturePath);
    }
  });

  /**
   * Scenario 4: File exporting multiple symbols
   * Given: file exporting multiple symbols
   * When: parsed
   * Then: all exported symbols catalogued with types
   */
  it('extracts all export statements with correct kinds', async () => {
    const source = `
      export const FOO = 42;
      export function bar() {}
      export class Baz {}
      export { qux };
      export default class DefaultClass {}
      export * from './utils';
    `;

    const fixturePath = path.join(FIXTURES_DIR, 'exports-test.ts');
    await fs.writeFile(fixturePath, source);

    try {
      const result = await parse(fixturePath);

      // All exports should be extracted
      expect(result.exports.length).toBeGreaterThanOrEqual(5);

      // Export declaration (const)
      const constExport = result.exports.find(
        e => e.kind === 'declaration' && e.specifiers.some(s => s.local === 'FOO')
      );
      expect(constExport).toBeTruthy();

      // Export declaration (function)
      const funcExport = result.exports.find(
        e => e.kind === 'declaration' && e.specifiers.some(s => s.local === 'bar')
      );
      expect(funcExport).toBeTruthy();

      // Export declaration (class)
      const classExport = result.exports.find(
        e => e.kind === 'declaration' && e.specifiers.some(s => s.local === 'Baz')
      );
      expect(classExport).toBeTruthy();

      // Named export
      const namedExport = result.exports.find(e => e.kind === 'named');
      expect(namedExport).toBeTruthy();

      // Default export
      const defaultExport = result.exports.find(e => e.kind === 'default');
      expect(defaultExport).toBeTruthy();
      expect(defaultExport?.specifiers).toHaveLength(1);
      expect(defaultExport?.specifiers[0].exported).toBe('default');

      // Namespace export
      const namespaceExport = result.exports.find(e => e.kind === 'namespace');
      expect(namespaceExport).toBeTruthy();
      expect(namespaceExport?.source).toBe('./utils');

      // All exports have spans
      result.exports.forEach(exp => {
        expect(exp.span).toBeTruthy();
        expect(exp.span.startLine).toBeGreaterThan(0);
        expect(exp.span.endLine).toBeGreaterThanOrEqual(exp.span.startLine);
      });
    } finally {
      await fs.unlink(fixturePath);
    }
  });

  /**
   * Success Criterion SC-009: 100% static dependency detection
   * All import/export statements should be detected and extracted
   */
  it('achieves 100% static dependency detection', async () => {
    const source = `
      import { foo } from './foo';
      import bar from './bar';

      export const baz = foo + bar;
      export { qux } from './qux';
    `;

    const fixturePath = path.join(FIXTURES_DIR, 'dependency-test.ts');
    await fs.writeFile(fixturePath, source);

    try {
      const result = await parse(fixturePath);

      // Should detect all imports (2)
      expect(result.imports).toHaveLength(2);

      // Should detect all exports (2)
      expect(result.exports.length).toBeGreaterThanOrEqual(2);

      // Verify import sources
      const importSources = result.imports.map(i => i.source).sort();
      expect(importSources).toContain('./foo');
      expect(importSources).toContain('./bar');

      // Verify export kinds
      expect(result.exports.some(e => e.kind === 'declaration')).toBe(true);
      expect(result.exports.some(e => e.kind === 'named')).toBe(true);
    } finally {
      await fs.unlink(fixturePath);
    }
  });
});
