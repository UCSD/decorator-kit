// A zero-dependency HTML parser and tree utility set.
//
// Node ships no DOM and this kit carries no runtime dependencies (see the
// "No dependencies" note in bin/cli.mjs and "dependency-free" in
// scripts/pin-decorator.mjs) — chrome verification keeps that promise rather
// than becoming the first thing in this repo that needs `npm install`.
//
// This is not a spec-complete HTML5 tree constructor. It covers what
// well-formed, hand-authored Decorator markup actually uses: normal nesting,
// void elements, raw-text elements, comments, quoted and unquoted attributes.
// It does not implement HTML5's tag-inference error-recovery algorithm — an
// unmatched end tag is ignored rather than triggering implied closes — which
// is deliberately lenient rather than spec-accurate. A linter that aborts on
// the first surprising tag is worse than one that is approximately right.

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

// Elements whose content is raw text: no child tags, no entity decoding,
// terminated only by a matching case-insensitive end tag.
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title"]);

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(value) {
  if (!value.includes("&")) return value;
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === "#") {
      const codePoint =
        body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

function makeElement(tag, attrs, parent) {
  return { type: "element", tag, attrs, children: [], parent };
}

function makeText(value, parent) {
  return { type: "text", value, parent };
}

function makeComment(value, parent) {
  return { type: "comment", value, parent };
}

function readStartTag(source, i) {
  let j = i + 1;
  const tagStart = j;
  while (j < source.length && !/[\s/>]/.test(source[j])) j++;
  const tag = source.slice(tagStart, j).toLowerCase();
  const attrs = [];
  let selfClosing = false;
  while (j < source.length) {
    while (j < source.length && /\s/.test(source[j])) j++;
    if (source[j] === ">") {
      j++;
      break;
    }
    if (source[j] === "/" && source[j + 1] === ">") {
      selfClosing = true;
      j += 2;
      break;
    }
    if (j >= source.length) break;
    const nameStart = j;
    while (j < source.length && !/[\s=/>]/.test(source[j])) j++;
    const name = source.slice(nameStart, j).toLowerCase();
    if (!name) {
      j++;
      continue;
    }
    while (j < source.length && /\s/.test(source[j])) j++;
    let value = "";
    if (source[j] === "=") {
      j++;
      while (j < source.length && /\s/.test(source[j])) j++;
      const quote = source[j];
      if (quote === '"' || quote === "'") {
        j++;
        const valStart = j;
        while (j < source.length && source[j] !== quote) j++;
        value = source.slice(valStart, j);
        j++;
      } else {
        const valStart = j;
        while (j < source.length && !/[\s>]/.test(source[j])) j++;
        value = source.slice(valStart, j);
      }
    }
    attrs.push([name, decodeEntities(value)]);
  }
  return { tag, attrs, selfClosing, next: j };
}

function findCloseTagCI(source, from, tag) {
  const lower = source.toLowerCase();
  const needle = `</${tag}`;
  let idx = lower.indexOf(needle, from);
  while (idx !== -1) {
    let k = idx + needle.length;
    while (k < source.length && /\s/.test(source[k])) k++;
    if (source[k] === ">") return { start: idx, end: k + 1 };
    idx = lower.indexOf(needle, idx + 1);
  }
  return null;
}

function pushText(node, value) {
  if (!value) return;
  const children = node.children;
  const last = children[children.length - 1];
  if (last && last.type === "text") {
    last.value += value;
    return;
  }
  children.push(makeText(value, node));
}

/**
 * Parse an HTML document (or fragment) into a lightweight tree of
 * `{type: "element"|"text"|"comment", ...}` nodes rooted at a
 * `{type: "document", children}` node.
 */
export function parseHTML(source) {
  const root = { type: "document", children: [] };
  let node = root;
  let i = 0;
  const n = source.length;

  while (i < n) {
    if (source[i] !== "<") {
      const next = source.indexOf("<", i);
      const stop = next === -1 ? n : next;
      pushText(node, decodeEntities(source.slice(i, stop)));
      i = stop;
      continue;
    }
    if (source.startsWith("<!--", i)) {
      const close = source.indexOf("-->", i + 4);
      node.children.push(makeComment(source.slice(i + 4, close === -1 ? n : close), node));
      i = close === -1 ? n : close + 3;
      continue;
    }
    if (source.startsWith("<!", i) || source.startsWith("<?", i)) {
      const close = source.indexOf(">", i);
      i = close === -1 ? n : close + 1;
      continue;
    }
    if (source[i + 1] === "/") {
      const close = source.indexOf(">", i);
      const rawName = source.slice(i + 2, close === -1 ? n : close).trim().toLowerCase();
      i = close === -1 ? n : close + 1;
      let cursor = node;
      while (cursor.type === "element" && cursor.tag !== rawName) cursor = cursor.parent;
      if (cursor.type === "element") node = cursor.parent;
      continue;
    }
    if (/[a-zA-Z]/.test(source[i + 1] ?? "")) {
      const { tag, attrs, selfClosing, next } = readStartTag(source, i);
      const element = makeElement(tag, attrs, node);
      node.children.push(element);
      i = next;
      if (VOID_ELEMENTS.has(tag) || selfClosing) {
        // No children scope to enter.
      } else if (RAW_TEXT_ELEMENTS.has(tag)) {
        const close = findCloseTagCI(source, i, tag);
        const raw = close === null ? source.slice(i) : source.slice(i, close.start);
        if (raw) element.children.push(makeText(raw, element));
        i = close === null ? n : close.end;
      } else {
        node = element;
      }
      continue;
    }
    // A '<' that isn't a real construct — e.g. a stray "<" in text like
    // "1 < 2". Treat it as one literal character rather than looping forever.
    pushText(node, "<");
    i += 1;
  }
  return root;
}

/** The exact attribute value, or undefined if the attribute is absent. */
export function getAttr(node, name) {
  const lower = name.toLowerCase();
  const found = node.attrs?.find(([key]) => key === lower);
  return found ? found[1] : undefined;
}

/** Whitespace-split `class` tokens, or an empty array. */
export function classList(node) {
  const value = getAttr(node, "class");
  return value ? value.split(/\s+/).filter(Boolean) : [];
}

/** Depth-first visit of every *descendant* element (not the root itself). */
export function walkElements(root, callback) {
  for (const child of root.children ?? []) {
    if (child.type !== "element") continue;
    callback(child);
    walkElements(child, callback);
  }
}

function escapeText(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function serializeNode(node) {
  if (node.type === "text") return escapeText(node.value);
  if (node.type === "comment") return `<!--${node.value}-->`;
  if (node.type !== "element") return node.children.map(serializeNode).join("");
  const attrText = node.attrs.map(([k, v]) => (v === "" ? k : `${k}="${escapeAttr(v)}"`)).join(" ");
  const open = attrText ? `<${node.tag} ${attrText}>` : `<${node.tag}>`;
  if (VOID_ELEMENTS.has(node.tag)) return open;
  return `${open}${node.children.map(serializeNode).join("")}</${node.tag}>`;
}

/**
 * Reconstruct approximate markup for a node — used in failure messages, not
 * as a source of truth. Truncated by default so a CLI failure prints a
 * recognizable fragment rather than an entire region.
 */
export function serialize(node, { maxLength = 600 } = {}) {
  const text = serializeNode(node);
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export const VOID_ELEMENT_NAMES = VOID_ELEMENTS;
