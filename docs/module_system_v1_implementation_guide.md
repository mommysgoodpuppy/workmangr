# Workman v1 Module System Implementation Guide (Grain)

This guide is implementation-focused and based on:
- Canonical docs in `docs/reference`
- Current Grain frontend/core code in `src`
- v0 behavior from `c:/GIT/workman/src` (especially `module_loader.ts`, `parser.ts`, `error.ts`)

The goal is to get v1 module semantics and v0-grade UX without v0-style coupling.

---

## 1. What to preserve from v0 vs what to change

Keep from v0:
- Explicit imports/reexports and explicit export surface.
- Topological module graph with cycle rejection.
- Prelude auto-seeding with `@core` opt-out behavior.
- Parse with operator context from dependencies/prelude.
- LSP-oriented features: in-memory source overrides and tolerant parsing.
- Cross-module typing seeded from dependency export summaries.

Change for v1:
- Hard architecture boundaries so module loading, parsing, typing, diagnostics, and LSP orchestration are separate packages.
- No fail-fast global error path for editor mode: aggregate diagnostics per module.
- Deterministic per-module artifacts (parsed/lowered/typed/export summaries) with stable cache keys.
- Canonicalized module identity and import resolution rules documented and test-locked.

---

## 2. Core requirement: diagnostics for deps when only file X is open

User scenario:
- Open `x.wm`.
- `x` imports `y`.
- `y` has frontend error.
- Editor must show diagnostic in `y` even though active file is `x`.

Required model:
- LSP request should compile/analyze a *module graph rooted at X*, not single-file only.
- Diagnostics are emitted per module URI.

### Pipeline shape

1. Resolve entry (`x`) to canonical module ID/path.
2. Build/load graph (DFS with cycle detection, canonical IDs).
3. Parse each reachable module in graph mode:
   - use source overrides for open buffers
   - tolerant mode in editor sessions
4. Run lower/type per module in topo order (or mark blocked if deps failed).
5. Emit `Map<ModuleId, List<Diagnostic>>`.
6. LSP publisher sends diagnostics for all touched module URIs.

### Do not fail-fast in editor mode

Use two modes:
- `BatchMode` (CLI/build): fail-fast acceptable.
- `EditorMode` (LSP): never abort whole graph on first module error.

In `EditorMode`, every stage returns:
- artifact (or partial artifact)
- diagnostics
- status (`Ok | Partial | Failed`)

If `y` fails parse:
- still publish parse diagnostics for `y`.
- `x` gets dependency-blocked diagnostics only where needed (for unresolved imports/types), not a generic cascade panic.

### Minimal data contracts

```txt
ModuleGraph:
  entry: ModuleId
  nodes: Map<ModuleId, ModuleNode>
  topo: List<ModuleId>

ModuleNode:
  id: ModuleId
  sourcePath: String
  imports: List<ImportEdge>
  reexports: List<ReexportEdge>
  flags: { core: Bool, raw: Bool }

ModuleDiagnostics:
  moduleId: ModuleId
  diagnostics: List<Diagnostic>
```

---

## 3. Types across modules (v1 design)

You want HM-style local inference with cross-module stability. The correct interface is:

- Each module exposes an **export type summary**:
  - exported values: `name -> Scheme`
  - exported nominal types: `name -> TypeInfo`
  - exported operators (if supported in frontend parse context)
- Importing module seeds inference/type environments from dependency summaries.

This is exactly the useful v0 pattern, and should be formalized in Grain.

### Import seeding rules

For each import specifier:
- If imported name resolves to exported value: seed value env.
- If imported name resolves to exported type: seed type env.
- If both exist (separate namespaces): allow according to namespace rules.
- For constructors, ensure their parent type info is available for pattern/type checks.

For namespace imports (`* as M` style):
- Build a value-level record-like namespace scheme from exported values.
- Keep type namespace separate (do not stuff types into value namespace unless explicitly in raw-mode rule set).

### Type stability contract

Each module should be inferable with inputs:
- prelude seed (if enabled)
- imported summaries from direct dependencies
- module AST/core AST

No hidden global mutable infer state across modules.

### Cycles

Canonical v1 forbids cycles. Keep this simple:
- detect cycle during graph build (`visiting` stack).
- emit diagnostics on every cycle participant with full path text.

