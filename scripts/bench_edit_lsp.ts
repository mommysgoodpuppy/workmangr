#!/usr/bin/env -S deno run --allow-run --allow-read

const enc = new TextEncoder();
const dec = new TextDecoder();

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};

type NotificationHandler = (method: string, params: any) => void;

class LspClient {
  #proc: Deno.ChildProcess;
  #writer: WritableStreamDefaultWriter<Uint8Array>;
  #pending = new Map<number, Pending>();
  #nextId = 1;
  #buf = "";
  #onNotification: NotificationHandler | null = null;

  constructor(proc: Deno.ChildProcess) {
    this.#proc = proc;
    this.#writer = proc.stdin.getWriter();
    this.#readLoop();
  }

  onNotification(handler: NotificationHandler) {
    this.#onNotification = handler;
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
        } else if (typeof msg.method === "string") {
          this.#onNotification?.(msg.method, msg.params);
        }
      }
    }
  }

  async send(method: string, params?: unknown) {
    const msg = { jsonrpc: "2.0", method, params };
    await this.#write(msg);
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.#nextId++;
    const msg = { jsonrpc: "2.0", id, method, params };
    const p = new Promise<unknown>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
    });
    await this.#write(msg);
    return await Promise.race([
      p,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 30000)),
    ]);
  }

  async #write(msg: unknown) {
    const body = JSON.stringify(msg);
    const bodyBytes = enc.encode(body);
    const header = `Content-Length: ${bodyBytes.length}\r\n\r\n`;
    await this.#writer.write(enc.encode(header + body));
  }

  async close() {
    try {
      await this.request("shutdown");
    } catch {
      // ignore
    }
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
  }
}

type EditResult = {
  label: string;
  msToFirstDiag: number;
  msToSettled: number;
  notifications: number;
  targetDiagCount: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dirname = (p: string) => {
  const i = p.lastIndexOf("/");
  if (i <= 0) return "/";
  return p.slice(0, i);
};
const unique = <T>(xs: T[]) => Array.from(new Set(xs));

async function main() {
  const cwd = Deno.cwd();
  const filePath = `${cwd}/simple.wm`;
  const uri = `file://${filePath}`;
  const stdRoot = Deno.args[0] ?? "/Users/profilence/git/workman/std";
  const preopenDirs = unique([
    ".",
    stdRoot,
    dirname(stdRoot),
    dirname(dirname(stdRoot)),
  ]);

  const base = 'let x = 1;\n';
  const edits: Array<{ label: string; text: string }> = [
    { label: "base", text: base },
    { label: "import-typed-1", text: 'from "std/list" import * as L;\n' + base },
    { label: "import-typed-2", text: 'from "std/list" import * as Li;\n' + base },
    { label: "import-final", text: 'from "std/list" import * as List;\n' + base },
  ];

  const proc = new Deno.Command("grain", {
    args: [
      ...preopenDirs.flatMap((d) => ["--dir", d]),
      "--env",
      "WORKMAN_LSP_TIMING=1",
      "--include-dirs",
      `${cwd}/src`,
      `${cwd}/src/cli/lsp/lsp.gr`,
      "--",
      "--std-root",
      stdRoot,
    ],
    cwd,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  (async () => {
    const reader = proc.stderr.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = dec.decode(value);
      console.error(text);
    }
  })();

  const lsp = new LspClient(proc);

  let activeRun: {
    startMs: number;
    firstDiagMs: number | null;
    notifyCount: number;
    targetDiagCount: number;
    settleTimer: number | null;
    hardTimeout: number | null;
    resolve: (r: EditResult) => void;
    label: string;
  } | null = null;

  lsp.onNotification((method, params) => {
    if (method !== "textDocument/publishDiagnostics" || !activeRun) return;
    const now = performance.now();
    activeRun.notifyCount += 1;
    if (activeRun.firstDiagMs === null) activeRun.firstDiagMs = now;

    const p = params as { uri?: string; diagnostics?: unknown[] };
    if (p?.uri === uri) {
      activeRun.targetDiagCount = Array.isArray(p.diagnostics) ? p.diagnostics.length : 0;
    }

    if (activeRun.settleTimer !== null) clearTimeout(activeRun.settleTimer);
    activeRun.settleTimer = setTimeout(() => {
      if (!activeRun) return;
      const settled = performance.now();
      const res: EditResult = {
        label: activeRun.label,
        msToFirstDiag: Math.round((activeRun.firstDiagMs ?? settled) - activeRun.startMs),
        msToSettled: Math.round(settled - activeRun.startMs),
        notifications: activeRun.notifyCount,
        targetDiagCount: activeRun.targetDiagCount,
      };
      const resolve = activeRun.resolve;
      if (activeRun.hardTimeout !== null) clearTimeout(activeRun.hardTimeout);
      activeRun = null;
      resolve(res);
    }, 400) as unknown as number;
  });

  await lsp.request("initialize", {
    processId: null,
    rootUri: `file://${cwd}`,
    capabilities: {},
  });
  await lsp.send("initialized", {});

  await lsp.send("textDocument/didOpen", {
    textDocument: {
      uri,
      languageId: "wm",
      version: 1,
      text: edits[0].text,
    },
  });

  // wait initial diagnostics settle
  await sleep(1200);

  const results: EditResult[] = [];
  let version = 2;
  for (const edit of edits.slice(1)) {
    const result = await new Promise<EditResult>((resolve) => {
      const startMs = performance.now();
      activeRun = {
        startMs,
        firstDiagMs: null,
        notifyCount: 0,
        targetDiagCount: 0,
        settleTimer: null,
        hardTimeout: null,
        resolve,
        label: edit.label,
      };
      // Ensure the run settles even when no diagnostics notification is emitted.
      activeRun.settleTimer = setTimeout(() => {
        if (!activeRun) return;
        const settled = performance.now();
        const res: EditResult = {
          label: activeRun.label,
          msToFirstDiag: Math.round((activeRun.firstDiagMs ?? settled) - activeRun.startMs),
          msToSettled: Math.round(settled - activeRun.startMs),
          notifications: activeRun.notifyCount,
          targetDiagCount: activeRun.targetDiagCount,
        };
        const done = activeRun.resolve;
        if (activeRun.hardTimeout !== null) clearTimeout(activeRun.hardTimeout);
        activeRun = null;
        done(res);
      }, 1200) as unknown as number;
      activeRun.hardTimeout = setTimeout(() => {
        if (!activeRun) return;
        const settled = performance.now();
        const res: EditResult = {
          label: activeRun.label,
          msToFirstDiag: Math.round((activeRun.firstDiagMs ?? settled) - activeRun.startMs),
          msToSettled: Math.round(settled - activeRun.startMs),
          notifications: activeRun.notifyCount,
          targetDiagCount: activeRun.targetDiagCount,
        };
        const done = activeRun.resolve;
        if (activeRun.settleTimer !== null) clearTimeout(activeRun.settleTimer);
        activeRun = null;
        done(res);
      }, 15000) as unknown as number;
      void lsp.send("textDocument/didChange", {
        textDocument: { uri, version: version++ },
        contentChanges: [{ text: edit.text }],
      });
    });
    results.push(result);
  }

  console.log("\nEdit-cycle results");
  for (const r of results) {
    console.log(
      `${r.label}: firstDiag=${r.msToFirstDiag}ms settled=${r.msToSettled}ms notifications=${r.notifications} targetDiagCount=${r.targetDiagCount}`,
    );
  }

  await lsp.close();
}

await main();
