/**
 * Deno-side C header extraction.
 *
 * Scans a .wm source for `from "xxx.h" import ...` declarations,
 * runs the Zig-based extractor for each header, and writes a combined
 * JSON cache file that the Grain compiler can read via WASI.
 *
 * Ported from workman v0 src/foreign_types/c_header_provider.ts
 */

import * as path from "node:path";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface CHeaderExtractionResult {
  /** Path to the written cache file (relative to cwd, readable by WASI) */
  cacheFilePath: string;
  /** Map of header path → extracted JSON string (for debugging) */
  headers: Map<string, string>;
}

export interface ExtractOptions {
  zigPath?: string;
  cacheDir?: string;
  includeDirs?: string[];
  defines?: string[];
}

// ---------------------------------------------------------------------------
// Scan .wm source for C header imports
// ---------------------------------------------------------------------------

interface CHeaderImport {
  headerPath: string;
  symbols: string[];
  alias?: string;
}

export function scanCHeaderImports(source: string): CHeaderImport[] {
  const imports: CHeaderImport[] = [];
  // Match: from "xxx.h" import * as Alias
  // Match: from "xxx.h" import { sym1, sym2 }
  // Match: from "xxx.h" import sym1, sym2
  const pattern =
    /from\s+"([^"]+\.h)"\s+import\s+(?:\*\s+as\s+\w+|(?:\{([^}]*)\}|([^;{}\n]*)))/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const headerPath = match[1];
    const importClause = match[0];
    const aliasMatch = /import\s+\*\s+as\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(
      importClause,
    );
    const alias = aliasMatch?.[1];
    // For wildcard imports (import * as X), we can't know symbols at scan time.
    // Instead, collect only the members actually referenced in source.
    // For named imports, extract symbol names.
    const symbolBlock = match[2] ?? match[3] ?? "";
    let symbols = symbolBlock
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
      .filter((s) => s.length > 0 && s !== "*");
    if (alias && symbols.length === 0) {
      const used = new Set<string>();
      const memberPattern = new RegExp(
        `\\b${alias}\\.([A-Za-z_][A-Za-z0-9_]*)\\b`,
        "g",
      );
      let memberMatch;
      while ((memberMatch = memberPattern.exec(source)) !== null) {
        used.add(memberMatch[1]);
      }
      symbols = [...used];
    }
    imports.push({ headerPath, symbols, alias });
  }
  return imports;
}

// ---------------------------------------------------------------------------
// Zig extractor
// ---------------------------------------------------------------------------

function escapeZigString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function buildZigSource(
  templatePath: string,
  headerPath: string,
  symbols: string[],
): Promise<string> {
  const template = await Deno.readTextFile(templatePath);
  const escapedHeader = escapeZigString(headerPath);
  const symbolLines = symbols.map((name) => `  "${escapeZigString(name)}",`)
    .join("\n");
  return template
    .replaceAll("{{HEADER}}", escapedHeader)
    .replaceAll("{{SYMBOLS}}", symbolLines);
}

function resolveZigPath(options: ExtractOptions): string {
  if (options.zigPath) return options.zigPath;
  const envPath = Deno.env.get("WM_ZIG_PATH") ?? Deno.env.get("ZIG") ??
    Deno.env.get("ZIG_PATH");
  if (envPath) return envPath;
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
  if (home) {
    const zigName = Deno.build.os === "windows" ? "zig.exe" : "zig";
    const zvmCandidate = path.join(home, ".zvm", "bin", zigName);
    try {
      Deno.statSync(zvmCandidate);
      return zvmCandidate;
    } catch { /* not found */ }
  }
  return "zig";
}

function isWindowsRuntime(): boolean {
  return Deno.build.os === "windows";
}

function isLinuxRuntime(): boolean {
  return Deno.build.os === "linux";
}

function detectWindowsTarget(): string {
  const override = Deno.env.get("WM_C_HEADER_TARGET");
  if (override) return override;
  const arch = (Deno.env.get("PROCESSOR_ARCHITECTURE") ??
    Deno.env.get("PROCESSOR_ARCHITEW6432") ?? "").toLowerCase();
  if (arch.includes("arm64")) return "aarch64-windows-gnu";
  if (arch.includes("arm")) return "arm-windows-gnu";
  if (arch.includes("86")) return "x86-windows-gnu";
  return "x86_64-windows-gnu";
}

function detectLinuxLibcTarget(): string {
  switch (Deno.build.arch) {
    case "aarch64":
      return "aarch64-linux-musl";
    case "x86":
      return "x86-linux-musl";
    default:
      return "x86_64-linux-musl";
  }
}

function isBareHeaderSpecifier(headerPath: string): boolean {
  return !headerPath.includes("/") && !headerPath.includes("\\");
}

