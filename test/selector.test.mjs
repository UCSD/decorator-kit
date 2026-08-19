import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHTML } from "../checks/lib/html.mjs";
import { matches, querySelector, querySelectorAll } from "../checks/lib/selector.mjs";

const FIXTURE = `
<header class="layout-header">
  <a class="skip-to-main" href="#main-content">Skip</a>
  <section class="layout-title">
    <a href="index.html" class="title-header title-header-large">Long</a>
    <a href="index.html" class="title-header title-header-short">Short</a>
    <a href="https://www.ucsd.edu" class="title-logo">UC San Diego</a>
  </section>
</header>
<div class="navmenu offcanvas"></div>
<div class="navmenu offcanvas offcanvas-clone"></div>
<form action="/search" method="get" id="cse">
  <select class="search-scope" name="search-scope"><option>x</option></select>
  <input type="search" class="search-term" name="search-term">
</form>
`;

describe("selector.mjs", () => {
  it("matches by type, class, and id, combined", () => {
    const doc = parseHTML(FIXTURE);
    assert.equal(querySelectorAll(doc, "header.layout-header").length, 1);
    assert.equal(querySelectorAll(doc, "form#cse").length, 1);
    assert.equal(querySelectorAll(doc, "a.title-header").length, 2);
  });

  it("matches [attr] existence and [attr=value] equality, quoted or not", () => {
    const doc = parseHTML(FIXTURE);
    assert.equal(querySelectorAll(doc, "a[href]").length, 4);
    assert.equal(querySelectorAll(doc, "form[method='get']").length, 1);
    assert.equal(querySelectorAll(doc, `form[method="get"]`).length, 1);
    assert.equal(querySelectorAll(doc, "form[method='post']").length, 0);
  });

  it("descendant vs child combinator are not interchangeable", () => {
    const doc = parseHTML(FIXTURE);
    assert.equal(querySelectorAll(doc, "header a").length, 4, "descendant reaches the skip link plus all 3 in section.layout-title");
    assert.equal(querySelectorAll(doc, "header > a").length, 1, "child only reaches the direct child skip link");
    assert.equal(querySelectorAll(doc, "header > section.layout-title > a").length, 3);
  });

  it(":not() excludes a compound match", () => {
    const doc = parseHTML(FIXTURE);
    assert.equal(querySelectorAll(doc, ".navmenu.offcanvas").length, 2);
    assert.equal(querySelectorAll(doc, ".navmenu.offcanvas:not(.offcanvas-clone)").length, 1);
  });

  it("requiring multiple classes is an AND, not an OR", () => {
    const doc = parseHTML(FIXTURE);
    assert.equal(querySelectorAll(doc, ".title-header.title-header-large").length, 1);
  });

  it("matches() tests a specific node without searching its ancestors", () => {
    const doc = parseHTML(FIXTURE);
    const clone = querySelectorAll(doc, ".offcanvas-clone")[0];
    assert.equal(matches(clone, ".offcanvas"), true);
    assert.equal(matches(clone, ".offcanvas:not(.offcanvas-clone)"), false);
  });

  it("querySelector excludes the root itself, only searching descendants", () => {
    const doc = parseHTML(FIXTURE);
    const header = querySelector(doc, "header.layout-header");
    assert.equal(querySelector(header, "header.layout-header"), null);
  });

  it("throws with the offending text on an unsupported selector rather than matching nothing silently", () => {
    assert.throws(() => querySelectorAll(parseHTML(FIXTURE), "a:hover"), /:hover/);
    assert.throws(() => querySelectorAll(parseHTML(FIXTURE), "a["), /Unclosed/);
  });
});
