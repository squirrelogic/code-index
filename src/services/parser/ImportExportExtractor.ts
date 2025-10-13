/**
 * Import/Export Statement Extraction
 *
 * Extracts import and export statements to track module dependencies
 * and API surfaces.
 */

import type TreeSitter from 'tree-sitter';
import type {
  ImportStatement,
  ImportKind,
  ImportSpecifier,
  ExportStatement,
  ExportKind,
  ExportSpecifier,
} from '../../models/ParseResult.js';
import { extractSpan } from './SymbolExtractor.js';

// ============================================================================
// Import Node Identification (T024)
// ============================================================================

/**
 * Check if a Tree-sitter node represents an import statement
 *
 * @param node - Tree-sitter syntax node
 * @returns True if node is an import
 */
export function isImportNode(node: TreeSitter.SyntaxNode): boolean {
  const nodeType = node.type;

  // JavaScript/TypeScript import nodes
  if (
    nodeType === 'import_statement' ||
    nodeType === 'import' ||
    nodeType === 'import_clause'
  ) {
    return true;
  }

  // CommonJS require: const foo = require('bar')
  if (nodeType === 'variable_declarator') {
    const init = node.childForFieldName('value');
    if (init?.type === 'call_expression') {
      const callee = init.childForFieldName('function');
      if (callee?.text === 'require') {
        return true;
      }
    }
  }

  // Python import nodes
  if (nodeType === 'import_statement' || nodeType === 'import_from_statement') {
    return true;
  }

  return false;
}

/**
 * Determine the kind of import from a Tree-sitter node
 *
 * @param node - Tree-sitter syntax node (must be an import node)
 * @returns Import kind
 */
export function getImportKind(node: TreeSitter.SyntaxNode): ImportKind {
  const nodeType = node.type;
  const nodeText = node.text;

  // Dynamic import: import('module')
  if (nodeType === 'call_expression') {
    const callee = node.childForFieldName('function');
    if (callee?.text === 'import') {
      return 'dynamic';
    }
  }

  // CommonJS require
  if (nodeType === 'variable_declarator') {
    return 'require';
  }

  // Side-effect import: import 'module'
  if (nodeType === 'import_statement' && !nodeText.includes('from')) {
    const hasClause = node.children.some(
      (child) => child.type === 'import_clause' || child.type === 'namespace_import'
    );
    if (!hasClause) {
      return 'side-effect';
    }
  }

  // Namespace import: import * as foo from 'module'
  if (nodeText.includes('* as ') || node.children.some((c) => c.type === 'namespace_import')) {
    return 'namespace';
  }

  // Default import: import foo from 'module'
  // Check if there's an identifier without braces before 'from'
  const hasDefaultImport = node.children.some((child) => {
    if (child.type === 'import_clause') {
      const firstChild = child.child(0);
      return firstChild?.type === 'identifier';
    }
    return false;
  });

  if (hasDefaultImport && !nodeText.includes('{')) {
    return 'default';
  }

  // Named import: import { foo } from 'module' (default)
  return 'named';
}

// ============================================================================
// Import Extraction (T025)
// ============================================================================

/**
 * Extract import statement details from a Tree-sitter node
 *
 * @param node - Tree-sitter syntax node (must be an import node)
 * @param source - Source code text
 * @returns ImportStatement object
 */
export function extractImport(node: TreeSitter.SyntaxNode, source: string): ImportStatement {
  const kind = getImportKind(node);
  const importSource = extractImportSource(node);
  const specifiers = extractImportSpecifiers(node, source);
  const span = extractSpan(node);

  return {
    source: importSource,
    kind,
    specifiers,
    span,
  };
}

/**
 * Extract the source module path from an import node
 *
 * @param node - Tree-sitter import node
 * @returns Module source path
 */
