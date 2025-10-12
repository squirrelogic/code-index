/**
 * MCP (Model Context Protocol) configuration generator
 */

import { join } from 'path';

/**
 * MCP server configuration
 */
export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * MCP configuration structure
 */
export interface MCPConfig {
  version: string;
  servers: Record<string, MCPServerConfig>;
}

/**
 * Generates default MCP configuration
 */
export function generateMCPConfig(projectRoot: string): MCPConfig {
  const codeIndexPath = join(projectRoot, 'node_modules', '.bin', 'code-index');

  return {
    version: '1.0.0',
    servers: {
      'code-index': {
        command: codeIndexPath,
        args: ['mcp-server'],
        env: {
          PROJECT_ROOT: projectRoot
        }
      }
    }
  };
}

/**
 * Converts MCP config to JSON string
 */
export function mcpConfigToString(config: MCPConfig): string {
  return JSON.stringify(config, null, 2);
}

/**
 * Creates MCP server description
 */
export function getMCPServerDescription(): string {
  return `{
  "name": "code-index",
  "description": "Local code indexing and search server",
  "capabilities": {
    "search": {
      "description": "Search indexed codebase for text patterns",
      "parameters": {
        "query": "string",
        "regex": "boolean",
        "limit": "number"
      }
    },
    "index": {
      "description": "Index or refresh project files",
      "parameters": {
        "full": "boolean"
      }
    },
    "getFile": {
      "description": "Retrieve file content by path",
      "parameters": {
        "path": "string"
      }
    },
    "listFiles": {
      "description": "List files matching pattern",
      "parameters": {
        "pattern": "string",
        "limit": "number"
      }
    }
  }
}`;
}