import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { decoratorPage } from "./fixtures/decorator-page.mjs";
import { discoverRoutes, loadConfig, loadRoutePages } from "../checks/lib/chrome-contract.mjs";
import {
  deriveProtectedTokens,
  discoverStyleFiles,
  loadStylingConfig,
  runStyling,
  scanCssFile,
  scanJsFile,
} from "../checks/lib/chrome-styling.mjs";

let workdir;

before(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "chrome-styling-test-"));
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

async function loadPages(dir) {
  const config = await loadConfig(dir);
  const routes = await discoverRoutes(dir);
  const pages = await loadRoutePages(dir, config.regions, routes);
  return { config, pages };
}

describe("deriveProtectedTokens", () => {
  it("protects tokens that appear only in chrome, not the canvas root's own id", async () => {
    const dir = await project();
    await writeFile(path.join(dir, "index.html"), decoratorPage("Home"));
    await writeFile(path.join(dir, "about.html"), decoratorPage("About"));
    const { config, pages } = await loadPages(dir);
    const tokens = deriveProtectedTokens(pages, config.canvas, config.regions);
    assert.ok(tokens.has("#search"));
    assert.ok(tokens.has(".search-toggle"));
    assert.ok(tokens.has(".navbar-toggle"));
    assert.ok(!tokens.has("#main-content"));
  });

  it("a class used by both chrome and the canvas drops out of the protected set entirely", async () => {
    const dir = await project();
    const withCanvasInputGroup = (title) =>
      decoratorPage(title).replace(
        '<main id="main-content">',
        '<main id="main-content"><div class="input-group">canvas content</div>',
      );
    await writeFile(path.join(dir, "index.html"), withCanvasInputGroup("Home"));
    await writeFile(path.join(dir, "about.html"), withCanvasInputGroup("About"));
    const { config, pages } = await loadPages(dir);
    const tokens = deriveProtectedTokens(pages, config.canvas, config.regions);
    // .input-group is also used inside the chrome search forms in the fixture
    // — this is the exact documented gap (checks/README.md): a shared token
    // is not derivable as protected, on purpose, to keep the check free of
    // false positives. A bare (unscoped) rule using it will not be caught by
    // this tier; that is why the skill requires every site selector to be
    // scoped under the canvas selector instead.
    assert.ok(!tokens.has(".input-group"));
  });
});

describe("scanCssFile — shipped regression 1: site CSS rebuilding the drawer search", () => {
  it("flags each selector that hits a protected token, with the correct line", () => {
    const tokens = new Set(["#search", ".search-toggle"]);
    const css = `.unrelated { color: red; }\n.search-toggle { display: none !important; }\n#search {\n  background: navy;\n}\n`;
    const findings = scanCssFile("css/site.css", css, tokens, { exceptions: [] });
    assert.deepEqual(
      findings.map((f) => [f.selector, f.line]),
      [[".search-toggle", 2], ["#search", 3]],
    );
  });

  it("does not flag a selector that touches no protected token", () => {
    const tokens = new Set(["#search"]);
    const css = `.hero-banner { color: red; }\n.callout .btn { padding: 4px; }\n`;
    assert.equal(scanCssFile("css/site.css", css, tokens, { exceptions: [] }).length, 0);
  });

  it("@media nesting: the prelude itself is not a selector, but what's inside it still gets scanned", () => {
    const tokens = new Set([".search-toggle"]);
    const css = `@media (max-width: 767px) {\n  .search-toggle { display: none; }\n}\n`;
    const findings = scanCssFile("css/site.css", css, tokens, { exceptions: [] });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 2);
  });

  it('does not misread a[href="#search"] as targeting #search', () => {
    const tokens = new Set(["#search"]);
    const css = `a[href="#search"] { color: blue; }`;
    assert.equal(scanCssFile("css/site.css", css, tokens, { exceptions: [] }).length, 0);
  });

  it('still catches [id="search"] and [class~="search-toggle"] attribute-selector forms', () => {
    const tokens = new Set(["#search", ".search-toggle"]);
    const css = `[id="search"] { color: blue; }\n[class~="search-toggle"] { color: red; }\n`;
    const findings = scanCssFile("css/site.css", css, tokens, { exceptions: [] });
    assert.equal(findings.length, 2);
  });

  it("a valid, un-expired exception suppresses the finding; an expired one reports itself instead of going silent", () => {
    const tokens = new Set(["#search"]);
    const css = `#search { padding: 4px; }`;
    const good = [{ file: "css/site.css", selector: "#search", reason: "repairs layout around a canvas form", reviewOn: "2099-01-01" }];
    assert.equal(scanCssFile("css/site.css", css, tokens, { exceptions: good }).length, 0);

    const expired = [{ ...good[0], reviewOn: "2000-01-01" }];
    const findings = scanCssFile("css/site.css", css, tokens, { exceptions: expired });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, "chrome/styling/expired-exception");
  });

  it("a missing or malformed reviewOn is treated as expired, not permanent — fails closed", () => {
    const tokens = new Set(["#search"]);
    const css = `#search { padding: 4px; }`;
    const missing = [{ file: "css/site.css", selector: "#search", reason: "x" }];
    const missingFindings = scanCssFile("css/site.css", css, tokens, { exceptions: missing });
    assert.equal(missingFindings.length, 1);
    assert.equal(missingFindings[0].kind, "chrome/styling/expired-exception");

    const malformed = [{ file: "css/site.css", selector: "#search", reason: "x", reviewOn: "not-a-date" }];
    const malformedFindings = scanCssFile("css/site.css", css, tokens, { exceptions: malformed });
    assert.equal(malformedFindings.length, 1);
    assert.equal(malformedFindings[0].kind, "chrome/styling/expired-exception");
  });
});

