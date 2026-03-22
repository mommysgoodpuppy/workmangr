#!/usr/bin/env -S deno test --allow-run --allow-read --allow-write

const decoder = new TextDecoder();
const repoRoot = new URL("../", import.meta.url);

const run = async (cmd: string, args: string[], cwd: string) => {
  const child = new Deno.Command(cmd, {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const { code, stdout, stderr } = await child.output();
  return {
    code,
    stdout: decoder.decode(stdout),
    stderr: decoder.decode(stderr),
  };
};

const compileViaCliWithArgs = async (source: string, compileArgs: string[]) => {
  const cwd = Deno.realPathSync(new URL("../", import.meta.url));
  const wmPath = await Deno.makeTempFile({
    dir: cwd,
    prefix: "tmp_wm_exec_",
    suffix: ".wm",
  });
  const wmRel = `./${wmPath.slice(cwd.length + 1)}`;
  const zigPath = wmPath.replace(/\.wm$/, ".zig");
  try {
    await Deno.writeTextFile(wmPath, source);
    return await run("wm", ["compile", ...compileArgs, wmRel], cwd);
  } finally {
    await Deno.remove(wmPath).catch(() => void 0);
    await Deno.remove(zigPath).catch(() => void 0);
  }
};

const compileViaCli = async (source: string) => compileViaCliWithArgs(source, []);

const compileAndRunViaCli = async (source: string) => {
  const cwd = Deno.realPathSync(new URL(".", repoRoot));
  const wmPath = await Deno.makeTempFile({
    dir: cwd,
    prefix: "tmp_wm_exec_",
    suffix: ".wm",
  });
  const wmRel = `./${wmPath.slice(cwd.length + 1)}`;
  const zigPath = wmPath.replace(/\.wm$/, ".zig");
  const zigRel = `./${zigPath.slice(cwd.length + 1)}`;

  try {
    await Deno.writeTextFile(wmPath, source);
    const compileRes = await run("wm", ["compile", wmRel], cwd);
    if (compileRes.code !== 0) {
      throw new Error(
        `wm compile failed (${compileRes.code})\nSTDOUT:\n${compileRes.stdout}\nSTDERR:\n${compileRes.stderr}`,
      );
    }
    const emitted = await Deno.readTextFile(zigPath);
    const runRes = await run("zig", ["run", zigRel], cwd);
    const textOut = `${runRes.stdout}${runRes.stderr}`.trim();
    const output = textOut === "" ? String(runRes.code) : textOut;
    return { emitted, output };
  } finally {
    await Deno.remove(wmPath).catch(() => void 0);
    await Deno.remove(zigPath).catch(() => void 0);
  }
};

const runViaCliRun = async (source: string) => {
  const cwd = Deno.realPathSync(new URL("../", import.meta.url));
  const wmPath = await Deno.makeTempFile({
    dir: cwd,
    prefix: "tmp_wm_run_",
    suffix: ".wm",
  });
  const wmRel = `./${wmPath.slice(cwd.length + 1)}`;
  const zigPath = wmPath.replace(/\.wm$/, ".zig");

  try {
    await Deno.writeTextFile(wmPath, source);
    const runRes = await run("wm", ["run", wmRel], cwd);
    const textOut = `${runRes.stdout}${runRes.stderr}`.trim();
    return { code: runRes.code, output: textOut };
  } finally {
    await Deno.remove(wmPath).catch(() => void 0);
    await Deno.remove(zigPath).catch(() => void 0);
  }
};

Deno.test("wm compile emits runnable zig for if-expression main", async () => {
  const { output } = await compileAndRunViaCli(
    `let main = => { if true { 1 } else { 2 } };`,
  );
  if (output !== "1") {
    throw new Error(`expected "1", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile emits comptime_int for unresolved Number main", async () => {
  const { emitted, output } = await compileAndRunViaCli(
    `let main = => { if true { 7 } else { -8 } };`,
  );

  if (!emitted.includes(`pub fn __wm_main() comptime_int`)) {
    throw new Error(`expected comptime_int return type, got:\n${emitted}`);
  }
  if (output !== "7") {
    throw new Error(`expected "7", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile uses inferred concrete numeric type for annotated main", async () => {
  const { emitted, output } = await compileAndRunViaCli(
    `let main = => { 1 + 1: U8 };`,
  );

  if (!emitted.includes(`pub fn __wm_main() u8`)) {
    throw new Error(`expected u8 return type, got:\n${emitted}`);
  }
  if (output !== "2") {
    throw new Error(`expected "2", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile runs integer arithmetic", async () => {
  const { output } = await compileAndRunViaCli(
    `let main = => { 1 + 1 };`,
  );
  if (output !== "2") {
    throw new Error(`expected "2", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile runs direct expr local let arithmetic", async () => {
  const { output } = await compileAndRunViaCli(
    `let main = => { let y = 1 + 1; y };`,
  );
  if (output !== "2") {
    throw new Error(`expected "2", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile runs immediate lambda call arithmetic", async () => {
  const { output } = await compileAndRunViaCli(
    `let main = => { ((x) => { x + 1 })(1) };`,
  );
  if (output !== "2") {
    throw new Error(`expected "2", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile runs top-level simple function call via inlining", async () => {
  const { emitted, output } = await compileAndRunViaCli(
    `let inc = (x) => { x + 1 };
let main = => { inc(1) };`,
  );
  if (!emitted.includes("inc(1)")) {
    throw new Error(`expected emitted direct call, got:\n${emitted}`);
  }
  if (emitted.includes("const x = 1;")) {
    throw new Error(`expected direct backend to avoid inlining top-level call, got:\n${emitted}`);
  }
  if (output !== "2") {
    throw new Error(`expected "2", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile preserves top-level calls in complex printed program", async () => {
  const { emitted, output } = await compileAndRunViaCli(
    `let inc = (x) => {
  x + 1
};

let mul2 = (x) => {
  x * 2
};

let main = => {
  let base = 10;
  let a = inc(base);
  let local = (n) => {
    n * 3
  };
  let b = local(a) + mul2(a);
  let c = if (true) {
    b + 5
  } else {
    b - 5
  };
  print(c)
};`,
  );
  if (!emitted.includes("const a = inc(base);")) {
    throw new Error(`expected top-level call to stay as a call, got:\n${emitted}`);
  }
  if (!emitted.includes("const b = (local(a) + mul2(a));")) {
    throw new Error(`expected nested top-level call to stay as a call, got:\n${emitted}`);
  }
  if (emitted.includes("const x = base;") || emitted.includes("const x = a;")) {
    throw new Error(`expected no inlined parameter temporaries, got:\n${emitted}`);
  }
  if (output !== "60") {
    throw new Error(`expected "60", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile runs local lambda let-call via inlining", async () => {
  const { output } = await compileAndRunViaCli(
    `let main = => { let f = (x) => { x + 2 }; f(3) };`,
  );
  if (output !== "5") {
    throw new Error(`expected "5", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile supports zero-arg sugar main thunk", async () => {
  const { output } = await compileAndRunViaCli(
    `let main = => { 1 + 1 };`,
  );
  if (output !== "2") {
    throw new Error(`expected "2", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm run compiles and executes .wm in one command", async () => {
  const result = await runViaCliRun(
    `let main = => { 1 + 1 };`,
  );
  if (result.code !== 2) {
    throw new Error(`expected exit code 2, got ${result.code}`);
  }
  if (!result.output.includes("Wrote prototype Zig backend output to")) {
    throw new Error(
      `expected compile output, got ${JSON.stringify(result.output)}`,
    );
  }
});

Deno.test("wm compile fatal abort includes actual diagnostic text", async () => {
  const res = await compileViaCli(`let main = => { doesNotExist };`);
  if (res.code === 0) {
    throw new Error("expected compile failure");
  }
  const output = `${res.stdout}\n${res.stderr}`;
  if (!output.includes("unknown identifier")) {
    throw new Error(`expected unknown-identifier diagnostic, got:\n${output}`);
  }
});

Deno.test("wm run supports global print builtin", async () => {
  const cwd = Deno.realPathSync(new URL("../", import.meta.url));
  const wmPath = await Deno.makeTempFile({
    dir: cwd,
    prefix: "tmp_wm_exec_",
    suffix: ".wm",
  });
  const wmRel = `./${wmPath.slice(cwd.length + 1)}`;
  const zigPath = wmPath.replace(/\.wm$/, ".zig");
  try {
    await Deno.writeTextFile(wmPath, `let main = => { print(42) };`);
    const res = await run("wm", ["run", wmRel], cwd);
    if (res.code !== 0) {
      throw new Error(
        `expected exit code 0, got ${res.code}\n${res.stdout}\n${res.stderr}`,
      );
    }
    const output = `${res.stdout}\n${res.stderr}`;
    if (!output.includes("42")) {
      throw new Error(`expected print output, got:\n${output}`);
    }
  } finally {
    await Deno.remove(wmPath).catch(() => void 0);
    await Deno.remove(zigPath).catch(() => void 0);
  }
});

Deno.test("wm compile emits void Zig main for void workman main", async () => {
  const { emitted, output } = await compileAndRunViaCli(
    `let main = => { print(42) };`,
  );
  if (!emitted.includes(`pub fn __wm_main() void`)) {
    throw new Error(`expected __wm_main void return type, got:\n${emitted}`);
  }
  if (!emitted.includes(`pub fn main() void`)) {
    throw new Error(`expected Zig main void return type, got:\n${emitted}`);
  }
  if (emitted.includes("blk: { __wm_print(")) {
    throw new Error(`expected direct void print call emission, got:\n${emitted}`);
  }
  if (!output.includes("42")) {
    throw new Error(`expected print output "42", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile supports expression sequencing after print", async () => {
  const result = await runViaCliRun(
    `let main = => { print(42); 1 + 1 };`,
  );
  if (result.code !== 2) {
    throw new Error(`expected exit code 2, got ${result.code}`);
  }
  if (!result.output.includes("42")) {
    throw new Error(`expected printed 42, got ${JSON.stringify(result.output)}`);
  }
});

Deno.test("wm compile supports wildcard let discard in sequencing", async () => {
  const result = await runViaCliRun(
    `let main = => { let _ = print(7); 1 + 2 };`,
  );
  if (result.code !== 3) {
    throw new Error(`expected exit code 3, got ${result.code}`);
  }
  if (!result.output.includes("7")) {
    throw new Error(`expected printed 7, got ${JSON.stringify(result.output)}`);
  }
});

Deno.test("wm compile supports captured local lambda", async () => {
  const { output } = await compileAndRunViaCli(
    `let main = => {
  let x = 2;
  let f = (y) => {
    x + y
  };
  f(3)
};`,
  );
  if (output !== "5") {
    throw new Error(`expected "5", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile supports nested local lambdas without capture", async () => {
  const { output } = await compileAndRunViaCli(
    `let main = => {
  let outer = (x) => {
    let inner = (y) => {
      y + 1
    };
    inner(x)
  };
  outer(2)
};`,
  );
  if (output !== "3") {
    throw new Error(`expected "3", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile supports lambda parameter shadowing outer local", async () => {
  const { output } = await compileAndRunViaCli(
    `let main = => {
  let x = 100;
  let add1 = (x) => {
    x + 1
  };
  add1(4) + x
};`,
  );
  if (output !== "105") {
    throw new Error(`expected "105", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile allows lambda to reference top-level binding", async () => {
  const { output } = await compileAndRunViaCli(
    `let base = 2;
let addBase = (y) => {
  base + y
};
let main = => {
  addBase(3)
};`,
  );
  if (output !== "5") {
    throw new Error(`expected "5", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile supports escaping closures", async () => {
  const { output } = await compileAndRunViaCli(
    `let makeAdder = (x) => {
  (y) => {
    x + y
  }
};
let main = => {
  let add2 = makeAdder(2);
  add2(3)
};`,
  );
  if (output !== "5") {
    throw new Error(`expected "5", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm run supports printing tuple literals", async () => {
  const result = await runViaCliRun(
    `let main = => { print((1, 2)) };`,
  );
  if (result.code !== 0) {
    throw new Error(`expected exit code 0, got ${result.code}`);
  }
  if (!result.output.includes("1") || !result.output.includes("2")) {
    throw new Error(`expected tuple output, got ${JSON.stringify(result.output)}`);
  }
});

Deno.test("wm run supports tuple values through local bindings", async () => {
  const result = await runViaCliRun(
    `let main = => {
  let pair = (true, 7);
  print(pair)
};`,
  );
  if (result.code !== 0) {
    throw new Error(`expected exit code 0, got ${result.code}`);
  }
  if (!result.output.includes("true") || !result.output.includes("7")) {
    throw new Error(`expected tuple binding output, got ${JSON.stringify(result.output)}`);
  }
});

Deno.test("wm run supports string literal printing", async () => {
  const result = await runViaCliRun(
    `let main = => { print("hello") };`,
  );
  if (result.code !== 0) {
    throw new Error(`expected exit code 0, got ${result.code}`);
  }
  if (!result.output.includes("hello")) {
    throw new Error(`expected string output, got ${JSON.stringify(result.output)}`);
  }
});

Deno.test("wm run supports nominal record literal values", async () => {
  const result = await runViaCliRun(
    `record Location = { x: Int, y: Int };
let main = => {
  let loc: Location = .{ x = 1, y = 2 };
  print(loc)
};`,
  );
  if (result.code !== 0) {
    throw new Error(`expected exit code 0, got ${result.code}`);
  }
  if (!result.output.includes("x") || !result.output.includes("1") || !result.output.includes("2")) {
    throw new Error(`expected record output, got ${JSON.stringify(result.output)}`);
  }
});

Deno.test("wm run supports nominal constructor values", async () => {
  const result = await runViaCliRun(
    `type Option<T> = Some<T> | None;
let main = => {
  print(Some(1));
  print(None)
};`,
  );
  if (result.code !== 0) {
    throw new Error(`expected exit code 0, got ${result.code}`);
  }
  if (!result.output.includes("payload = 1") || !result.output.includes("tag")) {
    throw new Error(`expected constructor output, got ${JSON.stringify(result.output)}`);
  }
});

Deno.test("wm compile supports nominal record projection", async () => {
  const { output } = await compileAndRunViaCli(
    `record Location = { x: Int, y: Int };
let main = => {
  let loc: Location = .{ x = 1, y = 2 };
  loc.x
};`,
  );
  if (output !== "1") {
    throw new Error(`expected "1", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile supports constructor-style nominal record construction", async () => {
  const { output } = await compileAndRunViaCli(
    `record Operation = { direction: Int, distance: Int };
let main = => {
  let op = Operation{ direction = 1, distance = 2 };
  op.distance
};`,
  );
  if (output !== "2") {
    throw new Error(`expected "2", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile supports ADT match payload binding", async () => {
  const { output } = await compileAndRunViaCli(
    `type Option<T> = Some<T> | None;
let main = => {
  match(Some(7)) {
    Some(v) => { v }
    None => { 0 }
  }
};`,
  );
  if (output !== "7") {
    throw new Error(`expected "7", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile supports ADT match fallback arm", async () => {
  const { output } = await compileAndRunViaCli(
    `type Option<T> = Some<T> | None;
let main = => {
  match(None) {
    Some(v) => { v }
    None => { 11 }
  }
};`,
  );
  if (output !== "11") {
    throw new Error(`expected "11", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile supports tuple pattern matching", async () => {
  const { output } = await compileAndRunViaCli(
    `let main = => {
  match((3, 4)) {
    (Var(x), Var(y)) => { x + y }
  }
};`,
  );
  if (output !== "7") {
    throw new Error(`expected "7", got ${JSON.stringify(output)}`);
  }
});

Deno.test("wm compile supports guarded ADT matches", async () => {
  const { output } = await compileAndRunViaCli(
    `type Option<T> = Some<T> | None;
let main = => {
  match(Some(8)) {
    Some(v) when true => { v }
    Some(v) => { v + 100 }
    None => { 0 }
  }
};`,
  );
  if (output !== "8") {
    throw new Error(`expected "8", got ${JSON.stringify(output)}`);
  }
});
