import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractCHeaders, scanCHeaderImports } from "./src/core/foreign_types/c_header_extract.ts";

type CliParse = {
  command: string;
  args: string[];
  fileArgIndex: number | null;
  hasStdRootArg: boolean;
};

type PendingLspExtraction = {
  filePath: string;
  source: string;
};

const fileExists = async (path: string): Promise<boolean> => {
  try {
    const stat = await Deno.stat(path);
    return stat.isFile;
  } catch {
    return false;
  }
};

const dirExists = async (path: string): Promise<boolean> => {
  try {
    const stat = await Deno.stat(path);
    return stat.isDirectory;
  } catch {
    return false;
  }
};

const uniqueExistingDirs = async (candidates: string[]): Promise<string[]> => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of candidates) {
    const normalized = path.normalize(raw);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (await dirExists(normalized)) out.push(normalized);
  }
  return out;
};

const parseCli = (argv: string[]): CliParse => {
  if (argv.length === 0) {
    return {
      command: "type",
      args: [],
      fileArgIndex: null,
      hasStdRootArg: false,
    };
  }

  const command = argv[0];
  const args = argv.slice(1);
  const takesValue = new Set(["--line", "--std-root", "--std", "--c-headers-file"]);
  let fileArgIndex: number | null = null;
  let hasStdRootArg = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--std-root" || arg === "--std") {
      hasStdRootArg = true;
    }
    if (takesValue.has(arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith("-")) continue;
    if (fileArgIndex == null) fileArgIndex = i;
  }

  return { command, args, fileArgIndex, hasStdRootArg };
};

const toPosixPath = (value: string): string => value.replaceAll("\\", "/");

const fileUriToPath = (uri: string): string | null => {
  try {
    if (!uri.startsWith("file://")) return null;
    return path.normalize(fileURLToPath(uri));
  } catch {
    return null;
  }
};

const toGrainInputPath = (absPath: string, rootDir: string): string => {
  // Grain/WASI on Windows is unreliable with drive-letter absolute paths.
  // Prefer a repo-relative POSIX path when possible.
  if (Deno.build.os === "windows") {
    const rel = path.relative(rootDir, absPath);
    if (rel.length > 0 && !rel.startsWith("..") && !path.isAbsolute(rel)) {
      return toPosixPath(rel);
    }
  }
  return toPosixPath(absPath);
};

const usage = `Usage:
  deno run -A wmgr.ts <command> [args...]

Examples:
  deno run -A wmgr.ts type /Users/profilence/git/workman/aoc2016/1.wm
  deno run -A wmgr.ts type --line 96 /Users/profilence/git/workman/aoc2016/1.wm
  deno run -A wmgr.ts ast /Users/profilence/git/workman/std/prelude.wm
  deno run -A wmgr.ts inlay ./simple.wm
  deno run -A wmgr.ts run ./simple.wm
  deno run -A wmgr.ts lsp
`;

