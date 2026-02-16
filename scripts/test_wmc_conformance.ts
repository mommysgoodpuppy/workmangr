#!/usr/bin/env -S deno run --allow-run

type GateTest = {
  label: string;
  file: string;
};

type TestCounts = {
  discoveredTests: number | null;
  passedTests: number | null;
  failedTests: number | null;
  ignoredTests: number | null;
};

const tests: GateTest[] = [
  { label: "analysis", file: "tests/analysis_test.gr" },
  { label: "parser", file: "tests/parser_semicolon_test.gr" },
  { label: "lowering", file: "tests/lowering_test.gr" },
  { label: "infer", file: "tests/infer_test.gr" },
  { label: "layer1-patterns", file: "tests/layer1_patterns_test.gr" },
  { label: "module-system", file: "tests/module_system_test.gr" },
  { label: "module-infer", file: "tests/module_infer_test.gr" },
];

const decoder = new TextDecoder();
const stripAnsi = (text: string) => text.replaceAll(/\x1b\[[0-9;]*m/g, "");

function parseTestCounts(output: string): TestCounts {
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

const runOne = async (test: GateTest) => {
  const start = performance.now();
  const child = new Deno.Command("grain", {
    args: [test.file],
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const { code, stdout, stderr } = await child.output();
  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  const output = decoder.decode(stdout) + decoder.decode(stderr);
  const counts = parseTestCounts(output);
  const ok = code === 0;
  const prefix = ok ? "[PASS]" : "[FAIL]";
  const testInfo = counts.passedTests == null
    ? "tests: ?"
    : `tests: ${counts.passedTests} passed, ${
      counts.failedTests ?? 0
    } failed, ${counts.ignoredTests ?? 0} ignored`;
  console.log(
    `${prefix} ${test.label} (${test.file}) ${elapsed}s, ${testInfo}`,
  );
  if (!ok) {
    console.log(`--- ${test.file} output ---`);
    console.log(output);
  }
  return { ok, counts };
};

const runLspRegression = async () => {
  const start = performance.now();
  const child = new Deno.Command("deno", {
    args: [
      "test",
      "--allow-run",
      "--allow-read",
      "--allow-env",
      "tests/lsp_crash_repro_test.ts",
    ],
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const { code, stdout, stderr } = await child.output();
  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  const output = decoder.decode(stdout) + decoder.decode(stderr);
  const ok = code === 0;
  const prefix = ok ? "[PASS]" : "[FAIL]";
  console.log(
    `${prefix} lsp-regression (tests/lsp_crash_repro_test.ts) ${elapsed}s`,
  );
  if (!ok) {
    console.log(`--- tests/lsp_crash_repro_test.ts output ---`);
    console.log(output);
  }
  return ok;
};

let failures = 0;
let totalPassed = 0;
let totalFailed = 0;
let totalIgnored = 0;
let totalDiscovered = 0;
const unknownCountSuites: string[] = [];
for (const test of tests) {
  const { ok, counts } = await runOne(test);
  if (!ok) {
    failures += 1;
  }
  if (counts.passedTests == null) {
    unknownCountSuites.push(test.file);
  } else {
    totalPassed += counts.passedTests;
    totalFailed += counts.failedTests ?? 0;
    totalIgnored += counts.ignoredTests ?? 0;
    totalDiscovered += counts.discoveredTests ?? 0;
  }
}
{
  const ok = await runLspRegression();
  if (!ok) {
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`WMC conformance gate failed: ${failures} suite(s) failed.`);
  Deno.exit(1);
}

console.log(
  `WMC conformance tests: ${totalPassed} passed, ${totalFailed} failed, ${totalIgnored} ignored` +
    (totalDiscovered > 0 ? ` (discovered: ${totalDiscovered})` : ""),
);
if (unknownCountSuites.length > 0) {
  console.log("Suites with unknown test counts:");
  for (const file of unknownCountSuites) {
    console.log(`- ${file}`);
  }
}
console.log("WMC conformance gate passed.");
