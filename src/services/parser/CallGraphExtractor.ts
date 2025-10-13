/**
 * Call Graph Extraction
 *
 * Extracts function calls and method invocations to build usage graphs
 * and track function references.
 */

import type Parser from 'tree-sitter';
import type { FunctionCall, CallKind, Span } from '../../models/ParseResult.js';

/**
 * Map of Tree-sitter node types to call kinds
 * Covers TypeScript, JavaScript, and Python call patterns
 */
const CALL_NODE_TYPES: Record<string, CallKind> = {
  'call_expression': 'function', // foo() or obj.method() - will be refined
  'new_expression': 'constructor', // new Foo()
  'super': 'super', // super()
};

/**
 * Check if a Tree-sitter node represents a function call (T039)
 *
 * @param node - Tree-sitter syntax node
 * @returns True if node is a call
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
 * Determine the call kind for a node
 *
 * @param node - Tree-sitter syntax node
 * @returns Call kind
 */
export function getCallKind(node: Parser.SyntaxNode): CallKind {
  // Python call
  if (node.type === 'call') {
    return 'function'; // Will be refined to method if receiver exists
  }

  // New expression
  if (node.type === 'new_expression') {
    return 'constructor';
  }

  // Super call
  if (node.type === 'super') {
    return 'super';
  }

  // Call expression - need to check if it's a method call or function call
  if (node.type === 'call_expression') {
    const functionNode = node.childForFieldName('function');

    if (functionNode) {
      // Check for member expression (obj.method())
      if (functionNode.type === 'member_expression') {
        return 'method';
      }

      // Check for subscript expression (computed property - obj[key]())
      if (functionNode.type === 'subscript_expression' ||
          functionNode.type === 'computed_member_expression') {
        return 'dynamic';
      }
    }

    return 'function';
  }

  // Default
  return 'function';
}

/**
 * Extract callee name from a call node (T040)
 *
 * @param node - Tree-sitter call node
 * @returns Callee name (function/method being called)
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
 * Extract receiver (object) for method calls (T040)
 *
 * @param node - Tree-sitter call node
 * @returns Receiver name or undefined for function calls
 */
export function extractReceiver(node: Parser.SyntaxNode): string | undefined {
  // Only relevant for method calls

  // Python attribute calls
  if (node.type === 'call') {
    const functionNode = node.childForFieldName('function');
    if (functionNode && functionNode.type === 'attribute') {
      const objectNode = functionNode.childForFieldName('object');
      if (objectNode) {
        return objectNode.text;
      }
    }
    return undefined;
  }

  // JavaScript/TypeScript call expressions
  if (node.type === 'call_expression') {
    const functionNode = node.childForFieldName('function');

    if (!functionNode) {
      return undefined;
    }

    // Method call: obj.method()
    if (functionNode.type === 'member_expression') {
      const objectNode = functionNode.childForFieldName('object');
      if (objectNode) {
        return objectNode.text;
      }
    }
  }

  return undefined;
}

/**
 * Count the number of arguments in a call (T040)
 *
 * @param node - Tree-sitter call node
 * @returns Number of arguments
 */
export function countArguments(node: Parser.SyntaxNode): number {
  // Find arguments node
  const argsNode = node.childForFieldName('arguments') ||
                   node.children.find(child =>
                     child.type === 'arguments' ||
                     child.type === 'argument_list'
                   );

  if (!argsNode) {
    return 0;
  }

  // Count non-punctuation children (actual arguments)
  let count = 0;
  for (const child of argsNode.children) {
    // Skip punctuation like '(', ')', ','
    if (child.type !== '(' && child.type !== ')' && child.type !== ',') {
      count++;
    }
  }

  return count;
}

/**
 * Extract location span from a Tree-sitter node
 *
 * @param node - Tree-sitter syntax node
 * @returns Span with line, column, and byte offsets
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
 * Check if a call is part of a method chain (T041)
 *
 * @param node - Tree-sitter call node
 * @returns True if part of a chain
 */
export function isPartOfChain(node: Parser.SyntaxNode): boolean {
  // Check if this call has a previous call in the chain
  if (node.type === 'call_expression') {
    const functionNode = node.childForFieldName('function');
    if (functionNode && functionNode.type === 'member_expression') {
      const objectNode = functionNode.childForFieldName('object');
      // If the object is also a call expression, we're in a chain
      if (objectNode && objectNode.type === 'call_expression') {
        return true;
      }
    }
  }

  // Check if this call has a next call in the chain
  // (parent is a member expression whose parent is a call)
  let parent = node.parent;
  if (parent && parent.type === 'member_expression') {
    const grandparent = parent.parent;
    if (grandparent && grandparent.type === 'call_expression') {
      return true;
    }
  }

  return false;
}

/**
 * Extract call chain context (T041)
 *
 * @param node - Tree-sitter call node
 * @param allCalls - All extracted calls (for reference)
 * @returns Call chain context or undefined
 */
export function extractCallChain(
  node: Parser.SyntaxNode,
  allCalls: Array<{ node: Parser.SyntaxNode; callee: string }>
): import('../../models/ParseResult.js').CallChain | undefined {
  if (!isPartOfChain(node)) {
    return undefined;
  }

  const chain: import('../../models/ParseResult.js').CallChain = {
    position: 0,
  };

  // Find previous call in chain
  if (node.type === 'call_expression') {
    const functionNode = node.childForFieldName('function');
    if (functionNode && functionNode.type === 'member_expression') {
      const objectNode = functionNode.childForFieldName('object');
      if (objectNode && objectNode.type === 'call_expression') {
        // Find the call in our list
        const prevCall = allCalls.find(c => c.node === objectNode);
        if (prevCall) {
          chain.previous = prevCall.callee;
          // Position is one more than previous
          const prevChain = extractCallChain(objectNode, allCalls);
          chain.position = prevChain ? prevChain.position + 1 : 1;
        }
      }
    }
  }

  // Find next call in chain
  let parent = node.parent;
  if (parent && parent.type === 'member_expression') {
    const grandparent = parent.parent;
    if (grandparent && grandparent.type === 'call_expression') {
      const nextCall = allCalls.find(c => c.node === grandparent);
      if (nextCall) {
        chain.next = nextCall.callee;
      }
    }
  }

  return chain;
}

/**
 * Extract function calls from parsed tree (T042)
 *
 * @param tree - Tree-sitter parse tree
 * @param source - Source code content
 * @returns Array of function calls
 */
export function extractCalls(tree: Parser.Tree, _source: string): FunctionCall[] {
  const calls: FunctionCall[] = [];
  // Temporary storage for chain analysis
  const callNodes: Array<{ node: Parser.SyntaxNode; callee: string }> = [];

  /**
   * First pass: collect all call nodes
   */
  function collectCalls(node: Parser.SyntaxNode): void {
    // Check if this node is a call
    if (isCallNode(node)) {
      const callee = extractCalleeName(node);
      callNodes.push({ node, callee });
    }

    // Recursively walk children
    for (const child of node.children) {
      collectCalls(child);
    }
  }

  /**
   * Second pass: build FunctionCall objects with chain context
   */
  function buildCalls(): void {
    for (const { node, callee } of callNodes) {
      const kind = getCallKind(node);
      const receiver = extractReceiver(node);
      const argumentCount = countArguments(node);
      const span = extractSpan(node);
      const chain = extractCallChain(node, callNodes);

      const call: FunctionCall = {
        callee,
        kind,
        receiver,
        argumentCount,
        span,
        chain,
      };

      calls.push(call);
    }
  }

  // Execute two-pass extraction
  collectCalls(tree.rootNode);
  buildCalls();

  return calls;
}
