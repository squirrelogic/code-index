/**
 * MCP (Model Context Protocol) Server Implementation
 *
 * Exposes code-index functionality via JSON-RPC 2.0 over stdio transport.
 * Provides 8 tool functions for AI assistants to navigate and understand codebases.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import { join, resolve } from 'path';
import { existsSync, createWriteStream } from 'fs';
import { checkAuth, AuthenticationError } from '../lib/mcp-auth.js';
import {
  SearchInputSchema,
  SearchOutput,
  FindDefinitionInputSchema,
  FindDefinitionOutput,
  FindReferencesInputSchema,
  FindReferencesOutput,
  CallersInputSchema,
  CallersOutput,
  CalleesInputSchema,
  CalleesOutput,
  OpenAtInputSchema,
  OpenAtOutput,
  RefreshInputSchema,
  RefreshOutput,
  SymbolsInputSchema,
  SymbolsOutput,
  SymbolDefinition,
  SymbolReference,
  CallRelationship,
  ToolResponse
} from '../models/mcp-types.js';
import {
  extractPreviewFromFile,
  extractPreviewWithAnchor,
  createAnchor
} from './preview-formatter.js';

/**
 * Query cache for prepared SQL statements
 */
class QueryCache {
  private cache = new Map<string, Database.Statement>();
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  prepare(sql: string): Database.Statement {
    if (!this.cache.has(sql)) {
      this.cache.set(sql, this.db.prepare(sql));
    }
    return this.cache.get(sql)!;
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * MCP Server for Code Intelligence
 */
export class MCPServer {
  private server: Server;
  private db: Database.Database | null = null;
  private queryCache: QueryCache | null = null;
  private projectRoot: string;
  private dbPath: string;
  private logStream: ReturnType<typeof createWriteStream>;
  private activeRequests = new Map<string, Promise<any>>();

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
    this.dbPath = join(this.projectRoot, '.codeindex', 'index.db');

    // Setup logging
    const logPath = join(this.projectRoot, '.codeindex', 'logs', 'mcp-server.log');
    this.logStream = createWriteStream(logPath, { flags: 'a' });

    // Initialize MCP Server
    this.server = new Server(
      {
        name: 'code-index-mcp',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
    this.setupShutdownHandlers();
  }

  /**
   * Log message to stderr and file
   */
  private log(level: string, message: string, meta?: any): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta
    };

    this.logStream.write(JSON.stringify(entry) + '\n');
    process.stderr.write(`[${level}] ${message}\n`);
  }

  /**
   * Setup tool handlers
   */
  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search',
            description: 'Search the codebase for text patterns',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
                directory: { type: 'string', description: 'Directory filter (optional)' },
                language: { type: 'string', description: 'Language filter (optional)' },
                limit: { type: 'number', minimum: 1, maximum: 100, default: 10 }
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
                symbol: { type: 'string', description: 'Symbol name to find' }
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
                symbol: { type: 'string', description: 'Symbol name to find references for' }
              },
              required: ['symbol']
            }
          },
          {
            name: 'callers',
            description: 'Find all callers of a function',
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
            description: 'Find all callees of a function',
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
                line: { type: 'number', minimum: 1, description: 'Line number (1-based)' },
                contextLines: { type: 'number', minimum: 0, maximum: 50, default: 10 }
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
            description: 'List symbols in a file or codebase',
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

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => {
      // Authentication check
      try {
        checkAuth(request as any); // Cast needed for MCP SDK compatibility
      } catch (error) {
        if (error instanceof AuthenticationError) {
          throw new McpError(error.code, error.message);
        }
        throw error;
      }

      const { name, arguments: args } = request.params;
      const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      try {
        // Track active request
        const promise = this.handleTool(name, args);
        this.activeRequests.set(requestId, promise);

        const result = await promise;

        this.activeRequests.delete(requestId);
        return result;
      } catch (error: any) {
        this.activeRequests.delete(requestId);
        this.log('error', `Tool ${name} failed`, { error: error.message });
        throw error;
      }
    });
  }

  /**
   * Handle tool execution
   */
  private async handleTool(name: string, args: unknown): Promise<ToolResponse> {
    switch (name) {
      case 'search':
        return this.handleSearch(args);
      case 'find_def':
        return this.handleFindDefinition(args);
      case 'find_refs':
        return this.handleFindReferences(args);
      case 'callers':
        return this.handleCallers(args);
      case 'callees':
        return this.handleCallees(args);
      case 'open_at':
        return this.handleOpenAt(args);
      case 'refresh':
        return this.handleRefresh(args);
      case 'symbols':
        return this.handleSymbols(args);
      default:
        throw new McpError(-32601, `Unknown tool: ${name}`);
    }
  }

  /**
   * Handle search tool
   */
  private async handleSearch(args: unknown): Promise<ToolResponse> {
    const validated = SearchInputSchema.parse(args);

    this.ensureDatabase();

    // Validate query
    if (!validated.query || validated.query.trim().length === 0) {
      throw new McpError(-32602, 'Query parameter cannot be empty');
    }

    try {
      const stmt = this.queryCache!.prepare(`
        SELECT f.id, f.path, f.content, f.language
        FROM files_fts
        JOIN files f ON files_fts.rowid = f.id
        WHERE files_fts MATCH ?
        LIMIT ?
      `);

      const rows = stmt.all(validated.query, validated.limit) as any[];

      const results = rows.map(row => {
        const { anchor, preview } = extractPreviewWithAnchor(
          row.path,
          row.content,
          1, // We'll need to find actual line number from FTS match
          undefined,
          10
        );
        return { anchor, preview };
      });

      const output: SearchOutput = {
        query: validated.query,
        total: results.length,
        returned: results.length,
        results
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(output, null, 2)
        }]
      };
    } catch (error: any) {
      if (error.message?.includes('CORRUPT')) {
        throw new McpError(-32002, 'Index unavailable: Database is corrupted');
      }
      throw new McpError(-32603, `Search failed: ${error.message}`);
    }
  }

  /**
   * Handle find_def tool
   */
  private async handleFindDefinition(args: unknown): Promise<ToolResponse> {
    const validated = FindDefinitionInputSchema.parse(args);

    this.ensureDatabase();

    try {
      const stmt = this.queryCache!.prepare(`
        SELECT s.name, s.kind, s.line, s.column, s.container_name, f.path, f.content
        FROM symbols s
        JOIN files f ON s.file_id = f.id
        WHERE s.name = ?
        LIMIT 1
      `);

      const row = stmt.get(validated.symbol) as any;

      if (!row) {
        const output: FindDefinitionOutput = {
          symbol: validated.symbol,
          found: false
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(output, null, 2)
          }]
        };
      }

      const { anchor, preview } = extractPreviewWithAnchor(
        row.path,
        row.content,
        row.line,
        row.column,
        10
      );

      const definition: SymbolDefinition = {
        symbol: row.name,
        kind: row.kind,
        anchor,
        preview,
        containerName: row.container_name
      };

      const output: FindDefinitionOutput = {
        symbol: validated.symbol,
        found: true,
        definition
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(output, null, 2)
        }]
      };
    } catch (error: any) {
      if (error.message?.includes('CORRUPT')) {
        throw new McpError(-32002, 'Index unavailable: Database is corrupted');
      }
      throw new McpError(-32603, `Find definition failed: ${error.message}`);
    }
  }

  /**
   * Handle find_refs tool
   */
  private async handleFindReferences(args: unknown): Promise<ToolResponse> {
    const validated = FindReferencesInputSchema.parse(args);

    this.ensureDatabase();

    try {
      const stmt = this.queryCache!.prepare(`
        SELECT s.name, s.line, s.column, f.path, f.content
        FROM symbols s
        JOIN files f ON s.file_id = f.id
        WHERE s.name = ?
      `);

      const rows = stmt.all(validated.symbol) as any[];

      const references: SymbolReference[] = rows.map(row => {
        const { anchor, preview } = extractPreviewWithAnchor(
          row.path,
          row.content,
          row.line,
          row.column,
          10
        );

        return {
          symbol: row.name,
          anchor,
          preview,
          isWrite: false // TODO: Determine read vs write from context
        };
      });

      const output: FindReferencesOutput = {
        symbol: validated.symbol,
        total: references.length,
        references
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(output, null, 2)
        }]
      };
    } catch (error: any) {
      if (error.message?.includes('CORRUPT')) {
        throw new McpError(-32002, 'Index unavailable: Database is corrupted');
      }
      throw new McpError(-32603, `Find references failed: ${error.message}`);
    }
  }

  /**
   * Handle callers tool
   */
  private async handleCallers(args: unknown): Promise<ToolResponse> {
    const validated = CallersInputSchema.parse(args);

    this.ensureDatabase();

    try {
      const stmt = this.queryCache!.prepare(`
        SELECT
          caller.name as caller_name,
          callee.name as callee_name,
          cg.line,
          f.path,
          f.content
        FROM call_graph cg
        JOIN symbols caller ON cg.caller_id = caller.id
        JOIN symbols callee ON cg.callee_id = callee.id
        JOIN files f ON cg.file_id = f.id
        WHERE callee.name = ?
      `);

      const rows = stmt.all(validated.symbol) as any[];

      const callers: CallRelationship[] = rows.map(row => {
        const { anchor, preview } = extractPreviewWithAnchor(
          row.path,
          row.content,
          row.line,
          undefined,
          10
        );

        return {
          caller: row.caller_name,
          callee: row.callee_name,
          anchor,
          preview
        };
      });

      const output: CallersOutput = {
        symbol: validated.symbol,
        total: callers.length,
        callers
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(output, null, 2)
        }]
      };
    } catch (error: any) {
      if (error.message?.includes('CORRUPT')) {
        throw new McpError(-32002, 'Index unavailable: Database is corrupted');
      }
      throw new McpError(-32603, `Find callers failed: ${error.message}`);
    }
  }

  /**
   * Handle callees tool
   */
  private async handleCallees(args: unknown): Promise<ToolResponse> {
    const validated = CalleesInputSchema.parse(args);

    this.ensureDatabase();

    try {
      const stmt = this.queryCache!.prepare(`
        SELECT
          caller.name as caller_name,
          callee.name as callee_name,
          cg.line,
          f.path,
          f.content
        FROM call_graph cg
        JOIN symbols caller ON cg.caller_id = caller.id
        JOIN symbols callee ON cg.callee_id = callee.id
        JOIN files f ON cg.file_id = f.id
        WHERE caller.name = ?
      `);

      const rows = stmt.all(validated.symbol) as any[];

      const callees: CallRelationship[] = rows.map(row => {
        const { anchor, preview } = extractPreviewWithAnchor(
          row.path,
          row.content,
          row.line,
          undefined,
          10
        );

        return {
          caller: row.caller_name,
          callee: row.callee_name,
          anchor,
          preview
        };
      });

      const output: CalleesOutput = {
        symbol: validated.symbol,
        total: callees.length,
        callees
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(output, null, 2)
        }]
      };
    } catch (error: any) {
      if (error.message?.includes('CORRUPT')) {
        throw new McpError(-32002, 'Index unavailable: Database is corrupted');
      }
      throw new McpError(-32603, `Find callees failed: ${error.message}`);
    }
  }

  /**
   * Handle open_at tool
   */
  private async handleOpenAt(args: unknown): Promise<ToolResponse> {
    const validated = OpenAtInputSchema.parse(args);

    // Resolve path (support both absolute and relative)
    let filePath = validated.path;
    if (!join(filePath)) {
      filePath = join(this.projectRoot, validated.path);
    }

    // Check file exists
    if (!existsSync(filePath)) {
      const output: OpenAtOutput = {
        anchor: createAnchor(filePath, validated.line),
        preview: { lines: [], startLine: validated.line },
        exists: false
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(output, null, 2)
        }]
      };
    }

    try {
      const preview = extractPreviewFromFile(
        filePath,
        validated.line,
        validated.contextLines
      );

      const output: OpenAtOutput = {
        anchor: createAnchor(filePath, validated.line),
        preview,
        exists: true
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(output, null, 2)
        }]
      };
    } catch (error: any) {
      throw new McpError(-32603, `Open file failed: ${error.message}`);
    }
  }

  /**
   * Handle refresh tool
   */
  private async handleRefresh(args: unknown): Promise<ToolResponse> {
    RefreshInputSchema.parse(args); // Validate but don't use yet

    const startTime = Date.now();
    const errors: Array<{ path: string; error: string }> = [];

    try {
      // TODO: Implement actual refresh logic using IndexerService
      // For now, return a placeholder response

      const duration = Date.now() - startTime;

      const output: RefreshOutput = {
        refreshed: 0,
        duration,
        errors
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(output, null, 2)
        }]
      };
    } catch (error: any) {
      throw new McpError(-32603, `Refresh failed: ${error.message}`);
    }
  }

  /**
   * Handle symbols tool
   */
  private async handleSymbols(args: unknown): Promise<ToolResponse> {
    const validated = SymbolsInputSchema.parse(args);

    this.ensureDatabase();

    try {
      let stmt: Database.Statement;
      let rows: any[];

      if (validated.path) {
        // Get symbols for specific file
        stmt = this.queryCache!.prepare(`
          SELECT s.name, s.kind, s.line, s.column, s.container_name, f.path, f.content
          FROM symbols s
          JOIN files f ON s.file_id = f.id
          WHERE f.path = ?
        `);
        rows = stmt.all(validated.path) as any[];
      } else {
        // Get all symbols
        stmt = this.queryCache!.prepare(`
          SELECT s.name, s.kind, s.line, s.column, s.container_name, f.path, f.content
          FROM symbols s
          JOIN files f ON s.file_id = f.id
          LIMIT 1000
        `);
        rows = stmt.all() as any[];
      }

      const symbols: SymbolDefinition[] = rows.map(row => {
        const { anchor, preview } = extractPreviewWithAnchor(
          row.path,
          row.content,
          row.line,
          row.column,
          10
        );

        return {
          symbol: row.name,
          kind: row.kind,
          anchor,
          preview,
          containerName: row.container_name
        };
      });

      const output: SymbolsOutput = {
        path: validated.path,
        total: symbols.length,
        symbols
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(output, null, 2)
        }]
      };
    } catch (error: any) {
      if (error.message?.includes('CORRUPT')) {
        throw new McpError(-32002, 'Index unavailable: Database is corrupted');
      }
      throw new McpError(-32603, `List symbols failed: ${error.message}`);
    }
  }

  /**
   * Ensure database is connected and configured
   */
  private ensureDatabase(): void {
    if (this.db) return;

    if (!existsSync(this.dbPath)) {
      throw new McpError(
        -32002,
        'Index unavailable: Database not found. Run "code-index index" first.'
      );
    }

    // Open database in readonly mode
    this.db = new Database(this.dbPath, { readonly: true });

    // Configure for concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000'); // 64MB cache

    // Initialize query cache
    this.queryCache = new QueryCache(this.db);

    this.log('info', 'Database connected', { path: this.dbPath });
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async () => {
      this.log('info', 'Shutting down MCP server...');

      // Wait for active requests with timeout
      const timeout = new Promise(resolve => setTimeout(resolve, 10000));
      const allRequests = Promise.all(Array.from(this.activeRequests.values()));

      await Promise.race([allRequests, timeout]);

      // Close database
      if (this.db) {
        this.queryCache?.clear();
        this.db.close();
        this.log('info', 'Database closed');
      }

      // Flush logs
      this.logStream.end();

      process.exit(0);
    };

    process.stdin.on('end', shutdown);
    process.stdin.on('close', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    this.log('info', 'Starting MCP server', { projectRoot: this.projectRoot });

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    this.log('info', 'MCP server started and listening on stdio');
  }
}