No SCC type-fixpoint needed in v1.

---

## 4. Avoiding spaghetti while preserving UX

v0 UX was good because behavior was practical; spaghetti came from cross-cutting orchestration in one place. Fix this by strict layering.

## 4.1 Package boundaries

Recommended modules in Grain:

- `ModuleId`
  - canonical path normalization, module identity comparison
- `ModuleResolver`
  - specifier -> canonical path/ID
  - std roots, relative rules, extension rules
- `ModuleGraphBuilder`
  - DFS, cycle detection, graph/topo construction
- `ModuleSourceStore`
  - disk + in-memory overrides
- `ModuleParser`
  - parse entrypoint with options `{ tolerant, operators, prefixOperators }`
- `ModuleFrontend`
  - parse+lower per module, with per-module diagnostics
- `ModuleTyping`
  - type each module from dependency summaries
- `ModuleExports`
  - collect and validate exports/reexports
- `ModulePrelude`
  - prelude policy + seeding
- `ModuleWorkspaceEngine`
  - orchestrates above for CLI/LSP modes

Rule: lower layers never import upper layers.

## 4.2 Artifact store

Use typed artifact tables keyed by `ModuleId`:

- `parsedById`
- `loweredById`
- `typedById`
- `summaryById`
- `diagnosticsById`

This prevents ad-hoc passing of half-constructed state.

## 4.3 Deterministic orchestration phases

Phase order:
1. Resolve + graph build
2. Parse pass (all reachable modules)
3. Operator-augmented reparse pass (if needed)
4. Lower pass
5. Type pass (topological)
6. Export/reexport validation
7. Diagnostic collation + publish

Each phase writes artifacts; later phases read only stable previous artifacts.

---

## 5. Prelude strategy (`@core` pain point)

Your instinct is correct: `@core` should be a first-class module flag, not an ad-hoc exception.

### v1 policy

- Default module gets prelude.
- `@core;` module does not auto-import prelude.
- Prelude module itself must not re-import itself.
- User must not explicitly import auto-loaded prelude module (emit clear diagnostic).

### Raw mode

If you keep raw mode:
- runtime mode prelude: `std/prelude`
- raw mode prelude: `std/zig/prelude` (or equivalent v1 path)

Selection rule:
- decide from module pragma/flag before typing.
- cache key must include mode.

### Implementation detail

Expose one function:

```txt
seedPrelude(moduleFlags, preludeSummary, envs) -> envs
```

and call it only in typing seed phase, not in parser/lowering.

---

## 6. Import and resolution spec (must be explicit)

Document and test:
- relative specifiers resolution (`./`, `../`)
- absolute path acceptance (if allowed)
- std-root resolution (`std/...`)
- extension defaulting (`.wm` when omitted)
- canonicalization (case-folding policy, slash normalization)

If Windows case-folding is used, enforce it consistently in ModuleId creation.

---

## 7. Operator-dependent parse in modules

v0 did useful two-pass behavior:
- parse once (discover imports)
- gather operators from deps/prelude
- parse/reparse with operator tables

Keep this, but formalize it:
- Parse pass result can be `NeedsOperatorContext`.
- Graph builder should still traverse statically discoverable imports.
- Reparse pass runs once operator context is available.

For LSP:
- if unresolved operator remains, emit diagnostic on module, but do not abort whole graph.

---

## 8. Diagnostics model for good LSP UX

### 8.1 Diagnostic key

Every diagnostic needs:
- `moduleId`
- span offsets + line/col
- stage (`Lexing|Parsing|Lowering|TypeInference|Module`)
- code/reason
- message
- related info list

### 8.2 Publish strategy

On each recheck:
- publish diagnostics for all modules in checked graph.
- publish empty list for previously-dirty modules now clean.

### 8.3 Dependency-blocked diagnostics

If `x` depends on `y` and `y` fails:
- `y`: real parser/type diagnostics.
- `x`: targeted diagnostics like “imported module has errors” only when needed; avoid flooding.

---

## 9. Caching and incremental behavior

Use content-hash based invalidation:
- `sourceHash(module)`
- `parseHash = hash(sourceHash + parseOptions + operatorContextHash)`
- `typeHash = hash(parseHash + directDepExportHashes + preludeHash + modeFlags)`

