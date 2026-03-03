# Introduction (Normative)

## Scope

Defines how to read the canonical Workman manual, conformance language, and
what counts as observable behavior.

## Status

Draft (normative where specified).

## Dependencies

None.

This document is part of the **Canonical Workman Reference Manual**.

Canonical Workman is the base language definition for Workman: it specifies
what programs **mean**. Tooling and compilers may differ internally, but
conforming implementations must agree on the observable behavior described
here.

Historical note (non-normative):
- The earlier Workman v0 implementation was a research/experimental system used
  to explore ideas.
- v0 implementation behavior and architecture do **not** define canonical
  Workman or WMC behavior unless explicitly adopted by this manual or a backend
  profile contract.

This manual is intended to be:
- Tight where it matters (so different implementations behave the same).
- Loose where evolution is desirable (so tooling can improve without “spec
  breaks”).

References for current user-facing behavior (non-normative):
- `workmansyntaxguide.md` (syntax constraints and idioms)
- `workmaninfectionguide.md` (infection model for users)

---

## Conformance Language

The keywords **must**, **must not**, **should**, and **may** are used as
follows:

- **must / must not**: required / forbidden for conforming implementations.
- **should**: recommended, but non-conformance is permitted.
- **may**: optional or implementation choice.

---

## Defined vs Implementation-Defined vs Unspecified vs Undefined

This manual uses these terms:

- **Defined behavior**: the manual specifies the outcome. Conforming
  implementations must behave the same (modulo allowed implementation-defined
  choices).
- **Implementation-defined behavior**: the implementation chooses a behavior,
  but must document the choice (e.g., maximum recursion depth).
- **Unspecified behavior**: the implementation may choose, and it may vary
  between runs; programs must not rely on it.
- **Undefined behavior (UB)**: the program is invalid; no guarantees are made.
  Canonical Workman aims to avoid UB except at explicit unsafe/FFI boundaries.

---

## What Counts as Observable Behavior

Unless otherwise stated, the observable behavior of a program is:

- Text output and other explicit I/O effects produced by standard library APIs.
- Program termination (normal completion vs failure).
- Raised runtime errors (if any) that escape into the host environment.

The following are **not** observable behavior and may vary:

- Performance, timing, allocation counts.
- Concrete in-memory layouts (unless explicitly guaranteed by an FFI contract).
- Exact wording of diagnostic messages (but error *classes* should be stable).

---

## Execution Model (High-Level)

Canonical Workman is:

- **Expression-oriented**: most constructs produce values; control flow
  constructs are expressions.
- **Strict (eager)**: expressions evaluate their subexpressions before use.
- **Deterministic evaluation order**: unless explicitly stated as
  implementation-defined, evaluation order is fixed by this manual.

Detailed evaluation rules live in:
- `../5. Dynamic semantics/1-values-and-evaluation.md`

---

## Program Model (High-Level)

- A program is a set of modules; module structure and name resolution are
  specified in `../3. Program structure/1-modules-and-names.md`.
- Top-level execution is restricted (no arbitrary top-level effects); the
  entrypoint is defined by the host/tooling contract.

---

## Status of the Manual

This manual is normative for canonical Workman, but sections may be incomplete.
Incomplete sections must say what is **defined now** vs what is **reserved for
future definition**.


# Design Goals (Non-Normative)

## Scope

Explains the intent and priorities of canonical Workman.

## Status

Draft (non-normative).

## Dependencies

None.

This document explains the intent behind canonical Workman. It is
**non-normative**: it helps interpret the language, but does not override
defined behavior in other sections.

---

## Core Goals

1. **One obvious way**
   - Canonical Workman intentionally avoids multiple spellings or redundant
     constructs.
   - Example: `if/else` exists only as sugar over `match` on booleans.
   - all forms of optional syntax must be a no-op ( trailing commas, leading pipe, comments )

2. **Predictability over cleverness**
   - Deterministic evaluation order.
   - Explicit scoping and binding rules (especially in patterns).

3. **Strong static semantics**
   - HM-style inference is the default mental model.
   - Extensions (pattern matching, infection) are specified as language
     semantics, not as compiler “magic”.

4. **Rigorous pattern matching**
   - Exhaustiveness and coverage are first-class.
   - Match composition (bundles, commas) is designed to scale to large programs
     without hiding missing cases.

5. **Infection as a core feature**
   - Infection is a language-level mechanism for effect-like propagation
     through a general constraint solver.
   - It is not tied to any particular backend.

6. **Backend freedom without semantic drift**
   - Multiple backends are expected.
   - Canonical semantics aim to prevent “backend-specific behavior” from
     accidentally becoming language behavior, except where intentionally
     declared by an explicit backend contract.

---

## Non-Goals

- Making raw interop primitives part of the canonical surface language.
- Specifying low-level memory/resource semantics prematurely (large design area
  deferred unless required for correctness of other sections).


# Lexical Structure (Normative)

## Scope

Defines tokenization rules: characters, whitespace, comments, identifiers, and
literals.

## Status

Draft (normative where specified).

## Dependencies

- `../4. Static semantics/1-types.md` (Byte/String meaning)

This section defines tokenization: characters, whitespace, comments,
identifiers, and literals.

If a tokenization rule is not specified here, it is a bug in the manual.

---

## Characters and Encoding

- Source files **must** be UTF-8.
- String and byte literal contents are treated as bytes in the range
  0..255 (see `../4. Static semantics/1-types.md`).

Normative v1 restriction:
- Non-ASCII characters are **not permitted** in identifiers, character
  literals, or string literals. Use escape sequences instead.

Implementation-defined (must be documented):
- Whether non-ASCII letters are permitted in identifiers as a non-canonical
  extension and how they are normalized.

---

## Whitespace

- Whitespace separates tokens.
- Newlines are not semantically significant, except inside string literals.

---

## Comments

- Line comment forms:
  - `--` starts a comment until end of line.
  - `//` starts a comment until end of line.
- Block comments are not canonical in v1.

---

## Identifiers

### Categories

- **Value identifiers**: start with `_` or a lowercase ASCII letter, followed by
  ASCII letters, digits, or `_`.
- **Type/constructor identifiers**: start with an uppercase ASCII letter,
  followed by ASCII letters, digits, or `_`.

Reserved words are defined in the grammar section.
Implementations **must** treat reserved words as non-identifiers.

---

## Literals

### Numbers

Canonical Workman has a single numeric literal syntax. Literal forms are
classified as:

- **integer literal**: no decimal point and no exponent
- **float literal**: contains a decimal point or an exponent

These map to `Number` values (sum of int/float) per the typing rules.

Grammar is defined in `2-grammar.md`.

### Booleans

- `true`, `false`

### Void

- `void` is the unit value literal.

### Bytes

Byte literals are written with single quotes:

```
'a'
'\\n'
'\\x41'
```

Normative:
- A byte literal denotes exactly one `Byte` value (0..255).
- Escapes produce a single byte.

Canonical escape set (minimum):
- `\\n`, `\\r`, `\\t`, `\\\\`, `\\'`, `\\\"`
- `\\xHH` where `HH` is two hex digits (00..FF)

### Strings

String literals are written with double quotes:

```
"hello"
"\\n"
"\\x41"
```

Normative:
- A string literal denotes a sequence of `Byte` values.
- Escape sequences are interpreted per the same rules as character literals.

Implementation-defined (must be documented):
- Whether additional escape forms are supported (e.g., `\\u{...}`).


# Grammar (Normative)

## Scope

This chapter defines the normative concrete syntax for canonical Workman: the
reserved vocabulary, the operator hierarchy, and the EBNF for modules,
declarations, expressions, patterns, and types.

## Status

Draft (normative where explicitly called out). Sections marked
“implementation-defined” must be documented by conforming compilers.

## Dependencies

- `../2. Source text/1-lexical-structure.md`
- `../3. Program structure/` for semantic stratification of modules/declarations

---

## Notation

The grammar uses standard EBNF:

- `rule := production` introduces a rule.
- `a b` means concatenation.
- `a | b` means choice.
- `x?` means optional.
- `x*` / `x+` mean zero-or-more / one-or-more repetitions.
- Terminals appear in double quotes (`"let"`, `"{"`).
- Non-terminals appear in lower_snake_case (`expr`, `block`).

Unless stated otherwise, terminals refer to tokens defined in the lexical
chapter. Productions are ordered so that earlier clauses are higher-level forms
and later clauses are leaves.

---

## Lexical Summary

Canonical Workman reuses the lexical classes from `1-lexical-structure.md`. The
grammar refers to these terminal families:

- `identifier`: lowercase-first value names.
- `constructor`: uppercase-first type/constructor names.
- `keyword`: reserved vocabulary listed below.
- `number_literal`, `string_literal`, `char_literal`, `bool_literal`.
- `symbol`: punctuation tokens (e.g., `(`, `)`, `{`, `}`, `;`, `,`, `.`, `:`).
- `operator`: multi-character operator tokens accepted by the lexer.
- `operator_token`: references the same lexical `operator` tokens; the separate
  name simply highlights where the grammar expects an infix/prefix operator
  spelling.
- `constructor_void`: a specialization of `constructor` whose lexeme is exactly
  `Void` (see `type_unit`).
