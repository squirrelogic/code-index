/**
 * Symbol Extraction Logic
 *
 * Extracts symbols (functions, classes, variables, etc.) from Tree-sitter
 * parse tree with hierarchical relationships and metadata.
 */

import type Parser from 'tree-sitter';
import type { Symbol, SymbolKind } from '../../models/ParseResult.js';

/**
 * Map of Tree-sitter node types to symbol kinds
 * Covers TypeScript, JavaScript, and Python node types
 */
const SYMBOL_NODE_TYPES: Record<string, SymbolKind> = {
  // Functions
  'function_declaration': 'function',
  'function_definition': 'function', // Python (will be overridden to 'method' if inside class)
  'generator_function_declaration': 'function',
  'arrow_function': 'function',

  // Classes
  'class_declaration': 'class',
  'class_definition': 'class', // Python

  // Variables and Constants (only extract from variable_declarator, not declarations)
  'variable_declarator': 'variable',

  // TypeScript specific
  'interface_declaration': 'interface',
  'type_alias_declaration': 'type',
  'enum_declaration': 'enum',

  // Methods and Properties
  'method_definition': 'method',
  'method_declaration': 'method', // TypeScript interface methods
  'property_signature': 'property',
  'public_field_definition': 'property',
  'field_definition': 'property', // Class fields
  'property_definition': 'property',

  // Module-related
  'module_declaration': 'module',
  'namespace_declaration': 'namespace',
  'internal_module': 'namespace',

  // Import/Export (treated as symbols in some contexts)
  'import_statement': 'import',
  'import_clause': 'import',
  'export_statement': 'export',
};

/**
 * Check if a Tree-sitter node represents a symbol
 *
 * @param node - Tree-sitter syntax node
 * @returns True if node is a symbol
 */
export function isSymbolNode(node: Parser.SyntaxNode): boolean {
  return SYMBOL_NODE_TYPES.hasOwnProperty(node.type);
}

/**
 * Get the symbol kind for a Tree-sitter node
 *
 * @param node - Tree-sitter syntax node
 * @returns Symbol kind or null if not a symbol
 */
export function getSymbolKind(node: Parser.SyntaxNode): SymbolKind | null {
  return SYMBOL_NODE_TYPES[node.type] || null;
}

/**
 * Check if a node represents a constant (vs a variable)
 *
 * @param node - Tree-sitter syntax node
 * @returns True if node is a constant declaration
 */
export function isConstant(node: Parser.SyntaxNode): boolean {
  // Check parent for const keyword in JavaScript/TypeScript
  let parent = node.parent;
  while (parent) {
    if (parent.type === 'lexical_declaration') {
      // Check for const keyword
      const firstChild = parent.child(0);
      if (firstChild && firstChild.type === 'const') {
        return true;
      }
    }
    parent = parent.parent;
  }
  return false;
}

/**
 * Extract symbol name from a Tree-sitter node (T013)
 *
 * @param node - Tree-sitter syntax node
 * @returns Symbol name or fallback
 */
export function extractSymbolName(node: Parser.SyntaxNode): string {
  // Use field name if available (more reliable)
  const nameNode = node.childForFieldName('name');
  if (nameNode) {
    return nameNode.text;
  }

  // Try to find identifier child node
  const identifierChild = node.children.find(child =>
    child.type === 'identifier' ||
    child.type === 'type_identifier' ||
    child.type === 'property_identifier'
  );

  if (identifierChild) {
    return identifierChild.text;
  }

  // Handle special cases
  switch (node.type) {
    case 'arrow_function':
      return '<anonymous>';
  }

  // Fallback: return anonymous or extract first identifier
  return '<anonymous>';
}

/**
 * Extract location span from a Tree-sitter node (T014)
 *
 * @param node - Tree-sitter syntax node
 * @returns Span with line, column, and byte offsets
 */
export function extractSpan(node: Parser.SyntaxNode): import('../../models/ParseResult.js').Span {
  return {
    startLine: node.startPosition.row + 1, // 1-indexed
    startColumn: node.startPosition.column, // 0-indexed
    endLine: node.endPosition.row + 1, // 1-indexed
    endColumn: node.endPosition.column, // 0-indexed
    startByte: node.startIndex,
    endByte: node.endIndex,
  };
}

/**
 * Extract parent scope chain from a Tree-sitter node (T015)
 *
 * Walks up the tree to find all enclosing symbols
 * Returns array ordered from immediate parent to root
 *
 * @param node - Tree-sitter syntax node
 * @returns Array of parent symbol names
 */
export function extractParents(node: Parser.SyntaxNode): string[] {
  const parents: string[] = [];
  let current = node.parent;

  while (current) {
    // Check if this parent node is a symbol
    if (isSymbolNode(current)) {
      const parentName = extractSymbolName(current);
      if (parentName && parentName !== '<anonymous>') {
        parents.push(parentName);
      }
    }

    current = current.parent;
  }

  // Return in order from immediate parent to root
  return parents;
}

/**
 * Extract function/method signature (T016)
 *
 * @param node - Tree-sitter syntax node
 * @param source - Source code
 * @returns Function signature string or null
 */
