/**
 * Sample JavaScript file for testing parser
 * Contains ES6+ features and CommonJS
 */

const { EventEmitter } = require('events');

// Class declaration
class Calculator extends EventEmitter {
  constructor() {
    super();
    this.history = [];
  }

  // Method
  add(a, b) {
    const result = a + b;
    this.history.push({ operation: 'add', a, b, result });
    this.emit('calculated', result);
    return result;
  }

  // Static method
  static create() {
    return new Calculator();
  }

  // Getter
  get lastResult() {
    return this.history[this.history.length - 1]?.result;
  }
}

// Function declaration
function multiply(a, b) {
  return a * b;
}

// Arrow function
const divide = (a, b) => {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
};

// Nested function
function complexOperation(x) {
  function helper(y) {
    return y * 2;
  }

  return helper(x) + 10;
}

// Object with methods
const mathUtils = {
  square(n) {
    return n * n;
  },

  cube(n) {
    return n * n * n;
  }
};

// Export
module.exports = {
  Calculator,
  multiply,
  divide,
  mathUtils
};
