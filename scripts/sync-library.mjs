import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Republishes skills/<name>/ into library/<collection>/<name>/, the shape the
// TritonAI Skills Library sync reads.
//
// skills/ is the source. library/ is a published copy, kept byte-identical and
// verified by scripts/check-library.mjs. Entries in library/ with no counterpart
// in skills/ — the ucsd-branding retirement pointer, for instance — are left
// alone; only the mirrored directories are rewritten.
//
//   node scripts/sync-library.mjs

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MIRRORED = [{ from: "skills/ucsd-decorator", to: "library/tritonai/ucsd-decorator" }];

for (const entry of MIRRORED) {
  const source = path.join(ROOT, entry.from);
  const destination = path.join(ROOT, entry.to);
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  // Skip dotfiles: the Skills Library sync reads the git tree and never sees
  // them, so copying local .DS_Store noise into a published directory only
  // creates spurious drift.
  await cp(source, destination, { recursive: true, filter: (entry) => !path.basename(entry).startsWith(".") });
  console.log(`published ${entry.from} -> ${entry.to}`);
}

console.log("");
console.log("Run `npm run check:library` to verify the result against the sync contract.");
