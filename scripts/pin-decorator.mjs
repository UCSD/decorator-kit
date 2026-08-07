import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

// Bootstraps a pinned copy of the pristine UC San Diego Decorator 5 templates
// into vendor/decorator-5/ of whatever project you run it in, so agents have a
// source of truth that is a file on disk rather than a rendered page they have
// to scrape.
//
//   node pin-decorator.mjs            download, extract, write the lockfile
//   node pin-decorator.mjs --check    report whether upstream moved; exit 1 on drift
//   node pin-decorator.mjs --out DIR  write somewhere other than vendor/decorator-5
//
// No dependencies — this is meant to run in a project that has not installed
// anything yet. Requires `unzip` on PATH.
//
// UCSD publishes no version manifest for Decorator 5: the CDN has no
// version.json and the archive carries no version marker. The lockfile records
// the upstream ETag, Last-Modified, and archive sha256 as the version identity.
// If a manifest is published later, prefer it. See
// skills/ucsd-decorator/references/distribution.md.

const execFileAsync = promisify(execFile);

const ARCHIVE_URL = "https://developer.ucsd.edu/_files/decorator-downloads/v5/Decorator-V5.zip";

// Markup and the readable stylesheet only. Fonts, images, minified scripts, and
// bundled vendor libraries are served from cdn.ucsd.edu and would add ~14 MB of
// binaries for no reviewable benefit.
const VENDORED_TREES = [
  { from: "templates", to: "templates", match: /\.html$/ },
  { from: "kitchen-sink", to: "kitchen-sink", match: /\.html$/ },
  { from: "widgets", to: "widgets", match: /\.html$/ },
  { from: "css", to: "styles", match: /^base\.css$/ },
];

const REQUIRED_FILE = "templates/two-column.html";

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

async function readLockfile() {
  try {
    return JSON.parse(await readFile(LOCKFILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`${path.relative(process.cwd(), LOCKFILE)} is not valid JSON: ${error.message}`);
  }
}

async function check() {
  const previous = await readLockfile();
  if (!previous) {
    console.error(`No lockfile at ${path.relative(process.cwd(), LOCKFILE)}. Run this script without --check first.`);
    process.exitCode = 1;
    return;
  }
  const response = await fetch(ARCHIVE_URL, {
    method: "HEAD",
    headers: { "User-Agent": "ucsd-decorator-kit-pin" },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Decorator archive responded ${response.status}`);
  const etag = response.headers.get("etag");
  if (etag && etag === previous.upstream?.etag) {
    console.log(`Decorator archive is current (ETag ${etag}).`);
    return;
  }
  console.error("The UC San Diego Decorator archive changed upstream.");
  console.error(`  pinned:  ${previous.upstream?.etag ?? "(none)"}  ${previous.upstream?.lastModified ?? ""}`);
  console.error(`  current: ${etag ?? "(none)"}  ${response.headers.get("last-modified") ?? ""}`);
  console.error("Re-run without --check, then review the diff.");
  process.exitCode = 1;
}

async function pin() {
  const previous = await readLockfile();
  const headers = { "User-Agent": "ucsd-decorator-kit-pin" };
  if (previous?.upstream?.etag) headers["If-None-Match"] = previous.upstream.etag;

  const response = await fetch(ARCHIVE_URL, { headers, signal: AbortSignal.timeout(180000) });
  if (response.status === 304) {
    console.log("Decorator archive is unchanged upstream (HTTP 304). Nothing to do.");
    return;
  }
  if (!response.ok) throw new Error(`Decorator archive responded ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const digest = sha256(buffer);
  if (previous?.upstream?.sha256 === digest) {
    console.log("Decorator archive is byte-identical to the pinned copy. Nothing to do.");
    return;
  }

  try {
    await execFileAsync("unzip", ["-v"]);
  } catch {
    throw new Error("`unzip` is required to extract the Decorator archive but was not found on PATH.");
  }

  const workdir = await mkdtemp(path.join(tmpdir(), "decorator-"));
  try {
    const archive = path.join(workdir, "Decorator-V5.zip");
    await writeFile(archive, buffer);
    const root = path.join(workdir, "extracted");
    await execFileAsync("unzip", ["-qo", archive, "-d", root], { maxBuffer: 64 * 1024 * 1024 });

    const files = [];
    for (const tree of VENDORED_TREES) {
      const source = path.join(root, tree.from);
      if (!(await stat(source).then(() => true).catch(() => false))) {
        throw new Error(`Decorator archive is missing the ${tree.from}/ directory.`);
      }
      for (const name of (await readdir(source)).filter((entry) => tree.match.test(entry)).sort()) {
        files.push({ relative: path.posix.join(tree.to, name), absolute: path.join(source, name) });
      }
    }
    if (await stat(path.join(root, "index.html")).then(() => true).catch(() => false)) {
      files.push({ relative: "index.html", absolute: path.join(root, "index.html") });
    }
    if (!files.some((file) => file.relative === REQUIRED_FILE)) {
      throw new Error(`Decorator archive is missing ${REQUIRED_FILE}; refusing to write a partial vendor tree.`);
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
          schemaVersion: 1,
          fetchedAt: new Date().toISOString(),
          version: null,
          upstream: {
            url: ARCHIVE_URL,
            etag: response.headers.get("etag"),
            lastModified: response.headers.get("last-modified"),
            bytes: buffer.length,
            sha256: digest,
          },
          referenceTemplate: REQUIRED_FILE,
          assets,
        },
        null,
        2,
      )}\n`,
    );

    const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
    console.log(`Pinned ${assets.length} Decorator files (${(total / 1024 / 1024).toFixed(1)} MB) into ${path.relative(process.cwd(), VENDOR_DIR)}.`);
    console.log(`Upstream Last-Modified: ${response.headers.get("last-modified") ?? "(none)"}  sha256: ${digest.slice(0, 16)}…`);
    console.log("");
    console.log("These files are for reference and contract derivation only. Keep serving");
    console.log("Decorator CSS and JS from cdn.ucsd.edu; do not point pages at this copy.");
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

await (flag("check") ? check() : pin());
