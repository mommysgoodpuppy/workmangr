# WMC Backend Readiness Gates

This document defines hard gates for starting backend implementation work.

Scope:
- Target = canonical Workman (WMC).
- Non-goal for this gate set = raw mode behavior (explicitly out of scope for
  current backend-start milestone).

## Gate A: Spec Decision Closure

All high-impact open semantic decisions are resolved and recorded.

Required artifacts:
- A resolved decision for generalization policy (from `docs/reference/4. Static semantics/2-type-inference.md`).
- A frozen minimal canonical infection typing/propagation contract (from `docs/reference/6. Infection system`).
- A canonical backend input contract document describing what semantics codegen may assume (`docs/backend/wmc_backend_input_contract.md`).

Exit criteria:
- No `Open Spec` items remain in `docs/backend/wmc_conformance_matrix.md` for semantics that affect runtime behavior.
- Explicitly non-blocking for backend start:
  - formal-core appendix completion,
  - backend-internal architecture/design details expected to evolve during backend bring-up.

## Gate B: Executable Conformance Coverage

Behavioral tests exist for each high-risk semantic area.

Required suites:
- Match semantics suite:
  - exhaustive coverage behavior,
  - pin vs `Var` behavior,
  - guard interaction with coverage.
- Evaluation semantics suite:
  - left-to-right evaluation for call args/tuple fields/record fields/scrutinee,
  - assignment lowering/evaluation shape and source-order guarantees.
- Module semantics suite:
  - cycle rejection,
  - canonical module identity behavior,
  - prelude/import/reexport edge cases.
- Recovery/diagnostics suite:
  - lowering and inference paths emit diagnostics instead of runtime panic,
  - typed summaries are still produced for recoverable invalid constructs.

Exit criteria:
- Suites run green through `deno task test:wmc-conformance` in normal development
  workflow (local and/or CI), with no flaky behavior.
- Explicitly non-blocking for backend start:
  - final `mut` runtime semantics and mutation/infection coupling details
    (iterative closure during backend experimentation).

## Gate C: Stable Typed Handoff Contract

Frontend/core outputs used by backend are stabilized.

Contracted interfaces:
- `ModuleSystem.ModuleGraph` (`src/module/module_system.gr`).
- `ModuleInfer.ModuleSummary` and cache signatures (`src/core/module_infer.gr`).
- Compiler diagnostics shape (stage/severity/span/message/clues).

Exit criteria:
- A single documented schema maps source -> module graph -> typed summaries.
- No backend-required field is marked experimental/implicit.

## Gate D: Preservation Invariants

Invariants from backend contract are test-locked.

Required invariants:
- Evaluation-order preservation.
- Match behavior preservation.
- Panic behavior preservation.

Exit criteria:
- Deferred for current backend-start milestone. Final backend-preservation E2E
  checks will be defined after backend behavior/design stabilizes.

## Gate E: Canonical/Non-Canonical Separation

Canonical path must not accidentally consume non-canonical behavior.

Required checks:
- Raw-specific syntax/features are explicitly rejected or ignored in canonical mode.
- Canonical prelude and module behavior do not depend on raw-only assumptions.

Exit criteria:
- Deferred for current backend-start milestone. When raw-mode work resumes, add
  a minimal smoke suite first, then expand as syntax settles.

## Execution Order

1. Complete Gate A.
2. Build/expand tests for Gate B (especially infection/generalization and
   evaluation/match behavior).
3. Freeze typed handoff artifacts for Gate C.
4. Keep Gate D deferred until backend behavior/design stabilizes.
5. Start backend implementation after Gates A-C pass (with Gate D intentionally deferred).
6. Keep Gate E deferred until raw-mode scope is re-enabled.

## Current Baseline

Already useful for Gate B seed coverage:
- `tests/module_system_test.gr`
- `tests/module_infer_test.gr`

High-value expansions (run during backend bring-up):
- dynamic semantics/evaluation-order tests,
- pin-vs-`Var` behavior tests,
- infection/generalization boundary tests,

Maintenance (ongoing, not backend-start blockers):
- typed-handoff contract stability checks.

Deferred for later scope:
- raw/canonical boundary matrix tests.
- exhaustive parser matrix once syntax is stable.
