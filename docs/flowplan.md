# Flow Plan

This note defines the intended shape for flow, capture, and closure-related
semantics in `wmgr`.

It is not a separate-pass design.

The point of `flow.gr` is to give this semantic model a home without turning
`infer.gr` into a giant pile of ad hoc bookkeeping.

## Core Direction

Flow/versioning must be native to the ordinary HM inference walk.

That means:

- no "infer HM first, derive flow later" pass
- no backend/TCore capture reconstruction by expression walking
- no sidecar model that watches HM from the outside

Instead:

- `infer.gr` remains the driver
- `flow.gr` holds the semantic data structures and helper operations
- inference calls into `flow.gr` at the same structural points where HM already
  introduces bindings, resolves names, enters lambdas, and handles calls

So `flow.gr` is a utility/substrate module used during inference, not a second
semantic pass after inference.

## High-Level Architecture

The intended split is:

- HM typing answers: what is this value's type?
- flow answers: which binding/identity/scope facts does this occurrence denote?
- infection answers: what domain state propagates over those facts?
- backend answers: how do we lower the already-classified semantics?

This implies a hard boundary:

- if a fact depends on lexical resolution, binding context, capture,
  callable shape, or transfer lineage, it must be produced during inference
  through the flow substrate
- TCore and backend may project and consume those facts, but must not
  rediscover them from syntax

## Minimal Semantic Model

The model should stay small and close to what v0 was actually using.

We do not need a giant abstract graph model up front.

The main semantic ingredients are:

- `bindingId`
- `scopeId`
- tracked `identityId`

These correspond to:

- binding context
- lexical nesting / capture boundary
- tracked value lineage

### Binding

Every active value binding should carry more than just a type scheme.

Conceptually:

```grain
record ValueEntry {
  scheme: Types.Scheme,
  bindingId: Number,
  scopeId: Number,
  identities: DomainIdentities,
}
```

where `DomainIdentities` is conceptually:

```grain
type DomainIdentities = Map.Map<String, List<Number>>
```

This means name lookup becomes semantic lookup, not just HM scheme lookup.

### Expression Identity Attachment

Tracked identities should also be attachable to expressions.

Conceptually:

```grain
exprIdentities: Map.Map<Number, DomainIdentities>
```

This is needed so inference can transfer identities through lets, calls,
pattern binding, and returns without a second AST walk.

### Identity Usage

The most important v0 lesson is that we must record where a tracked identity is
used, together with the binding/scope context of that use.

Conceptually:

```grain
record IdentityUse {
  nodeId: Number,
  scopeId: Number,
  bindingId: Number,
}
```

and then:

```grain
identityUsage: Map.Map<Number, Map.Map<String, List<IdentityUse>>>
```

This is what allows:

- same-binding propagation
- nested-scope capture propagation
- later infection/domain checks
- explicit closure planning for backend lowering

### Function Metadata

Function values should get explicit metadata after inference discovers their
capture facts. Capture may emerge naturally from lookup in nested scope, but the
result must be materialized explicitly for later phases.

Conceptually:

```grain
record FunctionInfo {
  fnId: Number,
  nodeId: Number,
  scopeId: Number,
  paramBindingId: Number,
  capturedBindings: List<Number>,
  callMode: CallMode,
}

enum CallMode {
  UnitThunk,
  UnaryValue,
}
```

Important:

- captures should be recorded as bindings, not names
- backend should consume `FunctionInfo`, not recompute free variables

## Native-to-Infer Integration

The system is native to HM if semantic facts are created at the exact same
points where HM already determines program structure.

Those points are:

- binding introduction
- identifier lookup
- lambda entry
- application
- let generalization/rebinding
- pattern binding

### 1. Binding Introduction

Whenever inference introduces a binding:

- let-bound name
- lambda parameter
- pattern-bound variable
- recursive placeholder

it should also:

- allocate a fresh `bindingId`
- associate that binding with the current `scopeId`
- create a full `ValueEntry`

This must happen immediately, not later.

### 2. Identifier Lookup

Identifier lookup should no longer mean only:

- find scheme
- instantiate scheme

It should mean:

- find `ValueEntry`
- instantiate scheme
- recover `bindingId`
- recover `scopeId`
- recover attached identities
- record identity usage for this occurrence

Conceptually:

```grain
record LookupResult {
  ty: Types.Type,
  bindingId: Number,
  scopeId: Number,
  identities: DomainIdentities,
}
```

This is the key reason the model is native to HM and not a post-pass.

### 3. Lambda Entry

The HM lambda rule already:

- creates a parameter type
- extends env
- infers body
- constructs a function type

This is exactly where flow semantics should also:

- allocate a fresh function scope id
- allocate the parameter binding id
- push current function/scope context
- record captures when the body resolves outer bindings
- finish with explicit `FunctionInfo`

Closure capture should therefore arise from ordinary identifier resolution in a
nested scope, not from later backend walking.

### 4. Application

The HM application rule already:

- infers callee
- infers argument
- unifies with function type
- produces result type

