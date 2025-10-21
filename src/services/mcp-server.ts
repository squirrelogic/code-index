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
import { join, resolve } from 'path';
import { existsSync, createWriteStream } from 'fs';
import { checkAuth, AuthenticationError } from '../lib/mcp-auth.js';
import {
  SearchInputSchema,
  SearchOutput,
  FindDefinitionInputSchema,
  FindReferencesInputSchema,
  CallersInputSchema,
  CalleesInputSchema,
  OpenAtInputSchema,
  OpenAtOutput,
  RefreshInputSchema,
  RefreshOutput,
  SymbolsInputSchema,
  ToolResponse
} from '../models/mcp-types.js';
import {
  extractPreviewFromFile,
  createAnchor
} from './preview-formatter.js';
import { SearchService } from './searcher.js';
import { HybridIndex } from './hybrid-index.js';
import { ASTPersistenceService } from './ast-persistence.js';
import { OnnxEmbedder } from './onnx-embedder.js';
import { IndexStoreService } from './index-store.js';

/**
 * MCP Server for Code Intelligence
 */
export class MCPServer {
  private server: Server;
  private searchService: SearchService | null = null;
  private hybridIndex: HybridIndex | null = null;
  private projectRoot: string;
  private logStream: ReturnType<typeof createWriteStream>;
  private activeRequests = new Map<string, Promise<any>>();

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);

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
   * Initialize search services
   */
  private async initializeServices(): Promise<void> {
    if (this.searchService) return;

    const indexPath = join(this.projectRoot, '.codeindex');
    const modelPath = join(indexPath, 'models', 'gte-small.onnx');
    const astPath = join(indexPath, 'ast');

    // Check if model exists
    if (!existsSync(modelPath)) {
      throw new Error('ONNX model not found. Run "code-index init" first.');
    }

    // Initialize embedder
    const embedder = new OnnxEmbedder(modelPath);
    await embedder.init();

    // Initialize index store
    const store = new IndexStoreService(indexPath);

    // Initialize hybrid index
    this.hybridIndex = new HybridIndex(embedder, store);
    await this.hybridIndex.load();

    // Initialize AST persistence
    const astPersistence = new ASTPersistenceService(astPath);

    // Initialize search service
    this.searchService = new SearchService(this.hybridIndex, astPersistence);

    this.log('info', 'Search services initialized');
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

    await this.initializeServices();

    // Validate query
    if (!validated.query || validated.query.trim().length === 0) {
      throw new McpError(-32602, 'Query parameter cannot be empty');
    }

    try {
      const results = await this.searchService!.search(validated.query, {
        limit: validated.limit,
        includeAst: false // Don't include full AST in MCP responses
      });

      const formattedResults = results.map(result => {
        // Parse anchor string "file:line:column"
        const anchorParts = result.anchor.split(':');
        const file = anchorParts[0] || result.filePath;
        const line = parseInt(anchorParts[1] || '1');
        const column = anchorParts[2] ? parseInt(anchorParts[2]) : undefined;

        // Get file preview
        const preview = existsSync(file)
          ? extractPreviewFromFile(file, line, 3)
          : { lines: [], startLine: line };

        return {
          anchor: { file, line, column },
          preview,
          score: result.score
        };
      });

      const output: SearchOutput = {
        query: validated.query,
        total: formattedResults.length,
        returned: formattedResults.length,
        results: formattedResults
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(output, null, 2)
        }]
      };
    } catch (error: any) {
      throw new McpError(-32603, `Search failed: ${error.message}`);
    }
  }

  /**
   * Handle find_def tool
   */
  private async handleFindDefinition(args: unknown): Promise<ToolResponse> {
    const validated = FindDefinitionInputSchema.parse(args);

    // Symbol-based tools are not available in hybrid search architecture
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          symbol: validated.symbol,
          found: false,
          message: 'Symbol-based queries are not supported in the hybrid search architecture. Use the search tool instead.'
        }, null, 2)
      }]
    };
  }

  /**
   * Handle find_refs tool
   */
  private async handleFindReferences(args: unknown): Promise<ToolResponse> {
    const validated = FindReferencesInputSchema.parse(args);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          symbol: validated.symbol,
          total: 0,
          references: [],
          message: 'Symbol-based queries are not supported in the hybrid search architecture. Use the search tool instead.'
        }, null, 2)
      }]
    };
  }

  /**
   * Handle callers tool
   */
  private async handleCallers(args: unknown): Promise<ToolResponse> {
    const validated = CallersInputSchema.parse(args);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          symbol: validated.symbol,
          total: 0,
          callers: [],
          message: 'Symbol-based queries are not supported in the hybrid search architecture. Use the search tool instead.'
        }, null, 2)
      }]
    };
  }

  /**
   * Handle callees tool
   */
  private async handleCallees(args: unknown): Promise<ToolResponse> {
    const validated = CalleesInputSchema.parse(args);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          symbol: validated.symbol,
          total: 0,
          callees: [],
          message: 'Symbol-based queries are not supported in the hybrid search architecture. Use the search tool instead.'
        }, null, 2)
      }]
    };
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

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          path: validated.path,
          total: 0,
          symbols: [],
          message: 'Symbol-based queries are not supported in the hybrid search architecture. Use the search tool instead.'
        }, null, 2)
      }]
    };
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

      // Cleanup services
      if (this.hybridIndex) {
        // No explicit cleanup needed for hybrid index
        this.log('info', 'Hybrid index released');
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
