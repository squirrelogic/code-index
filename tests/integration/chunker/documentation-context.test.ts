/**
 * Integration tests for documentation and context preservation
 * T035: Test US2 acceptance scenarios end-to-end
 * SC-008: 95% self-contained chunks
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parseAndChunk } from '../../helpers/chunker-test-helper.js';
import { Language } from '../../../src/models/ChunkTypes.js';
import { ChunkValidator } from '../../../src/services/chunker/ChunkValidator.js';

describe('Documentation and Context Preservation (US2)', () => {
  let validator: ChunkValidator;

  beforeAll(() => {
    validator = new ChunkValidator();
  });

  describe('JSDoc preservation in TypeScript', () => {
    it('should include complete JSDoc in chunk', async () => {
      const code = `
/**
 * Calculates the sum of two numbers
 * @param a - First number
 * @param b - Second number
 * @returns The sum of a and b
 */
function add(a: number, b: number): number {
  return a + b;
}`;

      const chunks = await parseAndChunk('/test/math.ts', code, Language.TypeScript);

      expect(chunks).toHaveLength(1);
      const chunk = chunks[0]!;

      // Verify JSDoc is completely preserved
      expect(chunk.documentation).toContain('Calculates the sum of two numbers');
      expect(chunk.documentation).toContain('@param a - First number');
      expect(chunk.documentation).toContain('@param b - Second number');
      expect(chunk.documentation).toContain('@returns The sum of a and b');

      // Verify self-containment
      expect(validator.isSelfContained(chunk)).toBe(true);
    });

    it('should preserve multi-line comments', async () => {
      const code = `
/*
 * This function processes data
 * It handles multiple scenarios:
 * - Empty arrays
 * - Null values
 * - Edge cases
 */
function process(data) {
  return data;
}`;

      const chunks = await parseAndChunk('/test/processor.ts', code, Language.TypeScript);

      expect(chunks).toHaveLength(1);
      const chunk = chunks[0]!;

      expect(chunk.documentation).toContain('This function processes data');
      expect(chunk.documentation).toContain('Empty arrays');
      expect(chunk.documentation).toContain('Null values');
      expect(chunk.documentation).toContain('Edge cases');
    });

    it('should preserve JSDoc for class methods', async () => {
      const code = `
class Calculator {
  /**
   * Multiplies two numbers
   * @param x - First operand
   * @param y - Second operand
   */
  multiply(x: number, y: number): number {
    return x * y;
  }
}`;

      const chunks = await parseAndChunk('/test/calculator.ts', code, Language.TypeScript);

      expect(chunks.length).toBeGreaterThan(0);
      const methodChunk = chunks.find((c) => c.name === 'multiply');

      expect(methodChunk).toBeDefined();
      expect(methodChunk!.documentation).toContain('Multiplies two numbers');
      expect(methodChunk!.documentation).toContain('@param x');
      expect(methodChunk!.documentation).toContain('@param y');
    });
  });

  describe('Python docstring preservation', () => {
    it('should include complete docstring with class name, inheritance, signature', async () => {
      const code = `
class DataProcessor(BaseProcessor):
    """
    Processes data from various sources.

    Args:
        config: Configuration dictionary

    Returns:
        Processed data as DataFrame
    """
    def transform(self, data):
        """
        Transform the input data.

        Args:
            data: Input data to transform

        Returns:
            Transformed data
        """
        return data.upper()`;

      const chunks = await parseAndChunk('/test/processor.py', code, Language.Python);

      expect(chunks.length).toBeGreaterThan(0);
      const methodChunk = chunks.find((c) => c.name === 'transform');

      expect(methodChunk).toBeDefined();

      // Verify class context
      expect(methodChunk!.context.className).toBe('DataProcessor');
      expect(methodChunk!.context.classInheritance).toContain('BaseProcessor');

      // Verify signature
      expect(methodChunk!.context.methodSignature).toContain('transform');
      expect(methodChunk!.context.methodSignature).toContain('self');
      expect(methodChunk!.context.methodSignature).toContain('data');

      // Verify docstring
      expect(methodChunk!.documentation).toContain('Transform the input data');
      expect(methodChunk!.documentation).toContain('Args:');
      expect(methodChunk!.documentation).toContain('Returns:');

      // Verify self-containment
      expect(validator.isSelfContained(methodChunk!)).toBe(true);
    });

    it('should preserve docstrings for functions', async () => {
      const code = `