describe("scanCssFile — shipped regression 2: a widget id restyled even though it is in no page's markup", () => {
  it("catches #chat-bubble via the hand-maintained widget token list alone", async () => {
    const dir = await project();
    const styling = await loadStylingConfig(dir);
    assert.ok(styling.widgetTokens.includes("#chat-bubble"));
    const css = `#chat-bubble {\n  border-radius: 50%;\n  width: 52px;\n  height: 52px;\n}\n`;
    const findings = scanCssFile("css/site.css", css, new Set(styling.widgetTokens), { exceptions: [] });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].selector, "#chat-bubble");
  });
});

describe("scanJsFile — shipped regression 3: JS deleting the id the mobile drawer search is keyed on", () => {
  it('flags removeAttribute("id") when the file references a protected token, keyed by the enclosing named function', () => {
    const tokens = new Set(["#search"]);
    const js = `
function dedupeIds() {
  var panel = document.getElementById('search');
  document.querySelectorAll('[id]').forEach(function (el, i, all) {
    for (var j = 0; j < i; j++) {
      if (all[j].id === el.id) el.removeAttribute('id');
    }
  });
}
`;
    const findings = scanJsFile("js/site.js", js, tokens, { exceptions: [] });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].function, "dedupeIds", "blame the named outer function, not the anonymous forEach callback");
  });

  it("does not scan a file that never references a protected token — canvas scripts assign ids to their own components constantly", () => {
    const tokens = new Set(["#search"]);
    const js = `function widget() { document.querySelector('.my-widget').removeAttribute('id'); }`;
    assert.equal(scanJsFile("js/site.js", js, tokens, { exceptions: [] }).length, 0);
  });

  it('also catches setAttribute("id", ...) and a bare .id = assignment, but not a === comparison', () => {
    const tokens = new Set(["#search"]);
    const setAttr = `function a() { document.getElementById('search'); el.setAttribute('id', 'x'); }`;
    assert.equal(scanJsFile("js/site.js", setAttr, tokens, { exceptions: [] }).length, 1);

    const assign = `function a() { document.getElementById('search'); el.id = 'x'; }`;
    assert.equal(scanJsFile("js/site.js", assign, tokens, { exceptions: [] }).length, 1);

    const comparison = `function a() { document.getElementById('search'); if (el.id === 'x') {} }`;
    assert.equal(scanJsFile("js/site.js", comparison, tokens, { exceptions: [] }).length, 0, "a comparison is not a mutation");
  });

  it("a valid exception suppresses by file + function:name; an expired one reports itself", () => {
    const tokens = new Set(["#search"]);
    const js = `function dedupeIds() { document.getElementById('search'); el.removeAttribute('id'); }`;
    const good = [{ file: "js/site.js", selector: "function:dedupeIds", reason: "legacy cleanup, ticketed", reviewOn: "2099-01-01" }];
    assert.equal(scanJsFile("js/site.js", js, tokens, { exceptions: good }).length, 0);

    const expired = [{ ...good[0], reviewOn: "2000-01-01" }];
    const findings = scanJsFile("js/site.js", js, tokens, { exceptions: expired });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, "chrome/styling/expired-exception");
  });
});

