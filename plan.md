# WMC Reboot Plan

## Goal

Rework `src/backend/wmc` so it is structurally much closer to the v0 compiler in
`/home/ellie/git/workman/backends/compiler`, while keeping the current WMC
type/inference implementation as the semantic source of truth.

This is a reboot toward a compiler that is:

- honest
- simple
- executable in shape
- Zig-oriented
- runtime-light
- focus on KISS

This is not a plan to preserve the previous `wmc` reboot attempt as-is, and not
a plan to chase premature optimization.

## Core Principles

1. Keep the current WMC type system and inference layer.
2. Move the backend architecture closer to v0's successful shape.
3. Prefer a small executable typed core over multiple speculative IR layers.
4. Avoid MIR entirely for now.
5. Treat monomorphization as mandatory from the beginning.
6. Emit readable Zig rather than highly optimized or heavily transformed Zig.
7. Let Zig/LLVM do later optimization work.
8. Avoid introducing a large runtime or universal boxed-value architecture.

## What We Keep From Current WMC

These parts appear generally successful and should remain foundational:

- `src/core/infer.gr`
- `src/core/types.gr`
- `src/core/env.gr`
- module inference/loading pipeline
- current language semantics from `docs/reference`
- infection/type integration in inference

Backend passes should consume this semantic layer, not reimplement it.

## What We Reuse From v0

v0 is the better reference for compiler shape and lowering strategy.

The parts to reuse conceptually are:

- typed executable core pipeline shape
- normalization toward a smaller executable subset
- monomorphization as a primary compilation strategy
- direct lowering mindset
- avoiding unnecessary intermediate machinery

The parts not to copy blindly are:

- over-ambitious optimization/planning layers
- premature backend cleverness
- anything tied to old language semantics where WMC has intentionally diverged

## Target Pipeline

The intended near-term pipeline is:

1. Parse / module graph / inference
2. Project to typed backend core IR
3. Normalize/desugar to a smaller executable core
4. Monomorphize reachable polymorphic bindings
5. Lower directly to readable Zig

Not in scope for now:

- MIR
- advanced representation planning
- aggressive optimization passes
- unreadable "hyper-optimized" emitted Zig

## Core IR Direction

`wmc` core IR should be executable-oriented, similar to v0, but simpler and
more directly grounded in the current WMC type system.

It should preserve enough structure to support:

- `let`
- `let rec`
- lambdas
- application
- tuples
- nominal records
- nominal constructors / ADT values
- explicit `match`
- guards
- typed bindings and expressions

It should normalize away surface sugar such as:

- `if/else` into boolean `match`
- operator syntax into ordinary calls or explicit backend intrinsics
- surface grouping/import/export forms into module metadata plus bindings

It should not erase semantics too early:

- scrutinee-once behavior
- match arm order
- guard timing
- constructor identity
- generalization boundaries
- infection-relevant typed structure

## Why No MIR Yet

MIR is deferred because it is not yet necessary to make progress on:

- correctness
- readability
- direct Zig lowering
- monomorphization

If a later stage proves necessary for control-flow lowering or backend cleanup,
it can be introduced then. For now it would mostly add complexity.

## Why Monomorphization Is Required

Monomorphization is not an optional optimization pass in this design.

Because the target is Zig and the priority is to avoid a large runtime,
monomorphization is the default implementation strategy for polymorphism.

Without it, the compiler would likely drift toward:

- erased polymorphism
- boxed/generic runtime values
- indirect runtime machinery

Those are specifically what this reboot is trying to avoid.

## Monomorphization Strategy

Default approach: replicate the v0 strategy as closely as practical.

The plan is to port the strategy, not reinvent it.

Expected characteristics:

- monomorphize after normalization
- track reachable instantiated bindings from program roots
- specialize by concrete instantiated types
- generate stable specialized names
- keep only reachable instances
- prefer simple type-based specialization keys

Things to verify during porting:

- what v0 assumes about callable shapes
- what v0 assumes about `match`
- what v0 assumes about infection having already been lowered or erased
- what IR shape v0 expects for top-level/global bindings

## KISS Rules

To keep this reboot from repeating the previous failed attempt:

1. Do not introduce a new IR unless it removes real complexity.
2. Do not add backend metadata layers that are not used for compilation.
3. Do not move typing logic into backend passes.
4. Do not optimize for hypothetical future performance problems.
5. Prefer "unsupported for now" over fake-general pipeline scaffolding.
6. Prefer direct, readable Zig output over backend cleverness.
7. Keep each pass narrow and explicit.

## Near-Term Work Items

### 1. Stabilize typed backend core projection

Continue building `src/backend/wmc/core_ir.gr` and
`src/backend/wmc/core_stage.gr` as the typed backend-facing projection from:

- `CoreAst`
- `InferState`
- module summaries

This should become the real backbone of backend work.

### 2. Add core normalization pass

Add a new pass, likely `src/backend/wmc/core_norm.gr`, with a deliberately
narrow job:

- canonicalize top-level value forms
- normalize lambdas/applications
- rewrite `if/else` to `match`
- normalize pattern structure
- expand or canonicalize match surface constructs as needed
- produce a smaller executable subset suitable for monomorphization

### 3. Port monomorphization from v0

Use the v0 monomorphization strategy as the template and adapt the new WMC core
shape to it.

Important constraint:

- shape the new core so monomorphization fits naturally, rather than inventing
  a totally new monomorph pipeline

### 4. Direct Zig lowering

Once normalized core + monomorphization are working, lower directly to Zig.

Initial goals:

- correct
- readable
- small runtime footprint

Not initial goals:

- highly optimized emission
- complex representation planning

## Non-Goals

This reboot is not trying to:

- preserve the previous `wmc` architecture just because it already exists
- build a MIR-first compiler
- make emitted Zig maximally optimized from day one
- recreate a universal runtime value model
- solve every specialization/representation problem up front

## Immediate Next Step

The next concrete task should be:

1. design the normalized executable core around the current inferred WMC typed
   projection, and
2. inspect v0 monomorphization in detail so the new core is made compatible
   with that strategy on purpose.

**Checklist**

Here’s the honest path to getting `wm run simple.wm` to actually run Workman code, while staying broadly v0-shaped without pretending WMC is just v0 again.

1. Make the backend graph carry the real data we’ll need.
   `src/backend/wmc/core_ir.gr`
   `src/backend/wmc/core_stage.gr`
   Right now we mostly project value bindings plus some names. That is enough for a scaffold, but not enough for executable lowering.
   We need to add:
   - type declarations with bodies
   - record declarations with fields
   - constructor metadata
   - enough resolved import/export info to know where values and types come from
   - any backend-only metadata we decide is necessary for monomorphization keys and Zig naming

2. Keep the current semantic source of truth, but make the backend projection intentionally executable-oriented.
   `src/core/infer.gr`
   `src/core/module/module_infer.gr`
   `src/backend/wmc/core_stage.gr`
   This is the WMC equivalent of v0’s “lower analyzed module to typed core” step.
   Requirements:
   - do not re-typecheck in the backend
   - preserve typed structure needed for match, guards, constructors, and infections
   - keep scrutinee-once and arm order visible
   - allow backend passes to consult surface AST only as a special-case escape hatch, not as the main representation

3. Expand normalized core so it is truly the backend executable subset.
   `src/backend/wmc/core_norm.gr`
   Today normalization is only partial.
   It needs to become the real “small executable core” pass, similar in role to v0’s core executable shape.
   It should fully define support for:
   - top-level `let`
   - `let rec`
   - lambda/function clauses
   - application/call shape
   - tuples
   - constructors and nominal values
   - `match`
   - guards
   - `if` lowered to `match`
   - record literals if we want them in the early subset
   It should also be explicit about what is still unsupported.

