/**
 * Async and generator functions for testing special chunk types
 */

/**
 * Async function that fetches user data
 */
async function fetchUser(id: number): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch user ${id}`);
  }
  return response.json();
}

/**
 * Async function with error handling
 */
async function fetchWithRetry(url: string, maxRetries: number = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Generator function that yields fibonacci numbers
 */
function* fibonacci(max: number = 10): Generator<number> {
  let a = 0, b = 1;
  for (let i = 0; i < max; i++) {
    yield a;
    [a, b] = [b, a + b];
  }
}

/**
 * Generator function that yields range of numbers
 */
function* range(start: number, end: number, step: number = 1): Generator<number> {
  for (let i = start; i < end; i += step) {
    yield i;
  }
}

/**
 * Async generator function
 */
async function* fetchPages(baseUrl: string, maxPages: number): AsyncGenerator<Page> {
  for (let page = 1; page <= maxPages; page++) {
    const response = await fetch(`${baseUrl}?page=${page}`);
    const data = await response.json();
    yield data;
  }
}

/**
 * Class with async and generator methods
 */
class AsyncDataSource {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Async method to fetch data
   */
  async fetch(id: string): Promise<Data> {
    const response = await fetch(`${this.baseUrl}/${id}`);
    return response.json();
  }

  /**
   * Async method with multiple awaits
   */
  async fetchMultiple(ids: string[]): Promise<Data[]> {
    const promises = ids.map(id => this.fetch(id));
    return Promise.all(promises);
  }

  /**
   * Generator method that yields items
   */
  *generateIds(count: number): Generator<string> {
    for (let i = 0; i < count; i++) {
      yield `id-${i}`;
    }
  }

  /**
   * Async generator method
   */
  async *streamData(ids: string[]): AsyncGenerator<Data> {
    for (const id of ids) {
      const data = await this.fetch(id);
      yield data;
    }
  }
}

// Type definitions
interface User {
  id: number;
  name: string;
  email: string;
}

interface Page {
  number: number;
  data: unknown[];
}

interface Data {
  id: string;
  value: unknown;
}