function extractImportSource(node: TreeSitter.SyntaxNode): string {
  // Look for string literal child
  const stringNode = node.children.find((child) => child.type === 'string');

  if (stringNode) {
    // Remove quotes from string literal
    return stringNode.text.replace(/['"]/g, '');
  }

  // For CommonJS require
  if (node.type === 'variable_declarator') {
    const init = node.childForFieldName('value');
    if (init?.type === 'call_expression') {
      const arg = init.childForFieldName('arguments')?.child(1); // First child is '(', second is arg
      if (arg && arg.type === 'string') {
        return arg.text.replace(/['"]/g, '');
      }
    }
  }

  return '';
}

/**
 * Extract import specifiers (imported names and local bindings)
 *
 * @param node - Tree-sitter import node
 * @param source - Source code text
 * @returns Array of import specifiers
 */
function extractImportSpecifiers(
  node: TreeSitter.SyntaxNode,
  _source: string
): ImportSpecifier[] {
  const kind = getImportKind(node);
  const specifiers: ImportSpecifier[] = [];

  // Side-effect imports have no specifiers
  if (kind === 'side-effect') {
    return specifiers;
  }

  // Namespace import: import * as foo
  if (kind === 'namespace') {
    // Look for namespace_import or import_clause containing namespace_import
    let namespaceNode = node.children.find((c) => c.type === 'namespace_import');

    if (!namespaceNode) {
      const importClause = node.children.find((c) => c.type === 'import_clause');
      if (importClause) {
        namespaceNode = importClause.children.find((c) => c.type === 'namespace_import');
      }
    }

    if (namespaceNode) {
      // Find the identifier (the local binding name after 'as')
      const localName = namespaceNode.children.find((c) => c.type === 'identifier');
      if (localName) {
        specifiers.push({
          imported: '*',
          local: localName.text,
          typeOnly: false,
        });
      }
    }
    return specifiers;
  }

  // Default import
  if (kind === 'default') {
    const importClause = node.children.find((c) => c.type === 'import_clause');
    if (importClause) {
      const identifier = importClause.child(0);
      if (identifier?.type === 'identifier') {
        specifiers.push({
          imported: 'default',
          local: identifier.text,
          typeOnly: false,
        });
      }
    }
    return specifiers;
  }

  // Named imports: import { foo, bar as baz }
  if (kind === 'named') {
    const importClause = node.children.find((c) => c.type === 'import_clause');
    if (importClause) {
      const namedImports = importClause.children.find((c) => c.type === 'named_imports');
      if (namedImports) {
        for (const child of namedImports.children) {
          if (child.type === 'import_specifier') {
            const imported = child.childForFieldName('name');
            const local = child.childForFieldName('alias') || imported;

            if (imported) {
              specifiers.push({
                imported: imported.text,
                local: local?.text || imported.text,
                typeOnly: false,
              });
            }
          }
        }
      }
    }
    return specifiers;
  }

  // CommonJS require: const { foo, bar } = require('module')
  if (kind === 'require') {
    const pattern = node.childForFieldName('name');
    if (pattern?.type === 'identifier') {
      // Simple require: const foo = require('module')
      specifiers.push({
        imported: 'default',
        local: pattern.text,
        typeOnly: false,
      });
    } else if (pattern?.type === 'object_pattern') {
      // Destructured require: const { foo, bar } = require('module')
      for (const child of pattern.children) {
        if (child.type === 'shorthand_property_identifier_pattern') {
          specifiers.push({
            imported: child.text,
            local: child.text,
            typeOnly: false,
          });
        } else if (child.type === 'pair_pattern') {
          const key = child.childForFieldName('key');
          const value = child.childForFieldName('value');
          if (key && value) {
            specifiers.push({
              imported: key.text,
              local: value.text,
              typeOnly: false,
            });
          }
        }
      }
    }
  }

  return specifiers;
}

/**
 * Extract import statements from parsed tree
 *
 * @param tree - Tree-sitter parse tree
 * @param source - Source code text
 * @returns Array of import statements
 */
export function extractImports(tree: TreeSitter.Tree, source: string): ImportStatement[] {
  const imports: ImportStatement[] = [];
  const cursor = tree.walk();

  function visit() {
    const node = cursor.currentNode;

    if (isImportNode(node)) {
      try {
        imports.push(extractImport(node, source));
        // Don't visit children of import nodes (avoid duplicate extraction)
        return;
      } catch (error) {
        // Skip malformed imports
        console.warn(`Failed to extract import at ${node.startPosition.row}: ${error}`);
      }
    }

    // Visit children
    if (cursor.gotoFirstChild()) {
      do {
        visit();
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  }

  visit();
  return imports;
}

// ============================================================================
// Export Node Identification (T026)
// ============================================================================

/**
 * Check if a Tree-sitter node represents an export statement
 *
 * @param node - Tree-sitter syntax node
 * @returns True if node is an export
 */
export function isExportNode(node: TreeSitter.SyntaxNode): boolean {
  const nodeType = node.type;

  // Export statements
  if (
    nodeType === 'export_statement' ||
    nodeType === 'export' ||
    nodeType === 'export_clause'
  ) {
    return true;
  }

  // Check for export modifier on declarations
  if (
    nodeType === 'lexical_declaration' ||
    nodeType === 'function_declaration' ||
    nodeType === 'class_declaration' ||
    nodeType === 'interface_declaration' ||
    nodeType === 'type_alias_declaration'
  ) {
    // Check if parent or node has 'export' keyword
    return node.text.startsWith('export ');
  }

  return false;
}

/**
 * Determine the kind of export from a Tree-sitter node
 *
 * @param node - Tree-sitter syntax node (must be an export node)
 * @returns Export kind
 */
export function getExportKind(node: TreeSitter.SyntaxNode): ExportKind {
  const nodeText = node.text;

  // Default export: export default ...
  if (nodeText.includes('export default')) {
    return 'default';
  }

  // Namespace export: export * from 'module'
  if (nodeText.match(/export\s+\*\s+from/)) {
    return 'namespace';
  }

  // Export declaration: export const/function/class/interface ...
  if (
    nodeText.match(/export\s+(const|let|var|function|class|interface|type|enum)/)
  ) {
    return 'declaration';
  }

  // Named export: export { foo, bar }
  return 'named';
}

// ============================================================================
// Export Extraction (T027)
// ============================================================================

/**
 * Extract export statement details from a Tree-sitter node
 *
 * @param node - Tree-sitter syntax node (must be an export node)
 * @param source - Source code text
 * @returns ExportStatement object
 */
export function extractExport(node: TreeSitter.SyntaxNode, source: string): ExportStatement {
  const kind = getExportKind(node);
  const specifiers = extractExportSpecifiers(node, source);
  const exportSource = extractExportSource(node);
  const span = extractSpan(node);

  return {
    kind,
    specifiers,
    source: exportSource,
    span,
  };
}

/**
 * Extract the source module path from an export node (for re-exports)
 *
 * @param node - Tree-sitter export node
 * @returns Module source path, or undefined if not a re-export
 */
function extractExportSource(node: TreeSitter.SyntaxNode): string | undefined {
  // Look for 'from' keyword followed by string literal
  const nodeText = node.text;
  const fromMatch = nodeText.match(/from\s+['"]([^'"]+)['"]/);

  if (fromMatch) {
    return fromMatch[1];
  }

  return undefined;
}

/**
 * Extract export specifiers (local name, exported name)
 *
 * @param node - Tree-sitter export node
 * @param source - Source code text
 * @returns Array of export specifiers
 */
function extractExportSpecifiers(
  node: TreeSitter.SyntaxNode,
  _source: string
): ExportSpecifier[] {
  const kind = getExportKind(node);
  const specifiers: ExportSpecifier[] = [];

  // Default export
  if (kind === 'default') {
    // Try to find the exported identifier
    const declaration = node.children.find(
      (c) =>
        c.type === 'function_declaration' ||
        c.type === 'class_declaration' ||
        c.type === 'identifier' ||
        c.type === 'lexical_declaration'
    );

    if (declaration) {
      let localName = 'default';
      if (declaration.type === 'identifier') {
        localName = declaration.text;
      } else {
        const nameNode = declaration.childForFieldName('name');
        if (nameNode) {
          localName = nameNode.text;
        }
      }

      specifiers.push({
        local: localName,
        exported: 'default',
        typeOnly: false,
      });
    }
    return specifiers;
  }

  // Namespace export: export * from 'module'
  if (kind === 'namespace') {
    specifiers.push({
      local: '*',
      exported: '*',
      typeOnly: false,
    });
    return specifiers;
  }

  // Export declaration: export const foo = ...
  if (kind === 'declaration') {
    const declaration = node.children.find(
      (c) =>
        c.type === 'lexical_declaration' ||
        c.type === 'function_declaration' ||
        c.type === 'class_declaration' ||
        c.type === 'interface_declaration' ||
        c.type === 'type_alias_declaration' ||
        c.type === 'enum_declaration'
    );

    if (declaration) {
      const nameNode = declaration.childForFieldName('name');
      if (nameNode) {
        specifiers.push({
          local: nameNode.text,
          exported: nameNode.text,
          typeOnly: false,
        });
      } else if (declaration.type === 'lexical_declaration') {
        // Handle const/let/var declarations which may have multiple declarators
        for (const child of declaration.children) {
          if (child.type === 'variable_declarator') {
            const name = child.childForFieldName('name');
            if (name) {
              specifiers.push({
                local: name.text,
                exported: name.text,
                typeOnly: false,
              });
            }
          }
        }
      }
    }
    return specifiers;
  }

  // Named exports: export { foo, bar as baz }
  if (kind === 'named') {
    const exportClause = node.children.find((c) => c.type === 'export_clause');
    if (exportClause) {
      for (const child of exportClause.children) {
        if (child.type === 'export_specifier') {
          const local = child.childForFieldName('name');
          const exported = child.childForFieldName('alias') || local;

          if (local) {
            specifiers.push({
              local: local.text,
              exported: exported?.text || local.text,
              typeOnly: false,
            });
          }
        }
      }
    }
  }

  return specifiers;
}

/**
 * Extract export statements from parsed tree
 *
 * @param tree - Tree-sitter parse tree
 * @param source - Source code text
 * @returns Array of export statements
 */
export function extractExports(tree: TreeSitter.Tree, source: string): ExportStatement[] {
  const exports: ExportStatement[] = [];
  const cursor = tree.walk();

  function visit() {
    const node = cursor.currentNode;

    if (isExportNode(node)) {
      try {
        exports.push(extractExport(node, source));
        // Don't visit children of export nodes (avoid duplicate extraction)
        return;
      } catch (error) {
        // Skip malformed exports
        console.warn(`Failed to extract export at ${node.startPosition.row}: ${error}`);
      }
    }

    // Visit children
    if (cursor.gotoFirstChild()) {
      do {
        visit();
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  }

  visit();
  return exports;
}
