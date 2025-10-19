# STDIO Transport Research for MCP Server Implementation

**Feature**: Code Intelligence Protocol Server (010-expose-an-mcp)
**Date**: 2025-10-19
**Purpose**: Technical research on implementing JSON-RPC 2.0 over stdio streams for Node.js/TypeScript MCP servers

## Executive Summary

This document compiles research on implementing stdio transport for JSON-RPC 2.0 servers in Node.js/TypeScript, specifically for Model Context Protocol (MCP) server implementations. Key findings:

- **Message Framing**: Newline-delimited JSON (NDJSON) is the standard for stdio transport
- **Stream Isolation**: stdout for JSON-RPC messages only; stderr for all logging
- **Concurrency**: Single client per stdio instance; async request handling via promises/queues
- **Shutdown**: Monitor stdin 'end' and 'close' events for graceful cleanup
- **SDK Support**: MCP TypeScript SDK provides `StdioServerTransport` abstraction

---

## 1. Stream Setup Patterns

### 1.1 Basic Stream Configuration

**Standard Streams in Node.js**:
- `process.stdin`: Readable stream for incoming messages (client → server)
- `process.stdout`: Writable stream for JSON-RPC responses (server → client)
- `process.stderr`: Writable stream for logging and diagnostics

**Critical Rule**: **NEVER write anything to stdout except JSON-RPC messages**. Any other output corrupts the protocol stream and causes stdio-based servers to fail.

### 1.2 MCP SDK Pattern (Recommended)

The Model Context Protocol TypeScript SDK provides the standard implementation:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

// Create server with capabilities
const server = new Server(
  {
    name: 'code-index-server',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {},  // Enable tool support
      resources: {}  // Enable resource support
    }
  }
);

// Register request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search',
        description: 'Search the codebase',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            dir: { type: 'string', description: 'Directory filter (optional)' },
            lang: { type: 'string', description: 'Language filter (optional)' },
            k: { type: 'number', description: 'Max results (default 100)' }
          },
          required: ['query']
        }
      }
      // ... other tools
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'search') {
    // Process search request
    const results = await performSearch(args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Connect to stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);

// Server is now listening on stdin and writing to stdout
```

**Key Benefits**:
- Handles message framing automatically
- Manages JSON-RPC 2.0 protocol details
- Provides request/response correlation
- Includes error handling
- Abstracts stream lifecycle management

### 1.3 Low-Level Implementation (Alternative)

For custom implementations without the SDK:

```typescript
import * as readline from 'readline';
import { Readable, Writable } from 'stream';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

class StdioServer {
  private rl: readline.Interface;

  constructor() {
    // Create readline interface for line-by-line parsing
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false  // Disable terminal features
    });

    // Set up message handler
    this.rl.on('line', (line: string) => {
      this.handleMessage(line);
    });

    // Handle graceful shutdown
    this.rl.on('close', () => {
      this.shutdown();
    });

    // Ensure stdin doesn't keep process alive if unneeded
    // Remove this if you want the server to stay alive
    // process.stdin.unref();
  }

  private async handleMessage(line: string): Promise<void> {
    try {
      const request = JSON.parse(line) as JsonRpcRequest;

      // Validate JSON-RPC 2.0 format
      if (request.jsonrpc !== '2.0') {
        throw new Error('Invalid JSON-RPC version');
      }

      // Process request and get result
      const result = await this.processRequest(request);

      // Send response
      this.sendResponse({
        jsonrpc: '2.0',
        id: request.id ?? null,
        result
      });

    } catch (error) {
      // Send error response
      this.sendError(-32700, 'Parse error', error);
    }
  }

  private sendResponse(response: JsonRpcResponse): void {
    // Write to stdout as single line JSON
    process.stdout.write(JSON.stringify(response) + '\n');
  }

  private sendError(code: number, message: string, data?: unknown): void {
    this.sendResponse({
      jsonrpc: '2.0',
      id: null,
      error: { code, message, data }
    });
  }

  private async processRequest(request: JsonRpcRequest): Promise<unknown> {
    // Implement request handling logic
    throw new Error('Not implemented');
  }

  private shutdown(): void {
    // Cleanup logic
    console.error('Server shutting down...');
    process.exit(0);
  }
}

