detailed docs for using grain can be found under c:/Git/grain-lang.org/src
grain compiler source code c:/Git/grain
workman v0 implementation c:/Git/workman

grain sometimes requires type annotation especially mutual rec

mutual rec is common and has to be explicit
to do it use syntax

let rec thingy and thingy

grain is highly particular about file use eg
"grain --dir . --include-dirs src src/cli/cli.gr -- %1 %2"

rare cases grain has cache errors that show as weird wasm stuff, to resolve delete .gro and .wasm files
deno task clean does this 

## Backend mode policy
The optimizing backend mode (`wm compile -O`) is now in backlog and under code freeze.

Policy until explicitly reopened:
- Do not require `-O` backend parity with the direct backend.
- Do not block feature work on keeping `-O` updated.
- `-O` backend is not part of routine testing gates.
- Expect `-O` to be rewritten after the direct backend is mostly feature complete.
