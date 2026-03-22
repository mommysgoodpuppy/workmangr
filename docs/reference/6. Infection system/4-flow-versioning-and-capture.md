# Flow, Versioning, and Capture (Normative, Draft)

very much draft, examples may be non canonical, sorry this meanders a bit too much into thesis territory

This section specifies the semantic layer that determines how values move
through scopes, bindings, and nested functions.

This layer is not limited to closures. It also defines the versioning behavior
that makes domain-specific safety checks practical, including memory/resource
tracking and other infection-driven constraints.

>v0 does not materialize versions as a separate runtime or IR object, but its identity-tagged rewrites and binding-sensitive propagation induce versioned views of the same tracked identity.

This chapter defines a structural model. Sequential examples are included for
readability, but the semantics are determined by binding structure, value flow,
and domain reachability.

Normative boundary:

- Infection propagation is defined over value flow, not over identifier spelling
  alone.
- Capturing a value in a nested function captures the current binding/version of
  that value.
- Rebinding and shadowing introduce distinct binding/version paths and must not
  collapse those paths into one denotation merely because tracked identity is
  continuous across them.
- Domain rewrites propagate only forward over reachable version flow; they do
  not backflow across a version-introducing cut such as `let`.



This section is draft, but the direction is intended to be stable.

---

## Conceptual Summary

Canonical Workman has three distinct semantic layers:

- HM/core typing determines ordinary value shape.
- Flow/versioning determines where a value, and the state attached to it, may
  reach.
- Infection/domain rules determine what state propagates, merges, rewrites, or
  is rejected at boundaries.

The flow/versioning layer exists so higher-order code can preserve the same
meaning as first-order code. Without it, closure capture, rebinding, and
resource-sensitive domains would require ad hoc special cases.

---

## Glossary

This glossary fixes the basic terms used throughout the chapter.

### Flow

Flow is the semantic relation that connects one value occurrence to another.

Normative:

- Flow is determined by binding structure, application, matching, capture, and
  explicit value transfer.
- Flow is not determined by identifier spelling alone.

### Scope

A scope is the region in which a binding is visible.

Normative:

- Scope determines visibility.
- Scope alone does not determine tracked identity or domain propagation.

### Non-Linearity

In this chapter, non-linearity means that surface programming is not restricted
to affine or single-use discipline.

Examples:

- a value may be named, passed, returned, or mentioned multiple times
- the language does not require Rust-style ownership syntax to express ordinary
  resource use

Normative:

- Non-linearity of surface syntax does not imply unrestricted domain flow.
- Domain rules still reject incompatible structural combinations.

### Closure

A closure is a function value together with the binding context it requires from
its defining environment.

Normative:

- Closure is a semantic notion.
- A backend may implement it by lambda lifting, explicit environment passing,
  closure objects, or another equivalent mechanism.

### Closure Capture

Closure capture is the connection between a nested function body and a binding
visible at the function’s definition site.

Normative:

- Capture refers to a binding/version, not merely to a name.
- If a captured value carries domain state, that state is reachable in the
  nested function according to the same flow rules as any other connected use.

### Version

A version is a semantic state of a tracked value along a binding/identity path.

Normative:

- Domain-sensitive rewrites may distinguish versions of the same tracked
  identity.
- Versions are semantic; implementations may or may not render them explicitly
  in diagnostics.

### Backflow

`Backflow` is an informal term for a propagation that would cross lexical
structure and reclassify an outer or otherwise inaccessible binding.

Informally, something may look like “backflow” because:
- state appears to move backward across the source text
- state appears to move backward through a chain of derived values
- state appears to move backward relative to an operational reading of "before"
  and "after"

Normative:

- Canonical Workman does not define flow by source-line direction.
- Canonical Workman does not define flow by an informal time order.
- The precise question is lexical/structural accessibility under ordinary FP/HM
  scope rules.
