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

This document only states architectural direction and non-goals for the
experimentation phase.
