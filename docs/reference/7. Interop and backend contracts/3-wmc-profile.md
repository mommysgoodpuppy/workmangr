# WMC Profile (Performance-Oriented, Manual Memory)

## Scope

Defines the reference implementation direction for WMC: a high-level Workman
language experience with performance-oriented compilation and explicit memory
control, without relying on a large VM-style runtime.

## Status

Draft (normative where explicitly marked).

## Dependencies

- `../1-introduction.md`
- `../5. Dynamic semantics/1-values-and-evaluation.md`
- `./2-backend-contract-zig.md`
- `./1-ffi-and-raw-mode.md`

---

## Design Intent

WMC is intended to feel like its own language, not a thin syntax layer over Zig.
At the same time, it targets systems-level performance and explicit resource
control.

This profile therefore commits to:

1. Preserving canonical Workman semantics.
2. Preferring compile-time specialization over runtime boxing/dispatch.
3. Exposing explicit memory/resource operations as first-class language
   constructs.
4. Avoiding a large VM runtime as the default execution model.

---

## Normative Goals

### 1. Semantic preservation first

WMC must preserve canonical observable behavior unless this profile explicitly
declares a backend-specific extension.

### 2. Minimal runtime model

WMC must not use a universal boxed-value VM runtime as the default execution
model for canonical code.

Normative:
- WMC must use type-directed specialization and concrete/unboxed
  representations by default whenever compile-time typing and analysis make
  them safe.
- A universal boxed representation is permitted only as a fallback for cases
  where specialization cannot be proven correct or cannot yet be implemented.
- The implementation must provide such fallback support, because full
  specialization cannot be guaranteed in all cases.
- Such fallback use must not define the primary runtime architecture, and must
  not change canonical observable behavior.

Implementations may still include small helper runtime libraries for:
- allocation helpers
- panic and diagnostics plumbing
- platform integration

but these helpers must not redefine language semantics.

### 3. Type-directed specialization

Normative:
- WMC must specialize representations and operations whenever static typing and
  analysis make it safe and the implementation has a corresponding specialized
  lowering path.

Implementation-defined (must be documented):
- Which constructs currently fall back to boxed lowering because a specialized
  lowering path is not yet implemented.

Examples:
- direct primitive operations instead of boxed operator dispatch
- concrete data layout for known ADTs/records
- monomorphized or specialized function bodies where profitable

### 4. Explicit memory control

WMC is to expose explicit memory/resource control APIs in a backend
profile surface, provided canonical semantics remain clear at the boundary.

Memory/resource behavior that is profile-specific must be documented as such and
must not be silently treated as canonical Workman behavior.

---

## Required Compiler Architecture Implications

To satisfy this profile, implementations should include:

1. A typed core IR (`TCore`) that is independent of surface syntax details.
2. A lowered optimization/codegen IR (`MIR`) with explicit control/data flow.
3. An explicit match-lowering stage (decision-tree style), not ad hoc emitter
   pattern expansion.
4. A representation-planning stage that decides boxed vs unboxed data from
   typing and escape/lifetime information, with boxed fallback treated as an
   exceptional path rather than the default codegen strategy.

---

## Non-Goals

1. Reintroducing a mandatory VM-like universal `Value` representation as the
   primary execution model.
2. Making WMC merely a Zig syntax frontend.
3. Hiding memory/resource behavior behind undocumented backend magic.

---

## Open Items

The following must be specified before this profile can be considered stable:

1. Which memory/resource APIs are canonical-profile extensions vs non-canonical.
2. Numeric specialization policy (`Number` strategy, fixed-width coercions,
   overflow behavior under specialization).
3. Conformance tests for typed specialization (to guarantee no semantic drift
   from canonical behavior).
