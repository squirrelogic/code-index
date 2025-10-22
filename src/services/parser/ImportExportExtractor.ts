/**
 * Import/Export Extraction
 *
 * Extracts import and export statements from Tree-sitter parse tree
 * and adds them to ASTDocBuilder with full details.
 */

import type Parser from 'tree-sitter';
import type { ASTDocBuilder } from './ASTDocBuilder.js';
import type { ImportStatement, ExportStatement, ImportSpecifier, ExportSpecifier } from '../../models/ASTDoc.js';
import { extractSpan } from './SymbolExtractor.js';

/**
 * Extract import statements from tree
 */
export function extractImports(
  tree: Parser.Tree,
  source: string,
  builder: ASTDocBuilder
): void {
  function walkNode(node: Parser.SyntaxNode): void {
    // Check for import statements
    if (node.type === 'import_statement') {
      const importStmt = parseImportStatement(node, source);
      if (importStmt) {
        builder.addImport(importStmt);
      }
    }

    // Recursively walk children
    for (const child of node.children) {
      walkNode(child);
    }
  }

  walkNode(tree.rootNode);
}

/**
 * Extract export statements from tree
 */
export function extractExports(
  tree: Parser.Tree,
  source: string,
  builder: ASTDocBuilder
): void {
  function walkNode(node: Parser.SyntaxNode): void {
    // Check for export statements
    if (node.type === 'export_statement') {
      const exportStmt = parseExportStatement(node, source);
      if (exportStmt) {
        builder.addExport(exportStmt);
      }
    }

    // Recursively walk children
    for (const child of node.children) {
      walkNode(child);
    }
  }

  walkNode(tree.rootNode);
}

/**
 * Parse an import statement node
 */
function parseImportStatement(node: Parser.SyntaxNode, _source: string): ImportStatement | null {
  const span = extractSpan(node);

  // Find the source
  const sourceNode = node.childForFieldName('source');
  if (!sourceNode) return null;

  // Remove quotes from source
  let sourceText = sourceNode.text;
  if (sourceText.startsWith("'") || sourceText.startsWith('"')) {
    sourceText = sourceText.slice(1, -1);
  }

  // Determine import kind and extract specifiers
  let kind: ImportStatement['kind'] = 'named';
  const specifiers: ImportSpecifier[] = [];

  // Check for namespace import: import * as foo from 'module'
  for (const child of node.children) {
    if (child.type === 'namespace_import') {
      kind = 'namespace';
      const nameNode = child.childForFieldName('name') || child.children.find(c => c.type === 'identifier');
      if (nameNode) {
        specifiers.push({
          imported: '*',
          local: nameNode.text
        });
      }
      break;
    }
  }

  // Check for named imports: import { foo, bar } from 'module'
  if (kind === 'named') {
    const importClause = node.children.find(c => c.type === 'import_clause');
    if (importClause) {
      // Check for default import
      const defaultNode = importClause.children.find(c => c.type === 'identifier');
      if (defaultNode) {
        kind = 'default';
        specifiers.push({
          imported: 'default',
          local: defaultNode.text
        });
      }

      // Check for named specifiers
      const namedImports = importClause.children.find(c => c.type === 'named_imports');
      if (namedImports) {
        for (const child of namedImports.children) {
          if (child.type === 'import_specifier') {
            const nameNode = child.childForFieldName('name');
            const aliasNode = child.childForFieldName('alias');

            if (nameNode) {
              specifiers.push({
                imported: nameNode.text,
                local: aliasNode ? aliasNode.text : nameNode.text
              });
            }
          }
        }
      }
    } else if (!sourceNode.parent || sourceNode.parent.children.length === 2) {
      // Side-effect import: import 'module'
      kind = 'side-effect';
    }
  }

  return {
    source: sourceText,
    kind,
    specifiers,
    span
  };
}

/**
 * Parse an export statement node
 */
function parseExportStatement(node: Parser.SyntaxNode, _source: string): ExportStatement | null {
  const span = extractSpan(node);

  // Check for re-export: export { foo } from 'module'
  const sourceNode = node.childForFieldName('source');
  const sourceText = sourceNode ? sourceNode.text.slice(1, -1) : undefined;

  let kind: ExportStatement['kind'] = 'named';
  const specifiers: ExportSpecifier[] = [];

  // Check for default export: export default foo
  const defaultNode = node.children.find(c => c.text === 'default');
  if (defaultNode) {
    kind = 'default';
    // Get what's being exported
    const valueNode = node.children.find(c =>
      c.type === 'identifier' ||
      c.type === 'function_declaration' ||
      c.type === 'class_declaration'
    );
    if (valueNode) {
      const name = valueNode.type === 'identifier' ? valueNode.text : extractName(valueNode);
      specifiers.push({
        local: name,
        exported: 'default'
      });
    }
    return {
      kind,
      specifiers,
      source: sourceText,
      span
    };
  }

  // Check for namespace export: export * from 'module'
  const starNode = node.children.find(c => c.text === '*');
  if (starNode && sourceText) {
    kind = 'namespace';
    specifiers.push({
      local: '*',
      exported: '*'
    });
    return {
      kind,
      specifiers,
      source: sourceText,
      span
    };
  }

  // Check for declaration export: export const foo = ...
  const declaration = node.children.find(c =>
    c.type === 'lexical_declaration' ||
    c.type === 'function_declaration' ||
    c.type === 'class_declaration' ||
    c.type === 'variable_declaration'
  );

  if (declaration) {
    kind = 'declaration';
    // Extract names from declaration
    const names = extractNamesFromDeclaration(declaration);
    for (const name of names) {
      specifiers.push({
        local: name,
        exported: name
      });
    }
    return {
      kind,
      specifiers,
      source: sourceText,
      span
    };
  }

  // Named exports: export { foo, bar }
  const exportClause = node.children.find(c => c.type === 'export_clause');
  if (exportClause) {
    for (const child of exportClause.children) {
      if (child.type === 'export_specifier') {
        const nameNode = child.childForFieldName('name');
        const aliasNode = child.childForFieldName('alias');

        if (nameNode) {
          specifiers.push({
            local: nameNode.text,
            exported: aliasNode ? aliasNode.text : nameNode.text
          });
        }
      }
    }
  }

  return {
    kind,
    specifiers,
    source: sourceText,
    span
  };
}

/**
 * Extract name from a node (function, class, etc.)
 */
function extractName(node: Parser.SyntaxNode): string {
  const nameNode = node.childForFieldName('name');
  if (nameNode) {
    return nameNode.text;
  }
  return '<anonymous>';
}

/**
 * Extract all names from a declaration
 */
function extractNamesFromDeclaration(node: Parser.SyntaxNode): string[] {
  const names: string[] = [];

  function walk(n: Parser.SyntaxNode): void {
    // Look for variable_declarator, function_declaration, class_declaration
    if (n.type === 'variable_declarator') {
      const nameNode = n.childForFieldName('name');
      if (nameNode) {
        names.push(nameNode.text);
      }
    } else if (n.type === 'function_declaration' || n.type === 'class_declaration') {
      const nameNode = n.childForFieldName('name');
      if (nameNode) {
        names.push(nameNode.text);
      }
    }

    // Recursively walk children
    for (const child of n.children) {
      walk(child);
    }
  }

  walk(node);
  return names;
}

/**
 * Extract both imports and exports
 * Convenience function to call both extractors
 */
export function extractImportsExports(
  tree: Parser.Tree,
  source: string,
  builder: ASTDocBuilder
): void {
  extractImports(tree, source, builder);
  extractExports(tree, source, builder);
}
