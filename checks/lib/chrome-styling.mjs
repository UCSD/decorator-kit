// Tier 4: site-authored CSS and JavaScript may not target the Decorator
// shell. Tiers 1-3 all read markup; every chrome regression that reached
// production after they were live changed no tag at all — a stylesheet that
// rebuilt the drawer search, `#chat-bubble { ... !important }` on a widget
// that builds its own DOM after load, and site JS deleting the id
// `base.min.css` keys the mobile drawer layout on. See ../README.md.
//
// The protected token set is derived per run from the built pages (every
// class and id inside a chrome region and nowhere inside the canvas), so it
// tracks the Decorator instead of a hand-maintained list going stale the
// first time a content component picks up a Bootstrap primitive. Campus
// widget ids are the one part that has to be hand-maintained — their DOM is
// built after load and never reaches the markup, so nothing can derive them.
//
// This is a scanner, not a CSS/JS parser: "you need selector text and a line
// number, not a CSS parse" (checks/README.md). The JS side in particular is a
// best-effort heuristic — it does not fully disambiguate regex literals from
// division, so a regex containing an unescaped brace immediately around an id
// mutation could in principle confuse the enclosing-function lookup. Real
// canvas interaction scripts are short and rarely hit this; treat a
// suspiciously-placed finding as a cue to look, not as gospel.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { classList, getAttr, walkElements } from "./html.mjs";
import { DEFAULT_EXCLUDE_DIRS, walkFiles } from "./fs-walk.mjs";
import { loadJSON, loadOptionalJSON } from "./json.mjs";
import { querySelector } from "./selector.mjs";
import { KIT_ROOT } from "./chrome-contract.mjs";

export const STYLING_OVERLAY_FILE = "chrome-styling.local.json";

// Where a project drops the component libraries its canvas uses — the same
// directory scripts/lib/rules.mjs compiles their READMEs from. CSS there is
// held to more than site CSS; see scanCssFile's `strict`.
export const CANVAS_COMPONENTS_DIR = "canvas-components";

// ── config ───────────────────────────────────────────────────────────────

const REQUIRED_EXCEPTION_FIELDS = ["file", "selector", "reason", "reviewOn", "approvedBy"];
const REVIEW_ON_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Hand-written, dependency-free validation of the `allow` list — this repo
 * takes no npm dependencies, so there is no ajv/schema-validator to lean on.
 * `contracts/chrome-styling.schema.json` documents the same shape for editor
 * tooling; this is what actually enforces it. A malformed or incomplete
 * exception is a human-authored file with a mistake in it, not something to
 * silently work around, so this throws rather than degrading.
 */
function validateExceptions(allow, sourceFile) {
  allow.forEach((entry, index) => {
    for (const field of REQUIRED_EXCEPTION_FIELDS) {
      if (typeof entry[field] !== "string" || entry[field].trim() === "") {
        throw new Error(
          `${sourceFile}: allow[${index}] is missing "${field}" (or it is empty). Every exception needs ` +
            `file, selector, reason, reviewOn, and approvedBy — the name of the human who reviewed it. ` +
            `This is a reviewed edit to a config file, not one an agent should be making — see ` +
            `rules/00-canvas.md.`,
        );
      }
    }
    if (!REVIEW_ON_PATTERN.test(entry.reviewOn)) {
      throw new Error(`${sourceFile}: allow[${index}].reviewOn ("${entry.reviewOn}") is not a YYYY-MM-DD date.`);
    }
  });
}

export async function loadStylingConfig(cwd) {
  const defaults = await loadJSON(path.join(KIT_ROOT, "contracts/chrome-styling.json"));
  const overlay = await loadOptionalJSON(path.join(cwd, STYLING_OVERLAY_FILE));
  if (defaults.allow?.length) validateExceptions(defaults.allow, "contracts/chrome-styling.json");
  if (overlay?.allow?.length) validateExceptions(overlay.allow, STYLING_OVERLAY_FILE);
  return {
    widgetTokens: [...new Set([...(defaults.widgetTokens ?? []), ...(overlay?.widgetTokens ?? [])])],
    allow: [...(defaults.allow ?? []), ...(overlay?.allow ?? [])],
  };
}

// ── protected token derivation ──────────────────────────────────────────

function addTokensFrom(node, into) {
  const id = getAttr(node, "id");
  if (id) into.add(`#${id}`);
  for (const cls of classList(node)) into.add(`.${cls}`);
}

