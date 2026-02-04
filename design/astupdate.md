i would disagree about two contexts, params => block is mathematically equivalent to pat => block

Yep — mathematically they’re the same thing. My “two contexts” point wasn’t about meaning, it was about parsing + later invariants.

You can 100% adopt the stance:

=> always introduces a clause: Clause(patterns, guard?, body)
and “lambda params” are just “patterns in parameter position”.

That’s consistent and honestly elegant.

Where the “two contexts” still matters in practice is:

What grammar constructs are allowed on the left of => (so you can parse without ambiguity), and

What semantics you assign to non-matching in parameter position (so your typechecker/evaluator knows what to do).

If you solve those, then yes: there is no conceptual difference.

The real crux: what does it mean if a “param pattern” doesn’t match?

If you allow full patterns in “lambda params” (because it’s the same as match arms), you’ve implicitly defined:

let f = (Some(x)) => { x };


When called as f(None), what happens?

There are only a few coherent answers:

A) It’s a compile-time error unless the clauses are exhaustive

So f is rejected unless you also provide None => ....

This is the cleanest if you want “functions are checked like matches”.

B) It’s a runtime match failure (panic / error)

This is what ML-family languages typically do for function clauses.

C) It returns an “unmatched” value (Option / Result) automatically

Cool idea, but it bleeds into the type system hard.

D) You restrict patterns in parameter position (at least initially)

This is the “engineering choice” route: you keep the math, but limit syntax for sanity.

You can still say “they’re the same thing”, while saying “the language restricts which patterns may appear in parameter position”.

Parsing: it can be one construct, but you still need a delimiter rule

Even if params => block == pat => block, the parser needs to know when it is parsing:

a clause list (bundle literal / function literal), vs

an ordinary expression that happens to contain => as an operator (your macro-infix experiments).

The usual way to keep this clean is:

=> is not a general infix operator in the expression precedence table.

Instead, it appears only inside ClauseList grammar productions:

FnLiteral := "match" "{" ClauseList "}" (or { ClauseList } if you generalize)

FirstClassMatch := "match" "(" exprs ")" "=>" Block (surface sugar)

That still respects your “mathematically one thing”: a ClauseList is a FnExpr, and => is the clause separator everywhere it appears.

So: one semantic construct, one AST, but “where => can appear” is constrained by grammar.

If you want the purest version: make all functions be clause lists

This is the “Haskell-ish equations” direction, but cleaner:

Function value is always “clauses” (possibly 1).

Match is just “apply scrutinees to a function value”.

Canonical AST (minimal)

Expr.Fn(FnExpr) — a list of items (clauses / includes / trivia)

Expr.Apply(fn: Expr, args: List<Expr>) — ordinary application

FnClause(patterns: List<Pattern>, guard?: Expr, body: Block)

FnItem = Clause | Include | Trivia | Hole

Then:

(p) => { body } parses as Expr.Fn([Clause([p], None, body)])

match(x) { ... } parses as Expr.Apply(Expr.Fn([...]), [x])

match(x) => { ... } is just sugar that returns an Expr.Fn(...) whose body applies the bundle to the parameter(s)

This achieves your “under the hood one canonical form”.

What I’d change in your current approach to match this

Right now you have:

ExprKind.Lambda(Pattern, Block)

plus separate MatchApply, plus separate BundleExpr

To unify harder, you remove Lambda and MatchApply, and replace with:

ExprKind.Fn(FnExpr)

ExprKind.Apply(Expr, List<Expr>) (or Apply(List<Expr>, Expr) if you want pipe-friendly order)

And keep your bundle stuff as the internal representation of FnExpr:

BundleItemKind.Case(...) becomes FnItem.Clause(...)

Include(Name) stays

Compose becomes optional (you can normalize includes into Compose later if you want)

So you still get:

bundles

inline arms

bundle references

first class match
…all represented as “functions with clauses”.

"If you want the purest version: make all functions be clause lists", this seems solid. how is it "cleaner" than haskell ish equation?

Because the “Haskell-ish equations” idea is *two* things mixed together:

1. **A function is defined by multiple equations** (pattern clauses), *and*
2. **Those equations live in the declaration syntax** (not as a first-class expression form in the same way).

In Haskell, you *can* model functions as a first-class “case lambda”, but the everyday “equation style” is tied to top-level / `where` / `let` bindings, and has extra quirks (guards syntax, layout rules, currying defaults, etc.). It’s beautiful, but it’s also *historically shaped*.

