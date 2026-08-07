import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Validates library/ against the contract that the TritonAI Skills Library sync
// job enforces, so a skill cannot reach the public page in a shape that makes
// the sync throw.
//
// The sync (tritonai-website/scripts/sync-skills.mjs) will:
//   - only pick up paths matching <collection>/<name>/SKILL.md, nothing deeper
//   - throw if frontmatter name or description is missing or empty
//   - throw if a community skill has no maintainer
//   - count supporting files under references/, scripts/, assets/
//
// The site validator additionally rejects duplicate names and duplicate paths.
//
//   node scripts/check-library.mjs

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIBRARY_DIR = path.join(ROOT, "library");
const COLLECTIONS = new Set(["tritonai", "community"]);
const RESOURCE_DIRS = new Set(["references", "scripts", "assets"]);

// Claude Code surfaces the description when deciding whether to load a skill.
// Long ones get truncated in listings; the sync itself sets no limit.
const DESCRIPTION_LIMIT = 1024;

const problems = [];
const skills = [];

function fail(where, issue) {
  problems.push(`${where}: ${issue}`);
}

function parseFrontmatter(source, where) {
  const match = /^---\n([\s\S]*?)\n---/.exec(source);
  if (!match) {
    fail(where, "has no YAML frontmatter block");
    return null;
  }
  const data = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    data[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return data;
}

async function walk(directory, base) {
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(absolute, base)));
    else out.push(path.relative(base, absolute).split(path.sep).join("/"));
  }
  return out;
}

if (!(await stat(LIBRARY_DIR).then(() => true).catch(() => false))) {
  console.error("No library/ directory to check.");
  process.exit(1);
}

for (const collection of (await readdir(LIBRARY_DIR, { withFileTypes: true })).filter((entry) => entry.isDirectory())) {
  if (!COLLECTIONS.has(collection.name)) {
    fail(`library/${collection.name}`, `unknown collection; the sync only reads ${[...COLLECTIONS].join(" and ")}`);
    continue;
  }
  const collectionDir = path.join(LIBRARY_DIR, collection.name);
  for (const entry of (await readdir(collectionDir, { withFileTypes: true })).filter((item) => item.isDirectory())) {
    const skillDir = path.join(collectionDir, entry.name);
    const where = `library/${collection.name}/${entry.name}`;
    const skillFile = path.join(skillDir, "SKILL.md");

    if (!(await stat(skillFile).then(() => true).catch(() => false))) {
      fail(where, "has no SKILL.md, so the sync will not see it at all");
      continue;
    }

    const data = parseFrontmatter(await readFile(skillFile, "utf8"), `${where}/SKILL.md`);
    if (!data) continue;

    const name = (data.name || "").trim();
    const description = (data.description || "").trim();
    if (!name) fail(`${where}/SKILL.md`, "frontmatter name is missing or empty; the sync throws on this");
    if (!description) fail(`${where}/SKILL.md`, "frontmatter description is missing or empty; the sync throws on this");
    if (name && name !== entry.name) fail(`${where}/SKILL.md`, `frontmatter name "${name}" does not match its directory name`);
    if (name && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) fail(`${where}/SKILL.md`, `name "${name}" is not lowercase-hyphenated`);
    if (description.length > DESCRIPTION_LIMIT) {
      fail(`${where}/SKILL.md`, `description is ${description.length} chars, over the ${DESCRIPTION_LIMIT} limit`);
    }
    if (collection.name === "community" && !(data.maintainer || "").trim()) {
      fail(`${where}/SKILL.md`, "community skills must declare a maintainer; the sync throws on this");
    }

    // Nested SKILL.md files are invisible to the sync — flag them rather than
    // let someone believe a sub-skill was published.
    const files = await walk(skillDir, skillDir);
    for (const file of files) {
      if (file !== "SKILL.md" && file.endsWith("SKILL.md")) {
        fail(where, `${file} is nested and will never be synced; only <collection>/<name>/SKILL.md is read`);
      }
    }

    const resources = { references: 0, scripts: 0, assets: 0, other: 0 };
    for (const file of files) {
      if (file === "SKILL.md") continue;
      const top = file.split("/")[0];
      if (RESOURCE_DIRS.has(top) && file.includes("/")) resources[top] += 1;
      else resources.other += 1;
    }

    skills.push({ collection: collection.name, name: name || entry.name, description, resources, files: files.length });
  }
}

const byName = new Map();
for (const skill of skills) {
  if (byName.has(skill.name)) fail(`library/${skill.collection}/${skill.name}`, "duplicate skill name; the site validator rejects this");
  byName.set(skill.name, skill);
}

if (!skills.length) fail("library/", "contains no skills");

for (const skill of skills.sort((a, b) => a.collection.localeCompare(b.collection) || a.name.localeCompare(b.name))) {
  const counts = Object.entries(skill.resources).filter(([, n]) => n).map(([k, n]) => `${k}:${n}`).join(" ") || "no resources";
  console.log(`  ${skill.collection.padEnd(10)} ${skill.name.padEnd(24)} ${String(skill.description.length).padStart(4)} chars  ${counts}`);
}
console.log("");

if (problems.length) {
  console.error(`${problems.length} problem${problems.length === 1 ? "" : "s"} would break the Skills Library sync:\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`${skills.length} skills satisfy the Skills Library sync contract.`);
}
