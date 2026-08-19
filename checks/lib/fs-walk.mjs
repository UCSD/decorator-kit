// A small recursive file walker shared by route discovery (tiers 1-3) and
// style/script discovery (tier 4). Both need the same exclusions — a project's
// pinned vendor copies and the pristine template directory are never
// site-authored, so walking into them would check code this kit itself ships
// against its own contracts.

import { readdir } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_EXCLUDE_DIRS = new Set(["node_modules", "vendor", "core-template"]);

/**
 * Every file under `cwd` whose name satisfies `matches`, skipping dotfiles,
 * dotdirs, and `exclude`-listed directory names at any depth.
 */
export async function walkFiles(cwd, { matches, exclude = DEFAULT_EXCLUDE_DIRS } = {}) {
  const found = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        if (exclude.has(entry.name)) continue;
        await walk(path.join(dir, entry.name));
      } else if (entry.isFile() && matches(entry.name)) {
        found.push(path.join(dir, entry.name));
      }
    }
  }
  await walk(cwd);
  return found.sort();
}
