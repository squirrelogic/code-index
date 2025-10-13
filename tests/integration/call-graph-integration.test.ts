/**
 * Integration Tests for Call Graph (T045)
 *
 * Tests end-to-end call graph extraction and analysis scenarios
 * including usage maps, call hierarchies, and multi-file analysis.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parse } from '../../src/services/parser/index.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import type { FunctionCall, Symbol } from '../../src/services/parser/index.js';

describe('Call Graph Integration Tests', () => {
  const testDir = join(tmpdir(), 'code-index-test-callgraph-' + Date.now());

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('Usage Map Building', () => {
    it('should build usage map showing which functions call which', async () => {
      const filePath = join(testDir, 'usage-map.ts');
      const source = `
function helper() {
  return 42;
}

function processor() {
  const value = helper();
  return value * 2;
}

function main() {
  const result = processor();
  console.log(result);
}
`;
      writeFileSync(filePath, source, 'utf-8');

      const result = await parse(filePath);

      // Build usage map: who calls whom
      const usageMap = new Map<string, string[]>();

      for (const call of result.calls) {
        // Find the symbol containing this call (the caller)
        const caller = result.symbols.find(
          s => s.span.startByte <= call.span.startByte &&
               s.span.endByte >= call.span.endByte
        );

        if (caller) {
          if (!usageMap.has(call.callee)) {
            usageMap.set(call.callee, []);
          }
          usageMap.get(call.callee)!.push(caller.name);
        }
      }

      // Verify usage map
      expect(usageMap.has('helper')).toBe(true);
      expect(usageMap.get('helper')).toContain('processor');

      expect(usageMap.has('processor')).toBe(true);
      expect(usageMap.get('processor')).toContain('main');

      expect(usageMap.has('log')).toBe(true);
      expect(usageMap.get('log')).toContain('main');
    });
  });

  describe('Unused Function Detection', () => {
    it('should find unused functions (symbols never called)', async () => {
      const filePath = join(testDir, 'unused.ts');
      const source = `
function used() {
  return 1;
}

function unused() {
  return 2;
}

function main() {
  return used();
}
`;
      writeFileSync(filePath, source, 'utf-8');

      const result = await parse(filePath);

      // Get all function symbols
      const functions = result.symbols.filter(s => s.kind === 'function');
      const functionNames = new Set(functions.map(f => f.name));

      // Get all called function names
      const calledNames = new Set(result.calls.map(c => c.callee));

      // Find unused functions
      const unusedFunctions: string[] = [];
      for (const name of functionNames) {
        if (!calledNames.has(name)) {
          unusedFunctions.push(name);
        }
      }

      // Verify unused function detection
      expect(unusedFunctions).toContain('unused');
      expect(unusedFunctions).not.toContain('used');
    });
  });

  describe('Call Hierarchy Tracing', () => {
    it('should trace call hierarchy from entry point to leaf functions', async () => {
      const filePath = join(testDir, 'hierarchy.ts');
      const source = `
function leaf1() {
  return 1;
}

function leaf2() {
  return 2;
}

function intermediate() {
  const a = leaf1();
  const b = leaf2();
  return a + b;
}

function entry() {
  return intermediate();
}
`;
      writeFileSync(filePath, source, 'utf-8');

      const result = await parse(filePath);

      // Build call graph: callee -> callers
      const callGraph = new Map<string, string[]>();
      for (const call of result.calls) {
        const caller = result.symbols.find(
          s => s.span.startByte <= call.span.startByte &&
               s.span.endByte >= call.span.endByte
        );

        if (caller) {
          if (!callGraph.has(call.callee)) {
            callGraph.set(call.callee, []);
          }
          callGraph.get(call.callee)!.push(caller.name);
        }
      }

      // Trace hierarchy from entry to leaves
      function traceCallers(callee: string, visited = new Set<string>()): string[] {
        if (visited.has(callee)) return [];
        visited.add(callee);

        const callers = callGraph.get(callee) || [];
        const allCallers = [...callers];

        for (const caller of callers) {
          allCallers.push(...traceCallers(caller, visited));
        }

        return allCallers;
      }

      // Verify hierarchy
      const leaf1Callers = traceCallers('leaf1');
      expect(leaf1Callers).toContain('intermediate');
      expect(leaf1Callers).toContain('entry');

      const intermediateCallers = traceCallers('intermediate');
      expect(intermediateCallers).toContain('entry');
    });
  });

  describe('Performance with Many Calls', () => {
    it('should handle files with 100+ calls efficiently', async () => {
      const filePath = join(testDir, 'many-calls.ts');

      // Generate file with 100+ calls
      const lines: string[] = [];
      lines.push('function helper(x: number) { return x * 2; }');
      lines.push('function process() {');
      for (let i = 0; i < 100; i++) {
        lines.push(`  const v${i} = helper(${i});`);
      }
      lines.push('  return v0;');
      lines.push('}');

      const source = lines.join('\n');
      writeFileSync(filePath, source, 'utf-8');

      const startTime = Date.now();
      const result = await parse(filePath);
      const duration = Date.now() - startTime;

      // Verify all calls extracted
      expect(result.calls.length).toBeGreaterThanOrEqual(100);

      // Verify performance (should be fast)
      expect(duration).toBeLessThan(1000); // Less than 1 second

      // Verify all calls have correct structure
      for (const call of result.calls) {
        expect(call.callee).toBeDefined();
        expect(call.kind).toBeDefined();
        expect(call.span).toBeDefined();
      }
    });
  });

  describe('Cross-Language Call Tracking', () => {
    it('should track calls consistently across TypeScript and JavaScript', async () => {
      // TypeScript file
      const tsPath = join(testDir, 'calls.ts');
      const tsSource = `
function foo() {
  return bar();
}

function bar() {
  return 42;
}
`;
      writeFileSync(tsPath, tsSource, 'utf-8');

      // JavaScript file
      const jsPath = join(testDir, 'calls.js');
      const jsSource = `
function foo() {
  return bar();
}

function bar() {
  return 42;
}
`;
      writeFileSync(jsPath, jsSource, 'utf-8');

      const tsResult = await parse(tsPath);
      const jsResult = await parse(jsPath);

      // Both should extract the same number of calls
      expect(tsResult.calls.length).toBe(jsResult.calls.length);

      // Both should have 'bar' call
      const tsBarCall = tsResult.calls.find(c => c.callee === 'bar');
      const jsBarCall = jsResult.calls.find(c => c.callee === 'bar');

      expect(tsBarCall).toBeDefined();
      expect(jsBarCall).toBeDefined();

      // Both should have same call kind
      expect(tsBarCall?.kind).toBe(jsBarCall?.kind);
    });
  });

  describe('Method Chaining Analysis', () => {
    it('should analyze method chains for optimization opportunities', async () => {
      const filePath = join(testDir, 'chains.ts');
      const source = `
const result = data
  .filter(x => x.active)
  .map(x => x.value)
  .sort()
  .slice(0, 10)
  .reduce((sum, x) => sum + x, 0);
`;
      writeFileSync(filePath, source, 'utf-8');

      const result = await parse(filePath);

      // Find all calls that are part of chains
      const chainedCalls = result.calls.filter(c => c.chain !== undefined);

      // Verify we have a chain
      expect(chainedCalls.length).toBeGreaterThan(0);

      // Build chain sequence
      const chainSequence: string[] = [];
      let current = chainedCalls.find(c => c.chain?.position === 0);

      while (current) {
        chainSequence.push(current.callee);
        const next = current.chain?.next;
        if (!next) break;
        current = chainedCalls.find(c => c.callee === next);
      }

      // Verify chain sequence
      expect(chainSequence.length).toBeGreaterThan(0);
      expect(chainSequence).toContain('filter');
      expect(chainSequence).toContain('map');

      // Verify positions are sequential
      const positions = chainedCalls.map(c => c.chain!.position).sort();
      for (let i = 0; i < positions.length; i++) {
        expect(positions[i]).toBe(i);
      }
    });
  });

  describe('Constructor and Super Call Tracking', () => {
    it('should track constructor and super calls in class hierarchies', async () => {
      const filePath = join(testDir, 'classes.ts');
      const source = `
class Base {
  constructor() {
    this.init();
  }

  init() {}
}

class Derived extends Base {
  constructor() {
    super();
    this.setup();
  }

  setup() {}
}

const instance = new Derived();
`;
      writeFileSync(filePath, source, 'utf-8');

      const result = await parse(filePath);

      // Find super call
      const superCall = result.calls.find(c => c.kind === 'super');
      expect(superCall).toBeDefined();
      expect(superCall?.callee).toBe('super');

      // Find constructor call
      const constructorCall = result.calls.find(c => c.kind === 'constructor');
      expect(constructorCall).toBeDefined();
      expect(constructorCall?.callee).toBe('Derived');

      // Find method calls in constructors
      const initCall = result.calls.find(c => c.callee === 'init');
      const setupCall = result.calls.find(c => c.callee === 'setup');

      expect(initCall).toBeDefined();
      expect(setupCall).toBeDefined();
    });
  });
});