- Compound punctuators such as `=>`, `:>`, `..`, `==`, `!=`, `<=`, `>=`, `&&`,
  and `||` are single tokens emitted by the lexer; productions reference them as
  quoted terminals.
- Unless stated otherwise, comma-separated lists permit an optional trailing
  comma to ease multi-line editing and formatting.

Whitespace and comments are insignificant except where explicitly mentioned.

---

## Reserved Words

Reserved words are tokens produced by the lexer as `keyword`. They **must not**
be used as identifiers in canonical code.

### Control / flow keywords

`if`, `else`, `match`, `when`

### Bindings / modules / declarations

`let`, `mut`, `rec`, `and`, `type`, `record`, `from`, `import`, `export`, `as`

### Infection and effect surface

`infectious`, `domain`, `policy`, `op`, `annotate`

### Literals / special forms

`void`, `Panic`, `Var`, `AllErrors`

Normative note: `void` is the unique unit literal. Its corresponding type
constructor `Void` is provided by the prelude (tokenised as a `constructor`, not
a keyword) and appears where `type_unit` is accepted.

Normative note: `bool_literal` tokens (`true`, `false`) come from the lexical
class listed above and are not keywords. Canonical Workman deliberately keeps
the keyword set small; adding a new keyword is a breaking change to the surface
language.

---

## Compiler Directives

Directives are lexically scoped annotations that precede declarations or appear
as the first entries inside a block. Canonical v1 only specifies `@core;`.

```ebnf
directive        := "@" identifier directive_args? ";"
directive_args   := "(" directive_arg ("," directive_arg)* ")"
directive_arg    := string_literal | number_literal | identifier
```

Scoping rules:

1. Module-level directives appear before the first top-level declaration and
   apply to the entire module.
2. Block-level directives appear immediately after `{` and apply to that block
   and its nested blocks. They are restored on block exit.

Canonical semantics (v1): only `@core;` is meaningful. Other directives may be
accepted to future-proof the grammar but must have no effect in canonical mode.

---

## Operator Precedence (Normative)

Workman follows a Grain-like model: user-defined operators inherit precedence
from their prefix. Postfix forms (call, projection) bind tighter than any infix
operator. `:>` is a built-in pipe operator.

