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

Open design decision (must be resolved):

- Whether canonical Workman adopts a value restriction. If adopted, the manual
  must define what counts as a “generalizable value”.
- How infection domains/effect rows interact with generalization (e.g., whether
  infection rows are part of the "generalizable" set).

---

## Annotations

Annotations may appear:

- on bindings: `let x: T = expr;`
- on parameters: `(x: T) => { ... }`
- as local assertions: `expr as T` (if supported)

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