const readContentLength = (headerText: string): number | null => {
  for (const line of headerText.split("\r\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (name === "content-length") {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    }
  }
  return null;
};

const maybeExtractFromLspPayload = async (payloadText: string) => {
  let extraction: PendingLspExtraction | null = null;
  try {
    const payload = JSON.parse(payloadText);
    const method = payload?.method;
    if (method === "textDocument/didOpen") {
      const uri = payload?.params?.textDocument?.uri;
      const text = payload?.params?.textDocument?.text;
      const filePath = typeof uri === "string" ? fileUriToPath(uri) : null;
      if (filePath && typeof text === "string") {
        extraction = { filePath, source: text };
      }
    } else if (method === "textDocument/didChange") {
      const uri = payload?.params?.textDocument?.uri;
      const filePath = typeof uri === "string" ? fileUriToPath(uri) : null;
      const changes = payload?.params?.contentChanges;
      const text = Array.isArray(changes) && changes.length > 0
        ? changes[0]?.text
        : undefined;
      if (filePath && typeof text === "string") {
        extraction = { filePath, source: text };
      }
    }
  } catch {
    extraction = null;
  }

  if (!extraction) return;
  if (!(await fileExists(extraction.filePath))) return;
  const headerImports = scanCHeaderImports(extraction.source);
  if (headerImports.length === 0) return;
  try {
    await extractCHeaders(extraction.filePath, extraction.source);
  } catch (err) {
    console.error(
      `[wmgr:lsp] C header extraction warning:`,
      err instanceof Error ? err.message : String(err),
    );
  }
};

const runLspProxy = async (
  workmangrRoot: string,
  grainBin: string,
  stdRoot: string | undefined,
) => {
  const extraPreopenDirs = await uniqueExistingDirs([
    ".",
    Deno.cwd(),
    workmangrRoot,
    stdRoot ?? "",
    stdRoot ? path.join(stdRoot, "..") : "",
    stdRoot ? path.join(stdRoot, "..", "..") : "",
  ]);

  const args = [
    ...extraPreopenDirs.flatMap((dir) => ["--dir", dir]),
    "--include-dirs",
    path.join(workmangrRoot, "src"),
    path.join(workmangrRoot, "src", "cli", "lsp", "lsp.gr"),
    "--",
    ...(stdRoot ? ["--std-root", stdRoot] : []),
  ];

  const env = { ...Deno.env.toObject() };
  if (stdRoot) env.WORKMAN_STD_ROOT = stdRoot;

  const proc = new Deno.Command(grainBin, {
    args,
    cwd: workmangrRoot,
    env,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  const stderrPump = proc.stderr.pipeTo(Deno.stderr.writable);
  const stdoutPump = proc.stdout.pipeTo(Deno.stdout.writable);

  const reader = Deno.stdin.readable.getReader();
  const writer = proc.stdin.getWriter();
  const decoder = new TextDecoder();
  let buffer = new Uint8Array(0);

  const appendBuffer = (current: Uint8Array, next: Uint8Array) => {
    const merged = new Uint8Array(current.length + next.length);
    merged.set(current, 0);
    merged.set(next, current.length);
    return merged;
  };

  const headerDelimiter = new TextEncoder().encode("\r\n\r\n");
  const indexOfBytes = (haystack: Uint8Array, needle: Uint8Array) => {
    outer:
    for (let i = 0; i <= haystack.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) continue outer;
      }
      return i;
    }
    return -1;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) buffer = appendBuffer(buffer, value);

      for (;;) {
        const headerEnd = indexOfBytes(buffer, headerDelimiter);
        if (headerEnd < 0) break;
        const headerBytes = buffer.slice(0, headerEnd);
        const headerText = decoder.decode(headerBytes);
        const contentLength = readContentLength(headerText);
        if (contentLength == null) {
          await writer.write(buffer);
          buffer = new Uint8Array(0);
          break;
        }
        const totalLength = headerEnd + 4 + contentLength;
        if (buffer.length < totalLength) break;
        const messageBytes = buffer.slice(0, totalLength);
        const bodyBytes = buffer.slice(headerEnd + 4, totalLength);
        const bodyText = decoder.decode(bodyBytes);
        await maybeExtractFromLspPayload(bodyText);
        await writer.write(messageBytes);
        buffer = buffer.slice(totalLength);
      }
    }

    if (buffer.length > 0) {
      await writer.write(buffer);
    }
  } finally {
    try {
      await writer.close();
    } catch {
      // ignore shutdown races
    }
    reader.releaseLock();
  }

  const status = await proc.status;
  await Promise.allSettled([stderrPump, stdoutPump]);
  Deno.exit(status.code);
};

