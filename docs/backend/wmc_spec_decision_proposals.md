# WMC Spec Decision Record (Backend Unblock)

This document records concrete defaults for semantic items that were blocking
backend start.

## 1) Generalization Policy (Locked)

Open item:
- `docs/reference/4. Static semantics/2-type-inference.md` generalization policy.

Locked decision:
- Adopt a **policy-boundary-aware generalization** model for v1:
  - Generalize `let` bindings by default.
  - Do not impose a blanket "infection must be discharged before generalization"
    rule.
  - Preserve infection/domain information in inferred schemes across `let` and
    function boundaries.
  - Reject infected flows only at explicit domain/policy boundaries (for
    example `pure`, `rejectDomains`, or domain boundary requirements).

Why:
- Preserves Workman's core infectious-propagation ergonomics.
- Keeps boundary control explicit and auditable for backend/codegen behavior.

## 2) Infection + Generalization Integration (Locked)

Open item:
- `docs/reference/6. Infection system` + generalization interaction.

Locked decision:
- Infection obligations participate in type checking and are preserved through
  generalized schemes when present.
- A binding may be generalized while infected if that infection is explicit in
  the inferred/exported scheme.
- Discharge via pattern matching is optional and local; it is not required at
  every `let` boundary.
- Policy/domain boundary checks remain the rejection mechanism.

Why:
- Preserves implicit propagation semantics while still enforcing explicit
  boundary policies.
- Keeps backend contract simple: no hidden side tables and no global infection
  ban.

## 3) Canonical Backend Start Defaults

These two decisions are the v1 defaults and are considered normative for
backend bring-up.

## 4) Acceptance Checklist

To keep these decisions stable:
1. Keep affected reference chapters aligned with normative wording.
2. Add targeted conformance tests for allowed/disallowed generalization forms.
3. Keep `docs/backend/wmc_conformance_matrix.md` and readiness status aligned.

## 5) Additional v1 Direction (Locked/Working Rules)

### 5.1 Number semantics

Decision:
- No new policy decision required now; use the existing canonical numeric
  contract in:
  `/Users/profilence/git/workmangr/docs/reference/4. Static semantics/1-types.md`
  (`Number` as semantic int/float sum with defined division/overflow behavior).

Implication:
- Remaining work is enforcement/testing, not semantics definition.

### 5.2 Mutation and infection interaction

Decision:
- Keep this intentionally iterative for v1.
- Start with the current canonical mutability baseline and evolve based on
  observed issues during implementation/testing.
- It is acceptable for mutation to introduce infection/effect constraints; the
  exact coupling may be refined as evidence accumulates.

### 5.3 Infection scheme encoding reference

Decision:
- Use workman v0 as reference input while freezing WMC behavior:
  - v0 reference: effect/carrier state is represented via `effect_row` and
    carrier-aware type operations in `/Users/profilence/git/workman/src/types.ts`
    and `/Users/profilence/git/workman/src/layer1`.
- WMC may choose a different internal encoding if externally observable
  behavior remains equivalent and deterministic.

### 5.4 Panic surface details

Decision:
- Keep panic host-facing details intentionally minimal in v1 for now.
- Preserve only the canonical requirement that `Panic(msg)` is unrecoverable;
  exact output/exit formatting can be fixed later.

### 5.5 Canonical parser/raw boundary policy

Decision:
- Canonical mode parses only the exact directive/syntax shapes supported by
  spec.
- Other raw/backend-target shapes are ignored or rejected according to existing
  parser behavior.
- Auto-corrections are allowed only for decidable cases that preserve user
  intent (e.g., missing semicolon/bracket when unambiguous).
