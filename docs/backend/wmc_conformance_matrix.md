# WMC Canonical Conformance Matrix (Backend Prerequisite)

This matrix tracks canonical spec conformance relevant to backend work.
Items explicitly marked as iterative/non-blocking may continue during backend bring-up.

Legend:
- `Implemented`: behavior exists and is covered by tests.
- `Partial`: behavior exists but is incomplete, underspecified, or not yet test-locked.
- `Missing`: behavior not yet implemented in canonical path.
- `Open Spec`: reference section is intentionally draft/open and requires a project decision (may be non-blocking for backend start when explicitly marked as iterative).

## Matrix

| Spec Area | Status | Current Evidence | Backend Risk if Unfixed | Required Closure |
| --- | --- | --- | --- | --- |
| `1. Front matter/1-introduction.md` conformance boundaries | Partial | Canonical docs include explicit backend input contract (`docs/backend/wmc_backend_input_contract.md`) and executable gate command (`deno task test:wmc-conformance`) | Backend may encode behavior not guaranteed by spec | Keep conformance command stable in day-to-day workflow (CI optional) |
| `2. Source text/1-lexical-structure.md` ASCII restriction | Implemented | Lexer emits diagnostics for non-ASCII (`src/frontend/lexer.gr`) | Low | Keep regression tests |
| `2. Source text/2-grammar.md` top-level directives and semicolons | Partial | Parser supports directives/import/export/reexport, match-form disambiguation, and `mut` let-group parsing, with coverage in parser tests (`src/frontend/parser.gr`, `tests/parser_semicolon_test.gr`) | Parser/backend mismatch on accepted forms | Continue expanding parser conformance tests by grammar production |
| `2. Source text/2-grammar.md` canonical directive semantics (`@core` only) | Implemented | `program.core` inferred from directive (`src/frontend/parser.gr`), with explicit `@core` vs unknown-directive tests in `tests/parser_semicolon_test.gr` | Low | Keep directive regression tests |
| `3. Program structure/1-modules-and-names.md` cycle rejection | Implemented | Module graph cycle diagnostics in `src/module/module_system.gr`; tests in `tests/module_system_test.gr` | Medium if regresses | Keep + extend cycle path diagnostics tests |
| `3. Program structure/1-modules-and-names.md` module identity canonicalization | Implemented | Path normalization/resolution exists (`src/module/module_system.gr`) with equivalent import/entry spelling coverage (including Windows-style paths) in `tests/module_system_test.gr` | Low | Keep canonicalization regression tests |
| `3. Program structure/2-declarations.md` mutual recursion semantics | Implemented | `let rec`/`and` supported and now test-locked including downstream polymorphic uses in `tests/infer_test.gr` | Low | Keep mutual-rec regression tests |
| `4. Static semantics/1-types.md` canonical type surface | Partial | Type system implemented in `src/core/types.gr` and infer stack | Drift between spec names and implemented nominals | Add type-surface contract tests and doc mapping |
| `4. Static semantics/1-types.md` `Number` semantics (sum int/float) | Partial | Canonical semantics are specified in reference docs; typing support exists, but runtime/backend preservation is not fully test-locked | Numeric behavior drift in backend | Add conformance tests that enforce existing canonical numeric contract |
| `4. Static semantics/2-type-inference.md` HM generalization boundaries | Implemented | Layered inference + tests (`src/core/infer.gr`, `tests/infer_test.gr`), including regression coverage for recoverable infer anomalies (diagnostic + continuation) | Medium if edge-cases remain untested | Add explicit group-generalization tests |
| `4. Static semantics/2-type-inference.md` generalization policy decision | Implemented | Spec now defines v1 policy-boundary-aware generalization in `docs/reference/4. Static semantics/2-type-inference.md` | Medium if implementation drifts from policy | Add/expand conformance tests for explicit policy-boundary enforcement |
| `4. Static semantics/2-type-inference.md` infection + generalization integration | Implemented | Spec now defines infection-preserving generalization and explicit-boundary rejection in `docs/reference/4. Static semantics/2-type-inference.md` + `docs/reference/6. Infection system/2-infection-types-and-composition.md` | Medium if solver encoding diverges | Add executable tests ensuring infection is preserved in schemes and rejected only at explicit boundaries |
| `5. Dynamic semantics/1-values-and-evaluation.md` left-to-right evaluation | Partial | Lowering order is test-locked for call args, pipe elaboration arg prepending/order, record fields, and match scrutinee (`tests/lowering_test.gr`) | Codegen may still reorder side effects without end-to-end preservation checks | Add dynamic preservation tests during backend bring-up |
| `5. Dynamic semantics/1-values-and-evaluation.md` assignment semantics | Partial | Assignment lowering shape/order plus `mut` group lowering are covered (`tests/lowering_test.gr`), but mutability/runtime semantics are still unspecified/untested | Incorrect mutability semantics in backend | Add assignment/mutability semantic tests (non-blocking for current backend-start milestone; iterative closure during backend experimentation) |
| `5. Dynamic semantics/2-control-flow-and-pattern-matching.md` exhaustive match contract | Partial | Non-exhaustive/empty-clause and unsupported-pattern recovery paths emit diagnostics (no runtime panic in canonical inference/lowering paths) with coverage in `tests/infer_test.gr`, `tests/lowering_test.gr`, and `tests/module_infer_test.gr` | Remaining risk is full formal coverage semantics, not crash behavior | Continue expanding coverage-rule test matrix while formal model is drafted |
| `5. Dynamic semantics/2-control-flow-and-pattern-matching.md` pin vs `Var` semantics | Implemented | Parser/lowering + inference test-lock bare identifier pinning, explicit `Var(...)` binding, constructor-arg binders, and tuple bare-identifier pinning in `tests/lowering_test.gr` and `tests/infer_test.gr` | Low | Keep pin-vs-bind regression tests |
| `6. Infection system/1-3` semantic boundaries | Partial | Minimal canonical infection propagation + explicit-boundary rejection model is now frozen in reference docs; broader infection semantics remain draft | Medium-high until full formalization lands | Expand infection conformance suite and formalization detail |
| `7. Interop/1-ffi-and-raw-mode.md` raw-mode separation | Partial | Canonical parser behavior test-locks raw-like directives as non-canonical/no-op for core mode and rejects backend-target directive args (`tests/parser_semicolon_test.gr`) | Backend scope creep and semantic contamination | Maintain a minimal raw-boundary smoke suite now; defer full boundary matrix while syntax evolves |
| `7. Interop/2-backend-contract-zig.md` required preservation contract | Partial | Contract documented; preservation-oriented tests now cover evaluation-order lowering, match pin/bind behavior, module-level Panic typing, and typed-handoff diagnostics propagation (`tests/lowering_test.gr`, `tests/infer_test.gr`, `tests/module_infer_test.gr`) | Remaining gap is true backend codegen/runtime preservation tests | Defer backend codegen/runtime preservation checks until backend behavior/design stabilizes |
| `8. Standard library/1-stdlib-surface.md` canonical std minimum (`Option`/`Result`/infectious variants) | Partial | Prelude + fixture coverage exists (`tests/fixtures/workman_std`) | Backend bootstrap gaps for canonical programs | Expand std conformance tests and export contracts |
| `9. Appendices/1-formal-core.md` formal core | Open Spec | Explicitly draft; treated as iterative/non-blocking for backend start by readiness-gate decision | Ambiguity in lowering/canonical IR semantics | Maintain interim executable conformance suite until formal core lands |

## Existing Test Baseline

Current tests already provide useful coverage and should be treated as seed gates:
- `tests/module_system_test.gr`
- `tests/module_infer_test.gr`
- `tests/infer_test.gr`
- `tests/lowering_test.gr`
- `tests/analysis_test.gr`

## Immediate Priority Buckets

### P0 (highest during backend bring-up)
- Lock executable tests for newly-frozen policy-boundary-aware generalization + infection boundaries.
- Lock remaining match coverage semantics beyond current test set.
- Lock evaluation-order guarantees with targeted dynamic tests.

### P1 (close during backend bring-up)
- Expand parser grammar conformance suite (focused, not exhaustive while syntax is in flux).
- Tighten module identity/path canonicalization tests.
- Standard-library canonical surface conformance checks.
- Maintain typed handoff stability for `ModuleGraph`, `ModuleSummary`, and diagnostics shape.
- Keep backend-preservation E2E checks deferred until backend behavior/design
  stabilizes.

### P2 (post first backend milestone)
- Exhaustive raw-boundary separation matrix.
- Formal-core alignment and proof-oriented coverage artifacts.
- CI branch-protection/required-check policy hardening (optional for solo workflow).