export function extractSignature(node: Parser.SyntaxNode, source: string): string | null {
  // Only extract signatures for callable symbols
  const kind = getSymbolKind(node);
  if (kind !== 'function' && kind !== 'method') {
    return null;
  }

  // Try to extract the full signature from source
  // Find the signature portion (up to the opening brace)
  const signatureNode = node.children.find(child =>
    child.type === 'formal_parameters' ||
    child.type === 'parameters' // Python
  );

  if (!signatureNode) {
    return null;
  }

  // Get function name
  const name = extractSymbolName(node);

  // Extract parameters
  const params = source.substring(signatureNode.startIndex, signatureNode.endIndex);

  // Try to find return type annotation (TypeScript)
  const returnTypeNode = node.children.find(child =>
    child.type === 'type_annotation'
  );

  let returnType = '';
  if (returnTypeNode) {
    returnType = source.substring(returnTypeNode.startIndex, returnTypeNode.endIndex);
  }

  // Build signature
  const signature = `function ${name}${params}${returnType}`;

  return signature;
}

/**
 * Extract symbol metadata (T017)
 *
 * @param node - Tree-sitter syntax node
 * @param source - Source code
 * @returns Symbol metadata
 */
export function extractMetadata(
  node: Parser.SyntaxNode,
  source: string
): import('../../models/ParseResult.js').SymbolMetadata {
  const metadata: import('../../models/ParseResult.js').SymbolMetadata = {
    exported: false,
  };

  // Check for export modifier
  let current: Parser.SyntaxNode | null = node;
  while (current) {
    if (current.type === 'export_statement') {
      metadata.exported = true;
      break;
    }
    current = current.parent;
  }

  // Check for visibility modifiers
  for (const child of node.children) {
    if (child.type === 'accessibility_modifier') {
      const modifier = child.text;
      if (modifier === 'public' || modifier === 'private' || modifier === 'protected') {
        metadata.visibility = modifier;
      }
    }
  }

  // Check for async modifier
  for (const child of node.children) {
    if (child.text === 'async') {
      metadata.async = true;
      break;
    }
  }

  // Check for static modifier
  for (const child of node.children) {
    if (child.text === 'static') {
      metadata.static = true;
      break;
    }
  }

  // Check for abstract modifier
  for (const child of node.children) {
    if (child.text === 'abstract') {
      metadata.abstract = true;
      break;
    }
  }

  // Extract type annotation (if present)
  const typeAnnotation = node.children.find(child =>
    child.type === 'type_annotation' || child.type === 'type'
  );
  if (typeAnnotation) {
    metadata.typeAnnotation = source.substring(
      typeAnnotation.startIndex,
      typeAnnotation.endIndex
    );
  }

  // Extract decorators (TypeScript/Python)
  const decorators: string[] = [];
  for (const child of node.children) {
    if (child.type === 'decorator') {
      decorators.push(child.text);
    }
  }
  if (decorators.length > 0) {
    metadata.decorators = decorators;
  }

  return metadata;
}

/**
 * Extract all symbols from parsed tree (T018)
 *
 * Walks the Tree-sitter tree recursively and extracts all symbols
 * with their names, kinds, spans, parents, signatures, and metadata.
 *
 * @param tree - Tree-sitter parse tree
 * @param source - Source code content
 * @returns Array of extracted symbols
 */
export function extractSymbols(tree: Parser.Tree, source: string): Symbol[] {
  const symbols: Symbol[] = [];

  /**
   * Recursive tree walker that extracts symbols
   */
  function walkNode(node: Parser.SyntaxNode): void {
    // Check if this node is a symbol
    if (isSymbolNode(node)) {
      const kind = getSymbolKind(node);

      // Skip if we couldn't determine the kind
      if (!kind) {
        // Continue walking children
        for (const child of node.children) {
          walkNode(child);
        }
        return;
      }

      // Override kind if it's a constant
      let finalKind = kind;
      if (kind === 'variable' && isConstant(node)) {
        finalKind = 'constant';
      }

      // For Python: function_definition inside a class should be 'method'
      if (node.type === 'function_definition') {
        // Check if parent is a class
        let parent = node.parent;
        while (parent) {
          if (parent.type === 'class_definition') {
            finalKind = 'method';
            break;
          }
          parent = parent.parent;
        }
      }

      // Extract all symbol properties
      const name = extractSymbolName(node);
      const span = extractSpan(node);
      const parents = extractParents(node);
      const signature = extractSignature(node, source);
      const metadata = extractMetadata(node, source);

      // Create symbol object
      const symbol: Symbol = {
        name,
        kind: finalKind,
        span,
        parents,
        signature,
        documentation: null, // Will be populated in Phase 5 (US3)
        hash: '', // Will be populated in Phase 7 (US5)
        metadata,
      };

      symbols.push(symbol);
    }

    // Recursively walk children
    for (const child of node.children) {
      walkNode(child);
    }
  }

  // Start walking from root node
  walkNode(tree.rootNode);

  return symbols;
}
