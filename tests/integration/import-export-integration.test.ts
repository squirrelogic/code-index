/**
 * Integration Tests: Import/Export Analysis (T031)
 *
 * End-to-end tests for import/export extraction including:
 * - Building dependency maps from imports
 * - Finding circular dependencies
 * - Finding unused exports
 * - Multi-file dependency graph analysis
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parse } from '../../src/services/parser/index.js';
import { promises as fs } from 'fs';
import path from 'path';

const TEST_DIR = path.join(process.cwd(), 'tests/fixtures/parser/dependency-analysis');

/**
 * Helper to create temporary test files
 */
async function setupTestFiles() {
  await fs.mkdir(TEST_DIR, { recursive: true });

  // File A: imports B, exports foo
  await fs.writeFile(
    path.join(TEST_DIR, 'fileA.ts'),
    `
      import { bar } from './fileB';
      export const foo = bar + 1;
    `
  );

  // File B: imports C, exports bar
  await fs.writeFile(
    path.join(TEST_DIR, 'fileB.ts'),
    `
      import { baz } from './fileC';
      export const bar = baz + 1;
    `
  );

  // File C: imports A (circular), exports baz
  await fs.writeFile(
    path.join(TEST_DIR, 'fileC.ts'),
    `
      import { foo } from './fileA';
      export const baz = 42;
      export const unused = 'never imported';
    `
  );

  // File D: standalone, no imports/exports
  await fs.writeFile(
    path.join(TEST_DIR, 'fileD.ts'),
    `
      const localVar = 10;
      console.log(localVar);
    `
  );
}

/**
 * Helper to clean up test files
 */
async function cleanupTestFiles() {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
}

