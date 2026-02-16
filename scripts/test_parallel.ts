#!/usr/bin/env -S deno run --allow-read --allow-run

type Status = "passed" | "failed" | "crashed";

type FileResult = {
  file: string;
  status: Status;
  code: number;
  durationMs: number;
  output: string;
  discoveredTests: number | null;
  passedTests: number | null;
  failedTests: number | null;
  ignoredTests: number | null;
};

const isTestFile = (name: string) =>
  name.endsWith("_test.gr") || name.endsWith(".test.gr");

const pathJoin = (...parts: string[]) =>
  parts.join("/").replaceAll(/\\+/g, "/").replaceAll(/\/+/g, "/");

async function discover(paths: string[]): Promise<string[]> {
  const out: string[] = [];

  const walk = async (p: string) => {
    let stat: Deno.FileInfo;
    try {
      stat = await Deno.stat(p);
    } catch {
      return;
    }

    if (stat.isFile) {
      if (isTestFile(p)) out.push(p);
      return;
    }

    if (!stat.isDirectory) return;

    for await (const entry of Deno.readDir(p)) {
      if (entry.name === "." || entry.name === "..") continue;
      await walk(pathJoin(p, entry.name));
    }
  };

  for (const p of paths) {
    await walk(p);
  }

  out.sort();
  return out;
}

function parseArgs(argv: string[]) {
  const paths: string[] = [];
  let jobs = Number(Deno.env.get("WM_TEST_JOBS") ?? "8");
  let filter: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--jobs" || a === "-j") {
      if (i + 1 < argv.length) {
        jobs = Number(argv[++i]);
      }
    } else if (a === "--filter" || a === "-f") {
      if (i + 1 < argv.length) {
        filter = argv[++i];
      }
    } else {
      paths.push(a);
    }
  }

  if (!Number.isFinite(jobs) || jobs < 1) jobs = 1;
  if (paths.length === 0) paths.push("./tests");

  return { paths, jobs, filter };
}

