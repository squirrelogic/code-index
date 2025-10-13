/**
 * Class with methods for testing TypeScript method chunking
 */

/**
 * Calculator class with basic arithmetic operations
 */
class Calculator {
  private history: string[] = [];

  /**
   * Constructor initializes the calculator
   * @param precision Number of decimal places
   */
  constructor(private precision: number = 2) {
    this.history = [];
  }

  /**
   * Adds two numbers
   * @param a First number
   * @param b Second number
   * @returns Sum of a and b
   */
  add(a: number, b: number): number {
    const result = a + b;
    this.history.push(`${a} + ${b} = ${result}`);
    return this.roundToPrecision(result);
  }

  /**
   * Subtracts b from a
   * @param a First number
   * @param b Second number
   * @returns Difference
   */
  subtract(a: number, b: number): number {
    const result = a - b;
    this.history.push(`${a} - ${b} = ${result}`);
    return this.roundToPrecision(result);
  }

  /**
   * Multiplies two numbers
   */
  multiply(a: number, b: number): number {
    return this.roundToPrecision(a * b);
  }

  /**
   * Async method that fetches calculation result from API
   */
  async fetchCalculation(expression: string): Promise<number> {
    const response = await fetch(`/api/calculate?expr=${expression}`);
    const result = await response.json();
    return result.value;
  }

  /**
   * Generator method that yields calculation steps
   */
  *calculateSteps(a: number, b: number): Generator<string> {
    yield `Starting calculation: ${a} + ${b}`;
    const result = a + b;
    yield `Intermediate result: ${result}`;
    yield `Final result: ${this.roundToPrecision(result)}`;
  }

  /**
   * Private helper method
   */
  private roundToPrecision(value: number): number {
    const multiplier = Math.pow(10, this.precision);
    return Math.round(value * multiplier) / multiplier;
  }

  /**
   * Gets the calculation history
   */
  getHistory(): string[] {
    return [...this.history];
  }

  /**
   * Clears the history
   */
  clearHistory(): void {
    this.history = [];
  }
}

/**
 * Extended calculator with scientific operations
 */
class ScientificCalculator extends Calculator {
  /**
   * Constructor with default high precision
   */
  constructor() {
    super(10);
  }

  /**
   * Calculates power
   * @param base Base number
   * @param exponent Exponent
   * @returns base^exponent
   */
  power(base: number, exponent: number): number {
    return Math.pow(base, exponent);
  }

  /**
   * Calculates square root
   */
  sqrt(value: number): number {
    return Math.sqrt(value);
  }
}