- In that precise sense, Workman does not backflow across lexical boundaries.
- More sharply: domain rewrites propagate forward over the version graph and
  never backward across a version-introducing cut.

Reading rule:

- In this chapter, `backflow` refers only to that lexical-crossing case, not to
  every propagation that merely looks backward in source text or informal
  execution order.

---

## Core Concepts

### Identity

Some values participate in tracked flow. A conforming implementation may assign
such values a semantic identity.

Normative:

- If a domain tracks state for a value, that state is attached to the value
  flowing through the program, not merely to a source-level name.
- Two distinct bindings are not required to share state merely because they use
  the same identifier text.

### Version

Operations may produce a new version of an existing logical value.

Examples include:

- consuming or discharging domain state
- rewriting a tracked state after a call
- producing a fresh post-operation binding result

Normative:

- A version transition distinguishes semantically different reachable states of
  a tracked value.
- A version transition must be modeled by ordinary value flow and rebinding
  structure, not by mutating the meaning of every same-named occurrence.
- Diagnostics may describe versions explicitly, but implementations are not
  required to expose a specific user-facing version syntax.

### Binding Context

A binding context associates a name with a particular value/version in a
particular scope.

Normative:

- Shadowing creates a new binding context.
- Operations on the shadowing binding do not alter what the shadowed binding
  denotes.

### Occurrence-Relative Denotation

An identifier does not denote one fixed semantic state for its entire scope.

Normative:

- Each occurrence denotes the version reachable at that occurrence's structural
  point on the relevant tracked identity lineage.
- Two occurrences in the same lexical scope may therefore denote different
  reachable versions of the same tracked identity.
- Rewrites classify only those occurrences reached by the propagation relation
  of the flow/versioning layer from the rewrite site.

---

## Flow Edges

Infection/domain propagation must follow semantic flow edges.

Typical flow edges include:

- expression result to enclosing expression
- argument to parameter at application
- bound value to uses in the same binding context
- match scrutinee to bound pattern variables
- captured binding to nested function body
- returned value to caller-visible result

Normative:

- Implementations must not propagate domain state by naive textual name lookup.
- Propagation must respect scope, rebinding, and capture structure.

Implementation-defined:

- The exact internal graph or IR used to represent flow edges.

---

## What This Layer Actually Determines

This layer is responsible for more than “whether closures work”.

Normative:

- It determines which uses of a value are semantically connected.
- It determines when an operation on a value/version is visible to another use
  site.
- It determines which domain state reaches a call, a nested function body, or a
  return boundary.

In particular, this layer is what makes the following possible without requiring
an affine or lifetime-based core language:

- closure-aware state propagation
- resource/memory state tracking
- explicit state rewrites on operations
- boundary checks at call and return positions

Non-normative intuition:

- If expression-oriented programming replaces "sequence of statements" with
  "composition of values", this layer similarly replaces "timeline of updates"
  with "structure of denotations, bindings, and tracked identities".

---

## Same-Scope Propagation

Within a scope, propagation follows the current binding context.

Normative:

- Uses in the same binding context are interpreted against the same tracked
  binding/version path.
- A different binding context created by shadowing is distinct unless explicit
  value flow connects it to the same tracked identity.

This rule is what allows non-linear surface programming while keeping domain
state meaningful.

---

## Flow Follows Lexical Scope

One of the central semantic properties of this layer is that domain flow follows
the same accessibility structure that ordinary FP/HM code already uses.

Normative:

- If a binding is visible in a nested scope, domain state attached to that
  binding may also be reachable there.
- If a binding is not lexically accessible, its state does not become reachable
  there merely because some other value stands in a derivation relation to it.
- Shadowing creates a new binding context local to its scope.
- A nested or shadowing binding does not change what an outer binding denotes
  merely by carrying additional domain state.

This matters because otherwise:

- shadowing would stop working as an FP structuring tool
- helper functions returning resource-like values would contaminate unrelated
  outer bindings
- closure capture would look like a special reverse mechanism instead of the
  ordinary FP rule that inner scopes can denote outer bindings

