/**
 * ASTDoc Builder
 *
 * Incrementally constructs ASTDoc from tree-sitter nodes during parsing.
 * Provides a clean API for extractors to populate the AST structure.
 */

import type {
  ASTDoc,
  Language,
  Span,
  Comment,
  SyntaxError,
  ImportStatement,
  ExportStatement,
  Property,
  Constant
} from '../../models/ASTDoc.js';

/**
 * Call relationship for building call graph
 */
export interface CallRelationship {
  /** Function making the call */
  caller: string;
  /** Function being called */
  callee: string;
}

/**
 * Builder for constructing ASTDoc from tree-sitter nodes
 *
 * Usage:
 * 1. Create builder with file info
 * 2. Add symbols, comments, imports/exports incrementally
 * 3. Build call graph relationships
 * 4. Call build() to get final ASTDoc
 */
export class ASTDocBuilder {
  private doc: ASTDoc;
  private startTime: number;
  private callRelationships: CallRelationship[] = [];

  constructor(filePath: string, language: Language, fileSize: number) {
    this.startTime = Date.now();
    this.doc = {
      file: filePath,
      language,
      mtimeMs: Date.now(),
      bytes: fileSize,
      functions: {},
      classes: {},
      interfaces: {},
      type_aliases: {},
      enums: {},
      constants: {},
      components: {},
      comments: [],
      syntax_errors: [],
      imports: [],
      exports: []
    };
  }

  // ========================================
  // Function Methods
  // ========================================

  /**
   * Add a function to the AST
   */
  addFunction(name: string, data: {
    signature: string;
    span: Span;
    doc?: string | null;
    decorators?: string[];
    visibility?: 'public' | 'private' | 'protected';
    async?: boolean;
    exported?: boolean;
  }): void {
    if (!this.doc.functions) this.doc.functions = {};

    this.doc.functions[name] = {
      ...data,
      calls: [],      // Populated in buildCallGraph()
      called_by: []   // Populated in buildCallGraph()
    };
  }

  /**
   * Check if a function exists
   */
  hasFunction(name: string): boolean {
    return !!(this.doc.functions && this.doc.functions[name]);
  }

  // ========================================
  // Class Methods
  // ========================================

  /**
   * Add a class to the AST
   */
  addClass(name: string, data: {
    span: Span;
    inherits?: string[];
    implements?: string[];
    doc?: string | null;
    abstract?: boolean;
    exported?: boolean;
  }): void {
    if (!this.doc.classes) this.doc.classes = {};

    this.doc.classes[name] = {
      ...data,
      methods: {},
      properties: {},
      class_constants: {}
    };
  }

  /**
   * Add a method to an existing class
   */
  addMethod(className: string, methodName: string, data: {
    signature: string;
    span: Span;
    doc?: string | null;
    decorators?: string[];
    static?: boolean;
    abstract?: boolean;
    async?: boolean;
    visibility?: 'public' | 'private' | 'protected';
  }): void {
    if (!this.doc.classes) {
      throw new Error(`Cannot add method: no classes exist`);
    }

    const cls = this.doc.classes[className];
    if (!cls) {
      throw new Error(`Class ${className} not found`);
    }

    if (!cls.methods) cls.methods = {};
    cls.methods[methodName] = data;
  }

  /**
   * Add a property to an existing class
   */
  addClassProperty(className: string, propertyName: string, data: Property): void {
    if (!this.doc.classes) {
      throw new Error(`Cannot add property: no classes exist`);
    }

    const cls = this.doc.classes[className];
    if (!cls) {
      throw new Error(`Class ${className} not found`);
    }

    if (!cls.properties) cls.properties = {};
    cls.properties[propertyName] = data;
  }

  /**
   * Add a constant to an existing class
   */
  addClassConstant(className: string, constantName: string, data: Constant): void {
    if (!this.doc.classes) {
      throw new Error(`Cannot add constant: no classes exist`);
    }

    const cls = this.doc.classes[className];
    if (!cls) {
      throw new Error(`Class ${className} not found`);
    }

    if (!cls.class_constants) cls.class_constants = {};
    cls.class_constants[constantName] = data;
  }

  /**
   * Check if a class exists
   */
  hasClass(name: string): boolean {
    return !!(this.doc.classes && this.doc.classes[name]);
  }

  // ========================================
  // Interface Methods
  // ========================================