function collectTokens(root, into) {
  addTokensFrom(root, into);
  walkElements(root, (node) => addTokensFrom(node, into));
}

/**
 * Every class/id appearing inside a chrome region and nowhere inside the
 * canvas, across all pages — plus the hand-maintained widget ids, which by
 * definition appear in no page and so cannot be derived this way.
 */
export function deriveProtectedTokens(pages, canvasSelector, regions, widgetTokens = []) {
  const chromeTokens = new Set();
  const canvasTokens = new Set();
  for (const page of pages) {
    for (const region of regions) {
      const node = page.found[region.id];
      if (node) collectTokens(node, chromeTokens);
    }
    const canvasNode = querySelector(page.doc, canvasSelector);
    if (canvasNode) collectTokens(canvasNode, canvasTokens);
  }
  const protectedTokens = new Set(widgetTokens);
  for (const token of chromeTokens) if (!canvasTokens.has(token)) protectedTokens.add(token);
  return protectedTokens;
}

// ── exceptions ───────────────────────────────────────────────────────────

function findException(exceptions, file, selectorKey) {
  return exceptions.find((entry) => entry.file === file && entry.selector === selectorKey);
}

/** A missing or malformed `reviewOn` fails closed (expired), not open (permanent). */
function isExpired(exception, now = new Date()) {
  const reviewOn = new Date(`${exception.reviewOn}T00:00:00Z`).getTime();
  if (Number.isNaN(reviewOn)) return true;
  return reviewOn < now.getTime();
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

// ── CSS scanning ─────────────────────────────────────────────────────────

function stripCssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function splitTopLevel(text, separator) {
  const pieces = [];
  let brackets = 0;
  let parens = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "[") brackets++;
    else if (c === "]") brackets--;
    else if (c === "(") parens++;
    else if (c === ")") parens--;
    else if (c === separator && brackets === 0 && parens === 0) {
      pieces.push({ text: text.slice(start, i), offset: start });
      start = i + 1;
    }
  }
  pieces.push({ text: text.slice(start), offset: start });
  return pieces;
}

function countNewlines(text) {
  let count = 0;
  for (const ch of text) if (ch === "\n") count++;
  return count;
}

