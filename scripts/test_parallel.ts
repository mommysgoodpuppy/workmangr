#!/usr/bin/env -S deno run --allow-read --allow-run

type Status = "passed" | "failed" | "crashed";

type FileResult = {
  file: string;
  status: Status;
  code: number;
  durationMs: number;
  output: string;
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

async function runOne(file: string): Promise<FileResult> {
  const started = performance.now();
  const child = new Deno.Command("grain", {
    args: [file],
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  const { code, stdout, stderr } = await child.output();
  const durationMs = Math.round(performance.now() - started);
  const output = new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr);

  const status: Status = code === 0 ? "passed" : code === 1 ? "failed" : "crashed";
  return { file, status, code, durationMs, output };
}

async function runParallel(files: string[], jobs: number): Promise<FileResult[]> {
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

      const prefix =
        res.status === "passed" ? "[PASS]" : res.status === "failed" ? "[FAIL]" : "[CRASH]";
      console.log(`${prefix} ${res.file} (${(res.durationMs / 1000).toFixed(2)}s)`);
    }
  };

  await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));
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
  console.log("\n========================================");
  console.log(`Results: ${passed} passed, ${failed} failed, ${crashed} crashed`);
  console.log("========================================");
  return { passed, failed, crashed };
}

async function main() {
  const { paths, jobs, filter } = parseArgs(Deno.args);
  let files = await discover(paths);
  if (filter) files = files.filter((f) => f.includes(filter));

  if (files.length === 0) {
    console.log("No test files found.");
    Deno.exit(1);
  }

  console.log(`Running ${files.length} test file(s) with ${jobs} parallel job(s)...`);
  const started = performance.now();
  const results = await runParallel(files, jobs);
  const elapsed = ((performance.now() - started) / 1000).toFixed(2);
  printFailures(results);
  const { failed, crashed } = summarize(results);
  console.log(`Elapsed: ${elapsed}s`);

  Deno.exit(failed > 0 || crashed > 0 ? 1 : 0);
}

await main();