4. Decide the normalized call/lambda shape on purpose.
   `src/backend/wmc/core_norm.gr`
   This is the thing we paused on earlier.
   We should choose based on backend simplicity, not habit.
   Options:
   - keep unary apply / unary lambda chains
   - switch to grouped calls and grouped params more like v0
   - use a hybrid if tuples are already the frontend’s call convention
   The rule should be:
   - preserve WMC semantics
   - make monomorphization and Zig lowering simpler
   - do not introduce fake abstraction layers

5. Add a real representation of top-level recursive groups.
   `src/backend/wmc/core_ir.gr`
   `src/backend/wmc/core_norm.gr`
   `src/backend/wmc/core_stage.gr`
   v0 relied heavily on making recursion explicit before later passes.
   We need the same kind of honesty here.
   That means:
   - preserve `CoreAst.Rec` groups distinctly
   - normalize recursive groups into a form monomorphization can traverse
   - avoid losing group structure by flattening too early

6. Carry resolved module dependencies, not just explicit source imports.
   `src/core/module/module_system.gr`
   `src/backend/wmc/core_stage.gr`
   `src/backend/wmc/module_stage.gr`
   This matters because `simple.wm` gets implicit `std/prelude`.
   The backend cannot rely only on explicit `import` syntax.
   We need:
   - resolved module edges from the real module graph
   - clear imported value/type namespaces
   - a policy for implicit prelude in emitted code

7. Add backend indexing for declarations and reachability.
   New pass, probably:
   `src/backend/wmc/core_index.gr`
   or part of future mono pass
   v0 had an implicit “know what bindings/types exist and where” layer before monomorphization/emission.
   We need indexes for:
   - module -> bindings
   - binding name -> normalized binding
   - type name -> declaration
   - constructor -> owning type and payload info
   - entry roots
   - imported references

8. Port the v0-style monomorphization strategy, adapted to WMC types.
   New pass, probably:
   `src/backend/wmc/monomorphize.gr`
   This is one of the biggest missing pieces.
   Similar to v0 in role:
   - start from roots
   - find reachable instantiated bindings
   - specialize by concrete instantiated type
   - emit stable specialized names
   - retain only reachable instances
   But WMC-specific constraints:
   - type/inference layer remains the source of truth
   - infection semantics may need to remain visible longer
   - surface AST access is allowed only for special cases

9. Decide what happens before and after monomorphization for ADTs and records.
   `src/backend/wmc/core_ir.gr`
   `src/backend/wmc/core_norm.gr`
   `src/backend/wmc/monomorphize.gr`
   `src/backend/wmc/zig_emit.gr` or similar
   Questions we need to answer explicitly:
   - do constructors stay nominal until after mono?
   - when are generic ADTs specialized?
   - how are record types named in Zig?
   - how are constructor tags represented?
   This should be v0-like in staging, not necessarily identical in representation.

10. Introduce a real intrinsic/builtin lowering layer.
    New pass or part of Zig emitter:
    `src/backend/wmc/intrinsics.gr`
    or `src/backend/wmc/zig_emit.gr`
    `simple.wm` looks trivial, but it depends on this immediately.
    We need a real story for:
    - `+ - * / %`
    - comparisons
    - `nativeAdd/nativeSub/...`
    - `nativePrint`
    - `Panic`
    - string/list helpers if prelude pulls them in
    This can be done similarly to v0: ordinary calls in core, recognized as backend intrinsics later.

11. Add executable lowering for `main`.
    `src/backend/wmc/graph_emitter.gr`
    or future `src/backend/wmc/zig_emit.gr`
    We need to define what counts as a runnable entrypoint.
    For now probably:
    - `let main = => { ... }`
    - inferred as `Void -> T`
    Then emit Zig entry wiring that:
    - calls `main`
    - handles result type correctly
    - prints or discards only by explicit policy, not by accident