This same step should also:

- transfer tracked identities from argument expression to parameter binding
  when applicable
- attach result identities to the call result where the callable/domain rules
  require it

This makes call-flow native to inference as well.

### 5. Let Rebinding

For:

```workman
let x = e
```

inference of `e` should produce both:

- type of `e`
- any identities attached to `e`

Then the let rule should:

- allocate a fresh binding id for `x`
- bind `x` to those identities
- preserve tracked lineage through rebinding

This keeps rebinding structural and avoids a later pass inventing transfer edges
from syntax.

## Closure Capture

Closure capture should be understood as an ordinary consequence of lookup in a
nested scope.

When a nested function body resolves an outer binding:

- HM gets the binding's type as usual
- flow also sees that the resolved binding belongs to an outer scope
- identity usage is recorded with the inner scope id and outer binding id
- that usage is therefore a capture

After the function body is inferred, those captured bindings should be
materialized into `FunctionInfo.capturedBindings`.

Important boundary:

- capture discovery may be emergent during inference
- capture data must be explicit after inference
- backend must not rediscover captures by free-name walking

## Function Arguments

Function arguments should be treated as ordinary bindings.

Each parameter gets:

- a fresh `bindingId`
- the lambda's `scopeId`
- an HM type entry

If a call passes a tracked value into that parameter, the parameter binding
should be associated with the argument's identities.

This means:

- parameters participate in the same model as lets and pattern bindings
- a captured parameter is just a captured binding
- backend does not need a separate "captured arg" semantic system

## What `flow.gr` Should Contain

`flow.gr` should be a semantic substrate module, not a second traversal.

It should contain:

- core record/type definitions
- flow state carried by inference
- fresh-id allocators for bindings/scopes/functions/identities
- binding/env helper utilities
- identity attachment helpers
- identity-usage recording helpers
- function/capture recording helpers
- small structural query helpers used by later phases

It should not contain:

- a separate full-program AST walk
- backend-specific closure analysis
- a second semantic interpretation of expressions

If `flow.gr` starts recursively analyzing expressions on its own, the design is
drifting again.

## What `infer.gr` Should Continue To Own

`infer.gr` should continue to own:

- traversal order
- HM inference
- unification
- generalization/instantiation
- deciding when semantic events occur

So the intended pattern is:

- infer sees a semantic event
- infer calls a `flow.gr` helper
- infer continues

## What Backend Must Eventually Consume

The Zig backend needs explicit closure/callable facts because Zig has no native
closures.

That is a reason to make those facts explicit earlier, not later.

Backend should eventually consume:

- explicit function metadata
- explicit captured binding sets
- explicit call mode (`UnitThunk` vs `UnaryValue`)
- binding-based closure env layout inputs

Backend must not:

- recompute captures from names
- infer callable shape from normalized syntax alone
- recover semantics by emitter heuristics

## Migration Direction

The implementation sequence should be:

1. Add `src/core/flow.gr` with the semantic state and helper API.
2. Extend env value entries to carry semantic binding info.
3. Extend infer state with flow state.
4. Refactor lookup to return both type and semantic binding/identity facts.
5. Refactor binding introduction helpers to allocate real binding ids.
6. Add lambda scope/capture recording.
7. Add application-time argument-to-parameter identity transfer.
8. Materialize explicit `FunctionInfo` for later phases.
9. Move backend closure planning to consume those facts instead of free-var
   walks.

## Current Status

This section tracks what has already been implemented in WMC and what still
needs to be done to match the intended design and the reference semantics.

### Implemented

- `src/core/flow.gr` exists and is used as infer-time semantic substrate, not a
  second pass.
- env value entries now carry semantic binding information rather than bare
  schemes.
- infer state now carries flow state.
- lookup now returns semantic facts together with the instantiated HM type.
- binding introduction allocates real `bindingId`s for:
  - let bindings
  - pattern bindings
  - parameter bindings
  - recursive placeholders/final bindings
- lambda inference creates fresh scope ids and explicit function records.
- nested-scope identifier lookup records captures during ordinary inference.
- explicit function metadata is projected into TCore/TCoreNorm.
- backend closure planning no longer discovers captures by free-var walks.
- direct Zig emission no longer computes captures from local syntax walks.
- flow state now includes the beginning of infer-time call/result structure:
  - identity creation state
  - expression-to-binding references for direct denotation
  - explicit arg-to-param flow records
  - function result binding/result identity tracking
- applications now record arg-to-param flow during inference.
- direct call-result lineage is now preserved for:
  - functions that directly return their parameter binding
  - functions whose body directly returns tracked identities already attached to
    the returned expression

Concretely, the currently implemented substrate is strongest for:

- binding-sensitive lookup
- scope-sensitive capture discovery
- explicit function/capture metadata for later phases
- initial call-flow and narrow result-flow cases

### Not Yet Implemented

The remaining work is mostly about the *flow/versioning* half of the design,
not the already-started closure metadata half.

