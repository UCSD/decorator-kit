import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { decoratorPage } from "./fixtures/decorator-page.mjs";
import {
  canonicalize,
  diffCanonical,
  discoverRoutes,
  hashCanonical,
  loadConfig,
  readGolden,
  runStructural,
  writeGolden,
} from "../checks/lib/chrome-contract.mjs";
import { parseHTML } from "../checks/lib/html.mjs";
import { querySelector } from "../checks/lib/selector.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "checks/chrome-contract.mjs");

let workdir;

before(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "chrome-contract-test-"));
});

after(async () => {
  await rm(workdir, { recursive: true, force: true });
});

let counter = 0;
async function project() {
  const dir = path.join(workdir, `proj-${counter++}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writePages(dir, opts = {}) {
  await writeFile(path.join(dir, "index.html"), decoratorPage("Home", opts));
  await writeFile(path.join(dir, "about.html"), decoratorPage("About", opts));
}

async function runCli(args, cwd) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

describe("canonicalize", () => {
  it("strips volatile classes and drops the attribute if it becomes empty", () => {
    const doc = parseHTML(`<li class="active"><a>x</a></li>`);
    const canon = canonicalize(querySelector(doc, "li"));
    assert.deepEqual(canon.attrs, []);
  });

  it("normalizes class token order so a reordered class list hashes the same", () => {
    const a = canonicalize(querySelector(parseHTML(`<div class="b a c"></div>`), "div"));
    const b = canonicalize(querySelector(parseHTML(`<div class="a c b"></div>`), "div"));
    assert.equal(hashCanonical(a), hashCanonical(b));
  });

  it("drops aria-current and empty style, keeps non-empty style", () => {
    const doc = parseHTML(`<a aria-current="page" style="  " href="/a">A</a><a style="color:red" href="/b">B</a>`);
    const canonA = canonicalize(doc.children[0]);
    const canonB = canonicalize(doc.children[1]);
    assert.ok(!canonA.attrs.some(([k]) => k === "aria-current"));
    assert.ok(!canonA.attrs.some(([k]) => k === "style"));
    assert.ok(canonB.attrs.some(([k, v]) => k === "style" && v === "color:red"));
  });

  it("drops comments and collapses/trims whitespace-only text", () => {
    const doc = parseHTML(`<p>  <!-- note -->  hello   world  </p>`);
    const canon = canonicalize(querySelector(doc, "p"));
    assert.deepEqual(canon.children, [{ text: "hello world" }]);
  });

  it("attribute order does not affect the hash", () => {
    const a = canonicalize(querySelector(parseHTML(`<a href="/x" id="q" class="c"></a>`), "a"));
    const b = canonicalize(querySelector(parseHTML(`<a class="c" id="q" href="/x"></a>`), "a"));
    assert.equal(hashCanonical(a), hashCanonical(b));
  });

  it("normalizes a URL attribute past a configured deployment base path", () => {
    const doc = parseHTML(`<a href="/my-repo/about.html">About</a>`);
    const canon = canonicalize(querySelector(doc, "a"), { basePath: "/my-repo" });
    assert.deepEqual(canon.attrs, [["href", "/about.html"]]);
  });

  it("ignoreChildrenOf empties a matching descendant's children, not the descendant itself", () => {
    const doc = parseHTML(`<div class="drawer"><ul class="navmenu-nav"><li>Home</li><li>About</li></ul></div>`);
    const canon = canonicalize(querySelector(doc, ".drawer"), { ignoreChildrenOf: ["ul.navmenu-nav"] });
    const ul = canon.children.find((c) => c.tag === "ul");
    assert.equal(ul.children.length, 0);
  });
});

describe("diffCanonical", () => {
  it("names the node and the attribute that changed", () => {
    const a = canonicalize(querySelector(parseHTML(`<form action="/search" method="get"></form>`), "form"));
    const b = canonicalize(querySelector(parseHTML(`<form action="/find" method="get"></form>`), "form"));
    assert.match(diffCanonical(a, b), /attribute "action" changed from "\/search" to "\/find"/);
  });

  it("reports a child count change when a form is replaced by a link", () => {
    const a = canonicalize(querySelector(parseHTML(`<div><form></form></div>`), "div"));
    const b = canonicalize(querySelector(parseHTML(`<div><a href="/x"></a></div>`), "div"));
    assert.match(diffCanonical(a, b), /tag changed from <form> to <a>/);
  });
});

describe("loadConfig", () => {
  it("defaults canvas to main#main-content without decorator-kit.json", async () => {
    const dir = await project();
    const config = await loadConfig(dir);
    assert.equal(config.canvas, "main#main-content");
    assert.equal(config.manifestFound, false);
    assert.equal(config.regions.length, 6);
  });

  it("reads canvas from decorator-kit.json", async () => {
    const dir = await project();
    await writeFile(path.join(dir, "decorator-kit.json"), JSON.stringify({ canvas: "div#ag-app-canvas" }));
    const config = await loadConfig(dir);
    assert.equal(config.canvas, "div#ag-app-canvas");
    assert.equal(config.manifestFound, true);
  });

  it("merges a chrome-regions.local.json overlay by id, adding and overriding", async () => {
    const dir = await project();
    await writeFile(
      path.join(dir, "chrome-regions.local.json"),
      JSON.stringify({ regions: [{ id: "footer", selector: "footer.custom" }, { id: "extra", selector: ".extra" }] }),
    );
    const config = await loadConfig(dir);
    assert.equal(config.regions.length, 7, "6 defaults with one overridden, plus one new");
    assert.equal(config.regions.find((r) => r.id === "footer").selector, "footer.custom");
    assert.ok(config.regions.find((r) => r.id === "extra"));
  });

  it("throws a clear error on a malformed overlay rather than silently ignoring it", async () => {
    const dir = await project();
    await writeFile(path.join(dir, "chrome-selectors.local.json"), "{ not json");
    await assert.rejects(loadConfig(dir), /not valid JSON/);
  });
});

describe("discoverRoutes", () => {
  it("finds *.html and excludes node_modules/vendor/core-template", async () => {
    const dir = await project();
    await writePages(dir);
    await mkdir(path.join(dir, "node_modules/pkg"), { recursive: true });
    await writeFile(path.join(dir, "node_modules/pkg/ignored.html"), "<html></html>");
    await mkdir(path.join(dir, "vendor/decorator-5"), { recursive: true });
    await writeFile(path.join(dir, "vendor/decorator-5/ignored.html"), "<html></html>");
    const routes = await discoverRoutes(dir);
    assert.deepEqual(routes.map((r) => path.basename(r)).sort(), ["about.html", "index.html"]);
  });
});

describe("tiers 1-3: clean fixture, isolated edit, and the replayed incident", () => {
  it("a clean, consistent fixture has zero tier 1/3 findings; tier 2 requires an explicit accept first", async () => {
    const dir = await project();
    await writePages(dir);
    const { findings, pages, config } = await runStructural(dir);
    const nonGolden = findings.filter((f) => f.kind !== "chrome/golden");
    assert.equal(nonGolden.length, 0);
    assert.equal(findings.length, config.regions.length, "one 'no golden yet' finding per region");

    await writeGolden(dir, pages, config.regions);
    const after = await runStructural(dir);
    assert.equal(after.findings.length, 0, "fully clean once the golden is recorded");
    assert.ok(await readGolden(dir));
  });

  it("an isolated edit on one page is caught by tier 1 (that route) and tier 3 (that route only)", async () => {
    const dir = await project();
    await writePages(dir);
    const clean = await runStructural(dir);
    await writeGolden(dir, clean.pages, clean.config.regions);

    await writeFile(path.join(dir, "about.html"), decoratorPage("About", { searchAsLink: true }));
    const { findings } = await runStructural(dir);

    const consistency = findings.filter((f) => f.kind === "chrome/consistent");
    const structure = findings.filter((f) => f.kind === "chrome/structure");
    assert.ok(consistency.length > 0, "tier 1 must notice the routes disagree");
    assert.ok(structure.every((f) => f.route === "about.html"), "tier 3 must not flag the untouched route");
    assert.ok(structure.some((f) => f.route === "about.html"));
  });

  // The scenario canvas-contract.md exists to explain: a generated site has
  // one shell feeding every route, so an agent's edit to it lands on every
  // page identically. Tier 1 (cross-page consistency) is blind to this by
  // construction — every route is still perfectly consistent with every
  // other. Tier 3 is what catches it, because it checks what the chrome is
  // *for*, not just whether pages agree with each other.
  it("the replayed incident: the same regression on every route leaves tier 1 green, tier 3 catches it everywhere", async () => {
    const dir = await project();
    await writePages(dir);
    const clean = await runStructural(dir);
    await writeGolden(dir, clean.pages, clean.config.regions);

    await writePages(dir, { searchAsLink: true }); // every route, identically

    const { findings } = await runStructural(dir);
    const consistency = findings.filter((f) => f.kind === "chrome/consistent");
    const structure = findings.filter((f) => f.kind === "chrome/structure");
    const golden = findings.filter((f) => f.kind === "chrome/golden");

    assert.equal(consistency.length, 0, "tier 1 stays green — every route changed identically");
    assert.ok(structure.some((f) => f.route === "index.html"));
    assert.ok(structure.some((f) => f.route === "about.html"));
    assert.ok(structure.some((f) => f.id === "mobile-drawer.search-form"));
    assert.ok(structure.some((f) => f.id === "navbar.search-form"));
    assert.ok(golden.length > 0, "the recorded baseline no longer matches either");
  });
});

describe("chrome-contract.mjs CLI: the --accept interlock", () => {
  it("--check fails before any golden is recorded, --accept then succeeds, --check passes after", async () => {
    const dir = await project();
    await writePages(dir);

    const before = await runCli(["--check"], dir);
    assert.equal(before.code, 1);
    assert.match(before.stderr, /chrome\/golden/);

    const accepted = await runCli(["--accept", "--reason", "initial baseline", "--yes"], dir);
    assert.equal(accepted.code, 0);
    assert.ok(await readGolden(dir));

    const after = await runCli(["--check"], dir);
    assert.equal(after.code, 0);
    assert.match(after.stdout, /all four tiers pass/);
  });

  it("--accept refuses while tier 3 fails, and does not touch the already-recorded golden", async () => {
    const dir = await project();
    await writePages(dir);
    await runCli(["--accept", "--reason", "initial baseline", "--yes"], dir);
    const goldenBefore = await readFile(path.join(dir, "chrome-contract.local.json"), "utf8");

    await writePages(dir, { searchAsLink: true }); // the replayed incident, on disk this time

    const refused = await runCli(["--accept", "--reason", "trying to launder it", "--yes"], dir);
    assert.equal(refused.code, 1);
    assert.match(refused.stderr, /--accept refuses/);
    assert.match(refused.stderr, /cannot be cleared by --accept/);

    const goldenAfter = await readFile(path.join(dir, "chrome-contract.local.json"), "utf8");
    assert.equal(goldenAfter, goldenBefore, "a refused accept must not rewrite the golden — that would launder the regression");
  });

  it("--accept refuses immediately with no --reason, before running any tier or writing anything", async () => {
    const dir = await project();
    await writePages(dir);
    const result = await runCli(["--accept"], dir);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /--reason/);
    assert.equal(await readGolden(dir), null);
  });

  it("--accept refuses non-interactively without --yes, even with a --reason", async () => {
    const dir = await project();
    await writePages(dir);
    const result = await runCli(["--accept", "--reason", "test"], dir);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /non-interactive|--yes/);
    assert.equal(await readGolden(dir), null);
  });

  it("--accept with --reason and --yes succeeds non-interactively and records provenance", async () => {
    const dir = await project();
    await writePages(dir);
    const result = await runCli(["--accept", "--reason", "human reviewed diff in PR #42", "--yes"], dir);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /human reviewed diff in PR #42/);
    const golden = await readGolden(dir);
    assert.equal(golden.acceptedReason, "human reviewed diff in PR #42");
    assert.ok(golden.acceptedAt);
  });

  it("--explain prints the resolved canvas and regions without needing a built project", async () => {
    const dir = await project();
    const result = await runCli(["--explain"], dir);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /canvas: main#main-content/);
    assert.match(result.stdout, /mobile-drawer/);
  });
});

describe("tier 3: closing the count-only and zero-coverage region gaps", () => {
  it("site-title.branding now catches a logo href swap, not just a count change", async () => {
    const dir = await project();
    await writePages(dir, { logoHref: "https://example.com/mascot" });
    const { findings } = await runStructural(dir);
    const structure = findings.filter((f) => f.kind === "chrome/structure" && f.id === "site-title.branding");
    assert.ok(structure.length > 0, "a swapped logo href must trip tier 3, not just tier 2");
  });

  it("footer.branding catches the footer-links list or the wordmark image going missing", async () => {
    const dir = await project();
    await writePages(dir, { footerBroken: true });
    const { findings } = await runStructural(dir);
    const structure = findings.filter((f) => f.kind === "chrome/structure" && f.id === "footer.branding");
    assert.ok(structure.length > 0, "a stripped footer must trip tier 3");
  });
});