// Start server
const server = new StdioServer();
```

---

## 2. Message Framing and Parsing Strategies

### 2.1 Newline-Delimited JSON (NDJSON)

**Format Requirements**:
- Each message is a complete JSON object on a single line
- Messages are separated by newline characters (`\n`)
- JSON MUST NOT contain embedded newlines
- Each message MUST include `"jsonrpc": "2.0"` field

**Example Message Stream**:
```
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search","arguments":{"query":"test"}}}\n
```

### 2.2 Readline-Based Parsing

The `readline` module provides line-by-line parsing with buffering:

```typescript
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false  // Disable TTY features
});

// Event-based approach
rl.on('line', (line: string) => {
  try {
    const message = JSON.parse(line);
    handleMessage(message);
  } catch (error) {
    console.error('Parse error:', error);
    // Send JSON-RPC error response
  }
});
```

### 2.3 Async Iterator Approach

Node.js readline supports async iteration (requires async context):

```typescript
import * as readline from 'readline';

async function startServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false
  });

  // Use for-await-of loop
  for await (const line of rl) {
    try {
      const message = JSON.parse(line);
      await handleMessage(message);
    } catch (error) {
      console.error('Parse error:', error);
    }
  }
}

startServer().catch(console.error);
```

**Important Caveats**:
- Async operations between interface creation and iteration may cause missed lines
- For performance-sensitive apps, use event-based 'line' listener instead
- The iterator approach blocks on each iteration; use event-based for true concurrency

### 2.4 Stream-Based JSON Parsing

For large or complex JSON, use streaming parsers:

```typescript
import { createReadStream } from 'fs';
import * as readline from 'readline';

// For JSON Lines format
const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity  // Handle both \r\n and \n
});

rl.on('line', (line) => {
  if (line.trim()) {  // Skip empty lines
    const json = JSON.parse(line);
    processMessage(json);
  }
});
```

---

## 3. Logging Redirection Approaches

### 3.1 The Critical Rule

**NEVER log to stdout when using stdio transport.** Stdout is reserved exclusively for JSON-RPC messages. Any other output corrupts the protocol stream.

### 3.2 Redirect Console to Stderr

```typescript
// Override console methods to use stderr
console.log = console.error;
console.info = console.error;
console.warn = console.error;
// console.error already uses stderr

// Or use a custom logger
const log = {
  debug: (...args: unknown[]) => process.stderr.write(`[DEBUG] ${args.join(' ')}\n`),
  info: (...args: unknown[]) => process.stderr.write(`[INFO] ${args.join(' ')}\n`),
  warn: (...args: unknown[]) => process.stderr.write(`[WARN] ${args.join(' ')}\n`),
  error: (...args: unknown[]) => process.stderr.write(`[ERROR] ${args.join(' ')}\n`)
};
```

### 3.3 File-Based Logging

For production servers, log to files:

```typescript
import { createWriteStream } from 'fs';
import { join } from 'path';

const logStream = createWriteStream(
  join(process.cwd(), '.codeindex', 'logs', 'mcp-server.log'),
  { flags: 'a' }  // Append mode
);

const logger = {
  log: (level: string, ...args: unknown[]) => {
    const timestamp = new Date().toISOString();
    const message = `${timestamp} [${level}] ${args.join(' ')}\n`;
    logStream.write(message);
  },

  debug: (...args: unknown[]) => logger.log('DEBUG', ...args),
  info: (...args: unknown[]) => logger.log('INFO', ...args),
  warn: (...args: unknown[]) => logger.log('WARN', ...args),
  error: (...args: unknown[]) => logger.log('ERROR', ...args)
};

// Ensure stream is flushed on exit
process.on('exit', () => {
  logStream.end();
});
```

### 3.4 Structured Logging

For JSON Lines (JSONL) format logging:

```typescript
import { createWriteStream } from 'fs';

const logStream = createWriteStream('./server.jsonl', { flags: 'a' });

function log(level: string, message: string, meta?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  };
  logStream.write(JSON.stringify(entry) + '\n');
}

// Usage
log('info', 'Server started', { port: 3000 });
log('debug', 'Processing request', { method: 'search', query: 'test' });
```

### 3.5 Conditional Debug Logging

```typescript
const DEBUG = process.env.DEBUG === 'true';

