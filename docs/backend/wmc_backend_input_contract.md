# WMC Backend Input Contract (Canonical)

This document defines the canonical frontend/core handoff that a backend may
assume before code generation.

Scope:
- Canonical Workman (`WMC`) only.
- Raw/non-canonical behavior is out of scope.

## 1. Entry Handoff Artifact

Backends consume `ModuleInfer.InferenceResult` from
`/Users/profilence/git/workmangr/src/core/module_infer.gr`.

Required shape:
- `graph: ModuleSystem.ModuleGraph`
- `modules: Map<String, ModuleSummary>`
- `diagnosticsById: Map<String, List<Error.CompilerError>>`

Contract:
- `graph.entry` is canonicalized (normalized path + `.wm` extension).
- `graph.topo` is dependency order for modules present in `graph.nodes`.
- `modules` is keyed by canonical module id (same key-space as `graph.nodes`).
- `diagnosticsById[moduleId]` must correspond to the diagnostics reported by
  that module summary.

## 2. Module Graph Contract

From `/Users/profilence/git/workmangr/src/module/module_system.gr`.

`ModuleNode` contract for each module id:
- `id`: canonical module id used as stable identity.
- `sourcePath`: resolved source path.
- `imports`: resolved canonical module ids in source order.
- `reexports`: resolved canonical module ids in source order.
- `program`: parsed `SurfaceAst.Program` for that source.
- `diagnostics`: parse/module diagnostics.
- `status`: `StatusOk | StatusPartial | StatusFailed`.

Conformance assumptions:
- Equivalent path spellings (including Windows-style separators) canonicalize
  to a single identity.
- Cycle diagnostics are emitted without crashing graph construction.

## 3. Typed Module Summary Contract

From `/Users/profilence/git/workmangr/src/core/module_infer.gr`.

`ModuleSummary` contract:
- `moduleId`: canonical module id.
- `program`: lowered `CoreAst.Program` consumed by type inference.
- `infer`: full `Infer.InferState` for the module.
- `typeEntries`: `(span, type)` lookup entries for tooling.
- `valueExports`: exported value schemes visible to dependents.
- `typeExports`: exported nominal type information visible to dependents.
- `diagnostics`: merged diagnostics for this module.

Diagnostic merge contract:
- `diagnostics` includes parse/module diagnostics from `ModuleGraph`,
  lowering diagnostics emitted while building lowered `CoreAst`, and
  type-inference diagnostics from infer marks.
- `diagnosticsById[moduleId]` must match `modules[moduleId].diagnostics`.

Backend-required invariants:
- Type inference should continue after non-fatal type marks and emit
  diagnostics instead of panicking.
- Lowering/inference recovery paths for unsupported or inconsistent constructs
  must emit diagnostics and continue producing a typed module summary.
- Non-exhaustive matches must surface diagnostics on the owning module.
- `Panic` is available as a builtin with polymorphic abort typing
  (`String -> 'a`) for typing continuity.

## 4. Diagnostics Contract

From `/Users/profilence/git/workmangr/src/core/error.gr`.

`Error.CompilerError` fields:
- `stage`
- `severity`
- `message`
- `span` (`line`, `col`, `start`, `end`)
- `clues`

Contract:
- Backend-facing tooling must preserve these fields when relaying diagnostics.
- `span.start <= span.end`, and `line/col >= 1`.
- Stage and severity values are stable enum domains.

## 5. Semantic Preservation Expectations

Backends must preserve canonical semantics from the reference docs:
- Evaluation order (left-to-right forms + pipe elaboration behavior).
- Match behavior (arm order, guard gating, pin-vs-bind semantics).
- Panic behavior (`Panic(msg)` is unrecoverable abort).

Current status:
- Frontend/core conformance is test-locked for lowering/inference properties.
- End-to-end backend runtime/codegen preservation tests are deferred for
  backend-start readiness and will be defined/expanded during backend bring-up.

## 6. Non-goals and Open Items

Not assumed by this contract:
- Fine-grained solver encoding details for policy-boundary checks.
- Exact internal representation of infection/domain constraints.
- Raw-mode behavior or FFI layout guarantees.

Backends must not infer behavior beyond what is explicitly documented here and
in canonical spec chapters.