Non-normative consequence:

- This lexical property is also what keeps the model simpler than temporal
  memory-safety systems.
- If one wants an "escape hatch" intuition, it comes from ordinary FP lexical
  structure itself: because flow does not cross those boundaries, a
  structurally separate binding/path can remain outside the incompatible state.
- That is enough to express checks such as "no use after free" without
  introducing time order, lifetimes, or a separate operational safety
  mechanism.

This is the right way to read the examples:

- `main2` is accepted because `buffer2` is a distinct binding context and does
  not change what `buffer` denotes
- `main3` is accepted because the inner `buffer` binding is not an outer
  binding
- `main` is rejected because closure capture is still ordinary outer-to-inner
  lexical accessibility
- `main6` is the subtle case where bindings remain connected on the same
  tracked identity lineage without introducing a general lexical backflow rule

---

## Scope, Binding, and Capture Are Separate Axes

To understand this layer, it is important to distinguish three different
concepts:

- lexical scope
- binding context
- tracked identity

Normative:

- Lexical scope determines where a name is visible.
- Binding context determines which particular binding/version that name denotes
  at a use site.
- Tracked identity determines which uses are part of the same domain-tracked
  value flow.

These must not be collapsed into a single notion of “variable”.

Consequences:

- Two uses may be in scope for the same name but refer to different binding
  contexts.
- Two different binding contexts may still carry the same tracked identity if
  explicit value flow connects them.
- A closure capture is defined in terms of the binding/version visible at the
  capture site, not merely in terms of the textual name used in the body.

---

## Nested Scope and Capture

A nested function may capture bindings from an outer scope.

Normative:

- A capture refers to the binding/version visible at the capture site.
- If the captured value carries domain state, that state is available in the
  nested function according to the domain’s propagation rules.
- Capture is therefore a flow boundary: state may cross into a nested scope even
  when no explicit parameter is written.

Important consequence:

- Closure support is not merely a backend representation problem.
- The language semantics require capture-aware flow before backend lowering.

---

## State Rewrites and Version Transitions

Many domain-sensitive operations do not merely observe state. They rewrite it.

Examples include:

- a close/free-like operation adding a “closed” state
- a domain-specific handler discharging an effect state
- a call producing a post-call version of a value

Normative:

- A rewrite applies to the relevant value identity/version at the rewrite site.
- Rewrites classify the reachable state of that tracked identity/version path.
- Rewrites are visible only where the flow/versioning layer says that
  identity/version remains semantically reachable.
- Rewrites propagate only along the reachable continuation of the tracked
  identity/version path from the rewrite site.
- A version-introducing cut such as `let` yields a distinct binding/version
  path; propagation does not cross that cut in the reverse structural
  direction.
- Rewrites must not be modeled as global mutation of every same-named binding
  or every historically related value.

This is why versioning is part of the semantic story: connected occurrences may
denote different semantic versions along one tracked identity lineage even when
the surface programming style is intentionally non-linear.

---

## Rebinding, Aliasing, and Explicit Transfer

A new binding may receive a value derived from an existing one.

Examples include:

- `let x2 = f(x1)`
- `let buffer2 = useBuffer(buffer)`

Normative:

- Such rebinding creates a new binding context.
- Domain state may flow from the original binding context to the new one only
  through the explicit value transfer.
- A rebinding such as `let x2 = ...` is also a version-introducing cut: it may
  preserve tracked identity while yielding a distinct reachable binding/version
  path.
- Once transferred, domain operations on the new binding do not automatically
  change what unrelated existing bindings denote unless the domain defines them
  as aliases of the same tracked identity.

Implementation-defined:

- Whether aliasing is represented directly, by version relation, or by another
  equivalent internal mechanism.

---

## Domain State Is Attached to Flow, Not to Names

The infection layer operates on top of this chapter’s flow/versioning model.

Normative:

- Domain state is attached to values as they flow.
- Names are only access paths to bindings/versions of those values.
- If two names denote unrelated binding contexts, domain state does not flow
  between them merely because the names match.
- If two bindings are explicitly connected by value flow, domain state may flow
  between them even when the names differ.

This is the central reason the model remains structural: the meaning is
determined by program structure and value flow, not by an external timeline or
calculus.

The intended object of reasoning is the connectivity structure of bindings,
identities, and domain state.

---

## Interaction with Infections

The infection system does not invent reachability on its own.

Normative:

- Domain-specific propagation happens over the flow/versioning layer defined in
  this chapter.
- Domain rules may merge, rewrite, discharge, or reject state only at locations
  reachable through value flow.

This means:

- HM typing answers what a value is.
- Flow/versioning answers where that value can reach.
- Infection rules answer what state is carried along that reachability.

---

## Domain Policies Over the Flow Graph

Domains define policies such as:

- propagation defaults
- merge behavior
- rewrite behavior
- conflict rules
- call restrictions
- return-boundary requirements

Normative:

- These policies are evaluated over the flow/versioning relation, not in
  isolation.
- A domain may reject a call if forbidden state reaches the call site.
- A domain may reject a return if forbidden or undischarged state reaches the
  return boundary.
- A domain may define incompatible states for the same tracked identity.

This is the point where the “versioning” part of the layer becomes essential:
domain rules often care not just that a resource exists, but which state is
reachable on the same tracked identity/binding path.

---

## Boundary Checks

Calls and returns are semantic boundaries.

Normative:

- Domains may require the state at a boundary to be empty.
- Domains may require state to be reified in a carrier at the boundary.
- Domains may reject calls on values carrying particular states.

These are domain-level policies, but they rely on the flow/versioning layer to
determine which state actually reaches the boundary.

---

## Why This Is Not “Another Unrelated Constraint System”

This chapter may appear to introduce a second constraint mechanism alongside HM
and infections.

Canonical design intent:

- HM typing determines node-local type shape.
- Flow/versioning determines the semantic reachability graph for values.
- Infection/domain logic propagates and checks domain state over that graph.

So this layer is not a separate rival to the infection system. It is the
substrate that makes infection propagation meaningful for higher-order and
resource-sensitive programs.

Equivalent intuition:

- HM gives the nodes.
- Flow/versioning gives the edges.
- Domain rules propagate labels over those edges.

---

## Comparison to Regions

Traditional region systems are often brought into the same conversation as this
chapter because they address some of the same broad concerns: making
resource-sensitive reasoning structural rather than purely operational.

Non-normative comparison:

- Both regions and this layer use program structure to make safety questions
  tractable.
- Both care about lexical nesting, boundaries, and non-local consequences of
  value movement.
- Both can be understood as alternatives to "simulate the whole execution" as
  the primary meaning of safety.

Important difference:

- Many traditional presentations of regions are organized around region
  membership, lifetime containment, and escape.
- This chapter's model is organized around lexical accessibility, binding
  context, explicit value flow, and tracked identity reachability.
- A region discipline often preserves safety by restricting where a value may
  go or whether it may escape.
- Workman instead permits broad value flow, including capture, return,
  rebinding, and derived-value movement, and preserves safety by rejecting
  incompatible state collisions on structurally connected identity paths.

This means the primary question is different:

- A region-oriented question is often: does this value outlive or escape the
  region/container it belongs to?
- A Workman-oriented question is: what state is reachable at this occurrence or
  boundary on the same tracked identity lineage?

Informal verbal contrast:

- Region-oriented reasoning is often described as a form of escape analysis.
- Workman's flow/versioning layer is often better described as
  reachability/collision analysis.
- Values may escape, return, alias, or be captured; the important question is
  whether incompatible state becomes jointly reachable on the same tracked
  identity path.

Practical consequence:

- Traditional region systems are often naturally centered on memory/storage
  lifetime.
