#!/usr/bin/env -S deno test --allow-run --allow-read

const enc = new TextEncoder();
const dec = new TextDecoder();

type Pending = { resolve: (v: unknown) => void };

class LspClient {
  proc: Deno.ChildProcess;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  buf = "";
  nextId = 1;
  pending = new Map<number, Pending>();
  runtimeError: string | null = null;

  constructor(proc: Deno.ChildProcess) {
    this.proc = proc;
    this.writer = proc.stdin.getWriter();
    this.readStdout();
    this.readStderr();
  }

  async readStdout() {
    const reader = this.proc.stdout.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      this.buf += dec.decode(value, { stream: true });
      while (true) {
        const h = this.buf.indexOf("\r\n\r\n");
        if (h < 0) break;
        const m = /Content-Length:\s*(\d+)/i.exec(this.buf.slice(0, h));
        if (!m) {
          this.buf = this.buf.slice(h + 4);
          continue;
        }
        const len = Number(m[1]);
        const total = h + 4 + len;
        if (this.buf.length < total) break;
        const body = this.buf.slice(h + 4, total);
        this.buf = this.buf.slice(total);
        let msg: any;
        try {
          msg = JSON.parse(body);
        } catch {
          continue;
        }
        if (typeof msg.id === "number") {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            p.resolve(msg.result);
          }
        }
      }
    }
  }

  async readStderr() {
    const reader = this.proc.stderr.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = dec.decode(value);
      if (text.includes("RuntimeError:")) {
        this.runtimeError = text;
      }
    }
  }

  async write(obj: unknown) {
    const body = JSON.stringify(obj);
    const bytes = enc.encode(body);
    await this.writer.write(enc.encode(`Content-Length: ${bytes.length}\r\n\r\n${body}`));
  }

  async request(method: string, params: unknown) {
    const id = this.nextId++;
    const p = new Promise<unknown>((resolve) => this.pending.set(id, { resolve }));
    await this.write({ jsonrpc: "2.0", id, method, params });
    return await Promise.race([
      p,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout ${method}`)), 30000)),
    ]);
  }

  async notify(method: string, params: unknown) {
    await this.write({ jsonrpc: "2.0", method, params });
  }

  async close() {
    try {
      await this.request("shutdown", null);
    } catch {
      // ignore
    }
    try {
      await this.notify("exit", null);
    } catch {
      // ignore
    }
    this.writer.releaseLock();
    try {
      this.proc.kill();
    } catch {
      // ignore
    }
    await this.proc.status;
  }
}

Deno.test({
  name: "LSP didOpen on aoc2016/1 should not crash runtime",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
  const cwd = Deno.cwd();
  const stdRoot = Deno.env.get("WORKMAN_STD_ROOT") ?? "/Users/profilence/git/workman/std";
  const target = "/Users/profilence/git/workman/aoc2016/1.wm";

  try {
    await Deno.stat(target);
    await Deno.stat(stdRoot);
  } catch {
    return; // skip when external fixtures are unavailable
  }

  const source = await Deno.readTextFile(target);
  const proc = new Deno.Command("grain", {
    args: [
      "--dir", ".",
      "--dir", stdRoot,
      "--dir", "/Users/profilence/git/workman",
      "--dir", "/Users/profilence/git",
      "--include-dirs", `${cwd}/src`,
      `${cwd}/src/cli/lsp/lsp.gr`,
      "--",
      "--std-root", stdRoot,
    ],
    cwd,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  const client = new LspClient(proc);
  const uri = `file://${target}`;

  await client.request("initialize", {
    processId: null,
    rootUri: `file://${cwd}`,
    capabilities: {},
  });
  await client.notify("initialized", {});
  await client.notify("textDocument/didOpen", {
    textDocument: {
      uri,
      languageId: "wm",
      version: 1,
      text: source,
    },
  });

  await new Promise((r) => setTimeout(r, 3000));
  const runtimeError = client.runtimeError;
  await client.close();

  if (runtimeError) {
    throw new Error(`unexpected LSP runtime error: ${runtimeError}`);
  }
  },
});
