/**
 * Simple function examples for testing JavaScript chunking
 */

/**
 * Calculates the sum of two numbers
 * @param {number} a First number
 * @param {number} b Second number
 * @returns {number} The sum of a and b
 */
function add(a, b) {
  return a + b;
}

/**
 * Multiplies two numbers
 */
function multiply(a, b) {
  return a * b;
}

// Arrow function assigned to const
const square = (n) => {
  return n * n;
};

// Arrow function with expression body
const double = (n) => n * 2;

// Async function
async function fetchData(url) {
  const response = await fetch(url);
  return response.text();
}

// Async arrow function
const fetchJson = async (url) => {
  const response = await fetch(url);
  return response.json();
};

// Generator function
function* numberGenerator(max) {
  for (let i = 0; i < max; i++) {
    yield i;
  }
}

// Function expression assigned to variable
const greet = function(name) {
  return `Hello, ${name}!`;
};