- Workman's flow/versioning layer is broader: the same substrate can support
  memory/resource tracking, closure-sensitive propagation, taint-like domains,
  effect discharge, and boundary policies.
- Examples such as `main2`, `main3`, and `main6` are therefore better read as
  collision/reachability examples than as simple escape examples.

Reader caution:

- This comparison is intended to orient the reader, not to claim that Workman
  is merely a region system under another name.
- Regions and Workman both aim at structural safety, but they do so with
  different semantic primitives.

---

## Relationship to Closures

Closures are one manifestation of this layer, not the whole layer.

Normative:

- A conforming implementation must preserve capture semantics even if it lowers
  closures by lambda lifting, explicit environment passing, closure objects, or
  another equivalent mechanism.
- No backend is permitted to change program meaning by replacing capture-aware
  flow with ad hoc inlining or name-based substitution.

Implementation-defined:

- The concrete runtime representation of closures, if any.

---

## Non-Normative Implementation Model

The semantics in this chapter can be implemented in more than one way. A
coherent WMC implementation should keep the layers distinct even if it uses a
single internal pass pipeline.

A practical implementation model, informed by the stable ideas explored in
Workman v0, is:

1. Perform ordinary HM typing/inference.
2. Build a value-flow model over normalized expressions.
3. Track binding contexts and nested-scope capture edges.
4. Associate tracked identities with values in domains that require them.
5. Apply domain-specific propagation, merges, rewrites, and boundary checks over
   that flow graph.
6. Lower the already-classified semantics to backend IR/code generation.

Important implementation note:

- The backend must consume this semantic analysis.
- The backend must not rediscover capture/version behavior by ad hoc emitter
  heuristics such as inlining-based simulation.

### v0-Inspired Shape

Non-normative:

- Workman v0 explored this model using explicit constraint-flow primitives such
  as sources, edges, rewrites, alias relations, and boundary requirements.
- That specific API shape is not normative for WMC.
- The semantic lessons are normative in spirit:
  - identity-sensitive propagation
  - same-scope vs nested-capture distinction
  - binding-sensitive rewrites
  - domain policies checked at calls and returns

### A Reasonable WMC Internal Split

Non-normative:

- `Types` / HM inference should continue to describe ordinary value shape.
- A separate flow/versioning analysis should classify bindings, captures, and
  derived-value edges.
- Infection/domain analysis should operate over that result.
- Closure representation planning and backend lowering should consume the
  analysis result rather than define it.

This keeps WMC coherent and avoids repeating the v0 pattern of experiments
stacking semantic and implementation concerns in the same phase.

---

## Worked Examples

The following examples are adapted from the closure/memory experiments in
`workman/whatevertest/test_closure_capture.wm`.

They are included here because the intended semantics are not obvious from a
first reading of the surface syntax alone.

### Example: Capture Preserves Incompatible State Reachability

```workman
let main = () => {
  let buffer = alloc(100);
  print(buffer);     -- rejected: `Closed` is reachable on the same tracked binding
  let useBuffer = () => {
    'X' :> buffer[0]; -- rejected: capture preserves reachability of `Closed`
  };
  free(buffer);
  useBuffer();
};
```

Normative intent:

- `buffer` denotes a tracked value with a resource identity.
- `useBuffer` captures that binding/version of `buffer`.
- `free(buffer)` changes the domain state of that identity.
- Because the nested function captured the binding, uses inside its body remain
  connected to that same identity/state path.
- The write is therefore rejected.

Outcome:

- Rejected.

Reason:

- The mem domain requires the target of the write-like operation to not already
  carry `Closed`.
- The closure body and the outer `print(buffer)` remain connected to the same
  tracked identity/state path on which `Closed` is present.

Typical diagnostic shape:

- `require_not_state` for domain `mem`
- message of the form: operation requires `mem` state to not be `[Closed]`
- with the forbidden `Closed` state pointing back to the `free` operation that
  introduced it

