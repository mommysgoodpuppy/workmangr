# Unified Arrow Model (`pattern => body`)

## 1. Goal

This document defines a unified model where:

- lambda parameters and match arms are the same construct
- `=>` always introduces a clause
- functions and matches share one core representation

The intent is a single semantic system, with fewer special cases in AST, typing, and tooling.

## 2. Core Principle

A function is a list of clauses.  
Each clause has:

- one input pattern
- optional guard
- body block

Conceptually:

- `pattern => body` is the only arrow form
- `(x) => { ... }` is a one-clause function
- `match(v) { p1 => b1, p2 => b2 }` is application of a clause-list function to `v`

## 3. Canonical Core Forms

Core expressions:

- `Fn(FnExpr)`
- `Apply(callee, arg)` (single argument only)

Core function structures:

- `FnExpr(items: List<FnItem>)`
- `FnItem = Clause | Include | Trivia | Hole`
- `Clause(param: Pattern, guard: Option<Expr>, body: Block)`

Notes:

- Multi-argument functions are represented by tuple patterns.
- Multi-argument calls are represented by tuple arguments.

## 4. Unification Rules

Surface forms normalize to the same core shape:

1. `(p) => { body }`  
   Normalizes to `Fn([Clause(p, None, body)])`

2. `match(x) { clauses }`  
   Normalizes to `Apply(Fn(clauses), x)`

3. `match(a, b) { clauses }`  
   Normalizes to `Apply(Fn(clauses), Tuple(a, b))`

4. `f(a, b)`  
   Normalizes to `Apply(f, Tuple(a, b))`

## 5. Clause Semantics

Given `Apply(Fn(items), arg)`:

1. Evaluate clauses in source order.
2. First clause whose pattern matches `arg` and whose guard is true is selected.
3. The selected clause body is evaluated with bindings from the pattern.
4. If no clause matches, behavior is defined by language policy.

## 6. Non-Match Policy (Required Language Choice)

The language must choose one of:

1. Static exhaustiveness required (compile-time error if partial)
2. Runtime match failure on missing clause
3. Typed unmatched channel (e.g. implicit `Option`/`Result`)

Recommended initial policy: runtime failure, with optional later exhaustiveness checking.

## 7. Typing Shape

Under tuple-argument canonicalization:

- function type is `Arg -> Ret`
- `Arg` may be tuple type for multi-parameter functions

Examples:

- `(x) => { ... }` has type `A -> B`
- `(x, y) => { ... }` has type `(A, B) -> C`

Currying, if supported, should be an elaboration/type-policy feature, not core AST meaning.

## 8. Why This Model

This unification gives:

- one arrow meaning (`pattern => body`)
- one callable core (`Fn`)
- one call core (`Apply`)
- consistent treatment of holes/trivia/formatting across lambda and match
- cleaner lowering and fewer ad-hoc AST node splits

## 9. Migration Guidance

During transition, legacy nodes may coexist. Final target should satisfy:

- no semantic distinction between “lambda clause” and “match case”
- all callable values normalize to `Fn`
- all invocation normalizes to single-arg `Apply`
- tuple is the only arity encoding mechanism in core
