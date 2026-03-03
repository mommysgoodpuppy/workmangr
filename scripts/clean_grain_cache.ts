const TARGET_EXTENSIONS = new Set([".gro", ".wasm"]);

function hasTargetExtension(name: string): boolean {
  const lower = name.toLowerCase();
  for (const ext of TARGET_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return true;
    }
  }
  return false;
}

async function removeGeneratedFiles(root: string): Promise<number> {
  let deleted = 0;

  for await (const entry of Deno.readDir(root)) {
    const fullPath = `${root}/${entry.name}`;

    if (entry.isDirectory) {
      deleted += await removeGeneratedFiles(fullPath);
      continue;
    }

    if (!entry.isFile || !hasTargetExtension(entry.name)) {
      continue;
    }

    await Deno.remove(fullPath);
    deleted += 1;
    console.log(`deleted ${fullPath}`);
  }

  return deleted;
}

if (import.meta.main) {
  const root = Deno.args[0] ?? Deno.cwd();
  const stat = await Deno.stat(root);
  if (!stat.isDirectory) {
    throw new Error(`clean_grain_cache root is not a directory: ${root}`);
  }
  const deleted = await removeGeneratedFiles(root);
  console.log(`done. deleted ${deleted} file(s)`);
}