- There is not yet a full infer-time call/result-flow model.
  - arg-to-param flow is now recorded, but it is not yet consumed by infection
    or later semantic propagation
  - result identities are attached only for narrow structurally direct cases,
    not for general derived-value returns
  - return/result flow is still only partially modeled
- `let` rebinding currently preserves attached identities only when the value
  expression already has them; this is not yet enough to model the reference
  chapter’s derived-binding/version-cut behavior through calls and returns.
- `flow.gr` now has identity allocator and creation-scope storage, but WMC does
  not yet broadly *use* it the way v0 did for infection-domain operations.
- backend still receives captures as binding ids *and* names, but the final
  closure env planning path is not fully binding-id driven yet.
- Infection still does not consume a full flow/versioning model as described in
  the reference chapter; right now the new substrate is primarily being used to
  establish correct denotation/capture facts and feed backend metadata.

### Important Clarification About "Versioning"

The current gap is **not** that WMC lacks an explicit `VersionId` object.

Workman v0 also got version-like behavior mostly *implicitly* from structural
facts:

- tracked identities
- binding-sensitive usage
- nested-scope capture behavior
- identity creation scope
- rebinding through expression identities
- call/result propagation and rewrites

So for WMC the goal is **not** necessarily to invent explicit version objects.
The goal is to implement enough infer-time structural flow that the intended
versioning semantics can emerge correctly.

That means the most important missing work is:

- broader result-flow
- rebinding/cut behavior across explicit transfer
- making infection propagation actually run over the new flow substrate
- turning stored identity creation/call-flow facts into real semantic
  propagation/checking behavior

not "invent a separate version datatype because the reference chapter talks
about versions".

## Comparison With v0

The v0 implementation is useful here as a structural reference, even though its
implementation shape was more tacked on than what WMC should become.

### v0 mechanisms already mirrored in WMC

- binding identity
  - v0: `createNewBindingForVar` in
    `C:/Git/workman/src/layer1/infer.ts`
  - WMC: `freshBindingId` / `bindScheme` in
    `C:/GIT/workmangr/src/core/flow.gr`
- scope tracking
  - v0: `functionParamStack` and `scopeId` in
    `C:/Git/workman/src/layer1/context.ts`
  - WMC: `currentScopeId`, `freshScopeId`, `withFreshScope`
- expression identity attachment
  - v0: `setExprIdentities`
  - WMC: `recordExprIdentities`
- expression-to-binding direct denotation
  - WMC: `exprBindingRefs` / `recordExprBindingRef`
- nested-scope capture discovery during lookup
  - v0: uses `scopeId` + `identityUsage` + nested propagation logic
  - WMC: `lookupEnv` records usage and calls `noteCapture` when lookup crosses
    scope
- identity creation scope storage
  - v0: `identityCreationScope`
  - WMC: `nextIdentityId` + `identityCreationScope` in `flow.gr`
- initial application/result structure
  - WMC: `argParamFlows`, `resultBindingIds`, `resultIdentities`

### v0 mechanisms not yet mirrored in WMC

- explicit fresh tracked identity creation
  - v0: `freshResource()` usage in call/op handling in
    `C:/Git/workman/src/layer1/infer.ts`
  - WMC has the allocator now, but not yet the corresponding broad infer-time
    use sites
- rebinding from expression identity attachment
  - v0: `bindIdentitiesFromExpr` in
    `C:/Git/workman/src/layer1/infer.ts`
  - WMC has the destination-side hook and narrow call-result attachment, but
    the application/result path is still not populating expression identities
    broadly enough for general derived returns
- same-binding vs nested-capture propagation logic
  - v0: `emitIdentityTagsToUsage` in
    `C:/Git/workman/src/layer1/infer.ts`
  - WMC records identity usage but does not yet have the corresponding
    propagation/rewrite logic over that data
- call/result flow edges as first-class semantic facts
  - v0: `emitConstraintFlow` at call sites in
    `C:/Git/workman/src/layer1/infer.ts`
  - WMC now records initial arg/result function-flow facts, but does not yet
    have the broader equivalent semantic propagation over them

### Practical Reading Of The v0 Comparison

So the current WMC state is:

- capture discovery and backend projection are now on a much better path than
  before
- the implementation is structurally closer to v0 on lookup/binding/scope
- the implementation has now entered the *application/result* path too
- the biggest missing parity is still the broader *result/rebinding/
  propagation* path

That is the area most likely to matter for the reference chapter’s examples
such as:

- explicit parameter passing vs capture
- derived bindings after calls
- shared identity with distinct occurrence-relative reachable views
- forward-only rewrite visibility across `let` cuts

## Hard Rules To Preserve

- flow is not a post-HM pass
- flow is not backend analysis
- closure capture is discovered during ordinary inference lookup
- backend consumes explicit capture metadata
- parameters are ordinary bindings in the same model
- binding/scope/identity are the core semantic axes

If a later phase needs a fact about:

- denotation
- capture
- callable shape
- transfer lineage
- binding-sensitive reachability

then that fact must be added to the infer/flow substrate, not reconstructed in
TCore or backend.
