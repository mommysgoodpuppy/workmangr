import path from "node:path";
import { fileURLToPath } from "node:url";

type CliParse = {
  command: string;
  args: string[];
  fileArgIndex: number | null;
  hasStdRootArg: boolean;
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
  const takesValue = new Set(["--line", "--std-root", "--std"]);
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
`;

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
    const zigProc = await runCommand("zig", ["run", zigPath], invocationCwd);
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
