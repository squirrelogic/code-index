import { z } from 'zod';

// ============================================================================
// Core Entities
// ============================================================================

/**
 * Represents a precise location in source code
 */
export interface CodeAnchor {
  file: string;
  line: number;
  column?: number;
}

export const CodeAnchorSchema = z.object({
  file: z.string().min(1).describe("Absolute file path"),
  line: z.number().int().positive().describe("Line number (1-based)"),
  column: z.number().int().nonnegative().optional().describe("Column number (1-based)")
});

/**
 * Provides context around a code location with surrounding lines
 */
export interface CodePreview {
  lines: string[];
  startLine: number;
}

export const CodePreviewSchema = z.object({
  lines: z.array(z.string()).min(1).max(10).describe("Preview lines (max 10)"),
  startLine: z.number().int().positive().describe("First line number in preview (1-based)")
});

/**
 * Represents a single search match with location and preview
 */
export interface SearchResult {
  anchor: CodeAnchor;
  preview: CodePreview;
  score?: number;
}

export const SearchResultSchema = z.object({
  anchor: CodeAnchorSchema,
  preview: CodePreviewSchema,
  score: z.number().min(0).max(1).optional().describe("Relevance score (0-1)")
});

/**
 * Symbol type classification
 */
export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'constant'
  | 'method'
  | 'property'
  | 'enum'
  | 'namespace';

export const SymbolKindSchema = z.enum([
  'function',
  'class',
  'interface',
  'type',
  'variable',
  'constant',
  'method',
  'property',
  'enum',
  'namespace'
]);

/**
 * Represents a symbol definition location with metadata
 */
export interface SymbolDefinition {
  symbol: string;
  kind: SymbolKind;
  anchor: CodeAnchor;
  preview: CodePreview;
  containerName?: string;
}

export const SymbolDefinitionSchema = z.object({
  symbol: z.string().min(1).describe("Symbol name"),
  kind: SymbolKindSchema.describe("Symbol type"),
  anchor: CodeAnchorSchema,
  preview: CodePreviewSchema,
  containerName: z.string().optional().describe("Parent symbol name (e.g., containing class)")
});

/**
 * Represents a location where a symbol is used/referenced
 */
export interface SymbolReference {
  symbol: string;
  anchor: CodeAnchor;
  preview: CodePreview;
  isWrite: boolean;
}

export const SymbolReferenceSchema = z.object({
  symbol: z.string().min(1),
  anchor: CodeAnchorSchema,
  preview: CodePreviewSchema,
  isWrite: z.boolean().describe("True if this is a write/assignment, false for read/usage")
});

/**
 * Represents a caller/callee relationship between functions
 */
export interface CallRelationship {
  caller: string;
  callee: string;
  anchor: CodeAnchor;
  preview: CodePreview;
}

export const CallRelationshipSchema = z.object({
  caller: z.string().min(1).describe("Function making the call"),
  callee: z.string().min(1).describe("Function being called"),
  anchor: CodeAnchorSchema,
  preview: CodePreviewSchema
});

// ============================================================================
// Tool Input/Output Schemas
// ============================================================================

// Search Tool
export const SearchInputSchema = z.object({
  query: z.string().min(1).describe("Search query for code"),
  directory: z.string().optional().describe("Directory filter (relative to project root)"),
  language: z.string().optional().describe("Programming language filter (e.g., 'typescript', 'python')"),
  limit: z.number().int().min(1).max(100).default(10).describe("Maximum results (1-100)")
});

export type SearchInput = z.infer<typeof SearchInputSchema>;

export const SearchOutputSchema = z.object({
  query: z.string(),
  total: z.number().int().nonnegative().describe("Total matches found"),
  returned: z.number().int().nonnegative().describe("Number of results returned"),
  results: z.array(SearchResultSchema)
});

export type SearchOutput = z.infer<typeof SearchOutputSchema>;

// Find Definition Tool
export const FindDefinitionInputSchema = z.object({
  symbol: z.string().min(1).describe("Symbol name to find definition for")
});

export type FindDefinitionInput = z.infer<typeof FindDefinitionInputSchema>;

