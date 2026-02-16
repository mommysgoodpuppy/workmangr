# WMC Cleanup Backlog (Pre/During Backend Bring-up)

Purpose:
- Reduce distraction and stale/duplicate systems while backend prototyping starts.
- Keep canonical context clear and minimize "half-finished" surface area.

Status:
- Backend prototyping is ready to start.
- Items below are chores; most are non-blocking.

## P0 (Do First: High-Leverage Noise Reduction)

1. Remove module-load side effect in frontend facade.
- File: `src/frontend/frontend.gr`
- Issue: `parseAndLower(testStr)` runs at module load, which is debug-era behavior and hidden work.
- Action: delete the side-effect call; keep only exported helpers.

2. Remove unused `Util` imports from parser/lexer.
- Files: `src/frontend/parser.gr`, `src/frontend/lexer.gr`
- Issue: both import `Util`; parser imports `testStr`, none are used.
- Action: remove dead imports/usages.

3. Fix duplicate import in API module.
- File: `src/api/api.gr`
- Issue: duplicate `from "../frontend/lower.gr" include Lower`.
- Action: remove duplicate line.

4. Trim or isolate massive embedded sample strings from `Util`.
- File: `src/util.gr`
- Issue: very large repeated test/sample payloads (`testStrLong` etc.) make core utility module noisy.
- Action: move big fixtures into `tests/fixtures` or dedicated sample fixture module.

## P1 (Reduce Parallel/Legacy Paths)

5. Resolve legacy inlay inference path.
- File: `src/cli/lsp/inlay.gr`
- Issue: explicit TODO says legacy single-file path kept for tests.
- Action: migrate remaining tests to module-summary-backed path, then remove legacy branch.

6. Consolidate entrypoint pipeline duplication (API/CLI/LSP).
- Files: `src/api/api.gr`, `src/cli/cli.gr`, `src/cli/lsp/lsp.gr`
- Issue: overlapping parse/lower/infer orchestration logic in multiple places increases drift risk.
- Action: centralize shared compile/infer orchestration in one reusable core module.

7. Prune one-off debug/repro scripts from primary scripts surface.
- Files: `scripts/debug_*.gr`, `scripts/repro_*.gr`, `scripts/bench_*.{gr,ts}`
- Issue: most scripts are not referenced by tasks/workflows and read as "operational clutter".
- Action: move to `scripts/dev/` (or `wip/`) and keep top-level `scripts/` for supported commands.

8. Decide handling of empty backend directory placeholder.
- Directory: `src/backend/wmc`
- Issue: currently empty; unclear if intentional placeholder or stale scaffold.
- Action: either add a short `README.md` with intended staging plan or remove until first backend module lands.

9. Collapse competing type-inference entrypoint paths to one canonical path.
- Canonical backend-facing path today: `ModuleInfer.inferEntry` -> `Infer.inferProgramWithTypingEnv` (`src/core/module_infer.gr`, `src/core/infer.gr`).
- Competing/parallel paths still present:
  - API single-file path using explicit layer calls (`src/api/api.gr`: `inferProgramLayer1` + `inferProgramLayer2`).
  - Legacy LSP type snapshot path (`src/cli/lsp/layer1/type_service.gr`) using `Frontend.parseAndLower` + `Infer.inferProgram`.
  - Inlay legacy single-file inference fallback (`src/cli/lsp/inlay.gr`).
- Action: define one supported inference API for tooling/runtime, mark others as debug-only or remove.

10. Remove hidden test/debug coupling from frontend facade used by type tooling.
- Files: `src/frontend/frontend.gr`, `src/cli/lsp/layer1/type_service.gr`
- Issue: frontend facade currently executes work at module load and is used by legacy type-service tests.
- Action: make `frontend.gr` a pure API facade; migrate any tests/tooling that rely on side effects.

## P2 (Repo Hygiene / Context Clarity)

9. Keep workspace scratch files out of repo root.
- Root files currently present: `tmp_aoc_probe.wm`, `tmp_aoc_diag_probe.gro`, `tmp_aoc_diag_probe.wasm`, `workmangr.code-workspace`, `.DS_Store`.
- Action: move probes to `wip/` or `tmp/`; keep root focused on canonical entrypoints.

10. Clarify canonical vs non-canonical docs split.
- Canonical: `docs/reference/*`, backend readiness docs under `docs/backend/*`.
- Potentially distracting broad guides: `docs/workmansyntaxguide.md`, `docs/workmaninfectionguide.md`, `docs/type_layers.md`, `docs/module_system_v1_implementation_guide.md`.
- Action: add a short "doc authority map" (which docs are normative vs exploratory).

12. Standardize generated artifact location during local workflows.
- Observation: many `.gro`/`.wasm` artifacts are generated across `src/`, `tests/`, `target/`.
- Action: prefer `target/` output where possible for local scripts, and keep `deno task clean` as the canonical reset path.

## Suggested Execution Order

1. P0 items 1-4 (small, low-risk cleanup with immediate clarity gain).
2. P1 items 5-8 (reduce long-term drift while backend code starts).
3. P2 items 9-11 (ongoing repo hygiene while implementing backend).
