import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { decoratorPage } from "./fixtures/decorator-page.mjs";
import { discoverRoutes, loadConfig, loadRoutePages } from "../checks/lib/chrome-contract.mjs";
import {
  deriveProtectedTokens,
  discoverComponentStyleFiles,
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

describe("scanCssFile — shipped regression 4: canvas-scoped CSS repainting the page ground", () => {
  const pageGround = (findings) => findings.filter((f) => f.kind === "chrome/styling/page-ground");

  it("flags the full-bleed box-shadow + clip-path that turned the whole band gray, and nothing else in the rule", () => {
    const css = [
      ".student-canvas.sx-light {",
      "  --sx-paper: #f2f4f7;",
      "  background: var(--sx-paper);",
      "  box-shadow: 0 0 0 100vmax var(--sx-paper);",
      "  clip-path: inset(0 -100vmax);",
      "}",
      "",
    ].join("\n");
    const findings = pageGround(scanCssFile("app/globals.css", css, new Set(), { exceptions: [] }));
    assert.deepEqual(
      findings.map((f) => [f.selector, f.line, f.detail.split(":")[0]]),
      [
        [".student-canvas.sx-light", 4, "box-shadow"],
        [".student-canvas.sx-light", 5, "clip-path"],
      ],
      "the background on a canvas component is the canvas's business; the bleed is not",
    );
    assert.ok(findings[0].remedy.includes(".jumbotron-sand"));
  });

  it("catches the same rule minified onto one line, with !important", () => {
    const css = `.a{color:red}.student-canvas.sx-light{background:#f2f4f7;box-shadow:0 0 0 100vmax #f2f4f7!important;clip-path:inset(0 -100vmax)}`;
    assert.equal(pageGround(scanCssFile("app/globals.css", css, new Set(), { exceptions: [] })).length, 2);
  });

  it("flags the other full-bleed shapes: 100vw width, 50vw breakout margin, a 9999px shadow", () => {
    const css = `.bleed-a { width: 100vw; }\n.bleed-b { margin: 0 calc(50% - 50vw); }\n.bleed-c { box-shadow: 0 0 0 9999px #eee; }\n`;
    const findings = pageGround(scanCssFile("css/site.css", css, new Set(), { exceptions: [] }));
    assert.deepEqual(findings.map((f) => f.selector), [".bleed-a", ".bleed-b", ".bleed-c"]);
  });

  it("does not flag ordinary canvas CSS: normal shadows, a small inset, max-width: 100vw, or a fixed modal backdrop", () => {
    const css = [
      ".card { background: #f7f8f9; box-shadow: 0 1px 2px rgba(0,0,0,.2); }",
      ".focus-ring { clip-path: inset(-2px); }",
      ".media { max-width: 100vw; width: 50vw; }",
      ".modal-backdrop { position: fixed; inset: 0; box-shadow: 0 0 0 100vmax rgba(0,0,0,.5); width: 100vw; }",
      "",
    ].join("\n");
    assert.equal(pageGround(scanCssFile("css/site.css", css, new Set(), { exceptions: [] })).length, 0);
  });

  it("flags a non-white background on html, body, :root, or the canvas root — but not on white or on a descendant", () => {
    const css = [
      "body { background: #f2f4f7; }",
      ":root { background-color: #eee; }",
      "main#main-content { background: #f7f8f9; }",
      "html, .hero { background-color: #eef1f4; }",
      "body { background: #FFF; }",
      "main#main-content .card { background: #f7f8f9; }",
      "body::before { background: #000; }",
      "",
    ].join("\n");
    const findings = pageGround(scanCssFile("css/site.css", css, new Set(), { exceptions: [] }));
    assert.deepEqual(
      findings.map((f) => [f.selector, f.line]),
      [["body", 1], [":root", 2], ["main#main-content", 3], ["html", 4]],
    );
  });

  it("resolves the canvas root from the project's canvas selector", () => {
    const css = `#ag-app-canvas { background: #eee; }\nmain { background: #eee; }\n`;
    const agKit = pageGround(scanCssFile("css/site.css", css, new Set(), { exceptions: [], canvasSelector: "div#ag-app-canvas" }));
    assert.deepEqual(agKit.map((f) => f.selector), ["#ag-app-canvas"], "a bare main is not the canvas root in that kit");
    const decorator = pageGround(scanCssFile("css/site.css", css, new Set(), { exceptions: [] }));
    assert.deepEqual(decorator.map((f) => f.selector), ["main"]);
  });

  it("a valid exception suppresses by file + rule selector; an expired one reports itself", () => {
    const css = `.full-bleed-hero { width: 100vw; }`;
    const good = [{ file: "css/site.css", selector: ".full-bleed-hero", reason: "approved campaign band", reviewOn: "2099-01-01" }];
    assert.equal(scanCssFile("css/site.css", css, new Set(), { exceptions: good }).length, 0);

    const findings = scanCssFile("css/site.css", css, new Set(), { exceptions: [{ ...good[0], reviewOn: "2000-01-01" }] });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, "chrome/styling/expired-exception");
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

  it("reports a page-ground repaint as tier 4 even when every chrome token is untouched", async () => {
    const dir = await project();
    await writeFile(path.join(dir, "index.html"), decoratorPage("Home"));
    await writeFile(path.join(dir, "about.html"), decoratorPage("About"));
    await mkdir(path.join(dir, "css"), { recursive: true });
    await writeFile(
      path.join(dir, "css/site.css"),
      `.student-canvas.sx-light {\n  box-shadow: 0 0 0 100vmax #f2f4f7;\n  clip-path: inset(0 -100vmax);\n}\n`,
    );

    const { config, pages } = await loadPages(dir);
    const { findings } = await runStyling(dir, { pages, canvasSelector: config.canvas, regions: config.regions });
    assert.deepEqual(findings.map((f) => [f.kind, f.file, f.line]), [
      ["chrome/styling/page-ground", "css/site.css", 2],
      ["chrome/styling/page-ground", "css/site.css", 3],
    ]);
  });
});

// canvas-components/ is where a project drops the component libraries its
// canvas uses. A library's reset — Tailwind's Preflight zeroing every margin
// and list style on the page — reaches the shell without naming one chrome
// token, so the protected-token scan alone cannot see it.
describe("scanCssFile strict — a component library's CSS may not style the page globally", () => {
  const none = new Set();

  it("flags selectors that name no class, id, or attribute, with the correct lines — at-rules included", () => {
    const source = [
      "*, ::before, ::after { box-sizing: border-box; margin: 0; }",
      "@layer base {",
      "  ul { list-style: none; }",
      "}",
      "body { font-family: system-ui; }",
      ":not(.card) p { margin: 0; }",
    ].join("\n");
    const findings = scanCssFile("canvas-components/ui/app.min.css", source, none, { strict: true });
    assert.deepEqual(
      findings.map((f) => [f.kind, f.selector, f.line]),
      [
        ["chrome/styling/global", "*", 1],
        ["chrome/styling/global", "::before", 1],
        ["chrome/styling/global", "::after", 1],
        ["chrome/styling/global", "ul", 3],
        ["chrome/styling/global", "body", 5],
        ["chrome/styling/global", ":not(.card) p", 6],
      ],
    );
  });

  it("does not flag anchored, scoped, nested, keyframe, shadow-root, or custom-property-only rules", () => {
    const source = [
      ".tw\\:flex { display: flex; }",
      "#app-root h1 { font-size: 2rem; }",
      '[data-slot="button"] { cursor: pointer; }',
      ':root, :host { --tw-color-primary: #182b49; --tw-font: "a;b"; }',
      "*, ::before, ::after, ::backdrop { --tw-border-style: solid; }",
      "@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }",
      ".card { h2 { margin: 0; } }",
      "@scope (#app-root) { p { margin: 0; } }",
      ":host { display: block; }",
    ].join("\n");
    assert.deepEqual(scanCssFile("canvas-components/ui/app.css", source, none, { strict: true }), []);
  });

  it("leaves site CSS as it was — strict is off unless the file is under canvas-components/", () => {
    assert.deepEqual(scanCssFile("css/site.css", "body { margin: 0; }\nh1 { color: #00629b; }", none), []);
  });

  it("a reviewed exception suppresses a global finding; an expired one reports itself", () => {
    const exception = {
      file: "canvas-components/ui/app.css",
      selector: "body",
      reason: "scroll lock while a dialog is open",
      reviewOn: "2999-01-01",
      approvedBy: "jsmith",
    };
    const source = "body { overflow: hidden; }";
    assert.deepEqual(scanCssFile(exception.file, source, none, { strict: true, exceptions: [exception] }), []);

    const expired = scanCssFile(exception.file, source, none, {
      strict: true,
      exceptions: [{ ...exception, reviewOn: "2000-01-01" }],
    });
    assert.deepEqual(expired.map((f) => f.kind), ["chrome/styling/expired-exception"]);
  });
});

describe("discoverComponentStyleFiles", () => {
  it("finds minified CSS under canvas-components/, and nothing outside it", async () => {
    const dir = await project();
    await mkdir(path.join(dir, "canvas-components/ui/dist"), { recursive: true });
    await mkdir(path.join(dir, "css"), { recursive: true });
    await writeFile(path.join(dir, "canvas-components/ui/dist/app.min.css"), "");
    await writeFile(path.join(dir, "css/bootstrap.min.css"), "");
    const files = await discoverComponentStyleFiles(dir);
    assert.deepEqual(
      files.map((f) => path.relative(dir, f).split(path.sep).join("/")),
      ["canvas-components/ui/dist/app.min.css"],
    );
  });

  it("returns nothing when the project has no canvas-components/", async () => {
    assert.deepEqual(await discoverComponentStyleFiles(await project()), []);
  });
});

describe("runStyling end-to-end: a component library dropped into canvas-components/", () => {
  it("scans its minified build for shell tokens and global selectors, and holds site CSS to neither", async () => {
    const dir = await project();
    await writeFile(path.join(dir, "index.html"), decoratorPage("Home"));
    await mkdir(path.join(dir, "canvas-components/ui/dist"), { recursive: true });
    await mkdir(path.join(dir, "css"), { recursive: true });
    const library = "canvas-components/ui/dist/app.min.css";
    await writeFile(path.join(dir, library), ".collapse{visibility:collapse}h1{margin:0}.tw\\:flex{display:flex}");
    await writeFile(path.join(dir, "css/site.css"), "body { margin: 0; }\n");

    const { config, pages } = await loadPages(dir);
    const { findings } = await runStyling(dir, { pages, canvasSelector: config.canvas, regions: config.regions });

    assert.ok(
      findings.some((f) => f.kind === "chrome/styling/stylesheet" && f.file === library && f.selector === ".collapse"),
      "Tailwind's collapse utility hits the class Bootstrap's navbar depends on",
    );
    const global = findings.filter((f) => f.kind === "chrome/styling/global");
    assert.deepEqual(global.map((f) => [f.file, f.selector]), [[library, "h1"]]);
    assert.match(global[0].remedy, /main#main-content/);
  });
});