Then:
- change in `y` invalidates `y` and reverse-dependents.
- unrelated modules remain intact.

Reverse dependency index is required for fast LSP updates.

---

## 10. Proposed Grain implementation plan

1. Introduce module orchestration packages (Section 4.1) without changing language semantics yet.
2. Implement `ModuleId` + resolver + graph builder with cycle diagnostics.
3. Add `ModuleSourceStore` supporting in-memory overrides for editor buffers.
4. Implement parse graph pass in tolerant mode and per-module diagnostics map.
5. Implement operator-context reparse pass.
6. Add export summary extraction and topo type seeding from dependency summaries.
7. Implement prelude policy with explicit `@core` flag handling.
8. Wire LSP to publish diagnostics by module URI for full dependency graph.
9. Add incremental cache + reverse dep invalidation.
10. Add golden tests for module UX parity with v0 scenarios.

---

## 11. Test matrix (must-have)

- Graph:
  - acyclic chain, diamond deps, cycle rejection
- Diagnostics fanout:
  - open `x`, syntax/type error in transitive `y` -> `y` diagnostic published
- Prelude:
  - default module gets prelude
  - `@core` module does not
  - explicit import of auto-prelude rejected
- Types across modules:
  - value import, type import, constructor usage, namespace import
  - missing export, duplicate import binding, type aliasing restrictions (if any)
- Reexports:
  - valid type reexport, missing type reexport diagnostics
- Raw mode (if retained):
  - raw prelude selected, runtime prelude not selected
- Incremental:
  - edit leaf module invalidates only reverse closure

---

## 12. Practical mapping from current `workmangr/src`

Current state:
- Parser/lowerer already carry import/reexport/directive/core in AST.
- Error collection exists but global mutable diagnostics are single-file oriented.
- LSP currently tracks open docs but not module graph diagnostics.

Immediate gap closure:
- Introduce a new module workspace engine used by API/LSP.
- Keep existing parser/lowering functions; wrap them per-module.
- Replace single global error accumulation in multi-file flows with per-module diagnostic collections.

---

## 13. Recommended non-negotiables

- Never run module resolution inside type inference.
- Never mutate global operator/prelude state across modules without keyed context.
- Never let one module error abort editor graph diagnostics.
- Keep module identity canonical and test it.
- Keep prelude policy centralized in one place.
- Never re-lex/re-parse/re-type the full workspace on one-file edits.

If you enforce those five rules, you keep v0 UX while avoiding v0 entanglement.

---

## 14. Performance Architecture (must be in v1 from day 1)

This section is mandatory design, not optional optimization.

### 14.1 Hard invariants

On edit of file `F`:
- Only `F` is re-lexed/re-parsed immediately.
- Only modules in reverse dependency closure of `F` are candidates for re-type.
- If `F`'s exported interface fingerprint is unchanged, no dependent re-type is allowed.
- Unrelated modules are never touched.

### 14.2 Workspace state model

```txt
WorkspaceState:
  graph: ModuleGraph
  revDeps: Map<ModuleId, Set<ModuleId>>
  sourceVersion: Map<ModuleId, Int>
  sourceHash: Map<ModuleId, Hash>
  parseArtifact: Map<ModuleId, ParseArtifact>
  lowerArtifact: Map<ModuleId, LowerArtifact>
  typeArtifact: Map<ModuleId, TypeArtifact>
  exportFingerprint: Map<ModuleId, Hash>
  diagByModule: Map<ModuleId, List<Diagnostic>>
```

`exportFingerprint` must hash only exported surface:
- exported value names + schemes
- exported type names + type info headers
- exported operators/prefix operators

### 14.3 Edit event algorithm

For `didChange(F)`:
1. Update source override + increment `sourceVersion[F]`.
2. Re-lex/re-parse `F` (tolerant).
3. Re-lower and re-type `F`.
4. Compute new `exportFingerprint[F]`.
5. If fingerprint unchanged:
   - stop invalidation at `F` (publish only changed diagnostics/hints for `F`).
6. If fingerprint changed:
   - enqueue reverse dependents of `F` in topo order for re-type.
   - process queue incrementally, publishing diagnostics per module as each finishes.

