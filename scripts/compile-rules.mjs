import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderRuleFiles } from "./lib/rules.mjs";

// Compiles rules/*.md into the per-tool instruction files each AI coding
// environment reads, plus the two reference pages the skill links to.
//
// The Antigravity Code Kit maintained CLAUDE.md, .cursorrules, and
// .github/copilot-instructions.md as three hand-synced copies of the same text
// (17100 / 17090 / 17090 bytes). They drift. Generate them instead.
//
// The rendering itself lives in scripts/lib/rules.mjs, because bin/cli.mjs runs
// the same code against a consumer project's root.
//
//   node scripts/compile-rules.mjs
//   node scripts/compile-rules.mjs --check    verify committed output is current

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RULES_DIR = path.join(ROOT, "rules");

async function main() {
  const check = process.argv.includes("--check");
  const { rules, outputs } = await renderRuleFiles({ rulesDir: RULES_DIR, references: true });

  const stale = [];
  for (const [relative, contents] of outputs) {
    const absolute = path.join(ROOT, relative);
    const current = await readFile(absolute, "utf8").catch(() => null);
    if (current === contents) continue;
    if (check) {
      stale.push(relative);
      continue;
    }
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
    console.log(`wrote ${relative}`);
  }

  if (check) {
    if (stale.length) {
      console.error(`These generated files are out of date with rules/:\n  ${stale.join("\n  ")}`);
      console.error("Run `node scripts/compile-rules.mjs` and commit the result.");
      process.exitCode = 1;
      return;
    }
    console.log(`All ${outputs.size} generated files are current with ${rules.length} rules.`);
    return;
  }
  console.log(`Compiled ${rules.length} rules into ${outputs.size} files.`);
}

await main();
