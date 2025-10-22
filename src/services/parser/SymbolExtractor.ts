/**
 * Symbol Extraction Logic
 *
 * Extracts symbols (functions, classes, variables, etc.) from Tree-sitter
 * parse tree and populates ASTDocBuilder.
 */

import type Parser from 'tree-sitter';
import type { ASTDocBuilder } from './ASTDocBuilder.js';
import type { Span } from '../../models/ASTDoc.js';

/**
 * Symbol kinds we recognize
 */
type SymbolKind =
  | 'function'
  | 'class'
  | 'variable'
  | 'interface'
  | 'enum'
  | 'type'
  | 'constant'
  | 'method'
  | 'property'
  | 'module'
  | 'namespace'
  | 'import'
  | 'export';

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
 */
export function isSymbolNode(node: Parser.SyntaxNode): boolean {
  return SYMBOL_NODE_TYPES.hasOwnProperty(node.type);
}

/**
 * Get the symbol kind for a Tree-sitter node
 */
export function getSymbolKind(node: Parser.SyntaxNode): SymbolKind | null {
  return SYMBOL_NODE_TYPES[node.type] || null;
}

/**
 * Check if a node represents a constant (vs a variable)
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
 * Extract symbol name from a Tree-sitter node
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
 * Extract location span from a Tree-sitter node
 */