| Prec. | Assoc. | Forms / Examples                                        |
| ----: | ------ | ------------------------------------------------------- |
|   180 | n/a    | Grouping: `(expr)`                                      |
|   170 | left   | Postfix: `expr(args)`, `expr.field`, `expr[index]`      |
|   150 | right  | Prefix: `!expr`, `-expr`, registered prefix operators   |
|   140 | left   | Exponent-style operators (implementation-defined)       |
|   130 | left   | Multiplicative: `*`, `/`, `%`                           |
|   120 | left   | Additive / concatenation: `+`, `-`, `++`                |
|   100 | left   | Comparison: `<`, `<=`, `>`, `>=`                        |
|    90 | left   | Equality: `==`, `!=`                                    |
|    60 | left   | Logical AND: `&&`                                       |
|    50 | left   | Logical OR: `                                           |
|    30 | left   | Pipe: `:>`                                              |
|    10 | right  | Assignment forms (see statements; not expression-level) |

Notes:

- Postfix chaining is greedy: `a.b(c).d` parses as `(((a.b)(c)).d)`.
- Custom infix operators must avoid spellings that collide with comment openers
  (`/*`, `//`) and must be registered (either via `infix*` declarations or by
  binding a parenthesized identifier Grain-style).
- When `preservePipeOperator` is disabled (canonical mode), `a :> f(b)`
  elaborates to `f(a, b)`.

---

## Modules

Top-level syntax:

```ebnf
module          := top_level* EOF
top_level       := directive* top_level_decl
top_level_decl  := import_decl
                |  reexport_decl
                |  value_decl
                |  type_decl
                |  record_decl
                |  operator_decl
                |  infectious_decl
                |  domain_decl
                |  policy_decl
                |  op_decl
                |  annotate_decl
```

Canonical Workman **requires** explicit semicolons after every top-level form
**and** after every directive. No automatic semicolon insertion exists in the
language; tooling may insert missing semicolons as an edit, but the canonical
source text always includes them explicitly. Directives may precede any
top-level declaration; each `directive*` sequence applies to the immediately
following declaration group.

### Imports and re-exports

```ebnf
import_decl     := "from" string_literal "import" import_clause ";"
import_clause   := "{" import_spec ("," import_spec)* (","?) "}"
                |  "*" "as" identifier
import_spec     := import_name ("as" identifier)?
import_name     := identifier | constructor | string_literal

reexport_decl   := "export" "from" string_literal "type" type_reexport_list ";"
type_reexport_list := type_reexport ("," type_reexport)* (","?)
type_reexport   := constructor ("(" ".."? ")")?
```

### Value declarations

```ebnf
value_decl      := export_modifier? "let" let_modifiers? let_binding
                    ("and" let_binding)* ";"
let_modifiers   := ("rec" | "mut")*
let_binding     := binding_name binding_signature?
                    (":" type_expr)? "=" initializer
binding_name    := identifier | operator_identifier
operator_identifier := "(" operator_token ")"
binding_signature := parameter_list (":" type_expr)?
initializer     := expr

parameter_list  := "(" (parameter ("," parameter)* (","?))? ")"
parameter       := pattern (":" type_expr)?
```

Rules:

1. `rec` enables references to the binding within `initializer`.
2. `mut` marks the binding as reassignable (dynamic semantics defined
   elsewhere).
3. Mutually recursive groups use `and` and inherit the modifiers of the first
   binding.
4. Operator bindings use `let (op) = expr;` and place the operator in the value
   namespace.

### Type declarations

```ebnf
type_decl       := export_modifier? "type" "rec"? type_body
                    ("and" (type_body | record_body))* ";"
type_body       := constructor type_params?
                    ("=" (type_sum | alias_type))?
type_params     := "<" type_param ("," type_param)* (","?) ">"
type_param      := identifier  -- lowercase by convention
type_sum        := type_constructor ("|" type_constructor)+
type_constructor := constructor (type_arguments)?
alias_type      := type_expr
```

Opaque types omit `= members` and therefore cannot be constructed directly in
canonical code. A single `constructor` clause without `|` is treated as
`alias_type`, so `type Foo = Bar;` is an alias, while `type Foo = Bar | Baz;`
defines a sum type without requiring a leading `|`.

### Record declarations

```ebnf
record_decl     := export_modifier? "record" "rec"? record_body
                    ("and" (record_body | type_body))* ";"
record_body     := constructor type_params?
                    "=" "{" record_member_list "}"
record_member_list := record_member ("," record_member)* (","?)
record_member   := identifier (":" type_expr)? ("=" expr)?
                |  identifier parameter_list (":" type_expr)? "=>" block
```

Field forms:

- `name: Type` declares a typed field.
- `name: Type = expr` declares a field with default value.
- `name(args) => { ... }` declares a method-like helper that elaborates to a
  function-valued field; an optional result annotation may appear between the
  parameter list and `=>`.

### Operator declarations (compatibility)

Canonical Workman prefers Grain-style bindings, but current tooling still
accepts explicit operator declarations for precedence registration:

```ebnf
operator_decl   := infix_decl | prefix_decl
infix_decl      := export_modifier? ("infix" | "infixl" | "infixr")
                    number_literal operator_token "=" identifier ";"
prefix_decl     := export_modifier? "prefix" operator_token "=" identifier ";"
```

`infixl`/`infixr` set associativity; `infix` is non-associative. The numeric
literal specifies precedence.

### Infection family declarations

These mirror existing surface forms and will be refined in the infection
chapter.

```ebnf
infectious_decl := export_modifier? "infectious" identifier infectious_body ";"
infectious_body := "type" constructor type_params? "=" type_members
                |  constructor type_params  -- legacy form

domain_decl     := export_modifier? "domain" identifier domain_rule_block ";"
policy_decl     := export_modifier? "policy" qualified_name rule_block ";"
op_decl         := export_modifier? "op" qualified_name rule_block ";"
annotate_decl   := export_modifier? "annotate" identifier annotate_payload ";"
```

The detailed EBNF for `qualified_name`, `rule_block`, and infection payloads is
specified in the infection and effect chapters; the grammar here simply
recognises their surface structure.

### Export modifiers

```ebnf
export_modifier := "export"
```

When present, the modifier applies to the whole mutually-recursive group.

---

## Blocks and Statements

```ebnf
block           := "{" directive* block_item* block_result? "}"
block_item      := let_statement
                |  pattern_let_statement
                |  assign_statement
                |  expr_statement
                |  comment_statement  -- preserved for tooling
block_result    := expr comment_statement*

let_statement           := "let" let_modifiers? let_binding ";"
pattern_let_statement   := "let" "(" pattern ")" "=" expr ";"
assign_statement        := identifier assign_operator expr ";"
assign_operator         := "=" | "+=" | "-=" | "*=" | "/=" | "%="
expr_statement          := expr ";"
comment_statement       := -- see lexer, ignored for canonical semantics
```

Rules:

- Blocks are expressions; only `block_result` yields a value. If it is absent,
  the block evaluates to `void`. Statements that end with `;` always evaluate to
  `void`, so `block_result` is the lone value-returning position inside a block.
- Destructuring lets use the parenthesised form to avoid ambiguity with
  identifier-only bindings (`let (x, y) = expr;`).
- `assign_statement` targets must refer to previously-declared `mut` bindings.
  Compound operators elaborate to read-modify-write (`x += y` ≡ `x = x + y`) and
  always evaluate to `void`.
- If expressions, match arms, and lambda bodies are block-only syntactically; no
  expression-bodied sugar is permitted in canonical Workman.

---

## Expressions

Top-level production:

```ebnf
expr            := if_expr
                |  match_expr
                |  lambda_expr
                |  block
                |  pipe_expr

pipe_expr       := binary_expr (":>" binary_expr)*
binary_expr     := as_expr (operator_token as_expr)*
as_expr         := call_expr ("as" type_expr)*
```

Type assertions are encoded via `as_expr`; multiple `as` clauses associate
left-to-right.

### Conditionals

```ebnf
if_expr         := "if" "(" expr ")" block "else" block
```

`else if` chains are disallowed; use nested `if` or `match`.

### Match expressions and bundles

```ebnf
match_expr      := "match" match_scrutinee match_body
                |  match_bundle_literal
                |  "match" "(" expr ("," expr)* ")" "=>" block
match_scrutinee := "(" expr ("," expr)* ")"
match_body      := "{" match_arm_list "}"
match_bundle_literal := "match" "{" match_arm_list "}"
match_arm_list  := match_arm ("," match_arm)* (","?)
match_arm       := pattern guard_clause? "=>" block
                |  identifier  -- bundle reference
guard_clause    := "when" expr
```

- `match { ... }` parses as `match_bundle_literal` (no nested braces).
- `match(scrutinee) => { ... }` is sugar for a first-class match function; it
  elaborates to `(args) => { match(args) { ... } }`.
- Disambiguation order: after the `match` keyword, `{` always starts a bundle
  literal; `(` starts either a scrutinee (closed by `) {`) or the `match_fn`
  form (when immediately followed by `)=>`).
- Bare identifiers become bundle references only when **not** followed by
  `when`/`=>`. In other words, `Foo => { ... }` always parses as a pattern arm,
  while `Foo,` or `Foo }` (with no guard/body) references a previously-declared
  bundle named `Foo`.

### Lambda expressions

```ebnf
lambda_expr     := parameter_list "=>" block
                |  "=>" block              -- zero-arg CoffeeScript form
```

### Binary expressions / postfix chain

```ebnf
call_expr       := postfix_expr
postfix_expr    := primary_expr postfix_segment*
postfix_segment := call_suffix | projection_suffix | index_suffix
call_suffix     := "(" (expr ("," expr)* (","?))? ")"
projection_suffix := "." identifier
index_suffix    := "[" expr "]"
```

Implementations map operator precedence using the table above. `postfix_expr`
parses the greedy chain of calls, record projections, and index accesses.

### Primary expressions

```ebnf
primary_expr    := literal
                |  identifier
                |  constructor_call
                |  tuple_expr
                |  record_literal
                |  list_literal
                |  parenthesized_expr
                |  block
                |  panic_expr
                |  hole_expr
                |  enum_literal

constructor_call := constructor ("(" expr ("," expr)* (","?) ")")?

tuple_expr      := "(" expr "," expr ("," expr)* (","?) ")"

record_literal  := ".{" record_field_list? "}"
record_field_list := record_field ("," record_field)* (","?)
record_field    := identifier ("=" expr)?
                |  ".." expr                      -- spread

list_literal    := "[" list_element_list? "]"
list_element_list := list_element ("," list_element)* (","?)
list_element    := expr | ".." expr                -- tail spread

parenthesized_expr := "(" expr ")"
panic_expr      := "Panic" "(" expr ")"
hole_expr       := "?"                               -- typed hole
enum_literal    := "." identifier
```

`constructor_call` covers both nullary constructors (`Foo`) and parameterised
ones (`Foo(a, b)`). Tuple literals use `(...)` exclusively; `.{ ... }` is
reserved for record literals with explicit field names/spreads to avoid
ambiguity with punning.

---

## Patterns

```ebnf
pattern         := wildcard_pattern
                |  identifier_pattern
                |  literal_pattern
                |  constructor_pattern
                |  var_pattern
                |  tuple_pattern
                |  list_pattern
                |  all_errors_pattern

wildcard_pattern    := "_"
identifier_pattern  := identifier
literal_pattern     := literal
constructor_pattern := constructor ("(" pattern ("," pattern)* ")")?
var_pattern      := "Var" "(" identifier ")"
tuple_pattern       := "(" pattern ("," pattern)+ ")"
list_pattern        := "[" list_pattern_elements? "]"
list_pattern_elements := pattern ("," pattern)* ("," ".." pattern)?
all_errors_pattern  := "AllErrors"
```

Pinning rules (normative):

1. Within `match` patterns, an unadorned identifier is a **pin** that refers to
   an existing binding; the arm matches only if the scrutinee equals that value.
2. `var_pattern` (`Var(identifier)`) introduces a fresh binding inside `match`
   patterns, regardless of surrounding structure.
3. Binding positions outside `match` (lambda parameters, `let` patterns, record
   members, etc.) treat unadorned identifiers as fresh bindings automatically
   and therefore never require `Var`.

Pattern guards (`when expr`) do not contribute to coverage unless provably
total, as specified in the pattern-matching chapter.

---

## Type Expressions

```ebnf
type_expr       := type_arrow
type_arrow      := type_primary ("=>" type_expr)?

type_primary    := type_tuple
                |  type_record
                |  type_reference
                |  type_variable
                |  type_unit
                |  type_pointer
                |  type_effect_row

type_tuple      := "(" type_expr ("," type_expr)+ ")"
type_record     := "{" type_record_field ("," type_record_field)* (","?) "}"
type_record_field := identifier ":" type_expr
type_reference  := constructor type_arguments?
type_arguments  := "<" type_expr ("," type_expr)* (","?) ">"
type_variable   := identifier         -- lowercase by convention
type_unit       := constructor_void
constructor_void := constructor        -- literal spelling "Void"
type_pointer    := "Ptr" "<" type_expr ("," identifier)? ">"
type_effect_row := "[" type_effect_case ("," type_effect_case)* tail_wildcard? "]"
type_effect_case := constructor ("(" type_expr ")")?
tail_wildcard   := ".." identifier?
```

The exact set of effect-row constructors is defined in the infection chapter;
the grammar here simply permits their surface syntax. `constructor_void` matches
the constructor token whose lexeme is exactly `Void`.

---

## Literals

```ebnf
literal         := number_literal
                |  bool_literal
                |  char_literal
                |  string_literal
                |  "void"
```

Numeric literal forms follow the lexical chapter. String and byte escapes obey
the canonical escape set (`\n`, `\r`, `\t`, `\\`, `\'`, `\"`, `\xHH`).

---

## Canonicality Checklist

Before claiming conformance, implementations must ensure:

1. Reserved words are rejected as identifiers in all namespaces.
2. Every grammar production here has a corresponding parser path.
3. Blocks are enforced for lambdas, matches, and conditional branches.
4. Operator precedence matches the normative table, especially the requirement
   that postfix chains bind tighter than all infix operators.
5. Pattern pinning semantics follow the `Var` convention.

Future revisions may extend the grammar with additional literals, directives, or
declaration forms. Such extensions must update this chapter accordingly.


# Modules and Names (Normative)

This section defines modules, imports/exports, and name resolution.

Canonical Workman aims to keep module semantics simple and predictable.

---

## Modules

- A module is the contents of a single source file.
- Module identity is implementation-defined (e.g., file path normalization),
  but must be consistent within a build.

Implementation-defined (must be documented):
- How module specifiers (e.g., `"./file.wm"`, `"std/list"`) map to files.
- Whether the same file can be imported under multiple spellings and if so
  whether it produces one module or multiple distinct modules.

---

## Namespaces

Canonical Workman has at least these namespaces:
- **values**
- **types**
- **constructors**

An identifier may exist in multiple namespaces with the same spelling.

---

## Imports

- Imports are explicit and list the imported items.
- Importing `type T(..)` imports the type and the specified constructors.
- Namespace imports (`* as Name`) introduce a value-level namespace binding.

Name resolution rules:
- Local bindings shadow imported bindings in the value namespace.
- Type and constructor resolution rules are specified in the typing chapter.

---

## Exports

- Exports are explicit.
- Exporting a type does not implicitly export all constructors unless written
  explicitly.

---

## Cycles

Import cycles are **not permitted** in canonical Workman (v1). Implementations
must reject cyclic module dependencies.


# Declarations (Normative)

This section defines top-level and local declarations: `let`, `type`, `record`,
operators, and related forms.

---

## Value Bindings (`let`)

### Non-recursive

`let x = expr;` binds `x` to the value of `expr`.

### Mutable bindings

`let mut x = expr;` declares a mutable binding.

Normative:
- A mutable binding may be reassigned (see assignment semantics in
  `../5. Dynamic semantics/1-values-and-evaluation.md`).
- `mut` affects the binding itself, not the interior mutability of the bound
  value.

### Recursive

`let rec f = expr;` permits `f` to be referenced inside `expr`.

Normative restriction:
- Only `let rec` introduces recursive scope.

### Mutual recursion

`let rec f = ... and g = ...;` binds a mutually recursive group.

---

## Types and Data

### Algebraic data types

`type Option<T> = None | Some<T>;`

Normative:
- Types are nominal.
- Constructors are in the constructor namespace.

### Records

`record Point = { x: Int, y: Int };`

Normative:
- Records are nominal.
- Record construction uses `.{ ... }`.

---

## Operators (Surface)

Canonical Workman supports infix/prefix operators by treating operators as
ordinary value bindings (Grain-style).

Normative:
- Operators are values in the value namespace.
- An operator may be bound with a parenthesized operator identifier:
  `let (op) = expr;` where `op` is an operator token such as `+`, `*`, `++`,
  `&&`, etc.
- Infix and prefix uses resolve by name:
  - `a op b` elaborates to `(op)(a, b)`.
  - `op a` elaborates to `(op)(a)` for prefix operators.
- Operator precedence/associativity is defined in the grammar chapter.

Non-normative note (current implementations):
- Some implementations additionally support explicit operator alias
  declarations like `infixl <prec> <op> = <name>;` and `prefix <op> = <name>;`
  to register operators for parsing/typechecking. These forms are not part of
  canonical v1 unless specified in the grammar chapter.


# Types (Normative)

## Scope

Defines the canonical type language and core type meanings.

## Status

Draft (normative where specified).

## Dependencies

- `../2. Source text/1-lexical-structure.md`

This section defines the type language of canonical Workman.

Canonical Workman is HM-based with extensions, but remains strongly typed and
predictable.

---

## Type Forms

The type language includes at least:

- Primitive types: `Number`, `Bool`, `Byte`, `String`, `Bytes`, `Void`
- Fixed-width integers: `Int8`, `Int16`, `Int32`, `Int64`, `Uint8`, `Uint16`,
  `Uint32`, `Uint64`
- Floating-point: `Float32`, `Float64`
- Function types: `(A, B, ...) => R`
- Tuples: `(A, B, ...)`
- Nominal records: `RecordName`
- Nominal algebraic data types: `TypeName<...>`
- Type variables (for polymorphism): `a`, `b`, ...

This manual intentionally does not guarantee representation/layout of any type
unless stated in the FFI/backends chapter.

---

## Number (Canonical Numeric Type)

`Number` is the canonical numeric type for most code. It is a *sum* of:
- integers
- floating-point numbers

Normative:
- Integer literals (no decimal point or exponent) have type `Number` and are
  integers.
- Floating literals (decimal point or exponent) have type `Number` and are
  floats.
- Arithmetic that involves at least one float yields a float.
- Division (`/`) on `Number` **always** produces a float.

Implementation-defined (must be documented):
- The integer range supported by `Number` (implementations must support at
  least signed 64-bit range).
- The floating-point precision of `Number` (recommended: IEEE-754 64-bit).

Normative error class:
- If an integer operation on `Number` exceeds the supported integer range, the
  program must raise a runtime error.

### Runtime representation and specialization

Normative:
- `Number` is a *semantic* sum type (int or float). The language definition
  does **not** require a specific runtime representation.
- A conforming implementation **may** specialize `Number` to a concrete
  numeric representation when type inference determines the value is
  unambiguously integer or float, as long as observable behavior is preserved.

Implementation-defined (must be documented):
- Whether `Number` is represented as a tagged union, NaN-boxed value, or
  specialized to a concrete numeric type in common cases.

---

## Void (Unit Type)

`Void` is the unit type. Its sole value is the literal `void`.

Normative:
- `void` has type `Void`.
- `Void` has exactly one value.

---

## Byte and String (v1 Minimal Semantics)

Canonical Workman v1 uses the simplest useful model:

- `Byte` is an 8-bit value in the range `0..255`.
- `String` is a sequence of `Byte` values (a byte string).
- String length is the number of bytes.
- String indexing yields a `Byte`.

This model is sufficient for AoC-style problems and self-hosting, and avoids
committing to Unicode semantics in v1. Future versions may extend this model in
a backward-compatible way.

---

## Nominality

- Record types are nominal.
- ADT types are nominal.
- Type equality is nominal for named types, except where the language defines
  aliasing (if alias types exist).

---

## Polymorphism

Canonical Workman supports parametric polymorphism (`forall` / HM schemes).

The precise generalization/instantiation rules are specified in
`plans/workmancanonical/4. Static semantics/2-type-inference.md`.


# Type Inference (Normative)

This section defines canonical Workman typing:

- HM-style inference
- generalization boundaries
- interaction with annotations
- extensions required by pattern matching and infection

---

## Typing Judgements (Sketch)

This manual uses a conventional judgement style:

- `Γ ⊢ e : τ` meaning “under environment Γ, expression e has type τ”.
- `Γ` contains value bindings, type constructor bindings, and constructor
  bindings, each in their respective namespaces.

This section will be expanded with formal rules over time.

---

## Generalization and Instantiation

Canonical Workman is based on let-polymorphism.

Normative:

- `let` bindings—both top-level and local—are generalized (unless restricted by
  a value-restriction rule defined elsewhere).
- `let rec`/mutually-recursive groups are generalized **after** each binding is
  checked under a monomorphic placeholder: every binding `xi` is inserted into Γ
  as `xi : αi` where `αi` is a fresh unification variable local to the group.
  Each RHS is inferred under that environment, producing constraints that unify
  `αi` with the RHS type; only after solving are the `αi` generalized (subject
  to value/infection restrictions). Recursive occurrences therefore always see
  the monotype, never the generalized scheme.
- Lambda parameters and pattern binders are never generalized at their binding
  sites.
- Module exports reuse the same boundary rules: a `let` exported from a module
  is generalized exactly once and subsequently instantiated by importers.

Normative (v1 generalization policy):

- By default, `let` bindings are generalized.
- Canonical Workman does **not** impose a blanket "discharge infection before
  generalization" rule.
- Infection propagation through ordinary expressions remains valid across `let`
  boundaries and function boundaries when represented in inferred types/schemes.
- Generalization must preserve inferred infection/domain information; it must
  not erase or silently drop infection state from a binding's exported scheme.
- Rejection of infected flows is enforced at explicit domain/policy boundaries
  (for example `pure`/`rejectDomains`/domain boundary requirements), not as a
  global ban on infected bindings.
- This rule is semantic and policy-boundary-aware, not a syntactic "values-only"
  gate.

Normative (infection + generalization integration):

- Infection/effect information participates in the same generalization boundary.
- A `let` binding may remain infected after generalization when the infection is
  represented in its inferred scheme (for example `A -> IResult<B, E>`).
- Discharge by pattern matching is one way to eliminate infection from a local
  expression, but it is not required at every `let` boundary.
- Implementations must not silently generalize away or drop infection state.

---

## Annotations

Annotations may appear:

- on bindings: `let x: T = expr;`
- on parameters: `(x: T) => { ... }`
- as local assertions: `expr as T`

Normative:

- An annotation introduces an **expected type**. Implementations may either
  infer first then unify with the annotation, or switch into checking mode and
  verify the expression directly against the annotation; both strategies must
  accept/reject the same programs.
- Surface annotations are rank-1 schemes (`∀` may appear only at the outermost
  level). During checking, each `∀`-bound variable is instantiated to a fresh
  unification variable so that the annotated expression can specialize it.
- If the inferred type does not unify with the instantiated annotation type, the
  program is ill-typed and the compiler must report the conflict.

---

## Pattern Matching Typing

Pattern typing:

- Patterns introduce bindings into the environment.
- The scrutinee type constrains the pattern shapes.
- All arms must unify to a common result type (subject to infection rules).

Exhaustiveness and coverage are specified in:

- `plans/workmancanonical/5. Dynamic semantics/2-control-flow-and-pattern-matching.md`
- `plans/workmancanonical/9. Appendices/1-formal-core.md` (when formalized)

### Match-as-inverse rule (Workman v1)

Let `C` be a nominal sum with constructor signatures recorded in the module/type
environment as:

```
Γ ⊢ constructor(ci) = ∀ᾱ . τi → C ᾱ
```

The canonical typing rule for matches is:

```
Γ ⊢ e : C ᾱ      ∀ci ∈ constructors(C).
  instantiate(constructor(ci)) ⇒ τi' → C β̄
  unify(C β̄, C ᾱ) ⇒ θi
  Γ ⊢ pi ⇐ θi(τi') ⊣ Δi      Γ, Δi ⊢ bodyi : τ
———————————————————————————————————————————————————————————————————————
Γ ⊢ match e { ci⁻¹ pi => bodyi } : τ
```

Each `θi` is the substitution returned by HM unification between the constructor
result and the scrutinee type. Patterns use the instantiated argument type
`θi(τi')` and yield bindings `Δi`. Wildcards (`_`) are permitted and simply
produce no bindings. Every constructor exported by `C` must be covered. Surface
syntax may use `_` as a catch-all arm, but elaboration must expand `_` into one
arm per remaining constructor (each with its own instantiated argument types) so
coverage and typing remain explicit. This mirrors the “inverse of a sum”
principle from the match-as-inverse paper: consuming `C` requires supplying an
inverse clause for every summand, so missing constructors manifest as a typing
failure rather than a separate ad-hoc check.

- Inference computes `Γ, Δi ⊢ bodyi : τi_body` for each arm and unifies all
  `τi_body` to obtain the common result type `τ` (subject to infection/domain
  constraints).
- Each arm instantiates the constructor scheme with fresh type variables and
  unifies the constructor result with the scrutinee type before binding
  arguments. This ensures constructor parameters track the scrutinee’s actual
  instantiation. If a constructor has multiple arguments, `τi'` represents the
  full argument spine (tuple/product); the pattern `pi` must bind that shape in
  order, matching the “inverse leaves values on the stack” intuition from the
  paper.

Although Workman presents `match` as a surface expression rather than first-
class clause atoms composed via `&`, the typing discipline above is directly
adapted from the same inverse-constructor view: each clause behaves like the
paper’s typed arm, and the coverage rule enforces the same De Morgan-style
duality between sums and their inverses.

#### Prerequisites for implementation

1. **Constructor tables in the typing environment.** `Γ` must expose a query
   from nominal type → ordered constructor list with their quantified argument
   types. This data already exists in the module loader but is not yet wired
   into the HM environment.
2. **Clause elaboration to inverse bindings.** The parser/lowering phase must
   annotate each clause with its constructor ID so the type checker can look up
   `τi` directly (no string matching).

Once both are satisfied, the HM core can enforce exhaustiveness and type the
bindings by instantiating the constructor scheme, pushing the argument types
into the branch environment, and checking the body.

---

## Infection Integration (Forward Reference)

Infection extends typing and inference.

This chapter defines only the integration points:

- Generalization/instantiation must quantify/freshen infection rows (or other
  infection variables) alongside regular type variables.
- Unification either unifies infection components directly or emits domain
  constraints handled by the solver.
- Annotations constrain infection components exactly as they constrain the
  underlying type structure.
- Pattern matching clauses may discharge infection obligations when the match is
  proven exhaustive.

Full infection typing rules are in:

- `plans/workmancanonical/6. Infection system/2-infection-types-and-composition.md`

```
```


# Traits / Interfaces (Reserved)

Canonical Workman may eventually support trait/typeclass-style constraints, but
this is currently reserved and not part of the minimal canonical core.

If traits are added:
- They must integrate with HM inference without ad hoc backend hooks.
- They should likely reuse the infection domain registry concepts, but remain
  constraints/evidence (not value-wrapping).

This section is intentionally incomplete.



# Values and Evaluation (Normative)

## Scope

Defines evaluation order, strictness, and runtime error categories.

## Status

Draft (normative where specified).

## Dependencies

- `../4. Static semantics/1-types.md`

This section defines what expressions evaluate to, and in what order.

---

## Values

Canonical Workman values include at least:
- integers, booleans, characters, strings, `Void`
- tuples
- records
- constructors/ADT values
- functions (closures)

The *representation* of values is not part of canonical semantics unless stated
in an explicit backend/FFI contract.

Normative:
- Values are immutable by default.
- Functions are closures that capture the lexical environment.

---

## Evaluation Strategy

Normative:
- Evaluation is **strict**.
- Function application evaluates the callee expression and each argument before
  performing the call.

### Pipe operator `:>` (Elaboration)

Normative:
- The pipe operator `:>` is surface syntax that elaborates to function
  application as specified in the grammar chapter (`../2. Source text/2-grammar.md`).
- After elaboration, evaluation order is the normal left-to-right evaluation
  order for function application.
  - In particular, `e1 :> f(x)` elaborates to `f(e1, x)`, so `e1` is evaluated
    before `x`.

### Sequencing and `let`

Normative:
- A non-recursive `let` evaluates its right-hand side before evaluating the
  body.
- A sequence of non-recursive bindings evaluates left-to-right in source order.
- A `let rec` group introduces bindings that are mutually visible within the
  group.
- Each `let` introduces a new scope. If a binding name matches an existing
  binding in the current scope, the new binding **shadows** the old one for the
  remainder of its scope.

Implementation-defined (must be documented):
- The evaluation strategy for recursive value bindings whose right-hand side is
  not a function. (Canonical Workman may restrict or reject such cases later.)

### Mutable bindings and assignment

Normative (v1):
- A `mut` binding creates a mutable variable whose value may be reassigned.
- Assignment uses the form `x = expr;` and is an expression that evaluates to
  `Void`.
- The right-hand side of an assignment is evaluated before updating `x`.
- Assigning to a non-`mut` binding is a type error.
- Canonical Workman does **not** define interior mutability (e.g., `x.field = y`
  is not part of canonical v1).

### Evaluation order

Normative:
- Evaluation order is **left-to-right** for:
  - function arguments
  - tuple elements
  - record field expressions (in source order)
  - record spread expressions (in source order)
  - match scrutinee (before selecting an arm)

If an implementation cannot preserve this order for optimization reasons, it
must not claim conformance to canonical Workman.

---

## Runtime Errors

Canonical Workman prefers typed errors via infection carriers, but some runtime
errors may exist (e.g., explicit `Panic`).

Normative:
- `Panic("msg")` aborts evaluation with an unrecoverable error.
- Unless specified, other runtime errors are reserved.
- If a non-exhaustive match is permitted by the implementation (e.g., via a
  partial-match feature), reaching an uncovered case must raise a runtime error.

Normative runtime error classes (v1 minimal set):
- integer overflow for `Number` integer operations outside the supported range
- non-exhaustive match (if allowed by the checker)

Implementation-defined:
- The exact host-visible form of a panic (exit code, stack trace, etc.), but
  implementations should provide location data when available.

---

## Non-Normative Notes (Current Implementations)

These notes are for guidance only and do **not** define canonical behavior.

- Some current runtime-mode implementations (including a v0 Zig runtime backend)
  use a boxed `Value` union for all values (`Int`, `Bool`, `String`, `Tuple`,
  `Record`, `Data`, `Func`).
- This is an implementation strategy note, not a recommended canonical backend
  architecture.
- In particular, the WMC profile targets compile-time specialization and
  unboxed representations by default, using boxed values only as a fallback
  when specialization is not possible (`../7. Interop and backend contracts/3-wmc-profile.md`).
- The JS runtime currently represents numbers, strings, and booleans as native
  JS values, and uses objects for ADT values; non-exhaustive matches throw an
  error with metadata.


# Control Flow and Pattern Matching (Normative)

## Scope

Defines `match` and `if/else` behavior, arm selection, and exhaustiveness.

## Status

Draft (normative where specified).

## Dependencies

- `../4. Static semantics/2-type-inference.md`

This section defines `match` and `if/else` (as sugar), including evaluation, arm
selection, and the contract for exhaustiveness.

---

## `if/else`

Normative:

- `if/else` is syntax sugar for a boolean match.
- `else` is mandatory.
  - An `if` without an `else` branch is ill-formed: it has no value, so it
    cannot appear in expression position (v1 static error).
- `else if` is not part of the language.

---

## `match`

### Scrutinee evaluation

Normative:

- The scrutinee expression is evaluated exactly once before arm selection.

### Arm selection

Normative:

- Arms are considered in source order (left-to-right).
- The first arm whose pattern matches and whose guard (if present) evaluates to
  `true` is selected.
- If a guard is present, it is evaluated only after the pattern match succeeds.

### Pattern binding

Normative:

- Bindings introduced by a successful pattern are in scope for the guard and the
  arm body.

---

## Exhaustiveness and Non-Exhaustive Matches

Normative (v1 rule):

- Matches must be exhaustive.
- For _closed_ sum types (algebraic data types with a known, finite set of
  constructors in scope), a match is exhaustive if all constructors are covered
  by unguarded arms.
- A wildcard arm (`_ => { ... }`) counts as exhaustive for any scrutinee type.
- For non-sum types, or when constructor coverage cannot be proven, a wildcard
  arm is required in v1.
- Guarded arms do not contribute to exhaustiveness unless the guard is
  statically provable (v1: treat as not provable).

This is a major semantic commitment and must be paired with precise diagnostics.
The rigorous coverage model is specified separately:

- `../9. Appendices/1-formal-core.md` (future formal core)
- and design notes in `../../coreirRefactor/match_refactor_plan.md`

Until a formal coverage proof system is defined, implementations must enforce
the wildcard-arm rule above.

---

## Match Bundles and Conjunction (Canonical Model)

This section formalizes the intended _canonical_ model that the v1 surface
syntax desugars into. It is normative for coverage and diagnostics.

Normative:

- A **match bundle** is a first-class value that represents a _product_ of
  inverse constructor clauses (a disjunctive product).
- `match { ... }` constructs a bundle; `match(scrutinee) { ... }` applies a
  bundle to a scrutinee.
- A bundle is composed from **arms**. Each arm introduces one inverse clause
  (constructor test + bindings).
- Commas in a bundle form a **conjunction** of inverse clauses. Conjunction is
  associative and does not introduce implicit wildcard coverage.

Normative (bundle reference):

- A bundle reference inside a bundle (e.g., `match { bundleRef, ... }`) is
  equivalent to splicing the referenced bundle's arms in place.
- Bundle references **do not** imply `_` coverage.

Normative (coverage model):

- The coverage of a bundle over a closed sum type is the union of constructors
  handled by its unguarded arms (including those from referenced bundles).
- Guarded arms do not add coverage in v1.
- A bundle is exhaustive for a closed sum type iff its coverage includes all
  constructors of the type.

Non-normative note:

- This model aligns with the "inverse constructor + conjunction" formulation in
  `plans/match/inv.md` and `plans/match/or.md`, and the `MatchType`/coverage
  tables described in `plans/coreirRefactor/match_refactor_plan.md`.

---

## Pattern Forms (Dynamic Meaning)

This chapter specifies only dynamic matching behavior; typing is specified in
the static semantics chapters.

### Summary (non-normative)

Workman has two different meanings for identifier-shaped patterns:

- A **binding** introduces a fresh name for (part of) the scrutinee.
- A **pin** refers to an existing name and matches only if the scrutinee equals
  that existing value.

This inversion applies specifically to `match` patterns; other binding sites
(lambda parameters, `let` bindings, record fields, etc.) continue to treat bare
identifiers as fresh bindings and therefore never require `Var`.

In particular:

- `Some(x)` binds `x` (constructor fields bind, even if `x` is already in
  scope).
  - `Some(Var(x))` is permitted but redundant.
  - To compare a constructor payload to an existing value, bind it and use a
    guard (e.g. `Some(v) when v == expected`).
- `x` (a pattern that is exactly one identifier) is a pin: it is never a binder.
- `(x, y, z)` and `[x, y, z]` are tuples/lists of pins; use `Var(...)` per
  element to bind: `(Var(x), Var(y), Var(z))`, `[Var(x), Var(y), Var(z)]`.

### Concrete example (non-normative)

Read the slogan as "destructuring binds, bare identifiers pin, `Var` binds the
whole value." The surface looks just like familiar `if (lhs == rhs)` checks, but
you write them with `match`.

```
let opt_value = compute();
let sentinel = true;
let expected = 42;

let payload = "outer";

match(opt_value) {
  Some(payload) => { log("Some payload: " ++ payload) },  -- binds (shadows outer `payload`)
  Var(copy) => { log("Fallback copy: " ++ copy) },        -- bind whole scrutinee
};

let x = read_int();
let y = expected;

-- if (x == sentinel) { ... } else if (x == y) { ... } else { ... }
match(x) {
  sentinel => { log("pinned compare to sentinel") },      -- bare identifier pins
  y => { log("pinned compare to y") },                    -- bare identifier pins
  Var(fresh) => { log("fresh binding: " ++ fresh) },      -- explicit binder
};
```

`Some(payload)` binds `payload`, `Var(copy)` binds the entire scrutinee, and the
bare identifiers (`sentinel`, `y`) simply compare against the values already in
scope.

### Guards + tuple pins vs explicit binding (non-normative)

Guards see bindings introduced earlier in the arm. Use `Var(...)` to capture
either the whole scrutinee or just the positions you want to guard on.

```
let expectedX = 10;
let expectedY = -4;
let expectedZ = 0;
let limit = 5;

match(read_sensor()) {
  Var(point) when point.distance > limit => {
    log("far away: " ++ point.id)
  },
  (expectedX, expectedY, expectedZ) => {
    log("exactly at the calibration tuple")
  },                                            -- tuple of pins
  (Var(x), Var(y), Var(z)) when z > limit => {
    log("fresh tuple bindings: " ++ x ++ ", " ++ y ++ ", " ++ z)
  },                                            -- explicit tuple binding
  (Ok(x), Ok(y), Ok(z)) => {
    log("triple success payload: " ++ x ++ y ++ z)
  },                                            -- constructors keep destructuring ergonomic
  _ => { log("fallback") }
};
```

Normative:

- Wildcard (`_`) matches any value.
- Literal patterns match if the scrutinee equals the literal value.
- Tuple patterns match if the scrutinee is a tuple of the same arity and each
  element pattern matches.
- Constructor patterns match if the scrutinee has the same constructor and all
  field patterns match.

Pinned vs binding (canonical rule, normative):

- Workman distinguishes **structural patterns** from **bare identifier
  patterns**.
- Structural patterns bind "as usual" when the pattern introduces shape (a
  constructor, tuple/list delimiter, or another explicit pattern form):
  - Constructor patterns bind their field identifiers: `Some(x)` binds `x`,
    `(Ok(x), Ok(y), Ok(z))` binds all three `x/y/z`, `[head, ..tail]` binds
    `head` and `tail`.
    - In particular, `Some(x)` binds `x` even if a value named `x` is already in
      scope; constructor fields are not treated as pins.
  - Tuples/lists apply the rule element-wise: structural subpatterns bind, but
    an element that is itself "just an identifier" is still treated as a pin.
  - Writing `Var(name)` in any position forces that position to bind, regardless
    of surrounding structure.
- A pattern that is _exactly one identifier_ is **not** a binder; it is a pinned
  reference:
  - `match(x) { y => { ... } }` treats `y` as a reference to an existing value
    named `y` (like a literal), not a new binding.
  - If a value named `y` is in scope at the pattern site, the arm matches iff
    the scrutinee equals the value of `y`.
  - If no value named `y` is in scope at the pattern site, the program is
    ill-formed (v1: a static error).
- To bind the whole scrutinee without destructuring, use `Var(name)`:
  - `match(x) { Var(y) => { ... } }` binds `y` to the scrutinee value.

### Tuple/list literals made of identifiers (Normative)

- `(x, y, z)` and `[x, y, z]` are interpreted as tuples/lists of pins.
  - Each identifier must already be in scope; the arm matches only when the
    scrutinee’s components equal those pinned values.
- To destructure into fresh bindings, wrap each identifier with `Var`:
  `(Var(x), Var(y), Var(z))`, `[Var(first), Var(second), ..Var(rest)]`.
- Mixed forms follow the rule element-wise. Example: `(Var(head), tail)` binds
  `head` (because of `Var`) but pins `tail`. Adding constructors restores the
  usual destructuring ergonomics: `(Ok(x), Ok(y), Ok(z))` binds all fields
  without extra `Var(...)`.

Non-normative explanation (the "inversion"):

- Canonical Workman chooses "`identifier` means pin" for the _bare identifier
  pattern_, and uses `Var(identifier)` for the _bare binder pattern_.
- This keeps constructor destructuring ergonomic (`Some(x)`, `Ok(x)`, etc.)
  while making the "match a named value" case explicit and consistent with
  literal matching.
- Users coming from more conventional `if`/`else` languages can translate mental
  models directly: `if (x == y) { body } else { other }` is desugared as
  `match(x) { y => { body }, _ => { other } }`. A bare identifier arm is just
  “the `== y` test” spelled as a pattern.
- Even functional-language veterans still rely on `if/else`, so nothing about
  this inversion should feel alien—`match` simply makes the comparison explicit
  and enforces that every branch produces a value.

Non-normative example (why this is consistent):

- Common confusion: `Some(x)` binds, it does not pin.
  ```
  let x = 1;

  match(Some(1)) {
    Some(x) => { log("binds x (shadows outer x): " ++ x) },
    _ => { log("no match") }
  };

  match(Some(1)) {
    Some(v) when v == x => { log("pins by guard: payload equals outer x") },
    _ => { log("other") }
  };
  ```

Non-normative example (guards + tuple pins vs explicit binding):

- Tuple/list pins vs bindings show up most often when matching against named
  tuples/lists.
  ```
  let expectedX = 10;
  let expectedY = -4;

  match(read_pair()) {
    (expectedX, expectedY) => { log("tuple of pins") },
    (Var(x), Var(y)) => { log("fresh bindings: " ++ x ++ ", " ++ y) },
    _ => { log("fallback") }
  };
  ```


# Data Model (Normative)

This section defines the semantic meaning of tuples, records, and ADTs.

---

## Tuples

Normative:
- Tuples are ordered, fixed-size product values.
- Tuples are first-class values (SML-style): a tuple value behaves the same
  regardless of whether it was constructed inline or obtained from a binding.
- Function application is not curried by default. Multi-argument functions are
  functions over tupled arguments (SML-style).
- Tuple equality (if defined) is structural element-wise equality.

If equality is not defined for all values, the manual must specify where it is
defined and where it is rejected (typed error vs runtime error).

---

## Records

Normative:
- Records are nominal types.
- Record values are mappings from field names to values for a particular record
  type.

Implementation-defined / not guaranteed:
- Any in-memory layout or field ordering, unless specified by an FFI contract.

---

## Algebraic Data Types

Normative:
- ADT values are tagged unions identified by their constructor.
- Constructor arguments preserve order.

---

## Equality and Ordering (Reserved)

Canonical Workman has not yet fully specified:
- total equality across all values
- ordering comparisons beyond numeric primitives

Until specified, libraries that expose equality/order must define their own
typing contracts (or be treated as non-canonical extensions).


# Infection System Overview (Normative)

This section defines what infection is, at the language level.

Canonical Workman’s infection system is a core extension to HM typing. It
tracks and propagates domain-specific information (carriers/effects and other
constraints) through ordinary expressions without requiring explicit monadic
syntax.

User-facing motivation and examples are described in `workmaninfectionguide.md`.
This manual defines the contract that conforming implementations must follow.

---

## Conceptual Summary

- An “infected value” carries a normal payload value plus domain-defined
  metadata.
- When an infected value is used, the infection propagates according to the
  domain’s rules.
- Discharging infection happens via pattern matching on the carrier (for
  carrier-like domains).

Normative boundary:
- Infection semantics are part of the language, not a backend policy.

---

## What Infection Is Not

- It is not “capability tracking like Rust” by default.
- It is not defined in terms of explicit state transition types.
- It is not a mere codegen convenience; it affects typing and program meaning.

---

## Domains

Infections are organized into **domains** (e.g. `effect`, `async`, others).

Each domain defines:
- how infections compose/merge
- how function application propagates infection
- what it means to discharge infection (if discharge exists)

The formal domain model is specified in:
- `plans/workmancanonical/6. Infection system/2-infection-types-and-composition.md`



# Infection Types and Composition (Normative, Draft)

This section specifies the typing-level contract for infection.

It must eventually answer, precisely:
- what infected types look like in the type system
- how infection propagates through expressions
- how infection composes when multiple infected values interact
- how discharge via pattern matching affects types

This is a draft and is expected to evolve as the solver model is stabilized.

---

## Type-Level Model (Sketch)

Canonical Workman extends the type language with an infection layer.

At a high level:
- A value has a base type `T`.
- It may also carry an infection “annotation” that tracks domain metadata.

This manual does not commit to a concrete internal representation, but it must
be possible to describe:
- which domains affect a value
- the domain-specific state carried by those domains (if any)

---

## Carrier Types

Carrier types are infectious types with explicit constructors:

- `@value` constructors carry normal values.
- `@effect` constructors carry domain-defined effects.

Normative (carrier discharge):
- Pattern matching on a carrier is the mechanism to discharge infection.
- Discharge is only valid when the match covers the domain-defined “effect”
  cases according to the domain’s rules.

---

## Propagation Through Function Application

Normative (high-level):
- If a function expects an uninfected argument but receives an infected value,
  the infection propagates according to the domain’s rules.

This must be defined carefully so it is not “compiler magic”. The eventual spec
should provide rules or a pseudo-formal algorithm.

---

## Composition and Merging

When combining infected values (e.g., in arithmetic or tuple construction), the
result infection is domain-defined and must be deterministic.

Implementation-defined (must be documented):
- Any domain ordering/canonicalization rules if multiple domains appear.

---

## Relationship to HM Inference

Canonical Workman intends infection to fit HM-style inference. That implies:
- infection constraints must integrate with unification/generalization
- solutions must be stable and deterministic for the same program

Normative (v1 generalization boundary with infection):
- Workman allows infection propagation to cross `let`/function boundaries when
  represented in inferred types/schemes.
- There is no blanket requirement to discharge infection before a binding can be
  generalized.
- Domain/effect constraints must not be dropped at `let` boundaries.
- Rejection happens at explicit domain/policy boundaries (for example pure or
  domain-specific boundary rules), not as a global anti-infection rule.

Implementation-defined (must be documented):
- The concrete scheme encoding for infection/domain constraints (for example,
  explicit row components vs equivalent canonical encoding), provided it
  preserves the normative behavior above.


# Elaboration and Lowering (Normative Boundary)

This section defines the boundary between:
- what the language **means**
- what a compiler is allowed to **desugar/elaborate**

Canonical Workman allows compilers to elaborate programs into an explicit IR,
but that elaboration must preserve the defined semantics.

---

## Desugaring vs Semantics

Normative:
- If two surface programs are defined as equivalent by this manual, they must
  behave identically in all conforming implementations.
- If the manual does not state an equivalence, compilers must not silently
  change behavior under “desugaring”.

Examples of intended sugar (must be specified elsewhere):
- `if/else` as sugar for boolean `match`
- operator syntax as sugar for function calls

---

## Infection Elaboration

Compilers may implement infection by elaborating into explicit operations
(e.g., carrier call/match helpers), but:

- The manual must define when infection propagation happens.
- Elaborated forms must be observationally equivalent to the surface program.

This chapter is where we prevent “the compiler happens to do X today” from
becoming accidental language behavior.



# FFI and Raw Mode (Normative Boundary)

Canonical Workman may support FFI, but canonical semantics must clearly
separate:

- safe, portable language meaning
- explicit unsafe/interop boundaries

---

## Canonical FFI (Wrappers)

Normative direction:

- Canonical Workman does not expose backend-native primitives directly (e.g.,
  Zig pointers) as ordinary language constructs.
- FFI is expressed via typed wrapper modules that:
  - declare ABI-safe types explicitly
  - isolate unsafe behavior behind a small API

What counts as ABI-safe must be specified before this section is complete.

---

## Raw Mode (Non-Canonical, Future Work)

Raw Workman is a proposed future extension intended for direct interop with the
target language (e.g., Zig), including:

- native types
- raw calling conventions
- target-specific constructs

Raw mode is **not** part of canonical Workman v1. Any mention of directives such
as `@raw;`, `@backend("zig");`, or block-scoped backend targets is aspirational
and provided only to guide future design. The canonical specification does not
define their syntax, semantics, or safety guarantees.

Non-normative note (current implementation reality):
- Some Workman implementations expose additional expression forms in *raw Zig*
  mode for interop/ergonomics. These are **not canonical v1** and must not be
  relied on by portable code. Examples include:
  - index expressions `target[index]` over raw pointer/slice-like values
  - the `value :> target[index]` write sugar (elaborating to
    `write(target, index, value)` under the host/toolchain's `write` binding)

Future work must supply:

- A dedicated grammar supplement describing backend directives.
- A normative account of the safety/infection boundary for raw code.
- Examples and conformance tests showing how mixed canonical/raw modules
  operate.


# Backend Contract: Zig (Normative, Minimal)

WMC is defined with a Zig backend contract as part of the reference language
implementation boundary. This section defines the **minimal** semantic contract
that Zig implementations of WMC must preserve.

This contract defines what the Zig backend must preserve at the semantic
boundary. Detailed implementation direction (specialization-first compilation,
representation planning, and fallback strategy) is specified in
`./3-wmc-profile.md` and `./4-wmc-compiler-architecture.md`.

This section is intentionally minimal and should not be read as implying
multiple WMC backend "modes".

---

## Required Semantic Preservation

The Zig backend must preserve:

- The evaluation order specified in `plans/workmancanonical/5. Dynamic semantics/1-values-and-evaluation.md`.
- The match semantics specified in `plans/workmancanonical/5. Dynamic semantics/2-control-flow-and-pattern-matching.md`.
- The typing and infection semantics specified in the static semantics and
  infection chapters.

---

## Runtime Errors and Panic

Normative:
- `Panic(msg)` must abort execution with an unrecoverable failure.

Implementation-defined (must be documented):
- how panics are surfaced (exit code, stack trace)
- whether location info is included

---

## Representation and Layout

WMC does not prescribe a universal runtime object model as the primary
execution architecture.

Normative:
- The Zig backend must support runtime/helper machinery for cases where full
  compile-time specialization is not possible.
- Boxed/generic representations may be used for those fallback cases, provided
  canonical observable behavior is preserved and implementation-defined details
  are documented.
- Such fallback machinery does not define the primary architecture of WMC.

Canonical Workman does not, by default, guarantee:
- record layout
- ADT layout
- pointer stability

If a Zig backend exposes FFI surfaces, it must do so through the FFI wrapper
rules in `plans/workmancanonical/7. Interop and backend contracts/1-ffi-and-raw-mode.md`.


# WMC Profile (Performance-Oriented, Manual Memory)

## Scope

Defines the reference implementation direction for WMC: a high-level Workman
language experience with performance-oriented compilation and explicit memory
control, without relying on a large VM-style runtime.

## Status

Draft (normative where explicitly marked).

## Dependencies

- `../1-introduction.md`
- `../5. Dynamic semantics/1-values-and-evaluation.md`
- `./2-backend-contract-zig.md`
- `./1-ffi-and-raw-mode.md`

---

## Design Intent

WMC is intended to feel like its own language, not a thin syntax layer over Zig.
At the same time, it targets systems-level performance and explicit resource
control.

This profile therefore commits to:

1. Preserving canonical Workman semantics.
2. Preferring compile-time specialization over runtime boxing/dispatch.
3. Exposing explicit memory/resource operations as first-class language
   constructs.
4. Avoiding a large VM runtime as the default execution model.

---

## Normative Goals

### 1. Semantic preservation first

WMC must preserve canonical observable behavior unless this profile explicitly
declares a backend-specific extension.

### 2. Minimal runtime model

WMC must not use a universal boxed-value VM runtime as the default execution
model for canonical code.

Normative:
- WMC must use type-directed specialization and concrete/unboxed
  representations by default whenever compile-time typing and analysis make
  them safe.
- A universal boxed representation is permitted only as a fallback for cases
  where specialization cannot be proven correct or cannot yet be implemented.
- The implementation must provide such fallback support, because full
  specialization cannot be guaranteed in all cases.
- Such fallback use must not define the primary runtime architecture, and must
  not change canonical observable behavior.

Implementations may still include small helper runtime libraries for:
- allocation helpers
- panic and diagnostics plumbing
- platform integration

but these helpers must not redefine language semantics.

### 3. Type-directed specialization

Normative:
- WMC must specialize representations and operations whenever static typing and
  analysis make it safe and the implementation has a corresponding specialized
  lowering path.

Implementation-defined (must be documented):
- Which constructs currently fall back to boxed lowering because a specialized
  lowering path is not yet implemented.

Examples:
- direct primitive operations instead of boxed operator dispatch
- concrete data layout for known ADTs/records
- monomorphized or specialized function bodies where profitable

### 4. Explicit memory control

WMC is to expose explicit memory/resource control APIs in a backend
profile surface, provided canonical semantics remain clear at the boundary.

Memory/resource behavior that is profile-specific must be documented as such and
must not be silently treated as canonical Workman behavior.

---

## Required Compiler Architecture Implications

To satisfy this profile, implementations should include:

1. A typed core IR (`TCore`) that is independent of surface syntax details.
2. A lowered optimization/codegen IR (`MIR`) with explicit control/data flow.
3. An explicit match-lowering stage (decision-tree style), not ad hoc emitter
   pattern expansion.
4. A representation-planning stage that decides boxed vs unboxed data from
   typing and escape/lifetime information, with boxed fallback treated as an
   exceptional path rather than the default codegen strategy.

---

## Non-Goals

1. Reintroducing a mandatory VM-like universal `Value` representation as the
   primary execution model.
2. Making WMC merely a Zig syntax frontend.
3. Hiding memory/resource behavior behind undocumented backend magic.

---

## Open Items

The following must be specified before this profile can be considered stable:

1. Which memory/resource APIs are canonical-profile extensions vs non-canonical.
2. Numeric specialization policy (`Number` strategy, fixed-width coercions,
   overflow behavior under specialization).
3. Conformance tests for typed specialization (to guarantee no semantic drift
   from canonical behavior).


# WMC Compiler Architecture (Non-Normative, Provisional)

This document records the current implementation direction for the WMC
compiler/backend.

Status:
- Provisional.
- Non-normative.
- Intended to guide experimentation, not freeze detailed compiler design.

Scope:
- WMC backend/compiler architecture direction.
- Relationship to Workman v0.

Out of scope:
- Canonical language semantics (defined elsewhere in this reference).
- Full IR design lock-in.
- Optimization policy details.

## 1. Positioning

WMC is a new, spec-first implementation.

Historical note:
- Workman v0 was a research/experimental implementation used to explore ideas.
- v0 does not define the WMC compiler architecture.
- WMC is not a "v0.1" or an incremental continuation of the v0 codebase.

Implication:
- Reuse from v0 is optional and opportunistic (ideas, tests, examples).
- WMC does not need to preserve v0 internal runtime, IR, or codegen structure.

## 2. Stable Goals (Current)

These goals are stable enough to guide backend bring-up:

1. Preserve canonical semantics.
2. Prefer compile-time specialization and concrete/unboxed representations.
3. Use boxed/generic representations only as fallback.
4. Keep runtime support minimal (helpers/diagnostics/panic), not a universal VM.
5. Keep architecture explicit enough to support match lowering and
   representation planning.

## 3. What Is Intentionally Not Locked Yet

The following should be decided through implementation experiments before being
documented as fixed architecture:

- Exact `TCore` shape.
- Exact `MIR` shape.
- Closure representation details.
- Monomorphization vs other specialization policies in borderline cases.
- Infection lowering internal encoding.
- Representation-planning heuristics (escape/lifetime strategy, thresholds).

## 4. Expected Compiler Shape (Minimal Direction)

WMC should use a typed, multi-stage compiler pipeline rather than a runtime-VM
execution model.

Minimal direction (subject to refinement):
1. Parse / module resolution / type inference.
2. Elaboration of specified surface sugar only.
3. Typed core IR (retain enough structure for semantics-preserving lowering).
4. Explicit match lowering (decision-tree style).
5. Lowered codegen/optimization IR with explicit control flow.
6. Representation planning (specialized/unboxed by default, boxed fallback when
   required).
7. Zig code generation plus small runtime support.

This is a direction, not a frozen pass list.

## 5. Semantic Guardrails During Experimentation

Experiments must not relax these semantic requirements:

- Deterministic evaluation order (including left-to-right forms).
- `match` scrutinee evaluated exactly once.
- Match arm order and guard timing.
- Canonical exhaustiveness/non-exhaustive behavior.
- Infection semantics as language semantics (not backend-only behavior).
- `Panic(msg)` as unrecoverable failure.

## 6. Fallback Policy (Provisional)

Boxed/generic lowering is allowed during bring-up, but only under this policy:

- It is a fallback path, not the default architecture.
- It must preserve canonical observable behavior.
- Fallback use should be documented as implementation status, not language
  behavior.

Future work:
- Add a concrete list of fallback cases and a tracking policy once backend
  experiments identify the real pressure points.

## 7. Relationship to Other Backend Docs

- `/Users/profilence/git/workmangr/docs/backend/wmc_backend_input_contract.md`
  defines the frontend/backend handoff.
- `/Users/profilence/git/workmangr/docs/backend/wmc_conformance_matrix.md`
  tracks semantic coverage requirements.
- `/Users/profilence/git/workmangr/docs/backend/wmc_backend_readiness_*`
  documents readiness and gating.

This document only states architectural direction and non-goals for the
experimentation phase.


# Standard Library Surface (Semi-Normative)

This section defines only the standard library behaviors that affect program
semantics.

The full stdlib API reference should live elsewhere. This chapter should remain
small and focused.

---

## Core Types

At minimum, canonical Workman expects standard definitions for:
- `Option<T>`
- `Result<T, E>` and infectious `IResult<T, E>`
- infectious `IOption<T>`

These definitions are semantically significant because they interact with:
- pattern matching (coverage)
- infection propagation/discharge (carriers)

### Result vs IResult (Normative)

- `Result<T, E>` behaves like a conventional algebraic result type in other
  languages (explicit success/failure value).
- `IResult<T, E>` is identical in shape and meaning to `Result<T, E>`, but is
  **infectious**: it propagates through expressions according to the infection
  rules.

Guidance:
- Use `Result` when you want explicit, local handling and no automatic
  propagation.
- Use `IResult` when you want automatic propagation through ordinary
  expressions.

### Option vs IOption (Normative)

- `Option<T>` behaves like a conventional option type in other languages.
- `IOption<T>` is identical in shape and meaning to `Option<T>`, but is
  **infectious**: it propagates through expressions according to the infection
  rules.

---

## IO and Effects

If IO is exposed, the manual must specify:
- what is considered observable output
- how IO interacts with infection domains (if at all)

This chapter is intentionally incomplete until the IO surface is stabilized.


# Formal Core (Appendix, Draft)

This appendix will define a small “core calculus” for canonical Workman.

Purpose:
- Provide a canonical meaning for tricky features (match coverage, infection).
- Serve as a target for conformance tests and future executable/reference
  semantics.

Non-goal:
- Fully formalize the entire surface syntax. The surface can be desugared into
  this core.

---

## Planned Core Constructs

Expressions:
- literals, variables
- lambda/application
- let / let-rec
- tuples, records (or a simpler product encoding)
- algebraic data + match
- explicit infection/carrier operations (or explicit typing judgements)

Typing:
- HM scheme rules for `let`
- pattern typing rules
- infection constraint rules

Evaluation:
- small-step or big-step semantics with fixed evaluation order

---

## Relationship to Match Design

The rigorous match model (inverse clauses, conjunction, coverage proofs) should
be captured here once stabilized.

See:
- `plans/coreirRefactor/match_refactor_plan.md`



# Glossary

Terms used throughout the canonical Workman manual.

- **ADT**: Algebraic Data Type; a nominal sum type with constructors.
- **Arm**: A single `match` clause: `pattern (when guard)? => { body }`.
- **Carrier**: An infectious type with `@value` and `@effect` constructors.
- **Canonical Workman**: The base language defined by this manual.
- **Conformance**: An implementation property meaning it obeys all “must”
  requirements of the manual.
- **Domain**: A named infection domain defining propagation and merge rules.
- **Elaboration**: Compiler transformation that makes implicit semantics
  explicit while preserving meaning.
- **Infection**: The language’s typed propagation mechanism (effect-like),
  described in the infection chapters.
- **Pinned pattern**: A pattern identifier that matches an existing value.
- **Var pattern**: `Var(x)` which introduces a new binding.



# Changelog (Canonical Workman Manual)

This changelog records semantic changes to the canonical Workman manual.

Guidelines:
- Every entry should mention which section changed and whether it is breaking.
- If behavior was previously unspecified and becomes defined, record that too.

## Unreleased

- Initial manual skeleton added and organized into numbered folders.
- Added `7. Interop and backend contracts/3-wmc-profile.md` to define the WMC
  implementation profile (performance-oriented, minimal-runtime, type-directed
  specialization, explicit memory control).


