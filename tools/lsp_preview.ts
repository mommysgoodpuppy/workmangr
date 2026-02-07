import { resolve, toFileUrl } from "https://deno.land/std@0.221.0/path/mod.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const inputPath = Deno.args[0] ? resolve(Deno.args[0]) : resolve("test_wmc_input.wm");
const source = await Deno.readTextFile(inputPath);

const uri = toFileUrl(inputPath).href;

const lastLineCol = (() => {
  const lines = source.replaceAll("\r", "").split("\n");
  const lastLine = lines.length - 1;
  const lastCol = lines[lastLine]?.length ?? 0;
  return { line: lastLine, character: lastCol };
})();

const msg = (obj: unknown) => {
  const json = JSON.stringify(obj);
  const bytes = encoder.encode(json);
  return `Content-Length: ${bytes.length}\r\n\r\n${json}`;
};

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    processId: null,
    rootUri: null,
    capabilities: {},
  },
};

const didOpen = {
  jsonrpc: "2.0",
  method: "textDocument/didOpen",
  params: {
    textDocument: {
      uri,
      languageId: "workman",
      version: 1,
      text: source,
    },
  },
};

const inlayHint = {
  jsonrpc: "2.0",
  id: 2,
  method: "textDocument/inlayHint",
  params: {
    textDocument: { uri },
    range: {
      start: { line: 0, character: 0 },
      end: lastLineCol,
    },
  },
};

const shutdown = { jsonrpc: "2.0", id: 3, method: "shutdown" };
const exit = { jsonrpc: "2.0", method: "exit" };

const command = new Deno.Command("grain", {
  args: ["--dir", ".", "--include-dirs", "src", "src/cli/lsp/lsp.gr", "--"],
  stdin: "piped",
  stdout: "piped",
  stderr: "piped",
});

const child = command.spawn();
const writer = child.stdin.getWriter();

await writer.write(encoder.encode(msg(initialize)));
await writer.write(encoder.encode(msg(didOpen)));
await writer.write(encoder.encode(msg(inlayHint)));
await writer.write(encoder.encode(msg(shutdown)));
await writer.write(encoder.encode(msg(exit)));
await writer.close();

const output = await child.output();
const outText = output.stdout ? decoder.decode(output.stdout) : "";
const errText = output.stderr ? decoder.decode(output.stderr) : "";

if (errText.trim().length > 0) {
  console.log("[LSP stderr]");
  console.log(errText.trim());
  console.log("");
}

if (!output.success) {
  console.error(`LSP process exited with code ${output.code}`);
}

const extractBlock = (label: string) => {
  const idx = errText.indexOf(label);
  if (idx === -1) return null;
  const tail = errText.slice(idx + label.length);
  const lines = tail.split("\n");
  const collected: string[] = [];
  for (const line of lines) {
    if (line.startsWith("[LSP] ") && collected.length > 0) break;
    collected.push(line);
  }
  return collected.join("\n").trim();
};

const virtualText = extractBlock("[LSP] virtual text:\n");
const previewText = extractBlock("[LSP] preview:\n");

if (virtualText !== null || previewText !== null) {
  console.log("[LSP summary]");
  if (virtualText !== null) {
    console.log("virtual:");
    console.log(virtualText);
  }
  if (previewText !== null) {
    console.log("preview:");
    console.log(previewText);
  }
}
