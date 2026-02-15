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
    return { command: "type", args: [], fileArgIndex: null, hasStdRootArg: false };
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

const usage = `Usage:
  deno run -A wmgr.ts <command> [args...]

Examples:
  deno run -A wmgr.ts type /Users/profilence/git/workman/aoc2016/1.wm
  deno run -A wmgr.ts type --line 96 /Users/profilence/git/workman/aoc2016/1.wm
  deno run -A wmgr.ts ast /Users/profilence/git/workman/std/prelude.wm
`;

const main = async () => {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workmangrRoot = path.normalize(Deno.env.get("WMGR_ROOT") ?? scriptDir);
  const invocationCwd = Deno.cwd();
  const grainBin = Deno.env.get("WMGR_GRAIN_BIN") ?? Deno.env.get("GRAIN_BIN") ?? "grain";

  const stdRootCandidates = [
    Deno.env.get("WMGR_STD_ROOT") ?? "",
    Deno.env.get("WORKMAN_STD_ROOT") ?? "",
    path.join(workmangrRoot, "..", "workman", "std"),
    "c:/Git/workman/std",
    "c:/GIT/workman/std",
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

  if (parsed.fileArgIndex != null) {
    const fileArg = passArgs[parsed.fileArgIndex];
    const abs = path.isAbsolute(fileArg) ? fileArg : path.resolve(invocationCwd, fileArg);
    if (await fileExists(abs)) {
      passArgs[parsed.fileArgIndex] = abs;
    }
  }

  if (parsed.command === "type" && !parsed.hasStdRootArg && stdRoot) {
    passArgs.unshift("--std-root", stdRoot);
  }

  const extraPreopenDirs = await uniqueExistingDirs([
    ".",
    invocationCwd,
    stdRoot ?? "",
    stdRoot ? path.join(stdRoot, "..") : "",
    stdRoot ? path.join(stdRoot, "..", "..") : "",
  ]);

  const grainArgs = [
    ...extraPreopenDirs.flatMap((dir) => ["--dir", dir]),
    "--include-dirs",
    path.join(workmangrRoot, "src"),
    path.join(workmangrRoot, "src", "cli", "cli.gr"),
    "--",
    parsed.command,
    ...passArgs,
  ];

  const env = { ...Deno.env.toObject() };
  if (stdRoot) env.WORKMAN_STD_ROOT = stdRoot;

  const proc = await new Deno.Command(grainBin, {
    args: grainArgs,
    cwd: workmangrRoot,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn().status;

  Deno.exit(proc.code);
};

await main();