describe("loadStylingConfig: exception validation", () => {
  it("rejects an allow entry missing approvedBy — the human who reviewed it", async () => {
    const dir = await project();
    await writeFile(
      path.join(dir, "chrome-styling.local.json"),
      JSON.stringify({
        schemaVersion: 1,
        allow: [{ file: "css/site.css", selector: "#search", reason: "repairs layout", reviewOn: "2099-01-01" }],
      }),
    );
    await assert.rejects(loadStylingConfig(dir), /approvedBy/);
  });

  it("rejects an allow entry with a malformed reviewOn", async () => {
    const dir = await project();
    await writeFile(
      path.join(dir, "chrome-styling.local.json"),
      JSON.stringify({
        schemaVersion: 1,
        allow: [
          {
            file: "css/site.css",
            selector: "#search",
            reason: "repairs layout",
            reviewOn: "not-a-date",
            approvedBy: "jsmith",
          },
        ],
      }),
    );
    await assert.rejects(loadStylingConfig(dir), /reviewOn/);
  });

  it("accepts a complete, valid exception", async () => {
    const dir = await project();
    await writeFile(
      path.join(dir, "chrome-styling.local.json"),
      JSON.stringify({
        schemaVersion: 1,
        allow: [
          {
            file: "css/site.css",
            selector: "#search",
            reason: "repairs layout around a canvas form",
            reviewOn: "2099-01-01",
            approvedBy: "jsmith",
          },
        ],
      }),
    );
    const config = await loadStylingConfig(dir);
    assert.equal(config.allow.length, 1);
    assert.equal(config.allow[0].approvedBy, "jsmith");
  });
});

describe("discoverStyleFiles", () => {
  it("excludes *.min.css and node_modules/vendor/core-template", async () => {
    const dir = await project();
    await mkdir(path.join(dir, "css"), { recursive: true });
    await writeFile(path.join(dir, "css/site.css"), "");
    await writeFile(path.join(dir, "css/bootstrap.min.css"), "");
    await mkdir(path.join(dir, "vendor/decorator-5"), { recursive: true });
    await writeFile(path.join(dir, "vendor/decorator-5/base.css"), "");
    const files = await discoverStyleFiles(dir);
    assert.deepEqual(files.map((f) => path.basename(f)), ["site.css"]);
  });
});

describe("runStyling end-to-end: all three shipped regressions together", () => {
  it("finds the CSS rebuild, the widget restyle, and the JS id deletion in one pass", async () => {
    const dir = await project();
    await writeFile(path.join(dir, "index.html"), decoratorPage("Home"));
    await writeFile(path.join(dir, "about.html"), decoratorPage("About"));
    await mkdir(path.join(dir, "css"), { recursive: true });
    await mkdir(path.join(dir, "js"), { recursive: true });
    await writeFile(
      path.join(dir, "css/site.css"),
      `.search-toggle { display: none !important; }\n#search { background: navy; }\n#chat-bubble { border-radius: 50%; }\n`,
    );
    await writeFile(
      path.join(dir, "js/site.js"),
      `function dedupeIds() {\n  document.getElementById('search');\n  el.removeAttribute('id');\n}\n`,
    );

    const { config, pages } = await loadPages(dir);
    const { findings } = await runStyling(dir, { pages, canvasSelector: config.canvas, regions: config.regions });

    const stylesheet = findings.filter((f) => f.kind === "chrome/styling/stylesheet");
    const script = findings.filter((f) => f.kind === "chrome/styling/script");
    assert.ok(stylesheet.some((f) => f.selector === ".search-toggle"));
    assert.ok(stylesheet.some((f) => f.selector === "#search"));
    assert.ok(stylesheet.some((f) => f.selector === "#chat-bubble"), "the widget id, present in no page's markup");
    assert.ok(script.some((f) => f.function === "dedupeIds"));
  });
});