/** `#id`/`.class` tokens outside `[...]`, plus `[id="…"]`/`[class~="…"]` forms — handled separately so `a[href="#search"]` is never read as targeting `#search`. */
function findProtectedTokenHits(selectorText, protectedTokens) {
  const hits = new Set();
  const withoutBrackets = selectorText.replace(/\[[^\]]*\]/g, " ");
  for (const m of withoutBrackets.matchAll(/[.#][a-zA-Z][\w-]*/g)) {
    if (protectedTokens.has(m[0])) hits.add(m[0]);
  }
  for (const m of selectorText.matchAll(/\[\s*(id|class)\s*~?=\s*(['"])([^'"]+)\2\s*]/g)) {
    const token = m[1] === "id" ? `#${m[3]}` : `.${m[3]}`;
    if (protectedTokens.has(token)) hits.add(token);
  }
  return [...hits];
}

/** Push a stylesheet finding unless a reviewed exception covers file + selector; an expired exception reports itself instead. */
function pushUnlessExcepted(findings, exceptions, finding) {
  const exception = findException(exceptions, finding.file, finding.selector);
  if (!exception) {
    findings.push(finding);
    return;
  }
  if (isExpired(exception)) {
    findings.push({
      kind: "chrome/styling/expired-exception",
      file: finding.file,
      line: finding.line,
      selector: finding.selector,
      detail: `the exception for "${finding.selector}" expired on ${exception.reviewOn} and no longer applies`,
      reason: exception.reason,
    });
  }
}

/** Line of the first non-whitespace character of the piece starting at `offset` within `text`, which itself starts on `startLine`. */
function lineOfPiece(text, offset, piece, startLine) {
  // A piece routinely starts with the newline left over from the previous
  // selector's trailing comma or declaration's semicolon — count up to where
  // its content actually is, not up to the piece boundary itself.
  const leadingWhitespace = /^\s*/.exec(piece)[0].length;
  return startLine + countNewlines(text.slice(0, offset + leadingWhitespace));
}

/** Each selector in a list, whitespace-collapsed, with the line its first character is on. */
function selectorsIn(preludeText, startLine) {
  const selectors = [];
  for (const { text, offset } of splitTopLevel(preludeText, ",")) {
    const selector = collapseWhitespace(text);
    if (selector) selectors.push({ selector, line: lineOfPiece(preludeText, offset, text, startLine) });
  }
  return selectors;
}

function scanSelectorList(preludeText, startLine, file, protectedTokens, exceptions, findings) {
  for (const { selector, line } of selectorsIn(preludeText, startLine)) {
    const hits = findProtectedTokenHits(selector, protectedTokens);
    if (!hits.length) continue;
    pushUnlessExcepted(findings, exceptions, {
      kind: "chrome/styling/stylesheet",
      file,
      line,
      selector,
      tokens: hits,
      detail: `selector "${selector}" reaches ${hits.join(", ")} — that belongs to the Decorator shell, not the canvas`,
    });
  }
}

// ── page ground ──────────────────────────────────────────────────────────
//
// The white behind the canvas is shell too: base.min.css sets
// `body, html { background: #fff }` and `.layout-main` is full width. A rule
// can repaint it without naming a single chrome token, so the token check
// above never sees it. Shipped regression: a canvas-scoped
// `.student-canvas.sx-light { box-shadow: 0 0 0 100vmax #f2f4f7;
// clip-path: inset(0 -100vmax) }` turned the whole band under the navbar gray
// from inside a 1170px container, with every other tier green.
//
// Two shapes are flagged. Declarations that paint past their own box to the
// viewport edges (any selector), and a non-white background on the page
// ground itself — html, body, :root, or the canvas root. A background on a
// component *inside* the canvas is the canvas's business and is not flagged.

const HUGE_LENGTH = String.raw`(?:(?:\d+\.?\d*|\.\d+)(?:vw|vh|vmax|vmin)|\d{4,}(?:\.\d+)?px)`;

const BLEED_DECLARATIONS = [
  {
    property: /^box-shadow$/,
    value: new RegExp(HUGE_LENGTH, "i"),
    what: "a box-shadow spread to viewport size",
  },
  {
    property: /^clip-path$/,
    value: new RegExp(String.raw`inset\([^)]*-\s*${HUGE_LENGTH}`, "i"),
    what: "a clip-path inset that extends past the element's own edges",
  },
  {
    property: /^(?:min-)?(?:width|inline-size)$/,
    value: /(?:^|[^\d.])100(?:\.0+)?vw\b/i,
    what: "a 100vw width",
  },
  {
    property: /^(?:margin(?:-left|-right|-inline(?:-start|-end)?)?|left|right|inset(?:-inline(?:-start|-end)?)?)$/,
    value: /(?:^|[^\d.])50(?:\.0+)?vw\b/i,
    what: "a 50vw breakout offset",
  },
];

const BACKGROUND_PROPERTY = /^background(?:-color|-image)?$/;
const WHITE_OR_NOTHING = new Set(["transparent", "none", "#fff", "#ffffff", "white", "rgb(255,255,255)", "inherit", "initial", "unset", "revert"]);

/** `{ property, value, line }` for each declaration in a rule body. Lowercased property; value without `!important`. */
function parseDeclarations(body, startLine) {
  const declarations = [];
  for (const { text, offset } of splitTopLevel(body, ";")) {
    const colon = text.indexOf(":");
    if (colon === -1) continue;
    const property = text.slice(0, colon).trim().toLowerCase();
    if (!/^-?[a-z][a-z-]*$/.test(property)) continue;
    const value = collapseWhitespace(text.slice(colon + 1).replace(/!\s*important\s*$/i, ""));
    declarations.push({ property, value, line: lineOfPiece(body, offset, text, startLine) });
  }
  return declarations;
}

/** The last compound of a selector — the element it actually styles. */
function subjectCompound(selector) {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (depth === 0 && /[\s>+~]/.test(c)) start = i + 1;
  }
  return selector.slice(start).trim();
}

/** Tag and id of the canvas selector's own element, e.g. `main#main-content` → `{ tag: "main", id: "main-content" }`. */
function canvasRoot(canvasSelector) {
  const compound = subjectCompound(canvasSelector ?? "");
  return {
    tag: /^[a-z][\w-]*/i.exec(compound)?.[0].toLowerCase() ?? null,
    id: /#([\w-]+)/.exec(compound)?.[1] ?? null,
  };
}

function isPageGround(selector, root) {
  const subject = subjectCompound(selector);
  if (subject.includes("::")) return false; // a pseudo-element is its own box, not the element's ground
  if (/^(?:html|body|:root)(?![\w-])/i.test(subject)) return true;
  if (root.id && new RegExp(`#${escapeRegExp(root.id)}(?![\\w-])`).test(subject)) return true;
  // A bare `main` is the canvas root in every Decorator template; a bare `div` is not worth guessing at.
  return root.tag === "main" && /^main(?![\w-])/i.test(subject);
}

function scanDeclarations(preludeText, preludeLine, body, bodyLine, file, root, exceptions, findings) {
  const declarations = parseDeclarations(body, bodyLine);
  if (!declarations.length) return;
  const selectorList = collapseWhitespace(preludeText);
  const remedy =
    "leave the page ground white — put a tinted band in a module wrapper such as .jumbotron-sand inside the canvas (rules/10-brand-integrity.md, \"The page ground is the Decorator's\")";

  // A fixed-position overlay (a modal backdrop) is meant to cover the viewport, and only while open.
  const fixed = declarations.some((d) => d.property === "position" && /^fixed\b/i.test(d.value));
  if (!fixed) {
    for (const declaration of declarations) {
      const match = BLEED_DECLARATIONS.find((b) => b.property.test(declaration.property) && b.value.test(declaration.value));
      if (!match) continue;
      pushUnlessExcepted(findings, exceptions, {
        kind: "chrome/styling/page-ground",
        file,
        line: declaration.line,
        selector: selectorList,
        detail: `${declaration.property}: ${declaration.value} — ${match.what} paints past this element's box to the edges of the viewport, over the Decorator's white page ground`,
        remedy,
      });
    }
  }

  const backgrounds = declarations.filter(
    (d) => BACKGROUND_PROPERTY.test(d.property) && !WHITE_OR_NOTHING.has(d.value.toLowerCase().replace(/\s+/g, "")),
  );
  if (!backgrounds.length) return;
  for (const { text, offset } of splitTopLevel(preludeText, ",")) {
    const selector = collapseWhitespace(text);
    if (!selector || !isPageGround(selector, root)) continue;
    for (const declaration of backgrounds) {
      pushUnlessExcepted(findings, exceptions, {
        kind: "chrome/styling/page-ground",
        file,
        line: lineOfPiece(preludeText, offset, text, preludeLine),
        selector,
        detail: `${declaration.property}: ${declaration.value} on ${subjectCompound(selector)} repaints the page ground, which the Decorator sets to #fff`,
        remedy,
      });
    }
  }
}

// ── component-library globals ────────────────────────────────────────────
//
// CSS under canvas-components/ is scanned `strict`: a library's global reset
// (Tailwind's Preflight) restyles the whole page without naming a chrome token.

const QUOTED = /(["'])(?:\\.|(?!\1).)*\1/g;

/**
 * Does this selector reach elements by type alone? One anchored to a class,
 * id, or attribute only reaches elements carrying it, and the protected-token
 * check decides whether those belong to the shell. One naming none of them —
 * `*`, `html`, `body`, `h1`, `ul li` — styles every match on the page, header
 * and footer included, and no token derivation can see that. `:not(…)` does
 * not anchor (`:not(.card) p` still reaches the footer's paragraphs), and
 * `:host` only ever matches inside a shadow root.
 */
function isGlobalSelector(selector) {
  const bare = selector.replace(QUOTED, "").replace(/:not\([^()]*\)/g, "");
  if (/[.#](?:[\w-]|\\)|\[/.test(bare)) return false;
  return !/^:host\b/.test(bare);
}

/** A rule that only sets custom properties styles nothing by itself, and the Decorator's CSS reads none. */
function setsOnlyCustomProperties(block) {
  return block
    .replace(QUOTED, '""')
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .every((declaration) => declaration.startsWith("--"));
}

/** Inside a style rule (CSS nesting), `@scope`, or `@keyframes`, a bare-looking selector is not global. */
function anchorsNestedSelectors(block) {
  return block.atRule === null || block.atRule === "scope" || block.atRule.endsWith("keyframes");
}

/**
 * Flag any site-authored selector that hits a protected token, and any rule
 * that repaints the page ground (see "page ground" above). Handles
 * `@media`/`@supports` nesting (their prelude is never itself a selector, but
 * what is inside still gets scanned) and strings (so `content: "{"` cannot be
 * mistaken for a brace). Not a full CSS parse — selector and declaration
 * *text* and a line number is the contract. A rule body is read from its `{`
 * to the next brace, so declarations after a nested rule inside it are not
 * scanned; plain site CSS rarely nests.
 *
 * With `strict` — CSS under canvas-components/ — also flag, as
 * `chrome/styling/global`, any selector that names no class, id, or attribute,
 * unless its rule sets only custom properties. A component library's global
 * reset reaches the shell without naming a single chrome token.
 */
export function scanCssFile(
  file,
  source,
  protectedTokens,
  { exceptions = [], strict = false, canvasSelector = "main#main-content" } = {},
) {
  const root = canvasRoot(canvasSelector);
  const findings = [];
  const clean = stripCssComments(source);
  const n = clean.length;
  let i = 0;
  let line = 1;
  let bufferStart = 0;
  let bufferStartLine = 1;
  const stack = [];

  while (i < n) {
    const ch = clean[i];
    if (ch === "\n") {
      line++;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < n && clean[j] !== quote) {
        if (clean[j] === "\\") j++;
        if (clean[j] === "\n") line++;
        j++;
      }
      i = Math.min(j + 1, n);
      continue;
    }
    if (ch === "{") {
      const prelude = clean.slice(bufferStart, i);
      const trimmed = prelude.trim();
      const atRule = trimmed.startsWith("@") ? (/^@([\w-]+)/.exec(trimmed)?.[1] ?? "").toLowerCase() : null;
      const isStyleRule = atRule === null && trimmed !== "";
      // `atRule: null` marks a style rule; anything else is an at-rule (or a stray brace, "").
      const block = isStyleRule
        ? { atRule: null, prelude, line: bufferStartLine, start: i + 1, globals: [] }
        : { atRule: atRule ?? "", globals: [] };
      if (isStyleRule) {
        scanSelectorList(prelude, bufferStartLine, file, protectedTokens, exceptions, findings);
        if (strict && !stack.some(anchorsNestedSelectors)) {
          block.globals = selectorsIn(prelude, bufferStartLine).filter(({ selector }) => isGlobalSelector(selector));
        }
      }
      stack.push(block);
      i++;
      bufferStart = i;
      bufferStartLine = line;
      continue;
    }
    if (ch === "}") {
      const block = stack.pop();
      if (block?.atRule === null) {
        scanDeclarations(block.prelude, block.line, clean.slice(bufferStart, i), bufferStartLine, file, root, exceptions, findings);
        // Decided at the closing brace, once the declarations are known.
        if (block.globals.length && !setsOnlyCustomProperties(clean.slice(block.start, i))) {
          for (const { selector, line: selectorLine } of block.globals) {
            pushUnlessExcepted(findings, exceptions, {
              kind: "chrome/styling/global",
              file,
              line: selectorLine,
              selector,
              detail: `selector "${selector}" names no class, id, or attribute, so it styles every match on the page — the Decorator shell included`,
              remedy: `scope it under the canvas (${canvasSelector}) or the library's own root element, or turn off the library's global reset`,
            });
          }
        }
      }
      i++;
      bufferStart = i;
      bufferStartLine = line;
      continue;
    }
    i++;
  }
  return findings;
}

// ── JS scanning ──────────────────────────────────────────────────────────

const REGEX_PRECEDERS = new Set(["", "(", ",", "=", "[", "!", "&", "|", ":", ";", "{", "}", "+", "-", "*", "%", "?"]);

function isRegexContext(lastSignificant, outTail) {
  if (REGEX_PRECEDERS.has(lastSignificant)) return true;
  return /(^|[^\w$])return\s*$/.test(outTail);
}

/**
 * Blank comments (always) and, by default, string/template contents and
 * regex literals — so brace-depth and function-name detection cannot be
 * thrown off by a stray `{`, `}`, or quote inside one. Pass
 * `blankStrings: false` for the protected-token *reference* check, which
 * needs to see inside string literals (`getElementById('search')` is a
 * string, and it is the normal way JS names an id).
 *
 * Regex-vs-division is genuinely ambiguous without a real parser; this uses
 * the common heuristic (what character precedes the `/`) rather than one.
 */
function stripJsNoise(source, { blankStrings = true } = {}) {
  let out = "";
  let i = 0;
  const n = source.length;
  let lastSignificant = "";
  while (i < n) {
    const c = source[i];
    const c2 = source[i + 1];
    if (c === "/" && c2 === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    if (c === "/" && c2 === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < n && source[j] !== quote) {
        if (source[j] === "\\") j++;
        j++;
      }
      const stop = Math.min(j + 1, n);
      out += blankStrings ? source.slice(i, stop).replace(/[^\n]/g, " ") : source.slice(i, stop);
      i = stop;
      lastSignificant = "x";
      continue;
    }
    if (c === "/" && isRegexContext(lastSignificant, out.slice(-10))) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < n && source[j] !== "\n") {
        if (source[j] === "\\") j++;
        else if (source[j] === "[") inClass = true;
        else if (source[j] === "]") inClass = false;
        else if (source[j] === "/" && !inClass) {
          closed = true;
          break;
        }
        j++;
      }
      if (closed) {
        let k = j + 1;
        while (k < n && /[a-z]/i.test(source[k])) k++;
        out += blankStrings ? source.slice(i, k).replace(/[^\n]/g, " ") : source.slice(i, k);
        i = k;
        lastSignificant = "x";
        continue;
      }
    }
    out += c;
    if (!/\s/.test(c)) lastSignificant = c;
    i++;
  }
  return out;
}

const CONTROL_KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "function", "else", "try", "do", "finally", "with"]);

/** Best-effort: what function does the block opened by this `{` belong to, if any? */
function detectFunctionName(prelude) {
  const trimmed = prelude.trim();
  let m = /function\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\([^()]*\)\s*$/.exec(trimmed);
  if (m) return m[1] ?? "<anonymous>";
  m = /(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$.]*)\s*=\s*(?:async\s+)?function\b/.exec(trimmed);
  if (m) return m[1];
  m = /(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$.]*)\s*=\s*(?:async\s*)?(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>\s*$/.exec(trimmed);
  if (m) return m[1];
  m = /([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*$/.exec(trimmed);
  if (m && !CONTROL_KEYWORDS.has(m[1])) return m[1];
  return null;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Gates the whole file scan: canvas scripts assign ids to their own components constantly, and that is not this rule's business. */
function referencesProtectedTokens(withStringsIntact, protectedTokens) {
  for (const token of protectedTokens) {
    const bare = token.slice(1);
    if (!bare) continue;
    if (new RegExp(`[#.]?\\b${escapeRegExp(bare)}\\b`).test(withStringsIntact)) return true;
  }
  return false;
}

/**
 * Flag `removeAttribute("id")`, `setAttribute("id", …)`, and `.id =` — but
 * only in files that reference a protected token somewhere, and keyed to the
 * enclosing function by name (not line), so reformatting a body does not
 * silently drop a reviewed exception.
 *
 * Two noise-stripped views of the same source are used, and matches on one
 * are safe to look up in the other: both blank comments the same way and
 * preserve length and newline positions exactly, so a character index means
 * the same position in either.
 *
 *   - `clean` blanks string/template/regex contents too — safe for brace-depth
 *     and function-name detection, which must not see a stray `{`, `}`, or
 *     quote hiding inside one.
 *   - `withStringsIntact` keeps them — required to see the id-mutation calls
 *     themselves, since `removeAttribute("id")` *is* a string literal: a view
 *     that blanks it can never match the pattern it exists to detect.
 */
export function scanJsFile(file, source, protectedTokens, { exceptions = [] } = {}) {
  const withStringsIntact = stripJsNoise(source, { blankStrings: false });
  if (!referencesProtectedTokens(withStringsIntact, protectedTokens)) return [];

  const clean = stripJsNoise(source);
  const boundaries = [{ index: 0, name: "<module>" }];
  const stack = [];
  let bufferStart = 0;

  // The nearest *named* enclosing function, not merely the innermost scope:
  // an anonymous forEach/addEventListener callback is exactly where an id
  // mutation tends to live, and "<anonymous>" is not a usable exception key
  // when a file has more than one of them. Blame the named function around
  // it instead — that is what a human can find and what stays stable if the
  // callback body is reformatted.
  function currentName() {
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k] && stack[k] !== "<anonymous>") return stack[k];
    }
    return "<module>";
  }

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === "{") {
      stack.push(detectFunctionName(clean.slice(bufferStart, i)));
      bufferStart = i + 1;
      boundaries.push({ index: i + 1, name: currentName() });
    } else if (ch === "}") {
      stack.pop();
      bufferStart = i + 1;
      boundaries.push({ index: i + 1, name: currentName() });
    }
  }

  function nameAt(index) {
    let name = boundaries[0].name;
    for (const boundary of boundaries) {
      if (boundary.index > index) break;
      name = boundary.name;
    }
    return name;
  }

  const findings = [];
  const idMutation = /\bremoveAttribute\(\s*(['"])id\1\s*\)|\bsetAttribute\(\s*(['"])id\2\s*,|\.id\s*=(?!=)/g;
  for (const match of withStringsIntact.matchAll(idMutation)) {
    const line = 1 + countNewlines(withStringsIntact.slice(0, match.index));
    const name = nameAt(match.index);
    const exception = findException(exceptions, file, `function:${name}`);
    if (exception) {
      if (isExpired(exception)) {
        findings.push({
          kind: "chrome/styling/expired-exception",
          file,
          line,
          detail: `the exception for function "${name}" expired on ${exception.reviewOn} and no longer applies`,
          reason: exception.reason,
        });
      }
      continue;
    }
    findings.push({
      kind: "chrome/styling/script",
      file,
      line,
      function: name,
      detail: `${match[0].trim()} in function "${name}" — this file references a protected chrome token, and the Decorator may own that id at runtime (see the drawer search breakpoint contract)`,
    });
  }
  return findings;
}

// ── orchestration ────────────────────────────────────────────────────────

export async function discoverStyleFiles(cwd) {
  return walkFiles(cwd, { exclude: DEFAULT_EXCLUDE_DIRS, matches: (name) => /\.css$/i.test(name) && !/\.min\.css$/i.test(name) });
}

/**
 * Every `*.css` under canvas-components/, minified included. Site CSS discovery
 * skips `*.min.css`; a component library's build is minified as often as not,
 * and it is the CSS most likely to carry a global reset.
 */
export async function discoverComponentStyleFiles(cwd) {
  return walkFiles(path.join(cwd, CANVAS_COMPONENTS_DIR), {
    exclude: DEFAULT_EXCLUDE_DIRS,
    matches: (name) => /\.css$/i.test(name),
  }).catch((error) => (error.code === "ENOENT" ? [] : Promise.reject(error)));
}

export async function discoverScriptFiles(cwd) {
  return walkFiles(cwd, { exclude: DEFAULT_EXCLUDE_DIRS, matches: (name) => /\.js$/i.test(name) && !/\.min\.js$/i.test(name) });
}

/**
 * Run tier 4 against a project: derive the protected token set from already
 * loaded `pages` (see chrome-contract.mjs's `loadRoutePages`), then scan its
 * site-authored CSS and JS. `styleFiles`/`scriptFiles` default to every
 * `*.css`/`*.js` under `cwd` (excluding `*.min.*`, node_modules, vendor,
 * core-template), plus every `*.css` under canvas-components/ — pass explicit
 * lists to scan a narrower or different set. CSS under canvas-components/ is
 * scanned strictly however it got into the list.
 */
export async function runStyling(cwd, { pages, canvasSelector, regions, styleFiles, scriptFiles }) {
  const config = await loadStylingConfig(cwd);
  const protectedTokens = deriveProtectedTokens(pages, canvasSelector, regions, config.widgetTokens);

  const css =
    styleFiles ?? [...new Set([...(await discoverStyleFiles(cwd)), ...(await discoverComponentStyleFiles(cwd))])];
  const js = scriptFiles ?? (await discoverScriptFiles(cwd));

  const findings = [];
  for (const absolute of css) {
    const relative = path.relative(cwd, absolute).split(path.sep).join("/");
    const source = await readFile(absolute, "utf8");
    const strict = relative.startsWith(`${CANVAS_COMPONENTS_DIR}/`);
    findings.push(
      ...scanCssFile(relative, source, protectedTokens, { exceptions: config.allow, strict, canvasSelector }),
    );
  }
  for (const absolute of js) {
    const relative = path.relative(cwd, absolute).split(path.sep).join("/");
    const source = await readFile(absolute, "utf8");
    findings.push(...scanJsFile(relative, source, protectedTokens, { exceptions: config.allow }));
  }
  return { protectedTokens, findings };
}
