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

const compileViaCli = async (source: string) => {
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
    return await run("wm", ["compile", wmRel], cwd);
  } finally {
    await Deno.remove(wmPath).catch(() => void 0);
    await Deno.remove(zigPath).catch(() => void 0);
  }
};

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
  const { output } = await compileAndRunViaCli(
    `let inc = (x) => { x + 1 };
let main = => { inc(1) };`,
  );
  if (output !== "2") {
    throw new Error(`expected "2", got ${JSON.stringify(output)}`);
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
