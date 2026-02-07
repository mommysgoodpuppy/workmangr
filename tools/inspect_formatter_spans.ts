import { relative, resolve } from "https://deno.land/std@0.221.0/path/mod.ts";

type Token = {
  kind: string;
  text: string;
  span: { line: number; col: number; start: number; end: number };
};

type OpaqueSpan = {
  sourceStart: number;
  sourceEnd: number;
  formattedStart: number;
  formattedEnd: number;
};

type ApiOutput = {
  tokens?: Token[];
  formatted?: string;
  formattedFix?: string;
  formattedTokens?: Token[];
  formattedFixTokens?: Token[];
  formattedOpaqueSpans?: OpaqueSpan[];
  formattedFixOpaqueSpans?: OpaqueSpan[];
};

const inputPath = Deno.args[0] ? resolve(Deno.args[0]) : resolve("_tmp_lsp_test3.wm");
const relInputPath = relative(Deno.cwd(), inputPath);
const modeArg = Deno.args[1] ?? "both";

const cmd = new Deno.Command("grain", {
  args: ["--dir", ".", "--include-dirs", "src", "src/api/api.gr", "--", relInputPath],
  stdout: "piped",
  stderr: "piped",
});

const child = await cmd.output();
const stdout = new TextDecoder().decode(child.stdout);
const stderr = new TextDecoder().decode(child.stderr);

if (!child.success) {
  console.error(stderr.trim() || `grain exited with code ${child.code}`);
  Deno.exit(child.code || 1);
}

let parsed: ApiOutput;
try {
  parsed = JSON.parse(stdout);
} catch (err) {
  console.error("Failed to parse API JSON output.");
  console.error(String(err));
  Deno.exit(1);
}

const sourceText = await Deno.readTextFile(inputPath);
const sourceTokens = parsed.tokens ?? [];
const contexts: Array<{
  mode: "real" | "fix";
  spans: OpaqueSpan[];
  formattedText: string;
  tokens: Token[];
}> = [];

if (modeArg === "real" || modeArg === "both") {
  contexts.push({
    mode: "real",
    spans: parsed.formattedOpaqueSpans ?? [],
    formattedText: parsed.formatted ?? "",
    tokens: parsed.formattedTokens ?? [],
  });
}
if (modeArg === "fix" || modeArg === "both") {
  contexts.push({
    mode: "fix",
    spans: parsed.formattedFixOpaqueSpans ?? [],
    formattedText: parsed.formattedFix ?? "",
    tokens: parsed.formattedFixTokens ?? [],
  });
}

if (contexts.length === 0) {
  console.log('Usage: deno run -A tools/inspect_formatter_spans.ts <file> [real|fix|both]');
  Deno.exit(1);
}

const tokenLabel = (t: Token) => `${t.kind}("${t.text}")@${t.span.start}-${t.span.end}`;

for (const ctx of contexts) {
  if (ctx.spans.length === 0) {
    console.log(`No ${ctx.mode.toUpperCase()} opaque spans found.`);
    continue;
  }
  for (let i = 0; i < ctx.spans.length; i++) {
    const s = ctx.spans[i];
    const start = ctx.mode === "real" ? s.sourceStart : s.formattedStart;
    const end = ctx.mode === "real" ? s.sourceEnd : s.formattedEnd;
    const slice = ctx.formattedText.slice(start, end);
    const sourceSlice = sourceText.slice(s.sourceStart, s.sourceEnd);

    const startIdx = ctx.tokens.findIndex((t) => t.span.end > start);
    const idx = startIdx === -1 ? ctx.tokens.length : startIdx;
    const before = ctx.tokens.slice(Math.max(0, idx - 5), idx);
    const after = ctx.tokens.slice(idx, Math.min(ctx.tokens.length, idx + 5));
    const sourceStartIdx = sourceTokens.findIndex((t) => t.span.end > s.sourceStart);
    const sourceIdx = sourceStartIdx === -1 ? sourceTokens.length : sourceStartIdx;
    const sourceBefore = sourceTokens.slice(Math.max(0, sourceIdx - 5), sourceIdx);
    const sourceAfter = sourceTokens.slice(sourceIdx, Math.min(sourceTokens.length, sourceIdx + 5));

    console.log(`\n[${ctx.mode.toUpperCase()} span ${i + 1}]`);
    console.log(`source: ${s.sourceStart}-${s.sourceEnd} | formatted: ${s.formattedStart}-${s.formattedEnd}`);
    console.log("source span text:");
    console.log(sourceSlice.length > 0 ? sourceSlice : "<empty>");
    console.log("span text:");
    console.log(slice.length > 0 ? slice : "<empty>");
    console.log("source tokens before:");
    console.log(sourceBefore.length > 0 ? sourceBefore.map(tokenLabel).join("\n") : "<none>");
    console.log("source tokens after:");
    console.log(sourceAfter.length > 0 ? sourceAfter.map(tokenLabel).join("\n") : "<none>");
    console.log("tokens before:");
    console.log(before.length > 0 ? before.map(tokenLabel).join("\n") : "<none>");
    console.log("tokens after:");
    console.log(after.length > 0 ? after.map(tokenLabel).join("\n") : "<none>");
  }
}
