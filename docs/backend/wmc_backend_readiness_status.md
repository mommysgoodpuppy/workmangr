# WMC Backend Readiness Status

Last updated: 2026-02-16

This status is derived from:
- `/Users/profilence/git/workmangr/docs/backend/wmc_backend_readiness_gates.md`
- `/Users/profilence/git/workmangr/docs/backend/wmc_conformance_matrix.md`
- executable gate command: `deno task test:wmc-conformance`

## Backend-Start Decision

Status: `Ready to start backend prototyping`

Rationale:
- Gate A (`Spec Decision Closure`) is implemented.
- Gate C (`Stable Typed Handoff Contract`) is implemented.
- Gate B has sufficient executable coverage for backend-start; remaining items
  are iterative and non-blocking for this milestone.
- Gate D and Gate E are explicitly deferred by project decision.

## Gate A: Spec Decision Closure

Status: `Implemented`

Done:
- Backend input contract document exists:
  `/Users/profilence/git/workmangr/docs/backend/wmc_backend_input_contract.md`.

Done:
- Generalization policy locked as policy-boundary-aware in:
  `/Users/profilence/git/workmangr/docs/reference/4. Static semantics/2-type-inference.md`.
- Infection-generalization integration locked in:
  `/Users/profilence/git/workmangr/docs/reference/4. Static semantics/2-type-inference.md`
  and
  `/Users/profilence/git/workmangr/docs/reference/6. Infection system/2-infection-types-and-composition.md`.
- Decision record retained in:
  `/Users/profilence/git/workmangr/docs/backend/wmc_spec_decision_proposals.md`.

Notes:
- Executable enforcement expansion lives under Gate B (conformance coverage),
  not Gate A.
- Formal-core appendix remains open by design and is non-blocking for backend
  start (iterative closure during/after backend bring-up).

## Gate B: Executable Conformance Coverage

Status: `Partial`

Done:
- Match coverage diagnostics tests (including guarded/wildcard behavior).
- Pin vs `Var` tests (bare identifiers, constructor args, tuple pins).
- Evaluation/lowering order tests (calls, pipe, records, match scrutinee,
  assignment lowering shape/order).
- Recovery/no-crash regression coverage for invalid-yet-recoverable syntax in
  lowering/inference (diagnostic + continuation behavior).
- Module semantics tests (cycles, canonical identity, std/prelude behavior).
- Parser grammar disambiguation tests for three match forms.
- Additional parser regressions for qualified module calls and constructor-style
  nominal record literal syntax.
- LSP regression test-lock for stale dependent diagnostics after dependency
  edit/fix (`tests/lsp_crash_repro_test.ts`).
- Executable gate command:
  `deno task test:wmc-conformance`.

Open:
- True backend runtime/codegen preservation checks (not just frontend/lowering
  invariants).
- Assignment/mutability runtime semantics are still not fully specified/locked.
- Mutation/infection coupling is intentionally iterative and needs
  experiment-driven refinement tests.

Notes:
- Backend runtime/codegen preservation checks are deferred for backend-start
  readiness and tracked under Gate D.
- For current backend-start readiness, unresolved `mut` runtime semantics are
  treated as non-blocking and will be closed iteratively during backend design.

## Gate C: Stable Typed Handoff Contract

Status: `Implemented`

Done:
- Contracted interfaces documented in backend input contract.
- Diagnostics shape contract is test-locked.
- Module-summary identity alignment now test-locked.
- Module diagnostics contract now includes lowering + inference diagnostics and
  is test-locked through module-infer regressions.
- CI conformance gate workflow now exists at:
  `/Users/profilence/git/workmangr/.github/workflows/wmc-conformance.yml`
  and runs:
  `deno task test:wmc-conformance`.

Maintenance:
- Keep the typed handoff contract stable while frontend/type-system work continues.
- Ensure `deno task test:wmc-conformance` stays green in normal local workflow.

## Baseline Performance (Native Grain)

Most recent local runs on 2026-02-15:
- `deno task test:wmc-conformance`: `real 4.61s` (`user 4.76s`, `sys 0.71s`).
- `deno test --allow-run --allow-read --allow-env tests/lsp_crash_repro_test.ts`:
  `real 9.92s` (`user 2.37s`, `sys 0.39s`).

Notes:
- The stale-diagnostics fix now uses dependency-targeted republish, avoiding
  full-open-workspace recomputation on every change.

## Gate D: Preservation Invariants

Status: `Partial`

Done:
- Preservation-oriented tests cover frontend/lowering/inference invariants for
  evaluation order, match behavior, and panic typing continuity.

Open:
- Deferred by project decision: backend-preservation E2E checks are postponed
  until backend behavior/design is concrete enough to validate.

## Gate E: Canonical/Non-Canonical Separation

Status: `Partial`

Done:
- Canonical directive behavior (`@core`) and unknown directive handling are
  test-locked.
- Raw-like directives (`@raw`, `@backend`) are test-locked as non-canonical
  and do not enable canonical core mode.
- Backend-target directive argument syntax (e.g. `@backend("zig")`) is rejected
  in canonical parser mode.

Open:
- Deferred by project scope decision: raw mode is out of scope for current
  backend-start readiness.

## Recommended Next Closures

1. Add/expand tests for policy-boundary-aware generalization and explicit boundary enforcement.
2. Maintain typed handoff artifacts stability (`ModuleGraph`, `ModuleSummary`, diagnostics shape)
   and catch drift with executable tests.
3. Keep backend-preservation E2E checks deferred until backend behavior/design
   is concrete enough to validate.
4. Continue focused parser conformance additions for actively-used canonical
   syntax (non-final while syntax remains fluid).
5. Treat CI workflow wiring as optional developer convenience, not a hard readiness gate.
6. Keep `mut` runtime semantics deferred until backend experimentation clarifies
   the design.
