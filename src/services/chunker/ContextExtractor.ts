/**
 * ContextExtractor - Extracts enclosing context (class, module, inheritance) from AST
 */

import Parser from 'tree-sitter';
import type { ChunkContext } from '../../models/Chunk.js';
import { Language } from '../../models/ChunkTypes.js';
import { relative } from 'path';

/**
 * ContextExtractor service
 */
export class ContextExtractor {
  /**
   * Extract complete context for a function/method node
   * @param node Function/method node
   * @param language Source language
   * @param filePath Absolute file path
   * @param projectRoot Project root path
   * @returns ChunkContext with all enclosing information
   */
  public extractContext(
    node: Parser.SyntaxNode,
    language: Language,
    filePath: string,
    projectRoot: string
  ): ChunkContext {
    const context: ChunkContext = {
      className: null,
      classInheritance: [],
      modulePath: this.deriveModulePath(filePath, projectRoot),
      namespace: null,
      methodSignature: null,
      isTopLevel: true,
      parentChunkHash: null,
    };

    // Find enclosing class
    const classNode = this.findEnclosingClass(node);
    if (classNode) {
      context.className = this.extractClassName(classNode);
      context.classInheritance = this.extractInheritance(classNode, language);
      context.isTopLevel = false;
    }

    // Extract method signature if this is a method/function
    context.methodSignature = this.extractSignature(node, language);

    // Extract namespace (for TypeScript/JavaScript modules)
    context.namespace = this.extractNamespace(node, language);

    return context;
  }

  /**
   * Find enclosing class node by walking up the AST
   */
  public findEnclosingClass(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    let current = node.parent;

    while (current) {
      if (
        current.type === 'class_declaration' ||
        current.type === 'class_definition'
      ) {
        return current;
      }
      current = current.parent;
    }

    return null;
  }

  /**
   * Extract class name from class node
   */
  private extractClassName(classNode: Parser.SyntaxNode): string {
    const nameNode = classNode.childForFieldName('name');
    if (nameNode) {
      return nameNode.text;
    }

    // Fallback: find first identifier child
    for (const child of classNode.children) {
      if (child.type === 'identifier' || child.type === 'type_identifier') {
        return child.text;
      }
    }

    return 'UnknownClass';
  }

  /**
   * Extract inheritance chain from class node
   */
  public extractInheritance(classNode: Parser.SyntaxNode, language: Language): string[] {
    const inheritance: string[] = [];

    if (language === Language.Python) {
      // Python: superclasses field contains argument_list
      const superclassesNode = classNode.childForFieldName('superclasses');
      if (superclassesNode) {
        for (const child of superclassesNode.children) {
          if (child.type === 'identifier' || child.type === 'attribute') {
            inheritance.push(child.text);
          }
        }
      }
    } else {
      // TypeScript/JavaScript: look for class_heritage node
      for (const child of classNode.children) {
        if (child.type === 'class_heritage') {
          if (language === Language.TypeScript) {
            // TypeScript: class_heritage -> extends_clause -> identifier
            for (const heritageChild of child.children) {
              if (heritageChild.type === 'extends_clause') {
                for (const clauseChild of heritageChild.children) {
                  if (clauseChild.type === 'identifier' || clauseChild.type === 'type_identifier') {
                    inheritance.push(clauseChild.text);
                  }
                }
              }
            }
          } else {
            // JavaScript: class_heritage -> identifier (direct child)
            for (const heritageChild of child.children) {
              if (heritageChild.type === 'identifier') {
                inheritance.push(heritageChild.text);
              }
            }
          }
        }
      }
    }

    return inheritance;
  }

  /**
   * Extract function/method signature
   */
  public extractSignature(node: Parser.SyntaxNode, language: Language): string {
    // Handle decorated_definition nodes by finding the nested function
    let targetNode = node;
    if (node.type === 'decorated_definition') {
      const funcNode = node.children.find(
        (child) => child.type === 'function_definition' ||
                   child.type === 'function_declaration'
      );
      if (funcNode) {
        targetNode = funcNode;
      }
    }

    // Get function name
    const nameNode = targetNode.childForFieldName('name');
    const name = nameNode ? nameNode.text : 'anonymous';

    // Get parameters
    const paramsNode = targetNode.childForFieldName('parameters');
    const params = paramsNode ? paramsNode.text : '()';

    // Get return type (TypeScript only)
    let returnType = '';
    if (language === Language.TypeScript) {
      const returnTypeNode = targetNode.childForFieldName('return_type');
      if (returnTypeNode) {
        returnType = `: ${returnTypeNode.text}`;
      }
    }

    // Check for async (check both the original node and target node)
    const isAsync = node.children.some((child) => child.type === 'async') ||
                    targetNode.children.some((child) => child.type === 'async');
    const asyncPrefix = isAsync ? 'async ' : '';

    // Check for generator
    const isGenerator = targetNode.type === 'generator_function_declaration' ||
      targetNode.children.some((child) => child.text === '*');
    const generatorPrefix = isGenerator ? '*' : '';

    return `${asyncPrefix}${generatorPrefix}${name}${params}${returnType}`;
  }

  /**
   * Derive module path from file path
   */
  public deriveModulePath(filePath: string, projectRoot: string): string {
    // Make path relative to project root
    const relativePath = relative(projectRoot, filePath);

    // Remove file extension
    const withoutExt = relativePath.replace(/\.(ts|tsx|js|jsx|py)$/, '');

    // Convert path separators to dots
    const modulePath = withoutExt.replace(/[/\\]/g, '.');

    return modulePath;
  }

  /**
   * Extract namespace/module hierarchy
   */
  private extractNamespace(node: Parser.SyntaxNode, language: Language): string | null {
    // For TypeScript/JavaScript, look for namespace declarations
    if (language === Language.TypeScript || language === Language.JavaScript) {
      const namespaces: string[] = [];
      let current = node.parent;

      while (current) {
        if (current.type === 'namespace_declaration' || current.type === 'module_declaration') {
          const nameNode = current.childForFieldName('name');
          if (nameNode) {
            namespaces.unshift(nameNode.text);
          }
        }
        current = current.parent;
      }

      return namespaces.length > 0 ? namespaces.join('.') : null;
    }

    // Python doesn't have explicit namespaces like TypeScript
    return null;
  }
}
