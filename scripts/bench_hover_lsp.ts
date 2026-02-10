#!/usr/bin/env -S deno run --allow-run --allow-read

const enc = new TextEncoder();
const dec = new TextDecoder();

type Pending = {
  id: number;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};

class LspClient {
  #proc: Deno.ChildProcess;
  #writer: WritableStreamDefaultWriter<Uint8Array>;
  #pending = new Map<number, Pending>();
  #nextId = 1;
  #buf = "";
  #aborted: Error | null = null;

  constructor(proc: Deno.ChildProcess) {
    this.#proc = proc;
    this.#writer = proc.stdin.getWriter();
    this.#readLoop();
    this.#watchExit();
  }

  async #readLoop() {
    const reader = this.#proc.stdout.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      this.#buf += dec.decode(value, { stream: true });

      while (true) {
        const headerEnd = this.#buf.indexOf("\r\n\r\n");
        if (headerEnd < 0) break;
        const header = this.#buf.slice(0, headerEnd);
        const m = header.match(/Content-Length:\s*(\d+)/i);
        if (!m) {
          this.#buf = this.#buf.slice(headerEnd + 4);
          continue;
        }
        const len = Number(m[1]);
        const total = headerEnd + 4 + len;
        if (this.#buf.length < total) break;

        const body = this.#buf.slice(headerEnd + 4, total);
        this.#buf = this.#buf.slice(total);

        let msg: any;
        try {
          msg = JSON.parse(body);
        } catch {
          continue;
        }

        if (typeof msg.id === "number") {
          const p = this.#pending.get(msg.id);
          if (p) {
            this.#pending.delete(msg.id);
            p.resolve(msg.result);
          }
        }
      }
    }
  }

  async send(method: string, params?: unknown) {
    if (this.#aborted) throw this.#aborted;
    const msg = { jsonrpc: "2.0", method, params };
    await this.#write(msg);
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    if (this.#aborted) throw this.#aborted;
    const id = this.#nextId++;
    const msg = { jsonrpc: "2.0", id, method, params };
    const p = new Promise<unknown>((resolve, reject) => {
      this.#pending.set(id, { id, resolve, reject });
    });
    await this.#write(msg);
    const timeoutMs = method === "initialize" ? 45000 : 15000;
    return await Promise.race([
      p,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeoutMs)
      ),
    ]);
  }

  async #write(msg: unknown) {
    if (this.#aborted) throw this.#aborted;
    const body = JSON.stringify(msg);
    const bodyBytes = enc.encode(body);
    const header = `Content-Length: ${bodyBytes.length}\r\n\r\n`;
    await this.#writer.write(enc.encode(header + body));
  }

  abort(err: Error) {
    if (this.#aborted) return;
    this.#aborted = err;
    for (const pending of this.#pending.values()) {
      pending.reject(err);
    }
    this.#pending.clear();
  }

  isAborted() {
    return this.#aborted !== null;
  }

  async #watchExit() {
    const status = await this.#proc.status;
    if (!this.#aborted && status.code !== 0) {
      this.abort(new Error(`LSP process exited with code ${status.code}`));
    }
  }

  async close() {
    try {
      await this.send("exit");
    } catch {
      // ignore
    }
    this.#writer.releaseLock();
    try {
      this.#proc.kill();
    } catch {
      // ignore
    }
    await this.#proc.status;
  }
}

type MemSample = {
  rssKb: number;
  ms: number;
  context: string;
};

async function readRssKb(pid: number): Promise<number | null> {
  try {
    const out = await new Deno.Command("ps", {
      args: ["-o", "rss=", "-p", String(pid)],
      stdout: "piped",
      stderr: "null",
    }).output();
    if (!out.success) return null;
    const txt = new TextDecoder().decode(out.stdout).trim();
    if (!txt) return null;
    const n = Number(txt);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    n: values.length,
    avg: sum / values.length,
    p50: p(0.5),
    p95: p(0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

async function main() {
  const inferDebug = Deno.args.includes("--infer-debug");
  const timing = Deno.args.includes("--timing");
  const firstNumericArg = Deno.args.find((a) => /^\d+$/.test(a));
  const iterations = Number(firstNumericArg ?? "20");
  const cwd = Deno.cwd();
  const listPath = `${cwd}/tests/fixtures/workman_std/list.wm`;
  const uri = `file://${listPath}`;
  const text = await Deno.readTextFile(listPath);

  const proc = new Deno.Command("grain", {
    args: [
      "--dir",
      ".",
      ...(inferDebug ? ["--env", "WORKMAN_INFER_DEBUG=1"] : []),
      ...(timing ? ["--env", "WORKMAN_LSP_TIMING=1"] : []),
      "--initial-memory-pages",
      "2048",
      "--maximum-memory-pages",
      "4096",
      "--include-dirs",
      `${cwd}/src`,
      `${cwd}/src/cli/lsp/lsp.gr`,
      "--",
      "--std-root",
      `${cwd}/tests/fixtures/workman_std`,
    ],
    cwd,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  const lsp = new LspClient(proc);
  const tStart = performance.now();
  let lastStderrLine = "";
  let peak: MemSample | null = null;
  const memMonitor = (async () => {
    while (!lsp.isAborted()) {
      const rssKb = await readRssKb(proc.pid);
      if (rssKb != null) {
        const sample: MemSample = {
          rssKb,
          ms: performance.now() - tStart,
          context: lastStderrLine,
        };
        if (!peak || sample.rssKb > peak.rssKb) {
          peak = sample;
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  })();
  (async () => {
    const stderr = proc.stderr.getReader();
    while (true) {
      const { value, done } = await stderr.read();
      if (done) break;
      const text = dec.decode(value);
      console.error(text);
      const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (lines.length > 0) {
        lastStderrLine = lines[lines.length - 1];
      }
      if (
        text.includes("RuntimeError:")
        || text.includes("memory access out of bounds")
      ) {
        if (lastStderrLine) {
          console.error(`[bench] last_stderr="${lastStderrLine}"`);
        }
        if (peak) {
          console.error(
            `[bench] peak_rss_kb=${peak.rssKb} at_ms=${peak.ms.toFixed(0)} last_context="${peak.context}"`
          );
        }
        lsp.abort(new Error("LSP runtime error detected (see stderr above)"));
        break;
      }
    }
  })();

  await lsp.request("initialize", {
    processId: null,
    rootUri: `file://${cwd}`,
    capabilities: {},
  });
  await lsp.send("initialized", {});
  await lsp.send("textDocument/didOpen", {
    textDocument: {
      uri,
      languageId: "workman",
      version: 1,
      text,
    },
  });

  const latencies: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await lsp.request("textDocument/hover", {
      textDocument: { uri },
      position: { line: 70, character: 17 },
    });
    latencies.push(performance.now() - t0);
  }

  const s = stats(latencies);
  console.log(`hover iterations=${s.n}`);
  console.log(`avg=${s.avg.toFixed(1)}ms p50=${s.p50.toFixed(1)}ms p95=${s.p95.toFixed(1)}ms min=${s.min.toFixed(1)}ms max=${s.max.toFixed(1)}ms`);

  await lsp.request("shutdown", null);
  await lsp.close();
  await memMonitor;
  if (peak) {
    console.log(
      `peak_rss_kb=${peak.rssKb} at_ms=${peak.ms.toFixed(0)} context="${peak.context}"`
    );
  }
}

await main();