export function extractSpan(node: Parser.SyntaxNode): Span {
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
 * Find parent class name by walking up the tree
 */
function getParentClassName(node: Parser.SyntaxNode): string | null {
  let current = node.parent;

  while (current) {
    if (current.type === 'class_declaration' || current.type === 'class_definition') {
      const nameNode = current.childForFieldName('name');
      if (nameNode) {
        return nameNode.text;
      }
    }
    current = current.parent;
  }

  return null;
}

/**
 * Check if node is inside a class
 */
function isInsideClass(node: Parser.SyntaxNode): boolean {
  let current = node.parent;
  while (current) {
    if (current.type === 'class_declaration' || current.type === 'class_definition') {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Check if node is exported
 */
function isExported(node: Parser.SyntaxNode): boolean {
  let current: Parser.SyntaxNode | null = node;
  while (current) {
    if (current.type === 'export_statement') {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Extract visibility modifier
 */
function extractVisibility(node: Parser.SyntaxNode): 'public' | 'private' | 'protected' | undefined {
  for (const child of node.children) {
    if (child.type === 'accessibility_modifier') {
      const modifier = child.text;
      if (modifier === 'public' || modifier === 'private' || modifier === 'protected') {
        return modifier;
      }
    }
  }
  return undefined;
}

/**
 * Check if function/method is async
 */
function isAsync(node: Parser.SyntaxNode): boolean {
  for (const child of node.children) {
    if (child.text === 'async') {
      return true;
    }
  }
  return false;
}

/**
 * Check if method is static
 */
function isStatic(node: Parser.SyntaxNode): boolean {
  for (const child of node.children) {
    if (child.text === 'static') {
      return true;
    }
  }
  return false;
}

/**
 * Check if class/method is abstract
 */
function isAbstract(node: Parser.SyntaxNode): boolean {
  for (const child of node.children) {
    if (child.text === 'abstract') {
      return true;
    }
  }
  return false;
}

/**
 * Extract decorators
 */
function extractDecorators(node: Parser.SyntaxNode): string[] {
  const decorators: string[] = [];
  for (const child of node.children) {
    if (child.type === 'decorator') {
      decorators.push(child.text);
    }
  }
  return decorators;
}

/**
 * Extract function/method signature
 */
function extractFunctionSignature(node: Parser.SyntaxNode, source: string, name: string): string {
  const signatureNode = node.children.find(child =>
    child.type === 'formal_parameters' ||
    child.type === 'parameters' // Python
  );

  if (!signatureNode) {
    return `${name}()`;
  }

  const params = source.substring(signatureNode.startIndex, signatureNode.endIndex);

  // Try to find return type annotation (TypeScript)
  const returnTypeNode = node.children.find(child =>
    child.type === 'type_annotation'
  );

  let returnType = '';
  if (returnTypeNode) {
    returnType = source.substring(returnTypeNode.startIndex, returnTypeNode.endIndex);
  }

  return `${name}${params}${returnType}`;
}

/**
 * Extract class signature (unused but kept for future use)
 */
// function extractClassSignature(node: Parser.SyntaxNode, source: string, name: string): string {
//   // Find extends/implements clauses
//   const heritage: string[] = [];

//   for (const child of node.children) {
//     if (child.type === 'class_heritage' || child.type === 'extends_clause' || child.type === 'implements_clause') {
//       heritage.push(source.substring(child.startIndex, child.endIndex));
//     }
//   }

//   const heritageStr = heritage.length > 0 ? ' ' + heritage.join(' ') : '';
//   return `class ${name}${heritageStr}`;
// }

/**
 * Extract type signature
 */
function extractTypeSignature(node: Parser.SyntaxNode, source: string, name: string): string {
  // Find the type definition
  const typeNode = node.children.find(child =>
    child.type === 'type' || child.type === 'type_annotation'
  );

  if (typeNode) {
    const typeStr = source.substring(typeNode.startIndex, typeNode.endIndex);
    // Limit length for complex types
    const truncated = typeStr.length > 200 ? typeStr.substring(0, 200) + '...' : typeStr;
    return `type ${name} = ${truncated}`;
  }

  return `type ${name}`;
}

/**
 * Extract variable/constant signature (unused but kept for future use)
 */
// function extractVariableSignature(node: Parser.SyntaxNode, source: string): string {
//   // Get the full declarator node text
//   const declaratorText = source.substring(node.startIndex, node.endIndex);

//   // Find parent to determine if const/let/var
//   let declarationKeyword = 'var';
//   let parent = node.parent;
//   while (parent) {
//     if (parent.type === 'lexical_declaration' || parent.type === 'variable_declaration') {
//       const firstChild = parent.child(0);
//       if (firstChild && (firstChild.type === 'const' || firstChild.type === 'let' || firstChild.type === 'var')) {
//         declarationKeyword = firstChild.text;
//       }
//       break;
//     }
//     parent = parent.parent;
//   }

//   // Limit length for long initializers
//   const truncated = declaratorText.length > 200
//     ? declaratorText.substring(0, 200) + '...'
//     : declaratorText;

//   return `${declarationKeyword} ${truncated}`;
// }

/**
 * Extract documentation from preceding comments
 */
function extractDocumentation(_node: Parser.SyntaxNode, _source: string): string | null {
  // TODO: Look for JSDoc/docstring comments immediately before the node
  // For now, return null - will be populated by CommentExtractor
  return null;
}

/**
 * Extract inherited classes
 */
function extractInherits(node: Parser.SyntaxNode, _source: string): string[] | undefined {
  const inherits: string[] = [];

  for (const child of node.children) {
    if (child.type === 'class_heritage' || child.type === 'extends_clause') {
      // Extract class names from extends clause
      for (const grandchild of child.children) {
        if (grandchild.type === 'identifier' || grandchild.type === 'type_identifier') {
          inherits.push(grandchild.text);
        }
      }
    }
  }

  return inherits.length > 0 ? inherits : undefined;
}

/**
 * Extract implemented interfaces
 */
function extractImplements(node: Parser.SyntaxNode, _source: string): string[] | undefined {
  const implements_: string[] = [];

  for (const child of node.children) {
    if (child.type === 'implements_clause') {
      // Extract interface names
      for (const grandchild of child.children) {
        if (grandchild.type === 'identifier' || grandchild.type === 'type_identifier') {
          implements_.push(grandchild.text);
        }
      }
    }
  }

  return implements_.length > 0 ? implements_ : undefined;
}

/**
 * Extract extended interfaces
 */
function extractExtends(node: Parser.SyntaxNode, _source: string): string[] | undefined {
  const extends_: string[] = [];

  for (const child of node.children) {
    if (child.type === 'extends_clause' || child.type === 'extends_type_clause') {
      // Extract interface names
      for (const grandchild of child.children) {
        if (grandchild.type === 'identifier' || grandchild.type === 'type_identifier') {
          extends_.push(grandchild.text);
        }
      }
    }
  }

  return extends_.length > 0 ? extends_ : undefined;
}

/**
 * Extract all symbols from parsed tree into ASTDocBuilder
 *
 * Walks the Tree-sitter tree recursively and extracts all symbols,
 * populating the builder with complete metadata.
 */
export function extractSymbols(
  tree: Parser.Tree,
  source: string,
  builder: ASTDocBuilder
): void {
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

      // Extract common data
      const name = extractSymbolName(node);
      const span = extractSpan(node);
      const doc = extractDocumentation(node, source);
      const exported = isExported(node);

      // Handle each symbol type
      switch (kind) {
        case 'function': {
          // Check if it's actually a method (inside a class)
          if (isInsideClass(node)) {
            // Will be handled as a method
            break;
          }

          const signature = extractFunctionSignature(node, source, name);
          const decorators = extractDecorators(node);
          const visibility = extractVisibility(node);
          const asyncFunc = isAsync(node);

          builder.addFunction(name, {
            signature,
            span,
            doc,
            decorators: decorators.length > 0 ? decorators : undefined,
            visibility,
            async: asyncFunc,
            exported
          });
          break;
        }

        case 'class': {
          const inherits = extractInherits(node, source);
          const implements_ = extractImplements(node, source);
          const abstract = isAbstract(node);

          builder.addClass(name, {
            span,
            inherits,
            implements: implements_,
            doc,
            abstract,
            exported
          });
          break;
        }

        case 'method': {
          const className = getParentClassName(node);
          if (!className) {
            // Method without parent class - skip
            break;
          }

          const signature = extractFunctionSignature(node, source, name);
          const decorators = extractDecorators(node);
          const visibility = extractVisibility(node);
          const staticMethod = isStatic(node);
          const abstractMethod = isAbstract(node);
          const asyncMethod = isAsync(node);

          try {
            builder.addMethod(className, name, {
              signature,
              span,
              doc,
              decorators: decorators.length > 0 ? decorators : undefined,
              static: staticMethod,
              abstract: abstractMethod,
              async: asyncMethod,
              visibility
            });
          } catch (error) {
            // Class might not exist yet if we encounter method before class
            // This shouldn't happen with proper traversal, but handle gracefully
            console.warn(`Failed to add method ${name} to class ${className}:`, error);
          }
          break;
        }

        case 'interface': {
          const extends_ = extractExtends(node, source);

          builder.addInterface(name, {
            span,
            doc,
            extends: extends_,
            exported
          });
          break;
        }

        case 'type': {
          const typeStr = extractTypeSignature(node, source, name);

          builder.addTypeAlias(name, {
            type: typeStr,
            span,
            doc,
            exported
          });
          break;
        }

        case 'enum': {
          // Extract enum values
          const values: string[] = [];
          for (const child of node.children) {
            if (child.type === 'enum_body') {
              for (const member of child.children) {
                if (member.type === 'property_identifier' || member.type === 'identifier') {
                  values.push(member.text);
                }
              }
            }
          }

          builder.addEnum(name, {
            values,
            span,
            doc,
            exported
          });
          break;
        }

        case 'variable':
        case 'constant': {
          // Determine if it's a constant
          const isConst = isConstant(node);

          // Extract value
          const valueNode = node.childForFieldName('value');
          const value = valueNode ? source.substring(valueNode.startIndex, valueNode.endIndex) : '';

          if (isConst || kind === 'constant') {
            builder.addConstant(name, {
              type: undefined, // TODO: Extract type annotation
              value,
              span,
              exported
            });
          }
          // Skip regular variables for now - focus on constants
          break;
        }

        case 'property': {
          // Properties are handled separately when we process their parent class/interface
          // We could extract them here if needed
          break;
        }

        default:
          // Skip other kinds (module, namespace, import, export - handled separately)
          break;
      }
    }

    // Recursively walk children
    for (const child of node.children) {
      walkNode(child);
    }
  }

  // Start walking from root node
  walkNode(tree.rootNode);
}
