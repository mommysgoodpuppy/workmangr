detailed docs for using grain can be found under c:/Git/grain-lang.org/src
grain compiler source code c:/Git/grain
workman v0 implementation c:/Git/workman
equivalents on linux are under ~/git

test stuff by using global "wm" cli command or the tests that already exist see deno.json (use :unix)

grain sometimes requires type annotation especially mutual rec

mutual rec is common and has to be explicit
to do it use syntax

let rec thingy and thingy

grain is highly particular about file use eg
"grain --dir . --include-dirs src src/cli/cli.gr -- %1 %2"

rare cases grain has cache errors that show as weird wasm stuff, to resolve delete .gro and .wasm files
deno task clean does this 
