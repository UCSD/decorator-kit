import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classList, getAttr, parseHTML, serialize, walkElements } from "../checks/lib/html.mjs";
import { querySelector, querySelectorAll } from "../checks/lib/selector.mjs";

function count(doc, selector) {
  return querySelectorAll(doc, selector).length;
}

describe("html.mjs", () => {
  it("parses nesting, quoted and unquoted attributes, and boolean attributes", () => {
    const doc = parseHTML(`<div id="a" class='b c' data-x=1 disabled><span>hi</span></div>`);
    const div = querySelector(doc, "div");
    assert.equal(getAttr(div, "id"), "a");
    assert.equal(getAttr(div, "class"), "b c");
    assert.equal(getAttr(div, "data-x"), "1");
    assert.equal(getAttr(div, "disabled"), "");
    assert.deepEqual(classList(div), ["b", "c"]);
    assert.equal(count(doc, "span"), 1);
  });

  it("treats void elements as childless without a closing tag", () => {
    const doc = parseHTML(`<div><img src="a.png"><input type="text"><p>after</p></div>`);
    const img = querySelector(doc, "img");
    assert.equal(img.children.length, 0);
    assert.equal(count(doc, "p"), 1, "content after a void element must not be swallowed as its child");
  });

  it("does not parse markup-like text inside script/style as tags", () => {
    const doc = parseHTML(`<script>if (a < b) { document.write("</not-a-tag>"); }</script><style>.x::before { content: "<div>"; }</style><p>real</p>`);
    assert.equal(count(doc, "not-a-tag"), 0);
    assert.equal(count(doc, "div"), 0, "the <div> inside the style string must not be parsed as an element");
    assert.equal(count(doc, "p"), 1);
    const script = querySelector(doc, "script");
    assert.match(script.children[0].value, /document\.write/);
  });

  it("drops comments and decodes entities in text and attributes", () => {
    const doc = parseHTML(`<!-- top level --><a href="a.html?x=1&amp;y=2">About &amp; more</a>`);
    const a = querySelector(doc, "a");
    assert.equal(getAttr(a, "href"), "a.html?x=1&y=2");
    assert.equal(a.children[0].value, "About & more");
  });

  it("ignores a stray unmatched end tag instead of throwing or hanging", () => {
    const doc = parseHTML(`<div>ok</div></section><p>after</p>`);
    assert.equal(count(doc, "p"), 1);
  });

  it("does not loop forever on a bare '<' that starts no real tag", () => {
    const doc = parseHTML(`<p>1 < 2 and 3 > 1</p>`);
    const p = querySelector(doc, "p");
    assert.equal(p.children[0].value, "1 < 2 and 3 > 1");
  });

  it("self-closes an explicit /> regardless of the tag name", () => {
    const doc = parseHTML(`<div><br/><custom-el/><p>after</p></div>`);
    assert.equal(count(doc, "p"), 1);
  });

  it("walkElements visits every descendant but not the root itself", () => {
    const doc = parseHTML(`<div id="root"><span></span><span></span></div>`);
    const root = querySelector(doc, "#root");
    const seen = [];
    walkElements(root, (node) => seen.push(node.tag));
    assert.deepEqual(seen, ["span", "span"]);
  });

  it("serialize reconstructs recognizable, truncated markup", () => {
    const doc = parseHTML(`<a class="skip-to-main" href="#main-content">Skip to main content</a>`);
    const out = serialize(querySelector(doc, "a"));
    assert.match(out, /<a class="skip-to-main" href="#main-content">Skip to main content<\/a>/);
    const long = serialize({ type: "text", value: "x".repeat(1000) }, { maxLength: 10 });
    assert.equal(long.length, 11); // 10 chars + the ellipsis marker
  });
});