What I meant by “cleaner” for Workman is: you can take the *core semantic idea* (“a function is a list of clauses”) and make it **uniform and first-class everywhere**, without inheriting the “equations live in declarations” split.

Here’s the difference in practice.

---

## 1) One construct everywhere (no “special top-level equation mode”)

### Haskell-ish equation style (conceptually)

You usually write:

```hs
f 0 = "zero"
f 1 = "one"
f _ = "other"
```

That’s not an expression. It’s a *binding form* that expands into a function.

You can get an expression-ish equivalent via `\case` or `case` lambdas, but it’s not the *same surface construct* and the ergonomics differ.

### Your “all functions are clause lists” approach

You make the *same syntax* be usable:

* as a value expression
* nested inside another expression
* inside a data structure
* returned from a function
* passed as an argument

i.e. your clause list is *the function literal*, not a “special declaration sugar”.

That’s the “cleaner”: one mental model.

---

## 2) Match is just “apply scrutinees to a clause-function”

In most languages, `match` is its own construct, and function clauses are another construct.

Your version makes them literally the same thing under the hood:

* `bundle` **is a function value** (clauses)
* `match(x) { ... }` **is just** `Apply(bundle, [x])`
* “first class match” is just returning the bundle

That collapses a whole family of special cases.

Haskell’s equation style doesn’t unify `case` and function equations into one *AST primitive* as cleanly, because `case` is expression-level and equations are binding-level sugar (again: you can desugar, but the surface + tooling model is split).

---

## 3) Guards / includes / composition become normal “items in the clause list”

Workman’s bundles + includes are a big deal:

```workman
let describe = match(n) => { zero, one, other };
```

In equation-land, you’d have to invent “equation includes” or do a second layer of macro-expansion.

In your approach, the clause list can just contain **items**:

* `Clause(patterns, guard?, body)`
* `Include(name)`
* `Trivia(...)`
* `Hole(...)`

That’s super direct for both parsing and tooling.

So it’s “cleaner” because you don’t end up with:

* *equations* vs *case arms* vs *bundle includes* as three separate surface mechanisms

Instead you get one: `FnItem`.

---

## 4) Tooling becomes simpler (Hazel-style + formatter)

This matters a lot for you.

If “function literal” and “match bundle literal” are the same thing, then:

* holes inside them are the same
* comments/trivia rules are the same
* formatting rules are the same
* AST explorer rules are the same

Equation style tends to force “binding-specific” handling:

* groups of equations
* layout-sensitive parsing (often)
* declaration-level attachment rules

You can avoid all that by making clause lists just another expression form.

---

## 5) You avoid accidental semantics you don’t want (like currying defaults)

Haskell’s equation style comes bundled with:

* currying everywhere
* multi-arg functions as nested lambdas
* pattern matching over curried args as multiple equations with multiple parameters

That’s fine in Haskell, but Workman explicitly doesn’t want “implicit currying” in call syntax.

If your core is `Fn(patterns...)` + `Apply(args...)` (fixed arity), you’re not fighting inherited semantics.

---

# So what’s the “clean” essence?

**Haskell equations:** *a binding form that expands to a function with clauses.*

**Workman “purest”:** *a first-class expression form that is literally a list of clauses; “match” is just applying it.*

Same spirit, but less split across syntactic categories.

---

## Tiny example of the cleanliness

With the “function = clause list” core, these are *the same AST shape*:

```workman
let f = match { 0 => {a}, _ => {b} };
let g = (x) => { match(x) { 0 => {a}, _ => {b} } };
let h = match(x) => { 0 => {a}, _ => {b} };
```

All are basically:

* `Fn([...clauses...])`
* optionally wrapped in `Fn([Clause([x], body=Apply(Fn(clauses), [x]))])` for the sugar form

That uniformity is what I meant.

---

If you want, I can write the *canonical core* for just these pieces (Expr/Fn/FnItem/Apply + lowering rules for `match(...) => { ... }` and bundle includes) in the same “no code, just AST shape” style you’ve been iterating with.


i am also pretty curious about having implicit currying too, not necessarily as a default, but id rather disable currying from a post processing view instead of inability. though also if currying doesnt naturally fit this design i might leave it for later

Yeah — you can absolutely keep the *possibility* of currying without making it the default, and without letting it infect your core AST.

The trick is: **treat currying as a typechecker / elaboration policy**, not as “what Apply means”.

So you keep a *fixed-arity* core apply, and allow an *elaboration* that can rewrite partial applications into lambdas **when (and only when) the language mode/policy allows it**.

