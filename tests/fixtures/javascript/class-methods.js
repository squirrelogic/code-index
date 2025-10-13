/**
 * Class with methods for testing JavaScript method chunking
 */

/**
 * Calculator class with basic arithmetic operations
 */
class Calculator {
  /**
   * Constructor initializes the calculator
   * @param {number} precision Number of decimal places
   */
  constructor(precision = 2) {
    this.precision = precision;
    this.history = [];
  }

  /**
   * Adds two numbers
   * @param {number} a First number
   * @param {number} b Second number
   * @returns {number} Sum of a and b
   */
  add(a, b) {
    const result = a + b;
    this.history.push(`${a} + ${b} = ${result}`);
    return this.roundToPrecision(result);
  }

  /**
   * Subtracts b from a
   */
  subtract(a, b) {
    const result = a - b;
    this.history.push(`${a} - ${b} = ${result}`);
    return this.roundToPrecision(result);
  }

  /**
   * Async method that fetches calculation result from API
   */
  async fetchCalculation(expression) {
    const response = await fetch(`/api/calculate?expr=${expression}`);
    const result = await response.json();
    return result.value;
  }

  /**
   * Generator method that yields calculation steps
   */
  *calculateSteps(a, b) {
    yield `Starting calculation: ${a} + ${b}`;
    const result = a + b;
    yield `Intermediate result: ${result}`;
    yield `Final result: ${this.roundToPrecision(result)}`;
  }

  /**
   * Private helper method (using # private fields - ES2022)
   */
  roundToPrecision(value) {
    const multiplier = Math.pow(10, this.precision);
    return Math.round(value * multiplier) / multiplier;
  }

  /**
   * Gets the calculation history
   */
  getHistory() {
    return [...this.history];
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
   */
  power(base, exponent) {
    return Math.pow(base, exponent);
  }

  /**
   * Calculates square root
   */
  sqrt(value) {
    return Math.sqrt(value);
  }
}

module.exports = { Calculator, ScientificCalculator };