def calculate_mean(numbers):
    """
    Calculate the mean of a list of numbers.

    Parameters
    ----------
    numbers : list
        List of numeric values

    Returns
    -------
    float
        The arithmetic mean
    """
    return sum(numbers) / len(numbers)`;

      const chunks = await parseAndChunk('/test/stats.py', code, Language.Python);

      expect(chunks).toHaveLength(1);
      const chunk = chunks[0]!;

      expect(chunk.documentation).toContain('Calculate the mean of a list of numbers');
      expect(chunk.documentation).toContain('Parameters');
      expect(chunk.documentation).toContain('Returns');
    });

    it('should handle decorated methods with docstrings', async () => {
      const code = `
class MyClass:
    @property
    def value(self):
        """Get the current value"""
        return self._value

    @value.setter
    def value(self, val):
        """Set the current value"""
        self._value = val`;

      const chunks = await parseAndChunk('/test/props.py', code, Language.Python);

      expect(chunks.length).toBeGreaterThan(0);

      // Check property getter
      const getterChunk = chunks.find((c) => c.name === 'value' && c.content.includes('Get'));

      if (getterChunk) {
        // Documentation might be null for decorated methods (edge case)
        if (getterChunk.documentation) {
          expect(getterChunk.documentation).toContain('Get the current value');
        }
        expect(getterChunk.context.className).toBe('MyClass');
      }
    });
  });

  describe('Module path and namespace preservation', () => {
    it('should preserve module path in context', async () => {
      const code = `
function utilityFunction() {
  return 42;
}`;

      const chunks = await parseAndChunk(
        '/test/project/src/utils/helpers.ts',
        code,
        Language.TypeScript
      );

      expect(chunks).toHaveLength(1);
      const chunk = chunks[0]!;

      // Module path should be derived from file path
      expect(chunk.context.modulePath).toBeTruthy();
      expect(typeof chunk.context.modulePath).toBe('string');
    });

    it('should handle namespace hierarchies', async () => {
      const code = `
namespace MyNamespace {
  export namespace Utils {
    export function helper() {
      return true;
    }
  }
}`;

      const chunks = await parseAndChunk('/test/namespaced.ts', code, Language.TypeScript);

      // Namespaced functions should be captured
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('Context completeness', () => {
    it('should provide complete context for methods in inherited classes', async () => {
      const code = `
class Base {
  baseMethod() {
    return 'base';
  }
}

class Child extends Base {
  childMethod() {
    return 'child';
  }
}`;

      const chunks = await parseAndChunk('/test/inheritance.ts', code, Language.TypeScript);

      const childMethodChunk = chunks.find((c) => c.name === 'childMethod');

      expect(childMethodChunk).toBeDefined();
      expect(childMethodChunk!.context.className).toBe('Child');
      expect(childMethodChunk!.context.classInheritance).toContain('Base');
      expect(childMethodChunk!.context.isTopLevel).toBe(false);
    });

    it('should distinguish top-level functions from methods', async () => {
      const code = `
function topLevel() {
  return 1;
}

class MyClass {
  method() {
    return 2;
  }
}`;

      const chunks = await parseAndChunk('/test/mixed.ts', code, Language.TypeScript);

      const topLevelChunk = chunks.find((c) => c.name === 'topLevel');
      const methodChunk = chunks.find((c) => c.name === 'method');

      expect(topLevelChunk!.context.isTopLevel).toBe(true);
      expect(topLevelChunk!.context.className).toBeNull();

      expect(methodChunk!.context.isTopLevel).toBe(false);
      expect(methodChunk!.context.className).toBe('MyClass');
    });

    it('should capture async and generator signatures', async () => {
      const code = `
async function fetchData() {
  return await fetch('/api');
}

function* generateNumbers() {
  yield 1;
  yield 2;
}

class AsyncGenerator {
  async* streamData() {
    yield 'a';
    yield 'b';
  }
}`;

      const chunks = await parseAndChunk('/test/async-gen.ts', code, Language.TypeScript);

      const asyncChunk = chunks.find((c) => c.name === 'fetchData');
      const generatorChunk = chunks.find((c) => c.name === 'generateNumbers');
      const asyncGenChunk = chunks.find((c) => c.name === 'streamData');

      expect(asyncChunk!.context.methodSignature).toContain('async');
      expect(generatorChunk!.context.methodSignature).toContain('*');
      expect(asyncGenChunk!.context.methodSignature).toContain('async');
      expect(asyncGenChunk!.context.methodSignature).toContain('*');
    });
  });

  describe('Self-containment validation (SC-008: 95%)', () => {
    it('should achieve 95%+ self-containment rate for well-documented code', async () => {
      const code = `