const stripAnsi = (text: string) => text.replaceAll(/\x1b\[[0-9;]*m/g, "");

function parseTestCounts(output: string) {
  const clean = stripAnsi(output);
  const runningMatch = clean.match(/running\s+(\d+)\s+tests?\s+from\b/);
  const summaryWithFailed = clean.match(
    /\bok\s+\|\s+(\d+)\s+passed\s+\|\s+(\d+)\s+failed(?:\s+\|\s+(\d+)\s+ignored)?/i,
  );
  const summaryNoFailed = clean.match(
    /\bok\s+\|\s+(\d+)\s+passed(?:\s+\|\s+(\d+)\s+ignored)?/i,
  );

  const discoveredTests = runningMatch ? Number(runningMatch[1]) : null;
  let passedTests: number | null = null;
  let failedTests: number | null = null;
  let ignoredTests: number | null = null;

  if (summaryWithFailed) {
    passedTests = Number(summaryWithFailed[1]);
    failedTests = Number(summaryWithFailed[2]);
    ignoredTests = summaryWithFailed[3] ? Number(summaryWithFailed[3]) : 0;
  } else if (summaryNoFailed) {
    passedTests = Number(summaryNoFailed[1]);
    failedTests = 0;
    ignoredTests = summaryNoFailed[2] ? Number(summaryNoFailed[2]) : 0;
  } else {
    const passedByLine = (clean.match(/\.\.\.\s+ok\b/g) || []).length;
    const failedByLine = (clean.match(/\.\.\.\s+FAILED\b/g) || []).length;
    if (passedByLine > 0 || failedByLine > 0) {
      passedTests = passedByLine;
      failedTests = failedByLine;
      ignoredTests = 0;
    }
  }

  const inferredDiscovered = passedTests == null
    ? null
    : passedTests + (failedTests ?? 0) + (ignoredTests ?? 0);

  return {
    discoveredTests: discoveredTests ?? inferredDiscovered,
    passedTests,
    failedTests,
    ignoredTests,
  };
}

async function runOne(file: string): Promise<FileResult> {
  const started = performance.now();
  const child = new Deno.Command("grain", {
    args: [file],
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  const { code, stdout, stderr } = await child.output();
  const durationMs = Math.round(performance.now() - started);
  const output = new TextDecoder().decode(stdout) +
    new TextDecoder().decode(stderr);
  const { discoveredTests, passedTests, failedTests, ignoredTests } =
    parseTestCounts(output);

  const status: Status = code === 0
    ? "passed"
    : code === 1
    ? "failed"
    : "crashed";
  return {
    file,
    status,
    code,
    durationMs,
    output,
    discoveredTests,
    passedTests,
    failedTests,
    ignoredTests,
  };
}

async function runLspCompileSmoke(): Promise<void> {
  const outPath = "/tmp/workman_lsp_smoke.wasm";
  const child = new Deno.Command("grain", {
    args: [
      "compile",
      "--include-dirs",
      "src",
      "src/cli/lsp/lsp.gr",
      "-o",
      outPath,
    ],
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const { code, stdout, stderr } = await child.output();
  if (code !== 0) {
    const output = new TextDecoder().decode(stdout) +
      new TextDecoder().decode(stderr);
    throw new Error(`LSP compile smoke failed:\\n${output}`);
  }
}

async function runApiRuntimeSmoke(): Promise<void> {
  const fixturePath = "api_runtime_smoke.wm";
  const child = new Deno.Command("grain", {
    args: [
      "--dir",
      ".",
      "--include-dirs",
      "src",
      "src/api/api.gr",
      "--",
      fixturePath,
    ],
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const { code, stdout, stderr } = await child.output();
  const output = new TextDecoder().decode(stdout) +
    new TextDecoder().decode(stderr);
  if (code !== 0) {
    throw new Error(`API runtime smoke failed:\\n${output}`);
  }
  if (!output.includes('"tokens":')) {
    throw new Error(
      `API runtime smoke produced unexpected output:\\n${output}`,
    );
  }
}

async function runParallel(
  files: string[],
  jobs: number,
): Promise<FileResult[]> {
  const results: FileResult[] = [];
  let idx = 0;

  const worker = async () => {
    while (true) {
      const current = idx;
      idx += 1;
      if (current >= files.length) return;
      const file = files[current];
      const res = await runOne(file);
      results.push(res);

      const prefix = res.status === "passed"
        ? "[PASS]"
        : res.status === "failed"
        ? "[FAIL]"
        : "[CRASH]";
      const testInfo = res.passedTests == null
        ? "tests: ?"
        : `tests: ${res.passedTests} passed, ${res.failedTests ?? 0} failed, ${
          res.ignoredTests ?? 0
        } ignored`;
      console.log(
        `${prefix} ${res.file} (${
          (res.durationMs / 1000).toFixed(2)
        }s, ${testInfo})`,
      );
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(jobs, files.length) }, worker),
  );
  results.sort((a, b) => a.file.localeCompare(b.file));
  return results;
}

function printFailures(results: FileResult[]) {
  const failed = results.filter((r) => r.status !== "passed");
  if (failed.length === 0) return;

  console.log("\n=== Failure Output ===");
  for (const r of failed) {
    console.log(`\n--- ${r.file} (${r.status}, exit ${r.code}) ---`);
    console.log(r.output);
  }
}

function summarize(results: FileResult[]) {
  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const crashed = results.filter((r) => r.status === "crashed").length;
  const totalDiscovered = results.reduce(
    (acc, r) => acc + (r.discoveredTests ?? 0),
    0,
  );
  const totalPassedTests = results.reduce(
    (acc, r) => acc + (r.passedTests ?? 0),
    0,
  );
  const totalFailedTests = results.reduce(
    (acc, r) => acc + (r.failedTests ?? 0),
    0,
  );
  const totalIgnoredTests = results.reduce(
    (acc, r) => acc + (r.ignoredTests ?? 0),
    0,
  );
  const filesWithUnknownCounts = results.filter((r) => r.passedTests == null)
    .map((r) => r.file);
  const filesWithMismatchedCounts = results
    .filter((r) =>
      r.discoveredTests != null && r.passedTests != null &&
      r.discoveredTests !==
        (r.passedTests + (r.failedTests ?? 0) + (r.ignoredTests ?? 0))
    )
    .map((r) => r.file);
  console.log("\n========================================");
  console.log(
    `Results: ${passed} passed, ${failed} failed, ${crashed} crashed`,
  );
  console.log(
    `Tests: ${totalPassedTests} passed, ${totalFailedTests} failed, ${totalIgnoredTests} ignored` +
      (totalDiscovered > 0 ? ` (discovered: ${totalDiscovered})` : ""),
  );
  if (filesWithUnknownCounts.length > 0) {
    console.log("Files with unknown per-file test counts:");
    for (const file of filesWithUnknownCounts) {
      console.log(`- ${file}`);
    }
  }
  if (filesWithMismatchedCounts.length > 0) {
    console.log("Files with mismatched discovered vs summary counts:");
    for (const file of filesWithMismatchedCounts) {
      console.log(`- ${file}`);
    }
  }
  console.log("========================================");
  return { passed, failed, crashed };
}

async function main() {
  await runLspCompileSmoke();
  await runApiRuntimeSmoke();
  const { paths, jobs, filter } = parseArgs(Deno.args);
  let files = await discover(paths);
  if (filter) files = files.filter((f) => f.includes(filter));

  if (files.length === 0) {
    console.log("No test files found.");
    Deno.exit(1);
  }

  console.log("Discovered test files:");
  for (const file of files) {
    console.log(`- ${file}`);
  }
  console.log("");
  console.log(
    `Running ${files.length} test file(s) with ${jobs} parallel job(s)...`,
  );
  const started = performance.now();
  const results = await runParallel(files, jobs);
  const elapsed = ((performance.now() - started) / 1000).toFixed(2);
  printFailures(results);
  const { failed, crashed } = summarize(results);
  console.log(`Elapsed: ${elapsed}s`);

  Deno.exit(failed > 0 || crashed > 0 ? 1 : 0);
}

await main();
