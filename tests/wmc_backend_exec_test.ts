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
    if (runRes.code !== 0) {
      throw new Error(
        `zig run failed (${runRes.code})\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`,
      );
    }
    return { emitted, output: `${runRes.stdout}${runRes.stderr}`.trim() };
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

Deno.test("wm compile specializes main result to i8 when possible", async () => {
  const { emitted, output } = await compileAndRunViaCli(
    `let main = => { if true { 7 } else { -8 } };`,
  );

  if (!emitted.includes(`pub fn __wm_main() i8`)) {
    throw new Error(`expected i8 specialization, got:\n${emitted}`);
  }
  if (output !== "7") {
    throw new Error(`expected "7", got ${JSON.stringify(output)}`);
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
