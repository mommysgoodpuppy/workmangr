#!/usr/bin/env -S deno run --allow-run --allow-read

const enc = new TextEncoder();
const dec = new TextDecoder();

class Lsp {
  proc: Deno.ChildProcess;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  buf = "";
  nextId = 1;
  pending = new Map<number, (v: any) => void>();
  aborted = false;

  constructor(proc: Deno.ChildProcess) {
    this.proc = proc;
    this.writer = proc.stdin.getWriter();
    this.readLoop();
    this.readErr();
  }

  async readErr() {
    const r = this.proc.stderr.getReader();
    while (true) {
      const { value, done } = await r.read();
      if (done) break;
      const t = dec.decode(value);
      console.error(t);
      if (t.includes("RuntimeError:")) {
        this.aborted = true;
      }
    }
  }

  async readLoop() {
    const r = this.proc.stdout.getReader();
    while (true) {
      const { value, done } = await r.read();
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
          const resolve = this.pending.get(msg.id);
          if (resolve) {
            this.pending.delete(msg.id);
            resolve(msg.result);
          }
        }
      }
    }
  }

  async write(obj: any) {
    const body = JSON.stringify(obj);
    const bytes = enc.encode(body);
    await this.writer.write(enc.encode(`Content-Length: ${bytes.length}\r\n\r\n${body}`));
  }

  async request(method: string, params: any) {
    const id = this.nextId++;
    const p = new Promise<any>((resolve) => this.pending.set(id, resolve));
    await this.write({ jsonrpc: "2.0", id, method, params });
    return await Promise.race([
      p,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout ${method}`)), 30000)),
    ]);
  }

  async notify(method: string, params: any) {
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

const cwd = Deno.cwd();
const stdRoot = "/Users/profilence/git/workman/std";
const target = "/Users/profilence/git/workman/aoc2016/1.wm";
const uri = `file://${target}`;
const text = await Deno.readTextFile(target);

const proc = new Deno.Command("grain", {
  args: [
    "--dir", ".",
    "--dir", stdRoot,
    "--dir", "/Users/profilence/git/workman",
    "--dir", "/Users/profilence/git",
    "--env", "WORKMAN_LSP_DEBUG=1",
    "--env", "WORKMAN_LSP_TIMING=1",
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

const lsp = new Lsp(proc);

await lsp.request("initialize", {
  processId: null,
  rootUri: `file://${cwd}`,
  capabilities: {},
});
await lsp.notify("initialized", {});
await lsp.notify("textDocument/didOpen", {
  textDocument: {
    uri,
    languageId: "wm",
    version: 1,
    text,
  },
});

await new Promise((r) => setTimeout(r, 3000));
if (lsp.aborted) {
  await lsp.close();
  throw new Error("LSP runtime error during didOpen repro");
}
console.log("didOpen repro completed without runtime crash");
await lsp.close();
