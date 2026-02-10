# Type Layers (Hazel-Inspired)

This project uses a two-layer typing architecture inspired by Hazel's
"bidirectional core + constraint layer" approach, adapted for Workman.

## Layer 1 (HM Core)
`/Users/profilence/git/workmangr/src/core/layer1`
- Local HM typing and bidirectional-style checks
- Local/eager equality unification
- Let-generalization boundaries (`let`, `let rec`, mutual recursion)
- ADT constructor registration and pattern typing

Layer 1 produces a typed state and may also collect constraints for tracing and
for deferred solving.

## Layer 2 (Deferred Constraints)

`/Users/profilence/git/workmangr/src/core/layer2`

- Solves only deferred/domain constraints
- In Workman this is where infection-style constraints belong
- Does not re-run core HM equality typing logic

This mirrors Hazel's separation where the core local typing relation is primary
and constraint solving is layered on top for additional obligations.

## Workman Adaptation

Hazel's published focus is holes/unfillable-hole localization; Workman extends
the same layering idea so the deferred layer is generalized for infection/domain
constraints.