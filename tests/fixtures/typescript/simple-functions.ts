/**
 * Simple function examples for testing TypeScript chunking
 */

/**
 * Calculates the sum of two numbers
 * @param a First number
 * @param b Second number
 * @returns The sum of a and b
 */
function add(a: number, b: number): number {
  return a + b;
}

/**
 * Multiplies two numbers
 * @param a First number
 * @param b Second number
 * @returns The product of a and b
 */
function multiply(a: number, b: number): number {
  return a * b;
}

/**
 * Greets a person by name
 * @param name Person's name
 * @returns Greeting message
 */
function greet(name: string): string {
  return `Hello, ${name}!`;
}

// Arrow function assigned to const
const square = (n: number): number => {
  return n * n;
};

// Arrow function with expression body
const double = (n: number): number => n * 2;

// Async function
async function fetchData(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

// Async arrow function
const fetchJson = async (url: string): Promise<unknown> => {
  const response = await fetch(url);
  return response.json();
};

// Generator function
function* numberGenerator(max: number): Generator<number> {
  for (let i = 0; i < max; i++) {
    yield i;
  }
}