12. Replace the scaffold emitter with a real Zig emitter.
    `src/backend/wmc/graph_emitter.gr`
    This is the current visible blocker.
    The scaffold must be replaced by:
    - module emission
    - imports
    - type declarations
    - value bindings
    - entrypoint
    We should likely split this into:
    - `graph_emitter.gr` for orchestration
    - `zig_emit.gr` for module/expression emission
    - maybe `zig_names.gr` for naming hygiene

13. Start with a deliberately small real Zig subset.
    Initial emitter target:
    - integer literals
    - bool literals
    - tuples if needed
    - top-level lambda as Zig `fn`
    - direct calls
    - arithmetic intrinsics
    - `if` via normalized `match`
    - maybe simple `match` on booleans and small enums
    This is still honest if the compiler clearly errors on unsupported forms.

14. Add match lowering that preserves WMC semantics.
    `src/backend/wmc/core_norm.gr`
    `src/backend/wmc/zig_emit.gr`
    This is one of the most important correctness areas.
    We need to preserve:
    - scrutinee evaluated exactly once
    - arm order
    - guard timing
    - constructor identity
    - non-exhaustive behavior
    v0 is useful here as pipeline shape, but not as semantic authority.

15. Add constructor/ADT Zig lowering.
    `src/backend/wmc/zig_emit.gr`
    `src/backend/wmc/monomorphize.gr`
    Required because `std/core/int.wm` already matches on `Ordering`.
    For `simple.wm` to work through real stdlib code, we will quickly need:
    - enum-like constructors with no payload
    - tagged unions for payload constructors
    - pattern matching on constructors

16. Add minimal support for the stdlib slice needed by `simple.wm`.
    Likely the actual path for `simple.wm` is:
    - `simple.wm`
    - implicit `std/prelude`
    - `std/core/int`
    - `std/coretypes`
    That means our “simple” milestone probably still needs:
    - `Ordering`
    - prelude value imports
    - integer comparison helpers
    - maybe list/string pieces later, but not necessarily for first success

17. Make unresolved unsupported cases fail honestly.
    `src/backend/wmc/core_norm.gr`
    `src/backend/wmc/graph_emitter.gr`
    `src/cli/compile_cli.gr`
    We should stop saying “success” when we only emitted a scaffold.
    Before full support, the compiler should:
    - surface normalization/emission blockers
    - fail compilation on unsupported required backend features
    - keep `wm run` honest

18. Add backend-focused tests for each new stage.
    New tests likely needed:
    - projection tests
    - normalization tests
    - monomorphization tests
    - Zig emission golden tests
    - end-to-end `simple.wm` run test
    Existing relevant file:
    [tests/core_norm_test.gr](/home/ellie/git/workmangr/tests/core_norm_test.gr)

19. Change `wm run` milestone from fake success to real success.
    `src/cli/compile_cli.gr`
    `wmgr.ts`
    End state for this milestone:
    - `wm run simple.wm`
    - compiles to real Zig
    - Zig executes Workman semantics
    - no scaffold banner
    - result is genuinely produced by the Workman backend

**Recommended implementation order**

1. Enrich backend core IR with declarations and resolved module/import info.
2. Make normalized core the real executable subset, including honest recursive-group handling.
3. Add backend indexes and declaration lookup.
4. Implement v0-shaped reachability + monomorphization for the new core.
5. Add intrinsic recognition.
6. Implement real Zig emission for the minimal executable subset.
7. Support constructor/match lowering needed by `std/core/int` and `std/coretypes`.
8. Flip `wm run simple.wm` from scaffold to real execution.
9. Expand supported surface/features after that.

**Honest current status**

Right now the hard blockers are:
- no real Zig emitter yet
- no backend type/constructor declaration model
- no monomorphization
- no honest stdlib executable path
- `wm run` still succeeds via scaffold output

If you want, I can turn this checklist into a tracked `plan.md` update with phases and concrete file-level tasks, then start on phase 1 immediately.