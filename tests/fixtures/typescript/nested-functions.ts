/**
 * Functions with nested functions to test inner function handling
 */

/**
 * Outer function with nested helper
 * Per spec FR-010, inner functions should be included in parent chunk
 */
function processData(data: string[]): string[] {
  // Inner function (should NOT be a separate chunk)
  function sanitize(item: string): string {
    return item.trim().toLowerCase();
  }

  // Another inner function
  function validate(item: string): boolean {
    return item.length > 0;
  }

  return data
    .map(sanitize)
    .filter(validate);
}

/**
 * Function with nested arrow functions
 */
function calculateStats(numbers: number[]): { sum: number; avg: number } {
  const sum = numbers.reduce((acc, n) => acc + n, 0);
  const avg = sum / numbers.length;

  // Inner function with closure
  const format = (value: number) => Math.round(value * 100) / 100;

  return {
    sum: format(sum),
    avg: format(avg)
  };
}

/**
 * Higher-order function that returns a function
 */
function createMultiplier(factor: number): (n: number) => number {
  // Returned function (inner function)
  return (n: number) => n * factor;
}

/**
 * Async function with nested async helpers
 */
async function fetchAndProcess(urls: string[]): Promise<string[]> {
  // Inner async function
  async function fetchOne(url: string): Promise<string> {
    const response = await fetch(url);
    return response.text();
  }

  // Inner processing function
  function process(text: string): string {
    return text.toUpperCase();
  }

  const results = await Promise.all(urls.map(fetchOne));
  return results.map(process);
}

/**
 * Class with nested function in method
 */
class DataProcessor {
  /**
   * Method with nested helper function
   */
  transform(items: string[]): string[] {
    // Inner function in method
    function capitalize(str: string): string {
      return str.charAt(0).toUpperCase() + str.slice(1);
    }

    return items.map(capitalize);
  }
}
