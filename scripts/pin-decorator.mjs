import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

// Bootstraps a pinned copy of the pristine UC San Diego Decorator 5 into
// vendor/decorator-5/ of whatever project you run it in, so agents have a
// source of truth that is a file on disk rather than a rendered page they have
// to scrape.
//
//   node pin-decorator.mjs            download, extract, write the lockfile
//   node pin-decorator.mjs --check    report whether upstream moved; exit 1 on drift
//   node pin-decorator.mjs --out DIR  write somewhere other than vendor/decorator-5
//
// No dependencies — this is meant to run in a project that has not installed
// anything yet. Requires `tar` on PATH.
//
// ── Why npm, and only npm ─────────────────────────────────────────────────
//
// `ucsd-decorator-v5` on the npm registry is the source of truth. It is the only
// channel carrying a version number, and the only one whose contents track what
// cdn.ucsd.edu actually serves.
//
// The Decorator-V5.zip on developer.ucsd.edu is not a fallback and is not read
// here. Measured 2026-08 against `ucsd-decorator-v5@5.0.4`, the archive — itself
// re-cut 2026-07-22 — is behind on every file it ships:
//
//   * `scripts/base.min.js` is an 8,024-byte build stamped 2023-01-26 with no
//     `toggleIdsAndClassesBasedOnScreenWidth`, no `.msearch`, no
//     `search-term-m`. The CDN serves 9,871 bytes containing all three. An agent
//     reading the ZIP's copy concludes the drawer-search breakpoint behavior
//     does not exist.
//   * Every template and kitchen-sink page differs: the npm build has dropped
//     the IE9 conditional blocks the ZIP still carries, and is reindented.
//
// What the ZIP does not cost us is the chrome contract. Every marker
// `contracts/ucsd-decorator-5.json` pins — `.search-content`, `.search-scope`,
// `button.navbar-toggle`, `.mobile-nav-bars`, three `span.icon-bar`,
// `.mobile-nav-icon`, the offcanvas drawer, `.layout-title` — appears the same
// number of times in both templates. The rules were derived from the ZIP and
// hold unchanged against the package.
//
// Neither channel publishes a version manifest: the CDN has no version.json and
// the ZIP carries no version marker. The lockfile records the package version
// and dist integrity as the version identity. If a CDN manifest is published
// later, prefer it. See skills/ucsd-decorator/references/distribution.md.
//
// The registry logic is ported from tritonai-website's scripts/sync-decorator.mjs,
// which has been running it in CI since the package appeared.

const execFileAsync = promisify(execFile);

const PACKAGE_NAME = "ucsd-decorator-v5";
const REGISTRY = "https://registry.npmjs.org";

// 5.0.3 onward ships dist/ — the built output, with gulp-useref directives
// resolved. Earlier releases shipped app/, the pre-build source.
const PACKAGE_ROOT = "package/dist";

// Markup, the readable stylesheet, and the one script that governs chrome
// behavior. Fonts, images, bundled vendor libraries and the FullCalendar and
// Modernizr demo trees stay behind: they are served from cdn.ucsd.edu and would
// add ~17 MB for no reviewable benefit. The demo trees are worse than useless
// here — they are third-party HTML sitting in a directory agents are told to
// read Decorator markup from, and a search for a component can match one.
const VENDORED_TREES = [
  { from: "templates", to: "templates", match: /\.html$/ },
  { from: "kitchen-sink", to: "kitchen-sink", match: /\.html$/ },
  { from: "widgets", to: "widgets", match: /\.html$/ },
  { from: "css", to: "styles", match: /^base\.css$/ },
  { from: "scripts", to: "scripts", match: /^base\.min\.js$/ },
];

const REQUIRED_FILES = ["templates/two-column.html", "scripts/base.min.js"];

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const VENDOR_DIR = path.resolve(option("out", "vendor/decorator-5"));
const LOCKFILE = path.join(VENDOR_DIR, "decorator.lock.json");

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const exists = (target) => stat(target).then(() => true).catch(() => false);

