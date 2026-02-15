#!/usr/bin/env -S deno test --allow-run --allow-read --allow-env

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
  diagnosticsByUri = new Map<string, unknown[]>();
  publishedUris = new Set<string>();

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
        } else if (
          msg.method === "textDocument/publishDiagnostics"
          && msg.params
          && typeof msg.params.uri === "string"
          && Array.isArray(msg.params.diagnostics)
        ) {
          this.publishedUris.add(msg.params.uri);
          this.diagnosticsByUri.set(msg.params.uri, msg.params.diagnostics);
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

const waitFor = async (
  fn: () => boolean,
  timeoutMs: number,
  sleepMs = 200,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, sleepMs));
  }
  return fn();
};

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

Deno.test({
  name: "LSP didChange on dependency should clear stale diagnostics in open dependent file",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const cwd = Deno.cwd();
    const fixtureRoot = `${cwd}/tests/fixtures/lsp_dep_repro`;
    const entryPath = `${fixtureRoot}/entry.wm`;
    const depPath = `${fixtureRoot}/dep.wm`;

    const depBroken =
      "let at = (x) => { \"bad\" };";
    const depFixed =
      "let at = (x) => { nativeAdd((x, 1)) };";
    const entrySource =
      "from \"./dep\" import { at };\n"
      + "let y = nativeAdd((at(1), 1));";

    const proc = new Deno.Command("grain", {
      args: [
        "--dir", ".",
        "--include-dirs", `${cwd}/src`,
        `${cwd}/src/cli/lsp/lsp.gr`,
        "--",
      ],
      cwd,
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();

    const client = new LspClient(proc);
    const entryUri = `file://${entryPath}`;
    const depUri = `file://${depPath}`;

    await client.request("initialize", {
      processId: null,
      rootUri: `file://${cwd}`,
      capabilities: {},
    });
    await client.notify("initialized", {});

    await client.notify("textDocument/didOpen", {
      textDocument: {
        uri: depUri,
        languageId: "wm",
        version: 1,
        text: depBroken,
      },
    });
    await client.notify("textDocument/didOpen", {
      textDocument: {
        uri: entryUri,
        languageId: "wm",
        version: 1,
        text: entrySource,
      },
    });

    const sawInitialEntryError = await waitFor(() => {
      const diags = client.diagnosticsByUri.get(entryUri) ?? [];
      return diags.length > 0;
    }, 15000);
    if (!sawInitialEntryError) {
      await client.close();
      throw new Error("expected initial dependent diagnostics for entry.wm");
    }

    await client.notify("textDocument/didChange", {
      textDocument: {
        uri: depUri,
        version: 2,
      },
      contentChanges: [
        { text: depFixed },
      ],
    });

    const clearedEntry = await waitFor(() => {
      const diags = client.diagnosticsByUri.get(entryUri) ?? [];
      return diags.length === 0;
    }, 15000);

    const runtimeError = client.runtimeError;
    await client.close();

    if (runtimeError) {
      throw new Error(`unexpected LSP runtime error: ${runtimeError}`);
    }
    if (!clearedEntry) {
      throw new Error("expected entry.wm diagnostics to clear after fixing dep.wm");
    }
  },
});

Deno.test({
  name: "LSP didOpen on aoc2016/1 should publish diagnostics for the opened file",
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

    const deadlineMs = Date.now() + 30000;
    while (
      Date.now() < deadlineMs
      && client.runtimeError == null
      && !client.publishedUris.has(uri)
    ) {
      await new Promise((r) => setTimeout(r, 200));
    }
    const runtimeError = client.runtimeError;
    const targetDiagnostics = client.diagnosticsByUri.get(uri) ?? [];
    const sawTargetPublish = client.publishedUris.has(uri);
    await client.close();

    if (runtimeError) {
      throw new Error(`unexpected LSP runtime error: ${runtimeError}`);
    }
    if (!sawTargetPublish) {
      throw new Error("expected publishDiagnostics notification for opened file, got none");
    }
    void targetDiagnostics;
  },
});

const toFileUri = (path: string) => `file:///${path.replaceAll("\\", "/").replace(":", "%3A")}`;
const lowerDrive = (path: string) =>
  path.length > 1 && path[1] === ":" ? `${path[0].toLowerCase()}${path.slice(1)}` : path;

Deno.test({
  name: "LSP windows external didOpen should not fail reading opened absolute module",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    if (Deno.build.os !== "windows") return;

    const cwd = Deno.cwd().replaceAll("\\", "/");
    const workmanRoot = lowerDrive(
      Deno.env.get("WORKMAN_V0_ROOT")?.replaceAll("\\", "/") ?? "c:/GIT/workman",
    );
    const stdRoot = lowerDrive(`${workmanRoot}/std`);
    const target = lowerDrive(`${workmanRoot}/examples/aoc.wm`);
    const workmanParent = lowerDrive(workmanRoot.replace(/\/[^/]+$/, ""));

    try {
      await Deno.stat(target);
      await Deno.stat(stdRoot);
    } catch {
      return;
    }

    const source = await Deno.readTextFile(target);
    const targetUri = toFileUri(target);
    const rootUri = toFileUri(cwd);

    const proc = new Deno.Command("grain", {
      args: [
        "--dir", ".",
        "--dir", workmanRoot,
        "--dir", stdRoot,
        "--dir", workmanParent,
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
    await client.request("initialize", {
      processId: null,
      rootUri,
      capabilities: {},
    });
    await client.notify("initialized", {});
    await client.notify("textDocument/didOpen", {
      textDocument: {
        uri: targetUri,
        languageId: "wm",
        version: 1,
        text: source,
      },
    });

    await new Promise((r) => setTimeout(r, 2000));
    const runtimeError = client.runtimeError;
    const allDiagnostics = Array.from(client.diagnosticsByUri.values()).flat();
    await client.close();

    if (runtimeError) {
      throw new Error(`unexpected LSP runtime error: ${runtimeError}`);
    }
    const failedStdRead = allDiagnostics.find((diag) => {
      if (!diag || typeof diag !== "object") return false;
      const message = (diag as { message?: unknown }).message;
      return typeof message === "string"
        && message.includes("Failed to read module")
        && (
          message.includes("/examples/aoc.wm")
          || message.includes("/std/prelude.wm")
        );
    });
    if (failedStdRead) {
      throw new Error(
        "unexpected absolute module read failure for opened Windows file URI",
      );
    }
  },
});