function debug(...args: unknown[]) {
  if (DEBUG) {
    process.stderr.write(`[DEBUG] ${args.join(' ')}\n`);
  }
}

function info(...args: unknown[]) {
  process.stderr.write(`[INFO] ${args.join(' ')}\n`);
}

// Usage
debug('Request received:', request);  // Only logs if DEBUG=true
info('Server started');  // Always logs
```

---

## 4. Graceful Shutdown Handling

### 4.1 Stdin Close Detection

When the client disconnects, stdin will emit 'end' or 'close' events:

```typescript
process.stdin.on('end', () => {
  console.error('Client disconnected (stdin ended)');
  performGracefulShutdown();
});

process.stdin.on('close', () => {
  console.error('Stdin closed');
  performGracefulShutdown();
});
```

### 4.2 Signal Handling

Handle process termination signals:

```typescript
// Handle SIGTERM (sent by Docker, process managers)
process.on('SIGTERM', () => {
  console.error('Received SIGTERM signal');
  performGracefulShutdown();
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.error('Received SIGINT signal');
  performGracefulShutdown();
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  performGracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  performGracefulShutdown();
});
```

### 4.3 Graceful Shutdown Implementation

```typescript
let isShuttingDown = false;
let activeRequests = 0;

async function performGracefulShutdown(): Promise<void> {
  if (isShuttingDown) {
    return;  // Already shutting down
  }

  isShuttingDown = true;
  console.error('Starting graceful shutdown...');

  // Wait for active requests to complete (with timeout)
  const shutdownTimeout = 10000;  // 10 seconds
  const startTime = Date.now();

  while (activeRequests > 0 && (Date.now() - startTime) < shutdownTimeout) {
    console.error(`Waiting for ${activeRequests} active requests...`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (activeRequests > 0) {
    console.error(`Forcing shutdown with ${activeRequests} active requests`);
  }

  // Close resources
  await closeDatabase();
  await flushLogs();

  console.error('Shutdown complete');
  process.exit(0);
}

// Track active requests
async function handleRequest(request: JsonRpcRequest): Promise<unknown> {
  if (isShuttingDown) {
    throw new Error('Server is shutting down');
  }

  activeRequests++;
  try {
    return await processRequest(request);
  } finally {
    activeRequests--;
  }
}
```

### 4.4 Readline Close Handling

```typescript
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('close', async () => {
  console.error('Readline interface closed');
  await performGracefulShutdown();
});

// For Windows compatibility (SIGINT doesn't always work)
rl.on('SIGINT', () => {
  console.error('Received SIGINT from readline');
  process.emit('SIGINT', 'SIGINT');
});
```

---

## 5. Concurrency Patterns for Async Request Handling

### 5.1 Single Client, Multiple Concurrent Requests

For MCP stdio transport:
- **One client per server instance** (stdio is point-to-point)
- **Multiple concurrent requests** from that client are handled asynchronously
- Use promise-based async handling to process requests concurrently

### 5.2 Promise-Based Request Handling

```typescript
interface PendingRequest {
  id: string | number;
  promise: Promise<unknown>;
  timestamp: number;
}

class RequestHandler {
  private pendingRequests: Map<string | number, PendingRequest> = new Map();

  async handleRequest(request: JsonRpcRequest): Promise<void> {
    const requestId = request.id ?? this.generateId();

    // Create promise for request processing
    const promise = this.processRequestAsync(request)
      .then(result => {
        this.sendResponse({ jsonrpc: '2.0', id: requestId, result });
      })
      .catch(error => {
        this.sendError(requestId, -32603, 'Internal error', error.message);
      })
      .finally(() => {
        this.pendingRequests.delete(requestId);
      });

    // Track pending request
    this.pendingRequests.set(requestId, {
      id: requestId,
      promise,
      timestamp: Date.now()
    });
  }

  private async processRequestAsync(request: JsonRpcRequest): Promise<unknown> {
    // Async request processing logic
    switch (request.method) {
      case 'search':
        return await this.handleSearch(request.params);
      case 'find_def':
        return await this.handleFindDefinition(request.params);
      default:
        throw new Error(`Unknown method: ${request.method}`);
    }
  }

  async waitForAllRequests(): Promise<void> {
    const promises = Array.from(this.pendingRequests.values()).map(r => r.promise);
    await Promise.allSettled(promises);
  }
}
```

### 5.3 Request Queue with Concurrency Limit

For controlled concurrency (e.g., database connection pool):

```typescript
import PQueue from 'p-queue';

class ThrottledRequestHandler {
  private queue: PQueue;

  constructor(concurrency: number = 10) {
    this.queue = new PQueue({ concurrency });
  }

  async handleRequest(request: JsonRpcRequest): Promise<void> {
    // Add to queue, respecting concurrency limit
    await this.queue.add(async () => {
      try {
        const result = await this.processRequest(request);
        this.sendResponse({ jsonrpc: '2.0', id: request.id, result });
      } catch (error) {
        this.sendError(request.id, -32603, 'Internal error', error);
      }
    });
  }

  async shutdown(): Promise<void> {
    await this.queue.onIdle();  // Wait for all tasks to complete
  }
}
```

### 5.4 Alternative: async.queue Pattern

Using the `async` library:

```typescript
import async from 'async';

interface QueueTask {
  request: JsonRpcRequest;
}

const requestQueue = async.queue<QueueTask>(async (task, callback) => {
  try {
    const result = await processRequest(task.request);
    sendResponse({ jsonrpc: '2.0', id: task.request.id, result });
    callback();
  } catch (error) {
    sendError(task.request.id, -32603, 'Internal error', error);
    callback(error);
  }
}, 10);  // Concurrency of 10

// Add requests to queue
function handleRequest(request: JsonRpcRequest) {
  requestQueue.push({ request });
}

// Graceful shutdown
async function drainQueue(): Promise<void> {
  if (requestQueue.length() > 0) {
    await requestQueue.drain();
  }
}
```

### 5.5 Fire-and-Forget vs. Awaited Responses

```typescript
class AsyncRequestHandler {
  // Fire-and-forget: Don't wait for response
  handleRequestFireAndForget(request: JsonRpcRequest): void {
    this.processRequest(request)
      .then(result => this.sendResponse({ jsonrpc: '2.0', id: request.id, result }))
      .catch(error => this.sendError(request.id, -32603, error.message));
  }

  // Awaited: Track completion (for graceful shutdown)
  async handleRequestTracked(request: JsonRpcRequest): Promise<void> {
    try {
      const result = await this.processRequest(request);
      this.sendResponse({ jsonrpc: '2.0', id: request.id, result });
    } catch (error) {
      this.sendError(request.id, -32603, error.message);
    }
  }
}
```

---

## 6. Complete TypeScript Implementation Example

### 6.1 Production-Ready MCP Server

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createWriteStream } from 'fs';
import { join } from 'path';

// Logger that writes to stderr and file
class Logger {
  private fileStream = createWriteStream(
    join(process.cwd(), '.codeindex', 'logs', 'mcp-server.log'),
    { flags: 'a' }
  );

  private log(level: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    const message = `${timestamp} [${level}] ${args.join(' ')}`;

    // Write to stderr
    process.stderr.write(message + '\n');

    // Write to file
    this.fileStream.write(message + '\n');
  }

  debug(...args: unknown[]): void { this.log('DEBUG', ...args); }
  info(...args: unknown[]): void { this.log('INFO', ...args); }
  warn(...args: unknown[]): void { this.log('WARN', ...args); }
  error(...args: unknown[]): void { this.log('ERROR', ...args); }

  close(): void {
    this.fileStream.end();
  }
}

const logger = new Logger();

// Override console to prevent stdout pollution
console.log = (...args: unknown[]) => logger.debug(...args);
console.info = (...args: unknown[]) => logger.info(...args);
console.warn = (...args: unknown[]) => logger.warn(...args);
console.error = (...args: unknown[]) => logger.error(...args);

// Authentication check
function checkAuth(): boolean {
  const authToken = process.env.CODE_INDEX_AUTH_TOKEN;
  if (!authToken) {
    return true;  // Auth disabled
  }

  // In real implementation, validate client-provided token
  // For MCP, this would be in connection metadata
  return true;
}

// Server implementation
async function startServer(): Promise<void> {
  logger.info('Starting Code Index MCP Server');

  // Create server
  const server = new Server(
    {
      name: 'code-index-server',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug('Listing tools');

    return {
      tools: [
        {
          name: 'search',
          description: 'Search the codebase for a query',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              dir: { type: 'string', description: 'Directory filter (optional)' },
              lang: { type: 'string', description: 'Language filter (optional)' },
              k: { type: 'number', description: 'Max results (default 100)', maximum: 100 }
            },
            required: ['query']
          }
        },
        {
          name: 'find_def',
          description: 'Find the definition of a symbol',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: { type: 'string', description: 'Symbol name' }
            },
            required: ['symbol']
          }
        },
        {
          name: 'find_refs',
          description: 'Find all references to a symbol',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: { type: 'string', description: 'Symbol name' }
            },
            required: ['symbol']
          }
        },
        {
          name: 'callers',
          description: 'Find all functions that call the given symbol',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: { type: 'string', description: 'Function name' }
            },
            required: ['symbol']
          }
        },
        {
          name: 'callees',
          description: 'Find all functions called by the given symbol',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: { type: 'string', description: 'Function name' }
            },
            required: ['symbol']
          }
        },
        {
          name: 'open_at',
          description: 'Open a file at a specific line',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path' },
              line: { type: 'number', description: 'Line number' }
            },
            required: ['path', 'line']
          }
        },
        {
          name: 'refresh',
          description: 'Refresh the code index',
          inputSchema: {
            type: 'object',
            properties: {
              paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Specific paths to refresh (optional)'
              }
            }
          }
        },
        {
          name: 'symbols',
          description: 'List symbols in a file or across the codebase',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path (optional)' }
            }
          }
        }
      ]
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info(`Tool called: ${name}`, args);

    try {
      let result;

      switch (name) {
        case 'search':
          result = await handleSearch(args as { query: string; dir?: string; lang?: string; k?: number });
          break;
        case 'find_def':
          result = await handleFindDefinition(args as { symbol: string });
          break;
        case 'find_refs':
          result = await handleFindReferences(args as { symbol: string });
          break;
        case 'callers':
          result = await handleCallers(args as { symbol: string });
          break;
        case 'callees':
          result = await handleCallees(args as { symbol: string });
          break;
        case 'open_at':
          result = await handleOpenAt(args as { path: string; line: number });
          break;
        case 'refresh':
          result = await handleRefresh(args as { paths?: string[] });
          break;
        case 'symbols':
          result = await handleSymbols(args as { path?: string });
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };

    } catch (error) {
      logger.error(`Error handling tool ${name}:`, error);
      throw error;
    }
  });

  // Graceful shutdown
  let isShuttingDown = false;

  async function shutdown(): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info('Shutting down server...');

    // Close resources
    logger.close();

    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    shutdown();
  });

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Server connected and ready');
}

// Tool handler stubs (implement with actual logic)
async function handleSearch(args: { query: string; dir?: string; lang?: string; k?: number }) {
  // Implement search logic
  return { results: [], count: 0 };
}

async function handleFindDefinition(args: { symbol: string }) {
  // Implement find definition logic
  return { location: null };
}

async function handleFindReferences(args: { symbol: string }) {
  // Implement find references logic
  return { references: [] };
}

async function handleCallers(args: { symbol: string }) {
  // Implement callers logic
  return { callers: [] };
}

async function handleCallees(args: { symbol: string }) {
  // Implement callees logic
  return { callees: [] };
}

async function handleOpenAt(args: { path: string; line: number }) {
  // Implement open at logic
  return { content: '', preview: [] };
}

async function handleRefresh(args: { paths?: string[] }) {
  // Implement refresh logic
  return { refreshed: args.paths?.length ?? 0 };
}

async function handleSymbols(args: { path?: string }) {
  // Implement symbols logic
  return { symbols: [] };
}

// Start the server
startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
```

---

## 7. Best Practices Summary

### 7.1 Stream Management
- ✅ Use `StdioServerTransport` from MCP SDK for automatic message handling
- ✅ NEVER write to stdout except JSON-RPC messages
- ✅ Use `readline.createInterface()` with `terminal: false` for custom implementations
- ✅ Set `crlfDelay: Infinity` to handle both Unix and Windows line endings

### 7.2 Logging
- ✅ All logging goes to stderr or files, never stdout
- ✅ Override `console.log/info/warn` to use stderr
- ✅ Use structured logging (JSONL) for production
- ✅ Include timestamps and log levels
- ✅ Support DEBUG environment variable for verbose logging

### 7.3 Message Framing
- ✅ Use newline-delimited JSON (NDJSON)
- ✅ Ensure JSON has no embedded newlines
- ✅ Always include `"jsonrpc": "2.0"` field
- ✅ Validate message format before processing

### 7.4 Concurrency
- ✅ Handle requests asynchronously with promises
- ✅ Track active requests for graceful shutdown
- ✅ Consider using `p-queue` or `async.queue` for concurrency limits
- ✅ One client per stdio instance; spawn multiple instances for multiple clients

### 7.5 Shutdown Handling
- ✅ Listen for stdin 'end' and 'close' events
- ✅ Handle SIGTERM and SIGINT signals
- ✅ Wait for active requests to complete (with timeout)
- ✅ Close database connections and file handles
- ✅ Flush log buffers before exit

### 7.6 Error Handling
- ✅ Use standard JSON-RPC 2.0 error codes
- ✅ Catch and handle all exceptions
- ✅ Return JSON-RPC error responses, not thrown exceptions
- ✅ Log errors to stderr/file for debugging

### 7.7 Testing
- ✅ Test with actual stdio streams
- ✅ Use `spawn()` to create child processes for integration tests
- ✅ Verify no stdout pollution
- ✅ Test graceful shutdown scenarios
- ✅ Test concurrent request handling

---

## 8. Common Pitfalls and Solutions

| Pitfall | Problem | Solution |
|---------|---------|----------|
| **Stdout Pollution** | Logging to stdout corrupts JSON-RPC stream | Redirect all logs to stderr or files |
| **Blocking I/O** | Synchronous operations block request handling | Use async/await throughout |
| **Zombie Processes** | Server doesn't exit when client disconnects | Listen for stdin 'end' and 'close' events |
| **Embedded Newlines** | Pretty-printed JSON breaks message framing | Use `JSON.stringify()` without formatting |
| **Missed Events** | Operations between readline creation and iteration lose data | Use event listeners immediately after creation |
| **Signal Handling** | SIGINT doesn't work on Windows | Also listen to readline 'close' event |
| **Resource Leaks** | Connections not closed on shutdown | Implement proper cleanup in shutdown handler |
| **Request Loss** | Shutdown kills in-flight requests | Track active requests and wait for completion |

---

## 9. References

### Official Documentation
- [Model Context Protocol Specification](https://modelcontextprotocol.io/docs/concepts/transports)
- [Node.js Readline API](https://nodejs.org/api/readline.html)
- [Node.js Process API](https://nodejs.org/api/process.html)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)

### Libraries
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) - Official MCP TypeScript SDK
- [p-queue](https://github.com/sindresorhus/p-queue) - Promise queue with concurrency control
- [async](https://github.com/caolan/async) - Utilities for async JavaScript
- [@hediet/json-rpc](https://github.com/hediet/typed-json-rpc) - Typed JSON-RPC for TypeScript

### Articles and Guides
- [Using stdout, stdin, and stderr in Node.js](https://blog.logrocket.com/using-stdout-stdin-stderr-node-js/)
- [Graceful Shutdown in NodeJS](https://nairihar.medium.com/graceful-shutdown-in-nodejs-2f8f59d1c357)
- [Build stdio MCP Servers - Complete Guide](https://mcpcat.io/guides/building-stdio-mcp-server/)
- [Writing an MCP Server with TypeScript](https://medium.com/@dogukanakkaya/writing-an-mcp-server-with-typescript-b1caf1b2caf1)

---

## 10. Next Steps for Implementation

1. **Install MCP SDK**: `npm install @modelcontextprotocol/sdk`
2. **Create Server Structure**: Set up TypeScript project with proper types
3. **Implement Tool Handlers**: Connect to existing search/indexing services
4. **Set Up Logging**: Implement stderr/file logging system
5. **Test Locally**: Use MCP inspector or simple stdio client
6. **Integration Test**: Test with Claude Code tool picker
7. **Error Handling**: Add comprehensive error handling and validation
8. **Performance Testing**: Verify response times meet SC-002/SC-003 requirements
9. **Documentation**: Update user docs with server usage instructions
10. **Production Hardening**: Add monitoring, metrics, and production logging