async function runZigExtractor(
  zigPath: string,
  sourcePath: string,
  headerPath: string,
  includeDirs: string[],
  defines: string[],
): Promise<string> {
  const args: string[] = ["run"];
  const explicitTarget = Deno.env.get("WM_C_HEADER_TARGET");
  if (explicitTarget) {
    args.push("-target", explicitTarget);
    args.push("-lc");
  } else if (isWindowsRuntime()) {
    args.push("-target", detectWindowsTarget());
    args.push("-lc");
  } else if (isLinuxRuntime() && isBareHeaderSpecifier(headerPath)) {
    args.push("-target", detectLinuxLibcTarget());
    args.push("-lc");
  }
  for (const inc of includeDirs) {
    args.push(`-I${inc}`);
  }
  for (const def of defines) {
    args.push(`-D${def}`);
  }
  args.push(sourcePath);

  const command = new Deno.Command(zigPath, {
    args,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    throw new Error(`zig extractor failed: ${stderr.trim()}`);
  }
  return new TextDecoder().decode(output.stdout);
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

async function hashKey(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function ensureDir(dirPath: string): Promise<void> {
  try {
    await Deno.mkdir(dirPath, { recursive: true });
  } catch { /* already exists */ }
}

async function readCacheEntry(
  filePath: string,
): Promise<string | null> {
  try {
    return await Deno.readTextFile(filePath);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// build.wm include path extraction (ported from v0)
// ---------------------------------------------------------------------------

function findNearestBuildWm(entryPath: string): string | undefined {
  let current = path.dirname(path.resolve(entryPath));
  for (;;) {
    const candidate = path.join(current, "build.wm");
    try {
      Deno.statSync(candidate);
      return candidate;
    } catch { /* not found */ }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function extractIncludePathsFromBuildWm(buildWmPath: string): string[] {
  try {
    const source = Deno.readTextFileSync(buildWmPath);
    const buildDir = path.dirname(path.resolve(buildWmPath));
    const includePaths: string[] = [];
    const pattern =
      /\.?addIncludePath\s*\(\s*b\.path\s*\(\s*["']([^"']+)["']\s*\)/g;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const abs = path.resolve(buildDir, match[1]);
      try {
        Deno.statSync(abs);
        includePaths.push(abs);
      } catch { /* skip missing */ }
    }
    return includePaths;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function extractCHeaders(
  entryPath: string,
  source: string,
  options: ExtractOptions = {},
): Promise<CHeaderExtractionResult> {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const templatePath = path.join(scriptDir, "zig", "c_header_extract.zig");
  const zigPath = resolveZigPath(options);
  const cacheDir = options.cacheDir ??
    path.join(path.dirname(path.resolve(entryPath)), ".wm_cache", "c_headers");

  // Gather include dirs
  const buildWmPath = findNearestBuildWm(entryPath);
  const buildWmIncludes = buildWmPath
    ? extractIncludePathsFromBuildWm(buildWmPath)
    : [];
  const envIncludes = (Deno.env.get("WM_C_HEADER_INCLUDE_DIRS") ?? "")
    .split(";").filter((s) => s.length > 0);
  const includeDirs = [
    ...buildWmIncludes,
    ...envIncludes,
    ...(options.includeDirs ?? []),
  ];
  const defines = [
    ...(Deno.env.get("WM_C_HEADER_DEFINES") ?? "").split(";").filter((s) =>
      s.length > 0
    ),
    ...(options.defines ?? []),
  ];

  const headerImports = scanCHeaderImports(source);
  const headers = new Map<string, string>();

  if (headerImports.length === 0) {
    return { cacheFilePath: "", headers };
  }

  await ensureDir(cacheDir);

  for (const imp of headerImports) {
    const cacheKey = await hashKey({
      schemaVersion: 3,
      headerPath: imp.headerPath,
      includeDirs,
      defines,
      symbols: imp.symbols,
    });
    const cacheFile = path.join(cacheDir, `${cacheKey}.json`);
    let json = await readCacheEntry(cacheFile);

    if (!json) {
      try {
        const zigSource = await buildZigSource(
          templatePath,
          imp.headerPath,
          imp.symbols,
        );
        const zigFile = path.join(cacheDir, `extract_${cacheKey}.zig`);
        await Deno.writeTextFile(zigFile, zigSource);
        json = await runZigExtractor(
          zigPath,
          zigFile,
          imp.headerPath,
          includeDirs,
          defines,
        );
        await Deno.writeTextFile(cacheFile, json);
      } catch (err) {
        console.error(
          `[c_header] extraction failed for ${imp.headerPath}:`,
          err instanceof Error ? err.message : String(err),
        );
        json = '{"types":[],"fns":[],"values":[]}';
      }
    }

    headers.set(imp.headerPath, json);
  }

  // Write combined cache file for Grain to read
  const combined: Record<string, unknown> = {};
  for (const [header, json] of headers) {
    try {
      combined[header] = JSON.parse(json);
    } catch {
      combined[header] = { types: [], fns: [], values: [] };
    }
  }

  const combinedPath = path.join(cacheDir, "_combined.json");
  await Deno.writeTextFile(combinedPath, JSON.stringify(combined));

  return { cacheFilePath: combinedPath, headers };
}
