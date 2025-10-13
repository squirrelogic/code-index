/**
 * Edge cases for testing robust chunking behavior
 */

// Function without documentation
function undocumented(x: number): number {
  return x * 2;
}

// Empty function
function empty(): void {
  // Intentionally empty
}

// Single-line function
function oneLiner(): string { return "hello"; }

/**
 * Function with very long parameter list
 */
function manyParams(
  a: string,
  b: number,
  c: boolean,
  d: string[],
  e: Record<string, unknown>,
  f: Date,
  g: RegExp,
  h: Map<string, number>,
  i: Set<string>,
  j: WeakMap<object, string>
): void {
  // Implementation
}

/**
 * Function with complex generic type parameters
 */
function genericFunction<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  key: K
): T[K] {
  return obj[key];
}

// Anonymous function in object
const api = {
  fetch: async function(url: string) {
    return fetch(url);
  },

  process: function(data: unknown) {
    return JSON.stringify(data);
  }
};

// IIFE (Immediately Invoked Function Expression)
(function() {
  console.log('IIFE executed');
})();

/**
 * Function with multiline string in documentation
 * This is a very long documentation comment that spans multiple lines
 * to test how the chunker handles documentation that contains:
 * - Multiple paragraphs
 * - Bullet points
 * - Code examples like: `const x = 42;`
 *
 * @example
 * ```typescript
 * const result = complexFunction({ foo: 'bar' });
 * ```
 */
function complexFunction(options: { foo: string }): string {
  return options.foo;
}

/**
 * Class with various edge cases
 */
class EdgeCaseClass {
  // Property without initializer
  uninitializedProperty: string;

  // Static property
  static staticProperty: number = 42;

  // Private property with initializer
  private privateProperty: string = 'private';

  // Method with no parameters
  noParams(): void {}

  // Method with only optional parameters
  allOptional(a?: string, b?: number): void {}

  // Method with default parameters
  withDefaults(a: string = 'default', b: number = 0): void {}

  // Method with rest parameters
  withRest(...args: unknown[]): void {}

  // Method with destructured parameters
  withDestructuring({ a, b }: { a: string; b: number }): void {}

  // Static method
  static staticMethod(): void {}

  // Private method
  private privateMethod(): void {}

  // Protected method
  protected protectedMethod(): void {}

  // Getter
  get value(): string {
    return this.privateProperty;
  }

  // Setter
  set value(val: string) {
    this.privateProperty = val;
  }
}

/**
 * Interface (should be ignored by chunker - not a code chunk)
 */
interface NotAChunk {
  method(): void;
}

/**
 * Type alias (should be ignored - not executable code)
 */
type AlsoNotAChunk = {
  field: string;
};

/**
 * Enum (might be considered a module-level chunk)
 */
enum Status {
  Active = 'active',
  Inactive = 'inactive'
}
