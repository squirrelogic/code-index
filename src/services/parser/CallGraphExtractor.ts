/**
 * Call Graph Extraction
 *
 * Extracts function calls and method invocations to build call graph
 * relationships in ASTDocBuilder.
 */

import type Parser from 'tree-sitter';
import type { ASTDocBuilder } from './ASTDocBuilder.js';

/**
 * Map of Tree-sitter node types to call kinds
 */
type CallKind = 'function' | 'method' | 'constructor' | 'super' | 'dynamic';

const CALL_NODE_TYPES: Record<string, CallKind> = {
  'call_expression': 'function', // foo() or obj.method() - will be refined
  'new_expression': 'constructor', // new Foo()
  'super': 'super', // super()
};

/**
 * Check if a Tree-sitter node represents a function call
 */
export function isCallNode(node: Parser.SyntaxNode): boolean {
  // Direct call expressions
  if (CALL_NODE_TYPES.hasOwnProperty(node.type)) {
    return true;
  }

  // Python specific: call nodes have 'call' type
  if (node.type === 'call') {
    return true;
  }

  return false;
}

/**
 * Extract callee name from a call node
 */
export function extractCalleeName(node: Parser.SyntaxNode): string {
  // Handle new expressions: new Foo()
  if (node.type === 'new_expression') {
    const constructorNode = node.childForFieldName('constructor');
    if (constructorNode) {
      return constructorNode.text;
    }
    // Fallback to first child
    for (const child of node.children) {
      if (child.type === 'identifier' || child.type === 'member_expression') {
        return child.text;
      }
    }
    return '<unknown>';
  }

  // Handle super calls
  if (node.type === 'super') {
    return 'super';
  }

  // Handle Python calls
  if (node.type === 'call') {
    const functionNode = node.childForFieldName('function');
    if (functionNode) {
      // For member expressions, get just the method name
      if (functionNode.type === 'attribute') {
        const attributeNode = functionNode.childForFieldName('attribute');
        if (attributeNode) {
          return attributeNode.text;
        }
      }
      // For simple function calls
      return functionNode.text;
    }
  }

  // Handle JavaScript/TypeScript call expressions
  if (node.type === 'call_expression') {
    const functionNode = node.childForFieldName('function');

    if (!functionNode) {
      return '<unknown>';
    }

    // Simple function call: foo()
    if (functionNode.type === 'identifier') {
      return functionNode.text;
    }

    // Method call: obj.method()
    if (functionNode.type === 'member_expression') {
      const propertyNode = functionNode.childForFieldName('property');
      if (propertyNode) {
        return propertyNode.text;
      }
      // Fallback: get the last part of the member expression
      const children = functionNode.children;
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (child && (child.type === 'property_identifier' || child.type === 'identifier')) {
          return child.text;
        }
      }
    }

    // Computed member expression: obj[key]()
    if (functionNode.type === 'subscript_expression' ||
        functionNode.type === 'computed_member_expression') {
      return '<dynamic>';
    }

    // Chained calls: obj.foo().bar() - get the full chain
    return functionNode.text;
  }

  return '<unknown>';
}

/**
 * Find the enclosing function/method name for a call
 */
function findEnclosingFunction(node: Parser.SyntaxNode): string | null {
  let current = node.parent;

  while (current) {
    // Check for function declaration
    if (current.type === 'function_declaration' ||
        current.type === 'function_definition' ||
        current.type === 'generator_function_declaration') {
      const nameNode = current.childForFieldName('name');
      if (nameNode) {
        return nameNode.text;
      }
    }

    // Check for method definition
    if (current.type === 'method_definition') {
      const nameNode = current.childForFieldName('name');
      if (nameNode) {
        // Get class name too
        const className = findEnclosingClass(current);
        if (className) {
          return `${className}.${nameNode.text}`;
        }
        return nameNode.text;
      }
    }

    // Check for arrow function assigned to variable
    if (current.type === 'variable_declarator') {
      const nameNode = current.childForFieldName('name');
      if (nameNode) {
        const valueNode = current.childForFieldName('value');
        if (valueNode && valueNode.type === 'arrow_function') {
          return nameNode.text;
        }
      }
    }

    current = current.parent;
  }

  return null;
}

/**
 * Find the enclosing class name
 */
function findEnclosingClass(node: Parser.SyntaxNode): string | null {
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
 * Extract function calls and build call graph in ASTDocBuilder
 *
 * Walks the tree to find all function calls, determines the caller
 * context, and records the relationships in the builder.
 */
export function extractCallGraph(
  tree: Parser.Tree,
  _source: string,
  builder: ASTDocBuilder
): void {
  /**
   * Recursive walker to find all calls
   */
  function walkNode(node: Parser.SyntaxNode): void {
    // Check if this node is a call
    if (isCallNode(node)) {
      const callee = extractCalleeName(node);

      // Skip if we couldn't determine the callee
      if (callee === '<unknown>' || callee === '<dynamic>') {
        // Continue walking children
        for (const child of node.children) {
          walkNode(child);
        }
        return;
      }

      // Find the function/method making this call
      const caller = findEnclosingFunction(node);

      // Record the relationship if we found a caller
      if (caller) {
        builder.recordCall(caller, callee);
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
