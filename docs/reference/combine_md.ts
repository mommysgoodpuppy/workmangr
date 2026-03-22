import { walk } from "https://deno.land/std@0.208.0/fs/walk.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.208.0/path/mod.ts";

async function combineMarkdownFiles() {
  const scriptDir = dirname(fromFileUrl(import.meta.url));
  const baseDir = scriptDir;
  const outputFile = join(baseDir, "canonical_full_generated.md");

  const files: string[] = [];

  for await (const entry of walk(baseDir)) {
    if (
      entry.isFile &&
      entry.name.endsWith(".md") &&
      entry.path !== outputFile &&
      entry.name !== "plan.md" &&
      entry.name !== "README.md"
    ) {
      files.push(entry.path);
    }
  }

  files.sort();

  let combinedContent = "";

  for (const file of files) {
    const content = await Deno.readTextFile(file);
    combinedContent += content + "\n\n";
  }

  await Deno.writeTextFile(outputFile, combinedContent);
  console.log(`Combined markdown written to ${outputFile}`);
}

if (import.meta.main) {
  await combineMarkdownFiles();
}