That gives you exactly what you want: “disable currying from a post-processing view”.

---

## 1) Keep the core meaning of Apply fixed-arity

Keep something like:

* `Apply(callee, args: List<Expr>)`

Interpretation: “call callee with exactly these args”.

No currying implied. This keeps everything (parser, formatter, AST explorer, later passes) sane.

Then you add **one optional elaboration step**:

* If `callee` has function type `(A, B, C) -> R`
* and you see `Apply(callee, [a])`
* you may elaborate into: `Lambda(patB, Lambda(patC, Apply(callee, [a, b, c])))`
  (or whatever clause-list core you prefer)

This is *exactly* “post processing”.

### Why this is nice

* Turning currying **off** is just “don’t run that rewrite” (or make it an error).
* Turning it **on** is purely local and typed.
* It doesn’t affect parsing, formatting, holes, trivia, etc.

---

## 2) Make it a *policy*, not a syntax rule

You can support a matrix like:

* **Mode A (default)**: fixed arity only
  `f(1)` is an error unless `f` truly expects 1 arg.

* **Mode B (opt-in)**: typed partial application allowed
  If the type says more args remain, `f(1)` becomes a function value.

* **Mode C (sugar)**: allow placeholders `_` / `?` in arg positions
  `f(_, 3)` elaborates to `x => f(x, 3)` (again: purely post-parse)

This is really clean because you don’t have to decide today whether Workman is “a currying language”. You just decide whether you *elaborate* partial applies.

---

## 3) Does currying “fit” the clause-list / bundle design?

It can, but there’s a philosophical choice:

### Option 1: Currying = returning a new function that waits for more args

This fits fine. Your function value is “a clause list over N args”. Partial application returns “a clause list over remaining args”, with captured bindings.

Even with multi-scrutinee match, it still works: you’re just fixing a prefix of the scrutinee list.

### Option 2: Workman is fundamentally “multi-argument match over a tuple”

If internally your function always takes **one argument** (like a tuple-of-args), then “currying” is just tuple construction tricks:

* full apply = pass full tuple
* partial apply = build a closure that fills the tuple later

That also works, but it pushes you toward “tuple-as-arg is the real model”, which might or might not match your ergonomics goals.

**Either way, it doesn’t force a change to the AST.**

---

## 4) The one place currying *can* get annoying: pipes

Your pipe `:>` is already an “apply sugar”.

If you allow partial application, you need one rule that keeps `:>` predictable:

* In fixed-arity mode: `a :> f(b)` → `f(a, b)`
* In curry mode: decide whether `f(b)` is:

  * “call f with b” (produces value), or
  * “partial apply f to b” (produces function)

If you make partial apply typed, then the ambiguity resolves at typecheck, but the UX can feel weird in an editor (temporarily unknown types = temporarily unknown meaning).

**So my recommendation:**

* Keep `:>` elaboration *syntax-directed* (always insert as first argument).
* Keep partial application an *explicit* choice if you want it early (placeholders or a `curry` keyword), and only later consider implicit.

That lets you preserve the “pipes always behave” intuition while still leaving the door open.

---

## 5) Practical recommendation for you right now

Given your Hazel-style goals + holes + total formatting:

1. **Keep core apply fixed-arity.**
2. Add a **single elaboration hook** in the typechecker stage:

   * “if partial apply and policy allows, rewrite to lambda/clauses”
3. Don’t let currying change parsing/lowering yet.
4. If you want the ergonomics early without implicitness, add a single explicit sugar later:

   * placeholder args, or
   * `partial f(1)` / `curry f(1)`.

This keeps your AST and your “one canonical match/function form” vision intact.

---

If you tell me which call syntax you’re leaning toward long-term (always `f(a,b)`? allow `f a b`? keep pipe as primary?), I can sketch what the *typed elaboration rules* would look like in Workman terms without changing your AST at all.


i am thinking match over tuple since that would fit the pipe operator

Nice — **“functions are match over a tuple”** is *really* compatible with `:>` because `:>` is basically “build/extend the tuple and keep going”.

Here’s a clean way to think about it that keeps your AST simple and still leaves the door open for currying later.

---

## 1) One canonical function form: match on a single scrutinee

Make the core idea:

> A function takes **one value** (the “argument”), and it pattern-matches on it.

So the canonical function is essentially:

* `Fn = BundleExpr` (or “clause list”) over **one pattern**

and multi-arg functions are just functions whose *single argument is a tuple*.

### Canonical shape

