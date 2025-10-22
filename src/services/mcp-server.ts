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
  createAnchor,
  extractCodeBySpan
} from './preview-formatter.js';
import { findSymbol } from '../models/ASTDoc.js';
import { SearchService } from './searcher.js';
import { HybridIndex } from './hybrid-index.js';
import { SymbolIndex } from './symbol-index.js';
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

    // Initialize AST persistence (pass base directory, it will add /ast)
    const astPersistence = new ASTPersistenceService(indexPath);

    // Initialize symbol index
    const symbolIndex = new SymbolIndex();

    // Populate symbol index with all AST files
    this.log('info', 'Loading symbol index...');
    const allFiles = await astPersistence.listAll();
    let symbolCount = 0;
    for (const filePath of allFiles) {
      const astDoc = await astPersistence.read(filePath);
      if (astDoc) {
        symbolIndex.add(filePath, astDoc);
        symbolCount++;
      }
    }
    const stats = symbolIndex.getStats();
    this.log('info', `Symbol index loaded: ${stats.numSymbols} symbols from ${symbolCount} files`);

    // Initialize search service
    this.searchService = new SearchService(this.hybridIndex, symbolIndex, astPersistence);

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
        includeAst: true // Include AST for better context
      });

      const formattedResults = results.map(result => {
        // Parse anchor string "file:line:column"
        const anchorParts = result.anchor.split(':');
        const file = anchorParts[0] || result.filePath;
        const line = parseInt(anchorParts[1] || '1');
        const column = anchorParts[2] ? parseInt(anchorParts[2]) : undefined;

        // Try to extract code context (10 lines around the match)
        let code: string | undefined;
        if (existsSync(file)) {
          const preview = extractPreviewFromFile(file, line, 10);
          code = preview.lines.join('\n');
        }

        return {
          file,
          line,
          column,
          code,
          score: result.score
        };
      });

      const output: SearchOutput = {
        query: validated.query,
        total: formattedResults.length,
        returned: formattedResults.length,
        results: formattedResults as any
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

    await this.initializeServices();

    try {
      const results = await this.searchService!.findDefinition(validated.symbol, 10);

      if (results.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              symbol: validated.symbol,
              found: false,
              message: `No definition found for symbol: ${validated.symbol}`
            }, null, 2)
          }]
        };
      }

      const formattedResults = results.map(result => {
        const anchorParts = result.anchor.split(':');
        const file = anchorParts[0] || result.filePath;
        const line = parseInt(anchorParts[1] || '1');
        const column = anchorParts[2] ? parseInt(anchorParts[2]) : undefined;

        // Find the symbol in the AST to get full information
        const symbolInfo = result.ast ? findSymbol(result.ast, validated.symbol) : null;

        let code: string | undefined;
        let lineRange: string | undefined;
        let signature: string | undefined;
        let kind: string | undefined;
        let calls: string[] | undefined;
        let called_by: string[] | undefined;

        if (symbolInfo && symbolInfo.data && typeof symbolInfo.data === 'object') {
          kind = symbolInfo.kind;
          const symbolData = symbolInfo.data as any;

          // Extract code using span
          if (symbolData.span && existsSync(file)) {
            try {
              code = extractCodeBySpan(file, symbolData.span);
              lineRange = `${symbolData.span.startLine}-${symbolData.span.endLine}`;
            } catch (e) {
              // Fall back to preview if extraction fails
            }
          }

          // Extract signature
          signature = symbolData.signature;

          // Extract call graph info
          calls = symbolData.calls;
          called_by = symbolData.called_by;
        }

        // Fallback to preview if no code extracted
        if (!code && existsSync(file)) {
          const preview = extractPreviewFromFile(file, line, 10);
          code = preview.lines.join('\n');
        }

        return {
          file,
          lineRange: lineRange || `${line}`,
          line,
          column,
          code,
          kind,
          signature,
          calls,
          called_by,
          score: result.score
        };
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            symbol: validated.symbol,
            found: true,
            total: formattedResults.length,
            definitions: formattedResults
          }, null, 2)
        }]
      };
    } catch (error: any) {
      throw new McpError(-32603, `Find definition failed: ${error.message}`);
    }
  }

  /**
   * Handle find_refs tool
   */
  private async handleFindReferences(args: unknown): Promise<ToolResponse> {
    const validated = FindReferencesInputSchema.parse(args);

    await this.initializeServices();

    try {
      const results = await this.searchService!.findReferences(validated.symbol, 50);

      const formattedResults = results.map(result => {
        const anchorParts = result.anchor.split(':');
        const file = anchorParts[0] || result.filePath;
        const line = parseInt(anchorParts[1] || '1');
        const column = anchorParts[2] ? parseInt(anchorParts[2]) : undefined;

        // Extract code context (10 lines around reference)
        let code: string | undefined;
        if (existsSync(file)) {
          const preview = extractPreviewFromFile(file, line, 10);
          code = preview.lines.join('\n');
        }

        // Determine reference type (call, import, export, definition)
        let referenceType = 'reference';
        if (result.ast) {
          const isDefined =
            (result.ast.functions && validated.symbol in result.ast.functions) ||
            (result.ast.classes && validated.symbol in result.ast.classes) ||
            (result.ast.interfaces && validated.symbol in result.ast.interfaces);

          if (isDefined) {
            referenceType = 'definition';
          } else if (result.ast.imports?.some(imp =>
            imp.specifiers.some(spec => spec.imported === validated.symbol || spec.local === validated.symbol)
          )) {
            referenceType = 'import';
          } else if (result.ast.exports?.some(exp =>
            exp.specifiers.some(spec => spec.local === validated.symbol || spec.exported === validated.symbol)
          )) {
            referenceType = 'export';
          } else {
            referenceType = 'call';
          }
        }

        return {
          file,
          line,
          column,
          code,
          referenceType,
          score: result.score
        };
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            symbol: validated.symbol,
            total: formattedResults.length,
            references: formattedResults
          }, null, 2)
        }]
      };
    } catch (error: any) {
      throw new McpError(-32603, `Find references failed: ${error.message}`);
    }
  }

  /**
   * Handle callers tool
   */
  private async handleCallers(args: unknown): Promise<ToolResponse> {
    const validated = CallersInputSchema.parse(args);

    await this.initializeServices();

    try {
      const results = await this.searchService!.findCallers(validated.symbol, 50);

      const formattedResults = results.map(result => {
        const anchorParts = result.anchor.split(':');
        const file = anchorParts[0] || result.filePath;
        const line = parseInt(anchorParts[1] || '1');
        const column = anchorParts[2] ? parseInt(anchorParts[2]) : undefined;

        let code: string | undefined;
        let callerName: string | undefined;
        let lineRange: string | undefined;
        let signature: string | undefined;

        // Find the calling function/method in the AST
        if (result.ast) {
          // Check functions
          if (result.ast.functions) {
            for (const [funcName, func] of Object.entries(result.ast.functions)) {
              if (func.calls?.includes(validated.symbol)) {
                callerName = funcName;
                signature = func.signature;
                if (func.span && existsSync(file)) {
                  try {
                    code = extractCodeBySpan(file, func.span);
                    lineRange = `${func.span.startLine}-${func.span.endLine}`;
                  } catch (e) {
                    // Fall back to preview
                  }
                }
                break;
              }
            }
          }

          // Check methods
          if (!callerName && result.ast.classes) {
            for (const [className, cls] of Object.entries(result.ast.classes)) {
              if (cls.methods) {
                for (const [methodName, method] of Object.entries(cls.methods)) {
                  if (method.calls?.includes(validated.symbol)) {
                    callerName = `${className}.${methodName}`;
                    signature = method.signature;
                    if (method.span && existsSync(file)) {
                      try {
                        code = extractCodeBySpan(file, method.span);
                        lineRange = `${method.span.startLine}-${method.span.endLine}`;
                      } catch (e) {
                        // Fall back to preview
                      }
                    }
                    break;
                  }
                }
              }
              if (callerName) break;
            }
          }
        }

        // Fallback to preview if no code extracted
        if (!code && existsSync(file)) {
          const preview = extractPreviewFromFile(file, line, 10);
          code = preview.lines.join('\n');
        }

        return {
          file,
          lineRange: lineRange || `${line}`,
          line,
          column,
          callerName,
          signature,
          code,
          score: result.score
        };
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            symbol: validated.symbol,
            total: formattedResults.length,
            callers: formattedResults
          }, null, 2)
        }]
      };
    } catch (error: any) {
      throw new McpError(-32603, `Find callers failed: ${error.message}`);
    }
  }

  /**
   * Handle callees tool
   */
  private async handleCallees(args: unknown): Promise<ToolResponse> {
    const validated = CalleesInputSchema.parse(args);

    await this.initializeServices();

    try {
      const calleeResults = await this.searchService!.findCallees(validated.symbol);

      // Format each callee with full information
      const formattedCallees = calleeResults.map(result => {
        const anchorParts = result.anchor.split(':');
        const file = anchorParts[0] || result.filePath;
        const line = parseInt(anchorParts[1] || '1');
        const column = anchorParts[2] ? parseInt(anchorParts[2]) : undefined;

        // Find the callee symbol in the AST
        let calleeName: string | undefined;
        let code: string | undefined;
        let lineRange: string | undefined;
        let signature: string | undefined;
        let kind: string | undefined;

        if (result.ast) {
          // Try to find the symbol at the anchor location
          // First check functions
          if (result.ast.functions) {
            for (const [funcName, func] of Object.entries(result.ast.functions)) {
              if (func.span.startLine === line) {
                calleeName = funcName;
                kind = 'function';
                signature = func.signature;
                if (existsSync(file)) {
                  try {
                    code = extractCodeBySpan(file, func.span);
                    lineRange = `${func.span.startLine}-${func.span.endLine}`;
                  } catch (e) {
                    // Fall back to preview
                  }
                }
                break;
              }
            }
          }

          // Check classes/methods
          if (!calleeName && result.ast.classes) {
            for (const [className, cls] of Object.entries(result.ast.classes)) {
              if (cls.span.startLine === line) {
                calleeName = className;
                kind = 'class';
                if (existsSync(file)) {
                  try {
                    code = extractCodeBySpan(file, cls.span);
                    lineRange = `${cls.span.startLine}-${cls.span.endLine}`;
                  } catch (e) {
                    // Fall back to preview
                  }
                }
                break;
              }

              // Check methods
              if (cls.methods) {
                for (const [methodName, method] of Object.entries(cls.methods)) {
                  if (method.span.startLine === line) {
                    calleeName = `${className}.${methodName}`;
                    kind = 'method';
                    signature = method.signature;
                    if (existsSync(file)) {
                      try {
                        code = extractCodeBySpan(file, method.span);
                        lineRange = `${method.span.startLine}-${method.span.endLine}`;
                      } catch (e) {
                        // Fall back to preview
                      }
                    }
                    break;
                  }
                }
              }
              if (calleeName) break;
            }
          }
        }

        // Fallback to preview if no code extracted
        if (!code && existsSync(file)) {
          const preview = extractPreviewFromFile(file, line, 10);
          code = preview.lines.join('\n');
        }

        return {
          file,
          lineRange: lineRange || `${line}`,
          line,
          column,
          calleeName,
          kind,
          signature,
          code,
          score: result.score
        };
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            symbol: validated.symbol,
            total: formattedCallees.length,
            callees: formattedCallees
          }, null, 2)
        }]
      };
    } catch (error: any) {
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
    const validated = RefreshInputSchema.parse(args);

    const startTime = Date.now();

    try {
      // Import required services
      const { DatabaseService } = await import('./database.js');
      const { IndexerService } = await import('./indexer.js');
      const { Logger } = await import('../cli/utils/logger.js');

      // Initialize database
      const dbPath = join(this.projectRoot, '.codeindex', 'index.db');
      const database = new DatabaseService(dbPath);

      // Initialize logger
      const logger = new Logger(this.projectRoot);

      // Initialize AST persistence
      const { ASTPersistenceService } = await import('./ast-persistence.js');
      const astPersistence = new ASTPersistenceService(join(this.projectRoot, '.codeindex'));
      await astPersistence.initialize();

      // Initialize hybrid index if not already initialized
      if (!this.hybridIndex) {
        await this.initializeServices();
      }

      // Create symbol index
      const symbolIndex = new SymbolIndex();

      // Create indexer service
      const indexer = new IndexerService(
        this.projectRoot,
        database,
        this.hybridIndex!,
        symbolIndex,
        astPersistence,
        logger
      );

      // Refresh based on whether paths were provided
      const result = validated.paths && validated.paths.length > 0
        ? await indexer.refreshFiles(validated.paths)
        : await indexer.refreshIndex();

      const duration = Date.now() - startTime;

      // Convert errors to expected format
      const errors = result.errors.map(errMsg => {
        // Try to extract path from error message
        const match = errMsg.match(/^Failed to (?:refresh|process) (.+?):/);
        return {
          path: (match && match[1]) || 'unknown',
          error: errMsg
        };
      });

      const output: RefreshOutput = {
        refreshed: result.filesUpdated + result.filesAdded,
        duration,
        errors
      };

      // Cleanup
      database.close();

      // Force re-initialization of search services to reload the symbol index
      this.searchService = null;
      this.log('info', 'Search services cleared, will reload on next request');

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

    await this.initializeServices();

    try {
      const results = await this.searchService!.listSymbols(validated.path);

      let allSymbols: Array<{
        name: string;
        kind: string;
        line: number;
        signature?: string;
        file?: string;
      }> = [];

      for (const result of results) {
        const fileSymbols = result.symbols.map(s => ({
          ...s,
          file: result.file
        }));
        allSymbols.push(...fileSymbols);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            path: validated.path,
            total: allSymbols.length,
            symbols: allSymbols
          }, null, 2)
        }]
      };
    } catch (error: any) {
      throw new McpError(-32603, `List symbols failed: ${error.message}`);
    }
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
