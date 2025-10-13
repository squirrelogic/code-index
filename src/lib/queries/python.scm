; Tree-sitter query patterns for Python function/method extraction
; Based on tree-sitter-python grammar

; ===== Top-level Functions =====

; Regular function
(function_definition
  name: (identifier) @function.name
  parameters: (parameters) @function.params
  body: (block) @function.body) @function.def

; Async function
(function_definition
  "async" @async.keyword
  name: (identifier) @async_function.name
  parameters: (parameters) @async_function.params
  body: (block) @async_function.body) @async_function.def

; ===== Methods within Classes =====

; Constructor (__init__)
(class_definition
  body: (block
    (function_definition
      (identifier) @constructor.name
      (#eq? @constructor.name "__init__")) @constructor.def))

; Async methods
(class_definition
  body: (block
    (function_definition
      "async"
      (identifier) @async_method.name) @async_method.def))

; All other methods
(class_definition
  body: (block
    (function_definition
      (identifier) @method.name) @method.def))

; ===== Property Decorators =====

; @property decorator
((decorated_definition
  (decorator
    (identifier) @decorator.name
    (#eq? @decorator.name "property")) @property.decorator
  (function_definition
    name: (identifier) @property.name
    parameters: (parameters) @property.params
    body: (block) @property.body)) @property.def)

; Multiple decorators on function
((decorated_definition
  (decorator)+ @decorators
  (function_definition
    name: (identifier) @decorated_function.name
    parameters: (parameters) @decorated_function.params
    body: (block) @decorated_function.body)) @decorated_function.def)

; Multiple decorators on method
(class_definition
  name: (identifier) @class.name
  body: (block
    ((decorated_definition
      (decorator)+ @decorators
      (function_definition
        name: (identifier) @decorated_method.name
        parameters: (parameters) @decorated_method.params
        body: (block) @decorated_method.body)) @decorated_method.def)))

; ===== Class Definitions =====

; Class declaration (may or may not have inheritance)
(class_definition
  name: (identifier) @class.name
  body: (block) @class.body) @class.def

; Class inheritance info (captured separately)
(class_definition
  name: (identifier) @class.name
  superclasses: (argument_list) @class.bases)

; ===== Documentation Extraction (Docstrings) =====

; Function docstring (first expression statement with string)
(function_definition
  name: (identifier) @function.name
  body: (block
    . (expression_statement (string) @function.docstring)))

; Class docstring
(class_definition
  name: (identifier) @class.name
  body: (block
    . (expression_statement (string) @class.docstring)))

; Method docstring
(class_definition
  name: (identifier) @class.name
  body: (block
    (function_definition
      name: (identifier) @method.name
      body: (block
        . (expression_statement (string) @method.docstring)))))

; Module-level docstring
(module
  . (comment)* .
  (expression_statement (string)) @module.docstring)

; ===== Comment-based Documentation =====

; Comments before function (less common in Python, but supported)
(
  (comment)+ @function.comment .
  (function_definition) @function.with_comment
)

; Comments before class
(
  (comment)+ @class.comment .
  (class_definition) @class.with_comment
)