export const FindDefinitionOutputSchema = z.object({
  symbol: z.string(),
  found: z.boolean(),
  definition: SymbolDefinitionSchema.optional()
});

export type FindDefinitionOutput = z.infer<typeof FindDefinitionOutputSchema>;

// Find References Tool
export const FindReferencesInputSchema = z.object({
  symbol: z.string().min(1).describe("Symbol name to find references for")
});

export type FindReferencesInput = z.infer<typeof FindReferencesInputSchema>;

export const FindReferencesOutputSchema = z.object({
  symbol: z.string(),
  total: z.number().int().nonnegative(),
  references: z.array(SymbolReferenceSchema)
});

export type FindReferencesOutput = z.infer<typeof FindReferencesOutputSchema>;

// Callers Tool
export const CallersInputSchema = z.object({
  symbol: z.string().min(1).describe("Function name to find callers of")
});

export type CallersInput = z.infer<typeof CallersInputSchema>;

export const CallersOutputSchema = z.object({
  symbol: z.string(),
  total: z.number().int().nonnegative(),
  callers: z.array(CallRelationshipSchema)
});

export type CallersOutput = z.infer<typeof CallersOutputSchema>;

// Callees Tool
export const CalleesInputSchema = z.object({
  symbol: z.string().min(1).describe("Function name to find callees of")
});

export type CalleesInput = z.infer<typeof CalleesInputSchema>;

export const CalleesOutputSchema = z.object({
  symbol: z.string(),
  total: z.number().int().nonnegative(),
  callees: z.array(CallRelationshipSchema)
});

export type CalleesOutput = z.infer<typeof CalleesOutputSchema>;

// Open At Tool
export const OpenAtInputSchema = z.object({
  path: z.string().min(1).describe("File path (absolute or relative to project root)"),
  line: z.number().int().positive().describe("Line number (1-based)"),
  contextLines: z.number().int().min(0).max(50).default(10).describe("Number of context lines around target line")
});

export type OpenAtInput = z.infer<typeof OpenAtInputSchema>;

export const OpenAtOutputSchema = z.object({
  anchor: CodeAnchorSchema,
  preview: CodePreviewSchema,
  exists: z.boolean()
});

export type OpenAtOutput = z.infer<typeof OpenAtOutputSchema>;

// Refresh Tool
export const RefreshInputSchema = z.object({
  paths: z.array(z.string()).optional().describe("Specific paths to refresh (if omitted, refresh all)")
});

export type RefreshInput = z.infer<typeof RefreshInputSchema>;

export const RefreshOutputSchema = z.object({
  refreshed: z.number().int().nonnegative().describe("Number of files refreshed"),
  duration: z.number().positive().describe("Duration in milliseconds"),
  errors: z.array(z.object({
    path: z.string(),
    error: z.string()
  }))
});

export type RefreshOutput = z.infer<typeof RefreshOutputSchema>;

// Symbols Tool
export const SymbolsInputSchema = z.object({
  path: z.string().optional().describe("File path to list symbols from (if omitted, list all symbols)")
});

export type SymbolsInput = z.infer<typeof SymbolsInputSchema>;

export const SymbolsOutputSchema = z.object({
  path: z.string().optional(),
  total: z.number().int().nonnegative(),
  symbols: z.array(SymbolDefinitionSchema)
});

export type SymbolsOutput = z.infer<typeof SymbolsOutputSchema>;

// ============================================================================
// MCP Protocol Types
// ============================================================================

/**
 * Standard MCP tool response format
 */
export interface ToolResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * MCP tool metadata for tool listing
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Configuration for code preview extraction
 */
export interface PreviewConfig {
  beforeLines: number;      // Lines before match (default: 3)
  afterLines: number;       // Lines after match (default: 6)
  maxLineLength: number;    // Truncate threshold (default: 150)
  highlightMatch: boolean;  // Whether to highlight match term (default: true)
}

export const defaultPreviewConfig: PreviewConfig = {
  beforeLines: 3,
  afterLines: 6,
  maxLineLength: 150,
  highlightMatch: true
};