* a function value: `Lambda(paramPattern, bodyBlock)` (or your clause-list form)
* where `paramPattern` can be `Tuple([...])`

So this:

```workman
let f = (a, b) => { ... }
```

is canonically:

* `Lambda(Pattern.Tuple([Var(a), Var(b)]), Block(...))`

No special “multi-arg” function concept required.

---

## 2) Calls become “apply with one argument”

Then the canonical apply is:

* `Apply(callee, arg: Expr)`  **(one arg, not a list)**

and multi-arg call syntax is sugar that builds a tuple:

```workman
f(x, y)
```

canonicalizes to:

* `Apply(f, Tuple([x, y]))`

This is the big simplification: **your core call node never needs a list**.

You can still *parse* `Call(List<Expr>)` and lower it into `Apply(Tuple(...))`, but the core is single-arg.

---

## 3) Pipe `:>` becomes “append into the tuple”

Now `:>` fits like a glove.

Think of `:>` as “feed a value into the *left* of an application pipeline”.

### Canonical rule (simple + predictable)

Treat `a :> f` as:

* `Apply(f, a)` (single arg)

Treat `a :> f(b, c)` as:

* `Apply(f, Tuple([a, b, c]))`

Treat `a :> f(b)` as:

* `Apply(f, Tuple([a, b]))`

So `:>` is just “prepend to the tuple-arg of the next call”.

### What about `a :> charToInt` (no parentheses)?

That’s just `Apply(charToInt, a)` — which is exactly what you want for your pipe-heavy style.

---

## 4) How to represent `match` and bundles under this model

If your function is “match over tuple”, then a **match expression** is the same mechanism, just immediately applied.

So you can unify the concepts like this:

* A **bundle** is a clause-list from an input pattern to a block result.
* `match(x) { ... }` is “apply bundle to scrutinee”.

### Minimal canonical core

You only need these (conceptually):

* `BundleExpr` (your clause list, supports Include/Ref/Compose)
* `ApplyBundle(bundle, scrutineeExpr)` *or* just `Match(scrutinee, bundle)` if you like that name.

Everything else is sugar:

* `match (a, b) => { ... }` is a function value where the scrutinee is a tuple pattern.
* `match(a, b) { ... }` desugars to `Match(Tuple([a, b]), bundleLiteral(...))`.
* “first-class match” is literally just a function value whose body is a match, or even just the bundle itself depending on what you choose to expose.

---

## 5) Currying later: still possible, but now it’s a policy choice

Tuple-arg model naturally *prefers* fixed arity, because “arity” = tuple size.

But you can still add currying *as elaboration* in a controlled way:

### Option A: No implicit currying (likely your default)

* `f(1)` is only valid if `f` expects a 1-tuple (or non-tuple) argument.

### Option B: Implicit currying via “tuple prefix”

Allow: if `f` expects `(A, B, C)` and you pass `(A)` then result is a function expecting `(B, C)`.

This is easy to implement as a typed rewrite:

* `Apply(f, a)` becomes:

  * if `f : (A,B,C)->R` then rewrite to `Lambda((b,c), Apply(f, Tuple([a,b,c])))`

But I’d personally keep this **off** at first, because:

* it makes incomplete programs ambiguous in the editor (especially with holes)
* it can make `:>` chains behave “mysteriously” before types settle

### Option C: Explicit partial application

Use `_` / `?` placeholders or an explicit `partial` form later.

This gives you the ergonomics without losing predictability.

---

## 6) What I’d change in your AST to match this direction

If you go “match over tuple” fully, the biggest cleanup is:

* make **Apply take one arg**
* make **Match scrutinee be one expr**
* treat multi-scrutinee as *surface sugar* that builds a tuple

So instead of:

* `MatchApply { scrutinees: List<Expr>, bundle: BundleExpr }`

you’d canonicalize to:

* `MatchApply { scrutinee: Expr, bundle: BundleExpr }`
  where `scrutinee` is often `Tuple([...])`.

Similarly, prefer:

* `Apply(callee, argExpr)`
  over list-arg calls in the core.

Everything else can stay basically the same.

---

If you want, I can rewrite your *match/bundle/call/pipe* part into a super small “core AST nucleus” (just the relevant nodes + what is sugar vs core) so you can sanity-check that “one canonical form” goal is actually achieved.

---

## Concrete AST Redesign Plan (unified fn/match + macro-op clarification)

This revision is aligned with current behavior in `src/frontend/lower.gr` where `=>` already behaves as a dedicated lowering form and not a general semantic infix operator.