  /**
   * Add an interface
   */
  addInterface(name: string, data: {
    span: Span;
    doc?: string | null;
    extends?: string[];
    exported?: boolean;
    properties?: Record<string, Property>;
  }): void {
    if (!this.doc.interfaces) this.doc.interfaces = {};

    this.doc.interfaces[name] = {
      ...data,
      methods: {}
    };
  }

  /**
   * Add a property to an existing interface
   */
  addInterfaceProperty(interfaceName: string, propertyName: string, data: Property): void {
    if (!this.doc.interfaces) {
      throw new Error(`Cannot add property: no interfaces exist`);
    }

    const iface = this.doc.interfaces[interfaceName];
    if (!iface) {
      throw new Error(`Interface ${interfaceName} not found`);
    }

    if (!iface.properties) iface.properties = {};
    iface.properties[propertyName] = data;
  }

  /**
   * Check if an interface exists
   */
  hasInterface(name: string): boolean {
    return !!(this.doc.interfaces && this.doc.interfaces[name]);
  }

  // ========================================
  // Type Alias Methods
  // ========================================

  /**
   * Add a type alias
   */
  addTypeAlias(name: string, data: {
    type: string;
    span: Span;
    doc?: string | null;
    exported?: boolean;
  }): void {
    if (!this.doc.type_aliases) this.doc.type_aliases = {};

    this.doc.type_aliases[name] = data;
  }

  // ========================================
  // Enum Methods
  // ========================================

  /**
   * Add an enum
   */
  addEnum(name: string, data: {
    values: string[];
    span: Span;
    doc?: string | null;
    exported?: boolean;
  }): void {
    if (!this.doc.enums) this.doc.enums = {};

    this.doc.enums[name] = data;
  }

  // ========================================
  // Constant Methods
  // ========================================

  /**
   * Add a constant
   */
  addConstant(name: string, data: {
    type?: string;
    value: string;
    span: Span;
    exported?: boolean;
  }): void {
    if (!this.doc.constants) this.doc.constants = {};

    this.doc.constants[name] = data;
  }

  // ========================================
  // Component Methods
  // ========================================

  /**
   * Add a component (React/Vue)
   */
  addComponent(name: string, data: {
    signature: string;
    span: Span;
    doc?: string | null;
  }): void {
    if (!this.doc.components) this.doc.components = {};

    this.doc.components[name] = {
      ...data,
      calls: [],
      called_by: []
    };
  }

  // ========================================
  // Comment Methods
  // ========================================

  /**
   * Add a comment
   */
  addComment(comment: Comment): void {
    if (!this.doc.comments) this.doc.comments = [];
    this.doc.comments.push(comment);
  }

  /**
   * Associate comments with symbols
   * Call this after all symbols are added
   */
  associateComments(): void {
    if (!this.doc.comments || this.doc.comments.length === 0) {
      return;
    }

    // For each comment, find the nearest symbol by span
    for (const comment of this.doc.comments) {
      // Only associate JSDoc/docstring comments
      if (comment.kind !== 'jsdoc' && comment.kind !== 'docstring') {
        continue;
      }

      const commentLine = comment.span.startLine;
      let closestSymbol: string | null = null;
      let closestDistance = Infinity;

      // Check functions
      for (const [name, fn] of Object.entries(this.doc.functions || {})) {
        const distance = fn.span.startLine - commentLine;
        if (distance > 0 && distance < closestDistance && distance <= 5) {
          closestDistance = distance;
          closestSymbol = name;
        }
      }

      // Check classes
      for (const [name, cls] of Object.entries(this.doc.classes || {})) {
        const distance = cls.span.startLine - commentLine;
        if (distance > 0 && distance < closestDistance && distance <= 5) {
          closestDistance = distance;
          closestSymbol = name;
        }
      }

      // Check interfaces
      for (const [name, iface] of Object.entries(this.doc.interfaces || {})) {
        const distance = iface.span.startLine - commentLine;
        if (distance > 0 && distance < closestDistance && distance <= 5) {
          closestDistance = distance;
          closestSymbol = name;
        }
      }

      // Associate if found
      if (closestSymbol) {
        comment.associatedSymbol = closestSymbol;
      }
    }
  }

  // ========================================
  // Error Methods
  // ========================================

