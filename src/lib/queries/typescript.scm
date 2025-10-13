; Tree-sitter query patterns for TypeScript function/method extraction
; Based on tree-sitter-typescript grammar

; ===== Top-level Function Declarations =====

; Regular function declaration
(function_declaration
  name: (identifier) @function.name
  parameters: (formal_parameters) @function.params
  body: (statement_block) @function.body) @function.def

; Async function declaration
(function_declaration
  "async" @async.keyword
  name: (identifier) @async_function.name
  parameters: (formal_parameters) @async_function.params
  body: (statement_block) @async_function.body) @async_function.def

; Generator function declaration
(generator_function_declaration
  name: (identifier) @generator.name
  parameters: (formal_parameters) @generator.params
  body: (statement_block) @generator.body) @generator.def

; ===== Arrow Functions (assigned to variables) =====

; Arrow function with formal parameters
(lexical_declaration
  (variable_declarator
    name: (identifier) @arrow.name
    value: (arrow_function
      (formal_parameters)) @arrow.def))

; Arrow function with single parameter (no parens)
(lexical_declaration
  (variable_declarator
    name: (identifier) @arrow.name
    value: (arrow_function
      parameter: (identifier)) @arrow.def))

; Async arrow function
(lexical_declaration
  (variable_declarator
    name: (identifier) @async_arrow.name
    value: (arrow_function
      "async") @async_arrow.def))

; ===== Class Methods =====

; Constructor (must come before general method pattern)
(class_body
  (method_definition
    (property_identifier) @constructor.name
    (#eq? @constructor.name "constructor")) @constructor.def)

; Async methods
(class_body
  (method_definition
    "async"
    (property_identifier) @async_method.name) @async_method.def)

; Generator methods
(class_body
  (method_definition
    "*"
    (property_identifier) @generator.name) @generator.def)

; All other methods
(class_body
  (method_definition
    (property_identifier) @method.name) @method.def)

; ===== Class Properties =====

; Field/property definition
(class_declaration
  name: (type_identifier) @class.name
  body: (class_body
    (public_field_definition
      (property_identifier) @property.name) @property.def))

; Property with decorator
(class_declaration
  name: (type_identifier) @class.name
  body: (class_body
    (public_field_definition
      (decorator)+ @property.decorators
      (property_identifier) @property.name) @property.def))

; ===== Documentation Extraction =====

; JSDoc comment before function
(
  (comment)+ @function.doc .
  (function_declaration) @function.with_doc
)

; JSDoc comment before async function
(
  (comment)+ @async_function.doc .
  (function_declaration
    "async") @async_function.with_doc
)

; JSDoc comment before method
(class_body
  (comment)+ @method.doc .
  (method_definition) @method.with_doc
)

; JSDoc comment before property
(class_body
  (comment)+ @property.doc .
  (public_field_definition) @property.with_doc
)

; ===== Class Definitions =====

; Class declaration (may or may not have inheritance)
(class_declaration
  name: (type_identifier) @class.name
  body: (class_body) @class.body) @class.def

; Class inheritance info (captured separately)
(class_declaration
  name: (type_identifier) @class.name
  (class_heritage
    (extends_clause
      (identifier) @class.parent)))
