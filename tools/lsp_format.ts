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

const formatting = {
  jsonrpc: "2.0",
  id: 2,
  method: "textDocument/formatting",
  params: {
    textDocument: { uri },
    options: { tabSize: 2, insertSpaces: true },
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
await writer.write(encoder.encode(msg(formatting)));
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

const parseMessages = (text: string) => {
  const messages: any[] = [];
  let buffer = text;
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const header = buffer.slice(0, headerEnd);
    const bodyStart = headerEnd + 4;
    const lenMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!lenMatch) break;
    const length = Number(lenMatch[1]);
    const totalNeeded = bodyStart + length;
    if (buffer.length < totalNeeded) break;
    const body = buffer.slice(bodyStart, totalNeeded);
    buffer = buffer.slice(totalNeeded);
    try {
      messages.push(JSON.parse(body));
    } catch {
      // ignore parse errors
    }
  }
  return messages;
};

const messages = parseMessages(outText);
const formatResp = messages.find((m) => m.id === 2);

if (!formatResp) {
  console.log("[LSP] no formatting response found");
  Deno.exit(0);
}

const edits = Array.isArray(formatResp.result) ? formatResp.result : [];
console.log("[LSP] formatting edits:");
console.log(JSON.stringify(edits, null, 2));

const positionToOffset = (text: string, line: number, character: number) => {
  let offset = 0;
  let l = 0;
  let c = 0;
  while (offset < text.length) {
    if (l === line && c === character) return offset;
    const ch = text[offset];
    if (ch === "\n") {
      l++;
      c = 0;
    } else {
      c++;
    }
    offset++;
  }
  return text.length;
};

let updated = source;
const sorted = edits
  .map((edit: any) => ({
    ...edit,
    __start: positionToOffset(source, edit.range.start.line, edit.range.start.character),
    __end: positionToOffset(source, edit.range.end.line, edit.range.end.character),
  }))
  .sort((a: any, b: any) => b.__start - a.__start);

for (const edit of sorted) {
  updated = updated.slice(0, edit.__start) + edit.newText + updated.slice(edit.__end);
}

console.log("[LSP] formatted text:");
console.log(updated);

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

const targetText = extractBlock("[LSP] format target:\n");
if (targetText !== null) {
  console.log("[LSP target]");
  console.log(targetText);
}