  /**
   * Add a syntax error
   */
  addError(error: SyntaxError): void {
    if (!this.doc.syntax_errors) this.doc.syntax_errors = [];
    this.doc.syntax_errors.push(error);
  }

  // ========================================
  // Import/Export Methods
  // ========================================

  /**
   * Add an import statement
   */
  addImport(importStmt: ImportStatement): void {
    if (!this.doc.imports) this.doc.imports = [];
    this.doc.imports.push(importStmt);
  }

  /**
   * Add an export statement
   */
  addExport(exportStmt: ExportStatement): void {
    if (!this.doc.exports) this.doc.exports = [];
    this.doc.exports.push(exportStmt);
  }

  // ========================================
  // Call Graph Methods
  // ========================================

  /**
   * Record a call relationship
   * Call this during extraction, then buildCallGraph() at the end
   */
  recordCall(caller: string, callee: string): void {
    this.callRelationships.push({ caller, callee });
  }

  /**
   * Build call graph relationships
   * Must be called after all functions/methods are added
   */
  buildCallGraph(): void {
    // Process all recorded call relationships
    for (const { caller, callee } of this.callRelationships) {
      // Add to caller's calls list
      const callerFunc = this.doc.functions?.[caller];
      if (callerFunc) {
        if (!callerFunc.calls) callerFunc.calls = [];
        if (!callerFunc.calls.includes(callee)) {
          callerFunc.calls.push(callee);
        }
      }

      // Also check if caller is a method
      for (const cls of Object.values(this.doc.classes || {})) {
        const method = cls.methods?.[caller];
        if (method) {
          // For methods, we don't track calls directly
          // But we could extend the Method type in the future
          break;
        }
      }

      // Add to callee's called_by list
      const calleeFunc = this.doc.functions?.[callee];
      if (calleeFunc) {
        if (!calleeFunc.called_by) calleeFunc.called_by = [];
        if (!calleeFunc.called_by.includes(caller)) {
          calleeFunc.called_by.push(caller);
        }
      }

      // Also check if callee is a method
      for (const cls of Object.values(this.doc.classes || {})) {
        const method = cls.methods?.[callee];
        if (method) {
          // For methods, we don't track called_by directly
          // But we could extend the Method type in the future
          break;
        }
      }
    }

    // Clear the relationships after building
    this.callRelationships = [];
  }

  // ========================================
  // Build Methods
  // ========================================

  /**
   * Finalize and return the ASTDoc
   * @param lineCount Total lines in the file
   * @param parserVersion Parser version string
   */
  build(lineCount: number, parserVersion: string): ASTDoc {
    const duration = Date.now() - this.startTime;

    // Add metadata
    this.doc.metadata = {
      parsedAt: new Date().toISOString(),
      duration,
      lineCount,
      fileSize: this.doc.bytes || 0,
      incremental: false,
      parserVersion
    };

    // Associate comments with symbols
    this.associateComments();

    // Build call graph
    this.buildCallGraph();

    return this.doc;
  }

  /**
   * Get the current (incomplete) ASTDoc
   * Useful for debugging
   */
  getDoc(): ASTDoc {
    return this.doc;
  }

  // ========================================
  // Utility Methods
  // ========================================

  /**
   * Get the parent class name for a node
   * Used when adding methods
   */
  findParentClassName(): string | null {
    // This would need context from the tree traversal
    // For now, return null - will be set by the extractor
    return null;
  }

  /**
   * Get statistics about the current state
   */
  getStats(): {
    functions: number;
    classes: number;
    interfaces: number;
    types: number;
    enums: number;
    constants: number;
    components: number;
    comments: number;
    errors: number;
    imports: number;
    exports: number;
    callRelationships: number;
  } {
    return {
      functions: Object.keys(this.doc.functions || {}).length,
      classes: Object.keys(this.doc.classes || {}).length,
      interfaces: Object.keys(this.doc.interfaces || {}).length,
      types: Object.keys(this.doc.type_aliases || {}).length,
      enums: Object.keys(this.doc.enums || {}).length,
      constants: Object.keys(this.doc.constants || {}).length,
      components: Object.keys(this.doc.components || {}).length,
      comments: (this.doc.comments || []).length,
      errors: (this.doc.syntax_errors || []).length,
      imports: (this.doc.imports || []).length,
      exports: (this.doc.exports || []).length,
      callRelationships: this.callRelationships.length
    };
  }
}