async function readLockfile() {
  try {
    return JSON.parse(await readFile(LOCKFILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`${path.relative(process.cwd(), LOCKFILE)} is not valid JSON: ${error.message}`);
  }
}

async function fetchMetadata() {
  const response = await fetch(`${REGISTRY}/${PACKAGE_NAME}/latest`, {
    headers: { "User-Agent": "ucsd-decorator-kit-pin", Accept: "application/json" },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`npm registry responded ${response.status} for ${PACKAGE_NAME}`);
  const manifest = await response.json();
  if (!manifest.version || !manifest.dist?.tarball) {
    throw new Error(`${PACKAGE_NAME} metadata is missing a version or tarball URL.`);
  }
  return manifest;
}

async function check() {
  const previous = await readLockfile();
  if (!previous) {
    console.error(`No lockfile at ${path.relative(process.cwd(), LOCKFILE)}. Run this script without --check first.`);
    process.exitCode = 1;
    return;
  }
  const manifest = await fetchMetadata();
  if (manifest.version === previous.version && manifest.dist.integrity === previous.upstream?.integrity) {
    console.log(`${PACKAGE_NAME} is current (${manifest.version}).`);
    return;
  }
  console.error(`${PACKAGE_NAME} changed upstream.`);
  console.error(`  pinned:  ${previous.version ?? "(none)"}  ${previous.upstream?.integrity ?? ""}`);
  console.error(`  current: ${manifest.version}  ${manifest.dist.integrity ?? ""}`);
  console.error("Re-run without --check, then review the diff.");
  process.exitCode = 1;
}

async function pin() {
  const previous = await readLockfile();
  const manifest = await fetchMetadata();

  if (previous?.version === manifest.version && previous?.upstream?.integrity === manifest.dist.integrity) {
    console.log(`${PACKAGE_NAME}@${manifest.version} is already pinned. Nothing to do.`);
    return;
  }

  const response = await fetch(manifest.dist.tarball, {
    headers: { "User-Agent": "ucsd-decorator-kit-pin" },
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error(`npm tarball responded ${response.status} for ${manifest.dist.tarball}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  try {
    await execFileAsync("tar", ["--version"]);
  } catch {
    throw new Error("`tar` is required to extract the Decorator package but was not found on PATH.");
  }

  const workdir = await mkdtemp(path.join(tmpdir(), "decorator-"));
  try {
    const tarball = path.join(workdir, "package.tgz");
    await writeFile(tarball, buffer);
    const extracted = path.join(workdir, "extracted");
    await mkdir(extracted, { recursive: true });
    await execFileAsync("tar", ["-xzf", tarball, "-C", extracted], { maxBuffer: 128 * 1024 * 1024 });
    const root = path.join(extracted, PACKAGE_ROOT);

    const files = [];
    for (const tree of VENDORED_TREES) {
      const source = path.join(root, tree.from);
      if (!(await exists(source))) throw new Error(`${PACKAGE_NAME} is missing the dist/${tree.from}/ directory.`);
      for (const name of (await readdir(source)).filter((entry) => tree.match.test(entry)).sort()) {
        files.push({ relative: path.posix.join(tree.to, name), absolute: path.join(source, name) });
      }
    }
    if (await exists(path.join(root, "index.html"))) {
      files.push({ relative: "index.html", absolute: path.join(root, "index.html") });
    }
    for (const required of REQUIRED_FILES) {
      if (!files.some((file) => file.relative === required)) {
        throw new Error(`${PACKAGE_NAME}@${manifest.version} is missing ${required}; refusing to write a partial vendor tree.`);
      }
    }

    await rm(VENDOR_DIR, { recursive: true, force: true });
    const assets = [];
    for (const file of files) {
      const destination = path.join(VENDOR_DIR, file.relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(file.absolute, destination);
      const contents = await readFile(destination);
      assets.push({ path: file.relative, bytes: contents.length, sha256: sha256(contents) });
    }

    await writeFile(
      LOCKFILE,
      `${JSON.stringify(
        {
          schemaVersion: 2,
          fetchedAt: new Date().toISOString(),
          version: manifest.version,
          upstream: {
            source: "npm",
            package: PACKAGE_NAME,
            url: manifest.dist.tarball,
            integrity: manifest.dist.integrity ?? null,
            shasum: manifest.dist.shasum ?? null,
            bytes: buffer.length,
            sha256: sha256(buffer),
          },
          referenceTemplate: REQUIRED_FILES[0],
          assets,
        },
        null,
        2,
      )}\n`,
    );

    const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
    console.log(
      `Pinned ${assets.length} Decorator files (${(total / 1024 / 1024).toFixed(1)} MB) from ${PACKAGE_NAME}@${manifest.version} into ${path.relative(process.cwd(), VENDOR_DIR)}.`,
    );
    console.log("");
    console.log("These files are for reference and contract derivation only. Keep serving");
    console.log("Decorator CSS and JS from cdn.ucsd.edu; do not point pages at this copy.");
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

await (flag("check") ? check() : pin());