No step includes scanning every source file.

### 14.4 Queues and scheduling

Use three queues:
- `Q_hot` (keystroke-critical): parse/lower/type for edited module only.
- `Q_warm` (dependency propagation): re-type reverse closure modules.
- `Q_cold` (idle/background): full consistency sweeps, expensive analyses.

Rules:
- `Q_hot` preempts everything.
- `Q_warm` is cancellable/debounced by newer edits.
- `Q_cold` runs only when hot/warm empty.

### 14.5 Latency budgets

Target budgets:
- `Q_hot`: 10-30ms median.
- First dependent diagnostics from `Q_warm`: <150ms median.
- Full reverse-closure stabilization: best effort, cancellable.

If budget exceeded:
- yield control and continue in next tick.
- never block editor responsiveness waiting for full graph stabilization.

### 14.6 Preventing accidental full-workspace work

Add explicit guardrails in code:
- `WorkspaceEngine.recheckFromEdit(moduleId)` API accepts one root edit only.
- No public API named `recheckAll` on keystroke paths.
- Instrument counters:
  - `modulesParsedPerEdit`
  - `modulesTypedPerEdit`
  - `modulesInvalidatedPerEdit`
- Add test/assertion:
  - editing leaf file in large synthetic workspace must keep parsed modules at `1`.

### 14.7 Minimum perf tests to add immediately

- Synthetic workspace: 100 modules, ~1000 lines each.
- Case A: edit internal expression in leaf module, no export change.
  - expect parse count = 1, type count = 1.
- Case B: edit exported signature in shared module.
  - expect re-type only reverse closure.
- Case C: edit comment/whitespace only.
  - expect no re-type outside edited module.

Treat these as regression gates in CI.

---

## 15. Multi-Entry Workspace Performance (open files, not single entry)

In editor mode, do not rebuild graph independently per open file.

### 15.1 Root set model

Maintain:
- `activeRoots: Set<ModuleId>` for open files (and optional pinned project roots).
- `reachableUnion = union(reachable(root) for root in activeRoots)`.

Then run analysis over `reachableUnion`, not per-root duplicate pipelines.

### 15.2 Shared graph cache

Cache graph fragments by module:
- `importsOf[module]`
- `resolvedEdges[module]`
- `reachableCache[root]` (invalidated only when affected imports change)

When root set changes:
- adding root `R`: compute only `reachable(R) - reachableUnion`.
- removing root `R`: do not immediately evict; mark for lazy eviction/idle GC.

### 15.3 Dirty graph updates

On edit of `F`:
- reparse `F` only.
- if import list of `F` unchanged: no graph topology recompute.
- if import list changed:
  - recompute reachability delta only for affected roots.
  - update `revDeps` incrementally, not by full rebuild.

### 15.4 Summary-first dependency work

Cross-module propagation must use summaries, not full AST walks:
- summary key: `SummaryHash(module)` from exported surface only.
- dependents are retyped only when upstream `SummaryHash` changed.

This keeps warm-queue propagation small even with many open roots.

### 15.5 Practical editor behavior

Expected behavior:
- 10 open files sharing many deps should behave close to one open file.
- opening a new file should mostly reuse existing graph/artifacts.
- go-to-definition/hover should work in unopened files if they are in `reachableUnion`.

---

## 16. Summary Cache Contract

Make summaries a first-class cache artifact:

```txt
ModuleSummary:
  exports:
    values: Map<String, Scheme>
    types: Map<String, TypeInfo>
    operators: Map<String, OperatorInfo>
    prefixOperators: Set<String>
  flags:
    core: Bool
    raw: Bool
  hash: SummaryHash
```

Rules:
- summary generation must be deterministic.
- summary must be available even if runtime/eval is skipped.
- downstream typing depends only on summary + local module artifact + prelude seed.

This mirrors the successful v0 pattern and is required for scale.

---

## 17. Optional but high-value: navigation index on same engine

To avoid duplicated work between diagnostics and navigation:
- build symbol index from the same module artifacts/summaries.
- do not run a separate parse/type pipeline for go-to-definition.

Minimum index:
- local defs by module/span
- exported defs by module/name
- import bindings -> resolved def targets

This keeps ctrl-click/hover fast and consistent with diagnostics.
