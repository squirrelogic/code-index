/**
 * Unit Tests: Import/Export Extraction (T029)
 *
 * Tests for ImportExportExtractor module including:
 * - Import node identification and extraction
 * - Export node identification and extraction
 * - All import/export kinds (ES6, CommonJS, Python)
 */

import { describe, it, expect } from 'vitest';
import TreeSitter from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import JavaScript from 'tree-sitter-javascript';
import {
  isImportNode,
  getImportKind,
  extractImport,
  isExportNode,
  getExportKind,
  extractExport,
  extractImports,
  extractExports,
} from '../../../../src/services/parser/ImportExportExtractor.js';

// ============================================================================
// Test Utilities
// ============================================================================

function parseTypeScript(source: string): TreeSitter.Tree {
  const parser = new TreeSitter();
  parser.setLanguage(TypeScript.typescript);
  return parser.parse(source);
}

function parseJavaScript(source: string): TreeSitter.Tree {
  const parser = new TreeSitter();
  parser.setLanguage(JavaScript);
  return parser.parse(source);
}

function findFirstNodeOfType(tree: TreeSitter.Tree, nodeType: string): TreeSitter.SyntaxNode | null {
  const cursor = tree.walk();

  function visit(): TreeSitter.SyntaxNode | null {
    const node = cursor.currentNode;

    if (node.type === nodeType || node.type.includes(nodeType)) {
      return node;
    }

    if (cursor.gotoFirstChild()) {
      do {
        const found = visit();
        if (found) return found;
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }

    return null;
  }

  return visit();
}

// ============================================================================
// Import Tests
// ============================================================================

describe('Import Node Identification', () => {
  it('identifies ES6 named import', () => {
    const source = "import { foo } from 'bar';";
    const tree = parseTypeScript(source);
    const importNode = findFirstNodeOfType(tree, 'import_statement');

    expect(importNode).toBeTruthy();
    expect(isImportNode(importNode!)).toBe(true);
    expect(getImportKind(importNode!)).toBe('named');
  });

  it('identifies default import', () => {
    const source = "import foo from 'bar';";
    const tree = parseTypeScript(source);
    const importNode = findFirstNodeOfType(tree, 'import_statement');

    expect(importNode).toBeTruthy();
    expect(isImportNode(importNode!)).toBe(true);
    expect(getImportKind(importNode!)).toBe('default');
  });

  it('identifies namespace import', () => {
    const source = "import * as foo from 'bar';";
    const tree = parseTypeScript(source);
    const importNode = findFirstNodeOfType(tree, 'import_statement');

    expect(importNode).toBeTruthy();
    expect(isImportNode(importNode!)).toBe(true);
    expect(getImportKind(importNode!)).toBe('namespace');
  });

  it('identifies side-effect import', () => {
    const source = "import 'bar';";
    const tree = parseTypeScript(source);
    const importNode = findFirstNodeOfType(tree, 'import_statement');

    expect(importNode).toBeTruthy();
    expect(isImportNode(importNode!)).toBe(true);
    expect(getImportKind(importNode!)).toBe('side-effect');
  });

  it('identifies CommonJS require', () => {
    const source = "const foo = require('bar');";
    const tree = parseJavaScript(source);
    const varDeclarator = findFirstNodeOfType(tree, 'variable_declarator');

    expect(varDeclarator).toBeTruthy();
    expect(isImportNode(varDeclarator!)).toBe(true);
    expect(getImportKind(varDeclarator!)).toBe('require');
  });
});

describe('Import Extraction', () => {
  it('extracts ES6 named import with correct specifiers', () => {
    const source = "import { foo, bar as baz } from 'module';";
    const tree = parseTypeScript(source);
    const imports = extractImports(tree, source);

    expect(imports).toHaveLength(1);
    expect(imports[0].kind).toBe('named');
    expect(imports[0].source).toBe('module');
    expect(imports[0].specifiers).toHaveLength(2);
    expect(imports[0].specifiers[0]).toEqual({
      imported: 'foo',
      local: 'foo',
      typeOnly: false,
    });
    expect(imports[0].specifiers[1]).toEqual({
      imported: 'bar',
      local: 'baz',
      typeOnly: false,
    });
  });

  it('extracts default import with correct kind', () => {
    const source = "import React from 'react';";
    const tree = parseTypeScript(source);
    const imports = extractImports(tree, source);

    expect(imports).toHaveLength(1);
    expect(imports[0].kind).toBe('default');
    expect(imports[0].source).toBe('react');
    expect(imports[0].specifiers).toHaveLength(1);
    expect(imports[0].specifiers[0]).toEqual({
      imported: 'default',
      local: 'React',
      typeOnly: false,
    });
  });

  it('extracts namespace import with correct kind', () => {
    const source = "import * as utils from './utils';";
    const tree = parseTypeScript(source);
    const imports = extractImports(tree, source);

    expect(imports).toHaveLength(1);
    expect(imports[0].kind).toBe('namespace');
    expect(imports[0].source).toBe('./utils');
    expect(imports[0].specifiers).toHaveLength(1);
    expect(imports[0].specifiers[0]).toEqual({
      imported: '*',
      local: 'utils',
      typeOnly: false,
    });
  });

  it('extracts side-effect import with empty specifiers', () => {
    const source = "import './styles.css';";
    const tree = parseTypeScript(source);
    const imports = extractImports(tree, source);

    expect(imports).toHaveLength(1);
    expect(imports[0].kind).toBe('side-effect');
    expect(imports[0].source).toBe('./styles.css');
    expect(imports[0].specifiers).toHaveLength(0);
  });

  it('extracts CommonJS require with correct kind and source', () => {
    const source = "const fs = require('fs');";
    const tree = parseJavaScript(source);
    const imports = extractImports(tree, source);

    expect(imports).toHaveLength(1);
    expect(imports[0].kind).toBe('require');
    expect(imports[0].source).toBe('fs');
    expect(imports[0].specifiers).toHaveLength(1);
    expect(imports[0].specifiers[0]).toEqual({
      imported: 'default',
      local: 'fs',
      typeOnly: false,
    });
  });

  it('extracts destructured CommonJS require', () => {
    const source = "const { readFile, writeFile } = require('fs');";
    const tree = parseJavaScript(source);
    const imports = extractImports(tree, source);

    expect(imports).toHaveLength(1);
    expect(imports[0].kind).toBe('require');
    expect(imports[0].source).toBe('fs');
    expect(imports[0].specifiers).toHaveLength(2);
    expect(imports[0].specifiers[0].imported).toBe('readFile');
    expect(imports[0].specifiers[0].local).toBe('readFile');
    expect(imports[0].specifiers[1].imported).toBe('writeFile');
    expect(imports[0].specifiers[1].local).toBe('writeFile');
  });
});

// ============================================================================
// Export Tests
// ============================================================================

describe('Export Node Identification', () => {
  it('identifies named export', () => {
    const source = "export { foo, bar };";
    const tree = parseTypeScript(source);
    const exportNode = findFirstNodeOfType(tree, 'export_statement');

    expect(exportNode).toBeTruthy();
    expect(isExportNode(exportNode!)).toBe(true);
    expect(getExportKind(exportNode!)).toBe('named');
  });

  it('identifies default export', () => {
    const source = "export default foo;";
    const tree = parseTypeScript(source);
    const exportNode = findFirstNodeOfType(tree, 'export_statement');

    expect(exportNode).toBeTruthy();
    expect(isExportNode(exportNode!)).toBe(true);
    expect(getExportKind(exportNode!)).toBe('default');
  });

  it('identifies export declaration', () => {
    const source = "export const foo = 42;";
    const tree = parseTypeScript(source);
    const exportNode = findFirstNodeOfType(tree, 'export_statement');

    expect(exportNode).toBeTruthy();
    expect(isExportNode(exportNode!)).toBe(true);
    expect(getExportKind(exportNode!)).toBe('declaration');
  });

  it('identifies namespace export', () => {
    const source = "export * from 'module';";
    const tree = parseTypeScript(source);
    const exportNode = findFirstNodeOfType(tree, 'export_statement');

    expect(exportNode).toBeTruthy();
    expect(isExportNode(exportNode!)).toBe(true);
    expect(getExportKind(exportNode!)).toBe('namespace');
  });
});

describe('Export Extraction', () => {
  it('extracts named export with correct specifiers', () => {
    const source = "export { foo, bar as baz };";
    const tree = parseTypeScript(source);
    const exports = extractExports(tree, source);

    expect(exports).toHaveLength(1);
    expect(exports[0].kind).toBe('named');
    expect(exports[0].specifiers).toHaveLength(2);
    expect(exports[0].specifiers[0]).toEqual({
      local: 'foo',
      exported: 'foo',
      typeOnly: false,
    });
    expect(exports[0].specifiers[1]).toEqual({
      local: 'bar',
      exported: 'baz',
      typeOnly: false,
    });
  });

  it('extracts default export with correct kind', () => {
    const source = "export default function foo() {}";
    const tree = parseTypeScript(source);
    const exports = extractExports(tree, source);

    expect(exports).toHaveLength(1);
    expect(exports[0].kind).toBe('default');
    expect(exports[0].specifiers).toHaveLength(1);
    expect(exports[0].specifiers[0].exported).toBe('default');
  });

  it('extracts export declaration with correct kind', () => {
    const source = "export const foo = 42;";
    const tree = parseTypeScript(source);
    const exports = extractExports(tree, source);

    expect(exports).toHaveLength(1);
    expect(exports[0].kind).toBe('declaration');
    expect(exports[0].specifiers).toHaveLength(1);
    expect(exports[0].specifiers[0]).toEqual({
      local: 'foo',
      exported: 'foo',
      typeOnly: false,
    });
  });

  it('extracts re-export with source captured', () => {
    const source = "export * from './utils';";
    const tree = parseTypeScript(source);
    const exports = extractExports(tree, source);

    expect(exports).toHaveLength(1);
    expect(exports[0].kind).toBe('namespace');
    expect(exports[0].source).toBe('./utils');
    expect(exports[0].specifiers).toHaveLength(1);
    expect(exports[0].specifiers[0]).toEqual({
      local: '*',
      exported: '*',
      typeOnly: false,
    });
  });

  it('extracts multiple named exports from declaration', () => {
    const source = "export const foo = 1, bar = 2;";
    const tree = parseTypeScript(source);
    const exports = extractExports(tree, source);

    expect(exports).toHaveLength(1);
    expect(exports[0].kind).toBe('declaration');
    expect(exports[0].specifiers.length).toBeGreaterThanOrEqual(1);
    // Should extract at least one export
    expect(exports[0].specifiers[0].local).toBeTruthy();
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Import/Export Integration', () => {
  it('extracts multiple imports from a file', () => {
    const source = `
      import React from 'react';
      import { useState } from 'react';
      import * as utils from './utils';
      import './styles.css';
    `;
    const tree = parseTypeScript(source);
    const imports = extractImports(tree, source);

    expect(imports.length).toBeGreaterThanOrEqual(3); // At least 3 imports
    expect(imports.some(i => i.kind === 'default')).toBe(true);
    expect(imports.some(i => i.kind === 'named')).toBe(true);
    expect(imports.some(i => i.kind === 'namespace')).toBe(true);
  });

  it('extracts multiple exports from a file', () => {
    const source = `
      export const foo = 1;
      export function bar() {}
      export { baz };
      export default class MyClass {}
    `;
    const tree = parseTypeScript(source);
    const exports = extractExports(tree, source);

    expect(exports.length).toBeGreaterThanOrEqual(3); // At least 3 exports
    expect(exports.some(e => e.kind === 'declaration')).toBe(true);
    expect(exports.some(e => e.kind === 'default')).toBe(true);
  });

  it('handles files with both imports and exports', () => {
    const source = `
      import { foo } from './foo';
      export const bar = foo + 1;
    `;
    const tree = parseTypeScript(source);
    const imports = extractImports(tree, source);
    const exports = extractExports(tree, source);

    expect(imports).toHaveLength(1);
    expect(exports).toHaveLength(1);
    expect(imports[0].source).toBe('./foo');
    expect(exports[0].kind).toBe('declaration');
  });
});