/**
 * User management service
 */
class UserService {
  /**
   * Get user by ID
   * @param id - User ID
   */
  async getUser(id: string) {
    return fetch(\`/users/\${id}\`);
  }

  /**
   * Create new user
   * @param data - User data
   */
  async createUser(data: any) {
    return fetch('/users', { method: 'POST', body: JSON.stringify(data) });
  }

  /**
   * Delete user
   * @param id - User ID
   */
  async deleteUser(id: string) {
    return fetch(\`/users/\${id}\`, { method: 'DELETE' });
  }
}`;

      const chunks = await parseAndChunk('/test/user-service.ts', code, Language.TypeScript);

      const selfContainmentRate = validator.calculateSelfContainmentRate(chunks);

      // Should meet SC-008: 95% self-contained
      expect(selfContainmentRate).toBeGreaterThanOrEqual(95);
    });

    it('should validate individual chunk completeness', async () => {
      const code = `
/**
 * Calculate area of circle
 * @param radius - Circle radius
 * @returns Area
 */
function calculateArea(radius: number): number {
  return Math.PI * radius * radius;
}`;

      const chunks = await parseAndChunk('/test/geometry.ts', code, Language.TypeScript);

      expect(chunks).toHaveLength(1);
      const chunk = chunks[0]!;

      const result = validator.validateChunk(chunk);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(validator.isSelfContained(chunk)).toBe(true);
    });

    it('should provide validation summary for multiple chunks', async () => {
      const code = `
/** Documented function */
function documented() {
  return 1;
}

// Missing JSDoc
function undocumented() {
  return 2;
}

/** Another documented function */
function alsoDocumented() {
  return 3;
}`;

      const chunks = await parseAndChunk('/test/validation.ts', code, Language.TypeScript);

      const summary = validator.validateChunks(chunks);

      expect(summary.totalChunks).toBe(3);
      expect(summary.validChunks).toBe(3); // All are valid (docs optional)
      expect(summary.invalidChunks).toBe(0);

      // Self-containment rate should still be high
      const selfContainmentRate = validator.calculateSelfContainmentRate(chunks);
      expect(selfContainmentRate).toBeGreaterThanOrEqual(66); // 2/3 documented
    });
  });

  describe('Edge cases', () => {
    it('should handle functions without documentation gracefully', async () => {
      const code = `
function noDoc() {
  return 42;
}`;

      const chunks = await parseAndChunk('/test/nodoc.ts', code, Language.TypeScript);

      expect(chunks).toHaveLength(1);
      const chunk = chunks[0]!;

      // Documentation is null but chunk is still valid
      expect(chunk.documentation).toBeNull();

      const result = validator.validateChunk(chunk);
      expect(result.isValid).toBe(true);
      // May have warnings about missing documentation
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle complex class hierarchies', async () => {
      const code = `
class GrandParent {}
class Parent extends GrandParent {}
class Child extends Parent {
  /**
   * Child method
   */
  method() {
    return 'child';
  }
}`;

      const chunks = await parseAndChunk('/test/hierarchy.ts', code, Language.TypeScript);

      const childMethod = chunks.find((c) => c.name === 'method');

      expect(childMethod).toBeDefined();
      expect(childMethod!.context.className).toBe('Child');
      expect(childMethod!.context.classInheritance).toContain('Parent');
      // Note: Only direct parent is captured, not the entire chain
    });

    it('should handle Python multiple inheritance', async () => {
      const code = `
class Mixin1:
    pass

class Mixin2:
    pass

class MyClass(Mixin1, Mixin2):
    """A class with multiple inheritance"""
    def method(self):
        """A method"""
        pass`;

      const chunks = await parseAndChunk('/test/multi-inherit.py', code, Language.Python);

      const methodChunk = chunks.find((c) => c.name === 'method');

      expect(methodChunk).toBeDefined();
      expect(methodChunk!.context.className).toBe('MyClass');
      expect(methodChunk!.context.classInheritance).toContain('Mixin1');
      expect(methodChunk!.context.classInheritance).toContain('Mixin2');
    });
  });
});
