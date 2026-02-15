#!/usr/bin/env -S deno run --allow-run

type GateTest = {
  label: string;
  file: string;
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
  const ok = code === 0;
  const prefix = ok ? "[PASS]" : "[FAIL]";
  console.log(`${prefix} ${test.label} (${test.file}) ${elapsed}s`);
  if (!ok) {
    console.log(`--- ${test.file} output ---`);
    console.log(output);
  }
  return ok;
};

let failures = 0;
for (const test of tests) {
  const ok = await runOne(test);
  if (!ok) {
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`WMC conformance gate failed: ${failures} suite(s) failed.`);
  Deno.exit(1);
}

console.log("WMC conformance gate passed.");