### 1) Clarification: `=>` is a reserved macro-op, not a general infix op

`=>` should remain parseable from infix syntax shape, but semantically:

- it is a reserved macro-op token/path
- it only lowers to clause/function constructs
- it never competes with ordinary operator dispatch

To avoid future confusion, rename in surface IR terminology:

- from: `InfixChain("=>")`
- to: `MacroOp("=>")` (or `MacroInfix("=>")`)

This can be a type rename only; behavior stays the same.

### 2) Keep a strict Surface/Core AST split

Surface AST can stay permissive and syntax-oriented:

- `InfixChain` / `MacroOp`
- `Postfix.Call(List<Expr>)`
- existing `MatchApply`, `Bundle`, `Lambda` during migration

Core AST should be semantic and uniform:

- `ExprKind.Fn(FnExpr)`
- `ExprKind.Apply(Expr, Expr)` (single argument)

Core function/match nodes:

- `record FnExpr { node, items: List<FnItem>, attach }`
- `enum FnItemKind { Clause(FnClause), Include(Name), Trivia(Trivia), Hole(Hole) }`
- `record FnClause { node, param: Pattern, guard: Option<Expr>, body: Block, attach }`

### 3) Canonical semantics (tuple argument model)

- all functions accept one argument value
- multi-arg functions are tuple-pattern functions
- all calls in core are single-arg `Apply`

Canonical lowerings:

- `(p) => { body }` -> `Fn([Clause(param=p, guard=None, body)])`
- `match(x) { clauses }` -> `Apply(Fn(clauses), x)`
- `match(a, b) { clauses }` -> `Apply(Fn(clauses), Tuple([a, b]))`
- `f(x, y)` -> `Apply(f, Tuple([x, y]))`
- `a :> f` -> `Apply(f, a)`
- `a :> f(b, c)` -> `Apply(f, Tuple([a, b, c]))`

### 4) Macro-op (`=>`) expansion contract

Given current lowering patterns in `src/frontend/lower.gr`:

- `matchExpr => blockOrBundle` expands to function-valued form (currently `Lambda(None, MatchApply)`; future `Fn`)
- `lhs => rhs` expands as clause only when `lhs` is valid param/pattern and `rhs` is block (or expression wrapped as block by policy)

Hard rule:

- any `=>` form that cannot lower to valid clause/function shape is a compile error
- there is no fallback meaning for `=>`

### 5) Current-code grounding (what this fixes)

Observed now:

- Parser stores `=>` as infix chain in `parseExpr` (`src/frontend/parser.gr:182`)
- `parseMatch` builds `MatchApply` + empty bundle shell (`src/frontend/parser.gr:1018`)
- Lowering pattern-matches `InfixChain(... "=>"... )` and rewrites (`src/frontend/lower.gr:87`)

This redesign keeps that flow, but makes intent explicit by naming it macro-op and targeting one core representation.

### 6) Policy kept out of core AST

- param-pattern non-match behavior remains checker/runtime policy
- default policy can be runtime failure first, then optional exhaustiveness checks
- implicit currying remains an optional typed elaboration pass, not parser/core-AST semantics

### 7) Incremental migration plan (file-by-file)

1. `src/core/ast.gr`
   - add `FnExpr`, `FnItem`, `FnClause`, `ExprKind.Fn`, `ExprKind.Apply`
   - add/rename surface marker for macro-op (`MacroOp` or equivalent)
2. `src/frontend/lower.gr`
   - move all `=>` handling behind a dedicated `lowerMacroOps` path
   - rewrite to emit `Fn` + `Apply` core nodes
   - normalize multi-arg calls to tuple-arg `Apply`
3. `src/frontend/parser.gr`
   - keep syntax mostly unchanged
   - optionally stop constructing semantic `Lambda` at parse time for `FatArrow`; emit macro/surface shape and defer semantic meaning to lowering
4. `src/core/infer.gr`
   - type `Fn` and `Apply` directly
   - do not depend on legacy `Lambda`/`MatchApply`
5. `src/api/api.gr` and `src/browser/serialize.gr`
   - expose new node names and preserve old ones during transition
6. Cleanup pass
   - remove `Lambda`, `MatchApply`, `Bundle` once all producers/consumers are migrated

### 8) Safety invariants for the redesign

- `=>` never survives into core AST
- core AST has exactly one callable representation (`Fn`) and one call representation (`Apply`)
- core `Apply` always has one arg; tuple packs represent arity > 1
- parser remains simple; semantic disambiguation belongs to lowering/macro expansion