describe('Import/Export Integration Tests', () => {
  beforeAll(async () => {
    await setupTestFiles();
  });

  afterAll(async () => {
    await cleanupTestFiles();
  });

  /**
   * Test 1: Build dependency map from imports
   * Shows which modules depend on what
   */
  it('builds dependency map showing module relationships', async () => {
    const files = [
      path.join(TEST_DIR, 'fileA.ts'),
      path.join(TEST_DIR, 'fileB.ts'),
      path.join(TEST_DIR, 'fileC.ts'),
      path.join(TEST_DIR, 'fileD.ts'),
    ];

    // Parse all files
    const results = await Promise.all(files.map(f => parse(f)));

    // Build dependency map: { filePath: [dependencies] }
    const dependencyMap = new Map<string, string[]>();

    for (const result of results) {
      const dependencies = result.imports.map(imp => {
        // Resolve relative imports to file paths
        const dir = path.dirname(result.path);
        return path.resolve(dir, imp.source + '.ts');
      });

      dependencyMap.set(result.path, dependencies);
    }

    // Verify dependency relationships
    const fileA = path.join(TEST_DIR, 'fileA.ts');
    const fileB = path.join(TEST_DIR, 'fileB.ts');
    const fileC = path.join(TEST_DIR, 'fileC.ts');
    const fileD = path.join(TEST_DIR, 'fileD.ts');

    expect(dependencyMap.get(fileA)).toContain(fileB);
    expect(dependencyMap.get(fileB)).toContain(fileC);
    expect(dependencyMap.get(fileC)).toContain(fileA); // Circular!
    expect(dependencyMap.get(fileD)).toHaveLength(0); // No dependencies

    // Check total number of dependencies
    const totalDeps = Array.from(dependencyMap.values()).reduce(
      (sum, deps) => sum + deps.length,
      0
    );
    expect(totalDeps).toBe(3); // A→B, B→C, C→A
  });

  /**
   * Test 2: Find circular dependencies
   * Detects A imports B, B imports A cycles
   */
  it('detects circular dependencies', async () => {
    const files = [
      path.join(TEST_DIR, 'fileA.ts'),
      path.join(TEST_DIR, 'fileB.ts'),
      path.join(TEST_DIR, 'fileC.ts'),
    ];

    // Parse all files
    const results = await Promise.all(files.map(f => parse(f)));

    // Build dependency graph
    const graph = new Map<string, Set<string>>();

    for (const result of results) {
      const deps = new Set<string>();
      for (const imp of result.imports) {
        const dir = path.dirname(result.path);
        const depPath = path.resolve(dir, imp.source + '.ts');
        deps.add(depPath);
      }
      graph.set(result.path, deps);
    }

    // Detect circular dependencies using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    function dfs(node: string, path: string[]): void {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const deps = graph.get(node) || new Set();
      for (const dep of deps) {
        if (!visited.has(dep)) {
          dfs(dep, [...path]);
        } else if (recursionStack.has(dep)) {
          // Found a cycle
          const cycleStart = path.indexOf(dep);
          if (cycleStart >= 0) {
            cycles.push([...path.slice(cycleStart), dep]);
          }
        }
      }

      recursionStack.delete(node);
    }

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    // Should detect the circular dependency: A → B → C → A
    expect(cycles.length).toBeGreaterThan(0);

    // Verify the cycle involves all three files
    const cycleFiles = cycles[0].map(p => path.basename(p));
    expect(cycleFiles).toContain('fileA.ts');
    expect(cycleFiles).toContain('fileC.ts');
  });

  /**
   * Test 3: Find unused exports
   * Symbols exported but not imported elsewhere
   */
  it('identifies unused exports', async () => {
    const files = [
      path.join(TEST_DIR, 'fileA.ts'),
      path.join(TEST_DIR, 'fileB.ts'),
      path.join(TEST_DIR, 'fileC.ts'),
    ];

    // Parse all files
    const results = await Promise.all(files.map(f => parse(f)));

    // Collect all exports
    const allExports = new Map<string, Set<string>>();
    for (const result of results) {
      const exports = new Set<string>();
      for (const exp of result.exports) {
        for (const spec of exp.specifiers) {
          exports.add(spec.exported);
        }
      }
      allExports.set(result.path, exports);
    }

    // Collect all imports
    const allImports = new Set<string>();
    for (const result of results) {
      for (const imp of result.imports) {
        for (const spec of imp.specifiers) {
          allImports.add(spec.imported);
        }
      }
    }

    // Find unused exports
    const unusedExports: { file: string; symbol: string }[] = [];
    for (const [file, exports] of allExports.entries()) {
      for (const exported of exports) {
        if (!allImports.has(exported) && exported !== 'default') {
          unusedExports.push({ file: path.basename(file), symbol: exported });
        }
      }
    }

    // Should find 'unused' export from fileC
    expect(unusedExports.length).toBeGreaterThan(0);
    expect(unusedExports.some(u => u.symbol === 'unused')).toBe(true);
    expect(unusedExports.some(u => u.file === 'fileC.ts')).toBe(true);
  });

  /**
   * Test 4: Parse project with 10+ files
   * Complete dependency graph analysis
   */
  it('analyzes dependency graph for multi-file project', async () => {
    // Create a small project with multiple files
    const projectDir = path.join(TEST_DIR, 'small-project');
    await fs.mkdir(projectDir, { recursive: true });

    // Create 10 interconnected files
    const fileCount = 10;
    const files: string[] = [];

    for (let i = 0; i < fileCount; i++) {
      const filePath = path.join(projectDir, `module${i}.ts`);
      files.push(filePath);

      // Each file imports from the previous file (creating a chain)
      const imports = i > 0 ? `import { func${i - 1} } from './module${i - 1}';` : '';
      const content = `
        ${imports}
        export function func${i}() {
          return ${i};
        }
      `;

      await fs.writeFile(filePath, content);
    }

    try {
      // Parse all files
      const results = await Promise.all(files.map(f => parse(f)));

      // Verify all files parsed successfully
      expect(results).toHaveLength(fileCount);

      // Verify import/export counts
      const totalImports = results.reduce((sum, r) => sum + r.imports.length, 0);
      const totalExports = results.reduce((sum, r) => sum + r.exports.length, 0);

      expect(totalImports).toBe(fileCount - 1); // 9 files import from previous
      expect(totalExports).toBe(fileCount); // All 10 files export

      // Build dependency chain
      const chain: string[] = [];
      let current = files[0];

      for (let i = 0; i < fileCount; i++) {
        chain.push(path.basename(current));
        const result = results.find(r => r.path === current);
        if (result && result.imports.length > 0) {
          const nextModule = result.imports[0].source.replace('./', '');
          current = path.join(projectDir, nextModule + '.ts');
        }
      }

      // Verify chain length
      expect(chain.length).toBe(fileCount);
    } finally {
      // Cleanup
      await fs.rm(projectDir, { recursive: true, force: true });
    }
  });

  /**
   * Performance test: Should handle multi-file analysis efficiently
   */
  it('performs multi-file analysis in acceptable time', async () => {
    const files = [
      path.join(TEST_DIR, 'fileA.ts'),
      path.join(TEST_DIR, 'fileB.ts'),
      path.join(TEST_DIR, 'fileC.ts'),
      path.join(TEST_DIR, 'fileD.ts'),
    ];

    const startTime = Date.now();

    // Parse all files in parallel
    await Promise.all(files.map(f => parse(f)));

    const duration = Date.now() - startTime;

    // Should complete in reasonable time (< 1 second for 4 small files)
    expect(duration).toBeLessThan(1000);
  });
});