const main = async () => {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workmangrRoot = path.normalize(Deno.env.get("WMGR_ROOT") ?? scriptDir);
  const invocationCwd = Deno.cwd();
  const grainBin = Deno.env.get("WMGR_GRAIN_BIN") ??
    Deno.env.get("GRAIN_BIN") ?? "grain";

  const stdRootCandidates = [
    Deno.env.get("WMGR_STD_ROOT") ?? "",
    Deno.env.get("WORKMAN_STD_ROOT") ?? "",
    "std",
  ].filter((x) => x.length > 0);

  let stdRoot: string | undefined;
  for (const candidate of stdRootCandidates) {
    if (await dirExists(candidate)) {
      stdRoot = path.normalize(candidate);
      break;
    }
  }

  const argv = [...Deno.args];
  if (
    argv.length === 0 ||
    argv[0] === "-h" ||
    argv[0] === "--help" ||
    argv[0] === "help"
  ) {
    console.log(usage);
    Deno.exit(0);
  }

  const parsed = parseCli(argv);
  const passArgs = [...parsed.args];
  const rawFileArg = parsed.fileArgIndex == null
    ? null
    : parsed.args[parsed.fileArgIndex];
  const absFileArg = rawFileArg == null
    ? null
    : (path.isAbsolute(rawFileArg)
      ? rawFileArg
      : path.resolve(invocationCwd, rawFileArg));

  if (parsed.fileArgIndex != null) {
    const fileArg = passArgs[parsed.fileArgIndex];
    const abs = path.isAbsolute(fileArg)
      ? fileArg
      : path.resolve(invocationCwd, fileArg);
    if (await fileExists(abs)) {
      passArgs[parsed.fileArgIndex] = toGrainInputPath(abs, workmangrRoot);
    }
  }

  if (
    (parsed.command === "type" || parsed.command === "compile" ||
      parsed.command === "run") &&
    !parsed.hasStdRootArg &&
    stdRoot
  ) {
    passArgs.unshift("--std-root", stdRoot);
  }

  const extraPreopenDirs = await uniqueExistingDirs([
    ".",
    invocationCwd,
    stdRoot ?? "",
    stdRoot ? path.join(stdRoot, "..") : "",
    stdRoot ? path.join(stdRoot, "..", "..") : "",
  ]);

  const grainArgsFor = (command: string, cmdArgs: string[]) => [
    ...extraPreopenDirs.flatMap((dir) => ["--dir", dir]),
    "--include-dirs",
    path.join(workmangrRoot, "src"),
    path.join(workmangrRoot, "src", "cli", "cli.gr"),
    "--",
    command,
    ...cmdArgs,
  ];

  const env = { ...Deno.env.toObject() };
  if (stdRoot) env.WORKMAN_STD_ROOT = stdRoot;

  if (parsed.command === "lsp") {
    await runLspProxy(workmangrRoot, grainBin, stdRoot);
    return;
  }

  // Extract C header types for commands that feed module inference or LSP.
  if (
    absFileArg && await fileExists(absFileArg)
    && (parsed.command === "type" || parsed.command === "compile" || parsed.command === "run")
  ) {
    try {
      const entrySource = await Deno.readTextFile(absFileArg);
      const headerImports = scanCHeaderImports(entrySource);
      if (headerImports.length > 0) {
        const result = await extractCHeaders(absFileArg, entrySource);
        if (result.cacheFilePath) {
          passArgs.unshift("--c-headers-file", result.cacheFilePath);
        }
      }
    } catch (err) {
      console.error(
        `[wmgr] C header extraction warning:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const runCommand = async (cmd: string, args: string[], cwd: string) =>
    await new Deno.Command(cmd, {
      args,
      cwd,
      env,
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    }).output();

  if (parsed.command === "run") {
    if (!absFileArg) {
      console.error("wm run requires a .wm input file");
      Deno.exit(1);
    }
    const compileProc = await runCommand(
      grainBin,
      grainArgsFor("compile", passArgs),
      workmangrRoot,
    );
    if (compileProc.stdout.length > 0) {
      await Deno.stdout.write(compileProc.stdout);
    }
    if (compileProc.stderr.length > 0) {
      await Deno.stderr.write(compileProc.stderr);
    }
    if (compileProc.code !== 0) Deno.exit(compileProc.code);

    const zigPath = absFileArg.endsWith(".wm")
      ? absFileArg.slice(0, absFileArg.length - 3) + ".zig"
      : absFileArg + ".zig";
    const zigProc = await runCommand("zig", ["run", "-lc", zigPath], invocationCwd);
    if (zigProc.stdout.length > 0) await Deno.stdout.write(zigProc.stdout);
    if (zigProc.stderr.length > 0) await Deno.stderr.write(zigProc.stderr);
    Deno.exit(zigProc.code);
  }

  const proc = await new Deno.Command(grainBin, {
    args: grainArgsFor(parsed.command, passArgs),
    cwd: workmangrRoot,
    env,
    // `type`/`ast` are non-interactive. Piping stdio avoids TTY-specific hangs
    // observed when running Grain/WASI under some terminals (e.g. pwsh).
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();

  if (proc.stdout.length > 0) {
    await Deno.stdout.write(proc.stdout);
  }
  if (proc.stderr.length > 0) {
    await Deno.stderr.write(proc.stderr);
  }

  Deno.exit(proc.code);
};

await main();
