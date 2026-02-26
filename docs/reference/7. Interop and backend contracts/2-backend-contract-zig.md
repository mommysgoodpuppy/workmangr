# Backend Contract: Zig (Normative, Minimal)

WMC is defined with a Zig backend contract as part of the reference language
implementation boundary. This section defines the **minimal** semantic contract
that Zig implementations of WMC must preserve.

This contract defines what the Zig backend must preserve at the semantic
boundary. Detailed implementation direction (specialization-first compilation,
representation planning, and fallback strategy) is specified in
`./3-wmc-profile.md` and `./4-wmc-compiler-architecture.md`.

This section is intentionally minimal and should not be read as implying
multiple WMC backend "modes".

---

## Required Semantic Preservation

The Zig backend must preserve:

- The evaluation order specified in `plans/workmancanonical/5. Dynamic semantics/1-values-and-evaluation.md`.
- The match semantics specified in `plans/workmancanonical/5. Dynamic semantics/2-control-flow-and-pattern-matching.md`.
- The typing and infection semantics specified in the static semantics and
  infection chapters.

---

## Runtime Errors and Panic

Normative:
- `Panic(msg)` must abort execution with an unrecoverable failure.

Implementation-defined (must be documented):
- how panics are surfaced (exit code, stack trace)
- whether location info is included

---

## Representation and Layout

WMC does not prescribe a universal runtime object model as the primary
execution architecture.

Normative:
- The Zig backend must support runtime/helper machinery for cases where full
  compile-time specialization is not possible.
- Boxed/generic representations may be used for those fallback cases, provided
  canonical observable behavior is preserved and implementation-defined details
  are documented.
- Such fallback machinery does not define the primary architecture of WMC.

Canonical Workman does not, by default, guarantee:
- record layout
- ADT layout
- pointer stability

If a Zig backend exposes FFI surfaces, it must do so through the FFI wrapper
rules in `plans/workmancanonical/7. Interop and backend contracts/1-ffi-and-raw-mode.md`.
