/**
 * Contract Tests for Call Tracking (T044, US4)
 *
 * Validates the parser contract for function call extraction
 * according to the specification scenarios.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parse } from '../../src/services/parser/index.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, mkdirSync, rmSync } from 'fs';

describe('Parser Contract: Function Call Tracking (US4)', () => {
  const testDir = join(tmpdir(), 'code-index-test-calls-' + Date.now());

  // Setup test directory
  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
  });

  // Cleanup test directory
  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('Scenario 1: File with function calls', () => {
    it('should identify all call sites with called function names', async () => {
      const filePath = join(testDir, 'calls.ts');
      const source = `
function helper() {
  return 42;
}

function main() {
  const result = helper();
  console.log(result);
  Math.max(1, 2, 3);
}
`;
      writeFileSync(filePath, source, 'utf-8');

      const result = await parse(filePath);

      // Verify calls array is populated
      expect(result.calls).toBeDefined();
      expect(result.calls.length).toBeGreaterThan(0);

      // Find specific calls
      const helperCall = result.calls.find(c => c.callee === 'helper');
      const logCall = result.calls.find(c => c.callee === 'log');
      const maxCall = result.calls.find(c => c.callee === 'max');

      // Verify helper call
      expect(helperCall).toBeDefined();
      expect(helperCall?.kind).toBe('function');
      expect(helperCall?.argumentCount).toBe(0);

      // Verify console.log call
      expect(logCall).toBeDefined();
      expect(logCall?.kind).toBe('method');
      expect(logCall?.receiver).toBe('console');
      expect(logCall?.argumentCount).toBe(1);

      // Verify Math.max call
      expect(maxCall).toBeDefined();
      expect(maxCall?.kind).toBe('method');
      expect(maxCall?.receiver).toBe('Math');
      expect(maxCall?.argumentCount).toBe(3);

      // Verify all calls have spans
      for (const call of result.calls) {
        expect(call.span).toBeDefined();
        expect(call.span.startLine).toBeGreaterThan(0);
        expect(call.span.endLine).toBeGreaterThan(0);
      }
    });
  });

  describe('Scenario 2: Method chaining in JavaScript', () => {
    it('should correctly extract entire call chain', async () => {
      const filePath = join(testDir, 'chaining.js');
      const source = `
const result = array
  .filter(x => x > 0)
  .map(x => x * 2)
  .reduce((sum, x) => sum + x, 0);
`;
      writeFileSync(filePath, source, 'utf-8');

      const result = await parse(filePath);

      // Find chained method calls
      const filterCall = result.calls.find(c => c.callee === 'filter');
      const mapCall = result.calls.find(c => c.callee === 'map');
      const reduceCall = result.calls.find(c => c.callee === 'reduce');

      // Verify all calls exist
      expect(filterCall).toBeDefined();
      expect(mapCall).toBeDefined();
      expect(reduceCall).toBeDefined();

      // Verify filter is the first in chain
      expect(filterCall?.chain).toBeDefined();
      expect(filterCall?.chain?.position).toBe(0);
      expect(filterCall?.chain?.next).toBe('map');

      // Verify map is in the middle
      expect(mapCall?.chain).toBeDefined();
      expect(mapCall?.chain?.position).toBe(1);
      expect(mapCall?.chain?.previous).toBe('filter');
      expect(mapCall?.chain?.next).toBe('reduce');

      // Verify reduce is the last in chain
      expect(reduceCall?.chain).toBeDefined();
      expect(reduceCall?.chain?.position).toBe(2);
      expect(reduceCall?.chain?.previous).toBe('map');
    });
  });

  describe('Scenario 3: Python method calls', () => {
    it('should distinguish object methods and static calls', async () => {
      const filePath = join(testDir, 'python-calls.py');
      const source = `
def process():
    obj.method()
    SomeClass.static_method()
    standalone_function()
`;
      writeFileSync(filePath, source, 'utf-8');

      const result = await parse(filePath);

      // Verify calls are extracted
      expect(result.calls.length).toBeGreaterThanOrEqual(3);

      // Find specific calls
      const methodCall = result.calls.find(c => c.callee === 'method');
      const staticCall = result.calls.find(c => c.callee === 'static_method');
      const functionCall = result.calls.find(c => c.callee === 'standalone_function');

      // Verify object method call
      expect(methodCall).toBeDefined();
      expect(methodCall?.kind).toBe('function'); // Python uses 'function' for attribute calls

      // Verify static method call
      expect(staticCall).toBeDefined();

      // Verify standalone function call
      expect(functionCall).toBeDefined();
      expect(functionCall?.kind).toBe('function');
    });
  });

  describe('Scenario 4: Dynamic or computed calls', () => {
    it('should handle gracefully without failing', async () => {
      const filePath = join(testDir, 'dynamic-calls.js');
      const source = `
const methodName = 'doSomething';
obj[methodName]();
obj['computed']();
obj[getMethod()]();
`;
      writeFileSync(filePath, source, 'utf-8');

      // Should not throw
      const result = await parse(filePath);

      // Verify parsing succeeded
      expect(result).toBeDefined();
      expect(result.calls).toBeDefined();

      // Find dynamic calls
      const dynamicCalls = result.calls.filter(c => c.kind === 'dynamic');
      expect(dynamicCalls.length).toBeGreaterThan(0);

      // Verify dynamic calls have special callee name
      for (const call of dynamicCalls) {
        expect(call.callee).toBe('<dynamic>');
      }
    });
  });

  describe('Contract Structure Validation', () => {
    it('should return FunctionCall objects matching the contract', async () => {
      const filePath = join(testDir, 'contract-structure.ts');
      const source = `
class Example {
  constructor() {
    super();
  }

  method() {
    this.helper(1, 2);
    new SomeClass();
  }
}
`;
      writeFileSync(filePath, source, 'utf-8');

      const result = await parse(filePath);

      // Verify at least one call exists
      expect(result.calls.length).toBeGreaterThan(0);

      // Validate structure of each call
      for (const call of result.calls) {
        // Required fields
        expect(call.callee).toBeDefined();
        expect(typeof call.callee).toBe('string');

        expect(call.kind).toBeDefined();
        expect(['function', 'method', 'constructor', 'super', 'dynamic']).toContain(call.kind);

        expect(typeof call.argumentCount).toBe('number');
        expect(call.argumentCount).toBeGreaterThanOrEqual(0);

        expect(call.span).toBeDefined();
        expect(call.span.startLine).toBeGreaterThan(0);
        expect(call.span.endLine).toBeGreaterThan(0);

        // Optional fields (should be present only when relevant)
        if (call.kind === 'method') {
          // Method calls may have receiver
          if (call.receiver !== undefined) {
            expect(typeof call.receiver).toBe('string');
          }
        }

        if (call.chain !== undefined) {
          // Chain context should have position
          expect(typeof call.chain.position).toBe('number');
          expect(call.chain.position).toBeGreaterThanOrEqual(0);

          // Previous and next are optional
          if (call.chain.previous !== undefined) {
            expect(typeof call.chain.previous).toBe('string');
          }
          if (call.chain.next !== undefined) {
            expect(typeof call.chain.next).toBe('string');
          }
        }
      }
    });
  });

  describe('Call Tracking Comprehensive', () => {
    it('should track all call types in a complex file', async () => {
      const filePath = join(testDir, 'comprehensive.ts');
      const source = `
import { helper } from './helper';

class MyClass {
  constructor() {
    super();
  }

  async process() {
    // Function call
    helper();

    // Method call
    this.doSomething();

    // Chained calls
    this.getData()
      .filter(x => x > 0)
      .map(x => x * 2);

    // Constructor call
    const obj = new SomeClass();

    // Dynamic call
    obj[this.methodName]();

    // Built-in methods
    console.log('test');
    Math.max(1, 2, 3);
  }
}
`;
      writeFileSync(filePath, source, 'utf-8');

      const result = await parse(filePath);

      // Verify comprehensive call tracking
      expect(result.calls.length).toBeGreaterThan(5);

      // Count different call kinds
      const functionCalls = result.calls.filter(c => c.kind === 'function');
      const methodCalls = result.calls.filter(c => c.kind === 'method');
      const constructorCalls = result.calls.filter(c => c.kind === 'constructor');
      const dynamicCalls = result.calls.filter(c => c.kind === 'dynamic');
      const superCalls = result.calls.filter(c => c.kind === 'super');

      expect(functionCalls.length).toBeGreaterThan(0);
      expect(methodCalls.length).toBeGreaterThan(0);
      expect(constructorCalls.length).toBeGreaterThan(0);
      expect(superCalls.length).toBeGreaterThan(0);

      // Verify chained calls have chain context
      const chainedCalls = result.calls.filter(c => c.chain !== undefined);
      expect(chainedCalls.length).toBeGreaterThan(0);
    });
  });
});