This example exists to make explicit that capture is not “copy the value at
definition time and forget state reachability”. It is capture of a binding in
the flow/versioning model.

### Example: Parameter Passing and Rebinding Preserve Binding Distinctions

```workman
let main2 = () => {
  let buffer = alloc(100);
  print(buffer); -- accepted
  let useBuffer = (buffer) => {
    'X' :> buffer[0];
    buffer
  };
  let buffer2 = useBuffer(buffer);
  free(buffer2); -- accepted
};
```

Normative intent:

- Passing `buffer` as a parameter creates explicit value flow rather than
  implicit closure capture.
- `buffer2` is a new binding context, even if it is derived from `buffer`.
- `free(buffer2)` classifies the continuation of the same identity lineage
  reached through `buffer2`.
- That rewrite does not propagate in the reverse structural direction across
  the `let buffer2 = ...` cut.

Outcome:

- Accepted in the v0 example.

Reason:

- The close is applied to the derived binding `buffer2`.
- The close classifies the shared identity along the continuation reached from
  the derived binding's version view.
- No backflow rule permits that rewrite to propagate in the reverse structural
  direction across the `let` cut.

This is one of the core reasons the model is defined in terms of bindings and
versions rather than raw identifier names.

### Example: Returning a Fresh Value Does Not Contaminate an Outer Binding

```workman
let main3 = () => {
  let useBuffer = () => {
    let buffer = alloc(100);
    'X' :> buffer[0];
    buffer
  };
  free(useBuffer()); -- accepted
};
```

Normative intent:

- The allocated value is created inside the nested function.
- The caller receives that returned value and closes it.
- There is no older outer binding of the same tracked identity that must be
  rewritten.

Outcome:

- Accepted in the v0 example.

Reason:

- The returned resource is consumed at the call site.
- There is no outer captured or pre-existing binding of that same identity to
  contaminate.

This illustrates that value flow is directional. Returning and then consuming a
fresh value is not the same as mutating an already-bound outer variable.

### Example: Same-Binding Use with Incompatible Closed State Is Rejected

```workman
let main4 = () => {
  let buffer = alloc(100);
  'X' :> buffer[0]; -- rejected
  free(buffer);
};
```

Normative intent:

- Canonical Workman does not use Rust-style affine typing, borrow checking, or
  explicit lifetime reasoning as its primary safety mechanism.
- Instead, it uses structural flow/versioning plus domain rules.
- Under those rules, this program is rejected even though many other languages
  would allow it.

Design tradeoff:

- Workman chooses a structurally-checkable rule here instead of a richer
  operational discipline.
- That keeps the model simpler, but it also means some programs that look
  operationally harmless are still rejected.

Outcome:

- Rejected in the v0 example.

Reason:

- The write requires the mem state to not contain `Closed`.
- The same tracked binding/identity also carries `Closed` on that binding path.
- Workman treats that as an invalid structural combination for the same
  binding/identity path, so the use site is rejected.

Typical diagnostic shape:

- `require_not_state` for domain `mem`
- message of the form: operation requires `mem` state to not be `[Closed]`
- with the origin of `Closed` pointing to the close operation that places the
  same tracked binding in an incompatible structural state

Important clarification:

- The design is intentionally not Rust-like in surface form, because it avoids
  affine types, explicit lifetimes, and a borrow checker.
- But it still deliberately rejects some programs that other languages would
  permit.
- This example is one of those cases.

### Example: Repeating a Closing Operation on the Same Returned Binding

```workman
let main5 = () => {
  let useBuffer = () => {
    let buffer = alloc(100);
    'X' :> buffer[0];
    buffer
  };
  let buffer = useBuffer();
  free(buffer); -- rejected together with the repeated close below
  free(buffer); -- rejected: duplicate `Closed` on the same tracked identity
};
```

Normative intent:

- The returned `buffer` carries a tracked identity and state history.
- Repeating `free(buffer)` attempts an incompatible state transition on that
  same identity path and must be rejected.

Outcome:

- Rejected.

Reason:

- The second close introduces another `Closed` state for the same tracked
  identity.
- In the v0 implementation this is surfaced as a duplicate/incompatible mem
  state for that identity.

Typical diagnostic shape:

- `incompatible_constraints` in the mem domain
- message of the form: duplicate `Closed` for the same tracked identity
- often rendered as a conflict between `mem:Closed` and a duplicate/identity
  marker for that resource

This is a versioning example as much as it is a memory example.

### Example: Shared Identity, Different Version Views

```workman
let main6 = () => {
  let buffer = alloc(100);
  print(buffer); -- accepted
  let useBuffer = (buffer) => {
    'X' :> buffer[0];
    buffer
  };
  let buffer2 = useBuffer(buffer);
  'X' :> buffer[1]; -- accepted
  free(buffer2); -- frees buffer
  'X' :> buffer[1]; -- rejected: `Closed` on the derived binding remains reachable here
};
```

Normative intent:

- `buffer2` is derived from `buffer` by explicit flow through the call.
- `let buffer2 = ...` creates a new binding context and a distinct version view
  without creating a fresh tracked identity.
- The two names therefore stay on one tracked identity lineage while exposing
  different reachable versions at different occurrences.
- `free(buffer2)` adds `Closed` on the continuation of that lineage reached
  through `buffer2`.
- That rewrite propagates along the continuation reachable from the rewrite
  site.
- It does not backflow across the `let` cut into the distinct version view
  denoted by the already-resolved `buffer` occurrence.

Outcome:

- The first post-call use is accepted in the v0 example.
- The second post-call use is rejected.

Reason:

- The decisive step is `let buffer2 = useBuffer(buffer)`.
- That `let` introduces a new binding context and version cut.
- The first post-call `buffer` use denotes one reachable version view of the
  shared lineage, so it remains accepted.
- `free(buffer2)` classifies the continuation of that same lineage reached
  through `buffer2` with `Closed`.
- The later `buffer` use denotes a reachable version view on that classified
  continuation, so `Closed` is reachable there and the use is rejected.
- The split is therefore not "same thing vs different thing". It is one
  identity, multiple occurrence-relative version views, and no backflow.

What this example proves:

- Binding separation is semantically real even when identity separation is not.
- A `let` cut can preserve the same tracked identity while splitting version
  views seen by different occurrences.
- Domain rewrites propagate along reachable continuation on that lineage, not
  in the reverse structural direction across the cut.
- Workman can therefore accept one occurrence and reject another on the same
  underlying identity without collapsing them into one denotation.

Typical diagnostic shape:

- `require_not_state` for domain `mem`
- message of the form: operation requires `mem` state to not be `[Closed]`
- with the reported origin of `Closed` pointing back to the `free(buffer2)`
  operation

This example demonstrates that the model is not merely "latest assignment
wins". It is also not a simple "escape is bad" discipline. It is
identity-sensitive reachability across derived bindings, with occurrence-
relative version views and forward-only rewrites doing real semantic work.

Important clarification:

- This example can look superficially like an affine, linear, or ownership
  transfer example.
- That reading is misleading.
- Workman is not explaining `main6` by saying that `buffer` was moved into
  `buffer2` or invalidated by ownership transfer.
- The program shape is permitted.
- The rejection arises because `free(buffer2)` places `Closed` on the reachable
  continuation of a tracked identity lineage that the rejected outer `buffer`
  occurrence denotes.

---

## Status and Future Work

This chapter intentionally fixes the semantic role of flow/versioning before
freezing a specific compiler-internal algorithm.

Expected future refinement:

- a more formal definition of identities and versions
- explicit rules for aliasing domains
- examples covering closure capture and resource/memory safety
- a more explicit pseudo-formal account of same-scope vs nested-capture
  propagation
- a cross-reference section describing how WMC’s internal passes realize this
  semantic layer without changing the language contract
- cross-reference to infection boundary policies once those are fully specified
