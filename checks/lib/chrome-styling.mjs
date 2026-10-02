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

// ── canvas-anchored selectors ───────────────────────────────────────────
//
// A selector whose leftmost compound is the canvas root, followed only by
// descendant (space) and child (`>`) combinators, can only ever match the
// canvas or something inside it — and the chrome lies outside the canvas. So a
// protected token in it is the canvas's own use of a shared Bootstrap word,
// not a reach into the shell: `main#main-content .deck-card .glyphicon` styles
// a canvas icon, whatever the derivation decided about `.glyphicon`. This is
// what rules/10-brand-integrity.md tells authors to write; the check agrees.
// It holds for any project's regions: a token is only protected if it appears
// nowhere inside the canvas, so a region a project declares inside the canvas
// contributes nothing an anchored selector could reach.
//
// Still flagged: a sibling combinator anywhere after the anchor
// (`main#main-content ~ footer .row` leaves the canvas), an anchor that is not
// the leftmost compound (`.navbar main#main-content .row` — or
// `body main#main-content .row`, which the scanner does not try to reason
// about), and a leading combinator from CSS nesting. The page-ground and
// global checks do not consult this at all.

/** Top-level compounds of one complex selector and the combinators between them; `leading` is a combinator before the first compound. */
function splitComplexSelector(selector) {
  const compounds = [];
  const combinators = [];
  let leading = null;
  let current = "";
  let pending = null;
  let depth = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === "\\") {
      current += c + (selector[i + 1] ?? "");
      i++;
      continue;
    }
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    if (depth === 0 && /[\s>+~]/.test(c)) {
      if (current) {
        compounds.push(current);
        current = "";
      }
      if (pending === null || pending === " ") pending = /\s/.test(c) ? " " : c;
      continue;
    }
    if (pending !== null) {
      if (compounds.length) combinators.push(pending);
      else leading = pending;
      pending = null;
    }
    current += c;
  }
  if (current) compounds.push(current);
  return { compounds, combinators, leading };
}

/** Tag, ids, and classes of one compound, ignoring what is inside `[...]` and `(...)`. */
function compoundParts(compound) {
  let bare = "";
  let depth = 0;
  for (const c of compound) {
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (depth === 0) bare += c;
  }
  return {
    tag: /^(?:[a-z][\w-]*|\*)/i.exec(bare)?.[0].toLowerCase() ?? null,
    ids: [...bare.matchAll(/#([\w-]+)/g)].map((m) => m[1]),
    classes: [...bare.matchAll(/\.([\w-]+)/g)].map((m) => m[1]),
  };
}

function compoundIsCanvasRoot(compound, root) {
  const { tag, ids, classes } = compoundParts(compound);
  if (root.tag && tag && tag !== "*" && tag !== root.tag) return false;
  if (root.id) return ids.includes(root.id);
  if (!root.classes.length) return Boolean(root.tag) && tag === root.tag;
  return (!root.tag || tag === root.tag) && root.classes.every((cls) => classes.includes(cls));
}

/** Can this selector only match the canvas root or something inside it? */
export function isCanvasAnchored(selector, root) {
  const { compounds, combinators, leading } = splitComplexSelector(selector);
  if (leading !== null || !compounds.length) return false;
  if (!combinators.every((combinator) => combinator === " " || combinator === ">")) return false;
  return compoundIsCanvasRoot(compounds[0], root);
}

function scanSelectorList(preludeText, startLine, file, protectedTokens, exceptions, findings, root) {
  for (const { selector, line } of selectorsIn(preludeText, startLine)) {
    const hits = findProtectedTokenHits(selector, protectedTokens);
    if (!hits.length) continue;
    if (isCanvasAnchored(selector, root)) continue;
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

/** Tag, id, and classes of the canvas selector's own element, e.g. `main#main-content` → `{ tag: "main", id: "main-content", classes: [] }`. */
function canvasRoot(canvasSelector) {
  const compound = subjectCompound(canvasSelector ?? "");
  return {
    tag: /^[a-z][\w-]*/i.exec(compound)?.[0].toLowerCase() ?? null,
    id: /#([\w-]+)/.exec(compound)?.[1] ?? null,
    classes: [...compound.replace(/\[[^\]]*\]|\([^)]*\)/g, "").matchAll(/\.([\w-]+)/g)].map((m) => m[1]),
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
 * Flag any site-authored selector that hits a protected token — unless it is
 * anchored on the canvas root (see "canvas-anchored selectors" above) — and
 * any rule that repaints the page ground (see "page ground" above). Handles
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
        scanSelectorList(prelude, bufferStartLine, file, protectedTokens, exceptions, findings, root);
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
 *
 * Pass a `literals` array to collect the `{ start, end }` span of every
 * string and template literal, quotes included.
 */
function stripJsNoise(source, { blankStrings = true, literals = null } = {}) {
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
      literals?.push({ start: i, end: stop });
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

// What counts as a script "referencing" a protected token. Only string
// literals in code position, never identifiers (`location.search` is not the
// `.search` class) and never prose: a framework bundle carries the app's copy
// as string literals, and a slide that says "Navbar, drawer & both search
// forms" names no selector. A literal counts when it is
//
//   - the first argument to a DOM selector API — querySelector(All), closest,
//     matches, getElementById, getElementsByClassName, jQuery's `$`/`jQuery`,
//     and `.find` — read as a selector (getElementById: as an id;
//     getElementsByClassName: as class names);
//   - selector-shaped on its own: it starts with `.`, `#`, or `[` and holds only
//     selector characters, so `const DRAWER = ".navmenu"` counts wherever the
//     constant is later used;
//   - an id value: assigned to or compared with `.id`, or the value in
//     `setAttribute("id", …)`.
//
// In the first two cases a token only counts with its sigil (`#search`,
// `.search`), and `[...]` contents are ignored, so `a[href^='#']` names nothing.

const SELECTOR_CALL =
  /(?:\.\s*(querySelector|querySelectorAll|closest|matches|getElementById|getElementsByClassName|find)|(?<![\w$.])(\$|jQuery))\s*\(\s*$/;
const ID_VALUE = /(?:\.id\s*(?:[!=]==?|=)|\bsetAttribute\(\s*(['"])id\1\s*,)\s*$/;
const SELECTOR_SHAPED = /^\s*[.#[][\w\s.#\-[\]="'^$*~|:>+,()\\]*$/;

/**
 * Protected tokens one string literal names, given the code just before it —
 * `before` from the blanked view, so an earlier string cannot pose as a call,
 * and `beforeIntact` for `setAttribute("id", …)`, whose `"id"` is a string.
 */
function literalTokens(text, before, beforeIntact, protectedTokens) {
  const call = SELECTOR_CALL.exec(before);
  if (call) {
    const api = call[1] ?? call[2];
    if (api === "getElementById") return protectedTokens.has(`#${text.trim()}`) ? [`#${text.trim()}`] : [];
    if (api === "getElementsByClassName") {
      return text.split(/\s+/).filter(Boolean).map((cls) => `.${cls}`).filter((token) => protectedTokens.has(token));
    }
    return findProtectedTokenHits(text, protectedTokens);
  }
  if (ID_VALUE.test(beforeIntact)) return protectedTokens.has(`#${text.trim()}`) ? [`#${text.trim()}`] : [];
  if (SELECTOR_SHAPED.test(text)) return findProtectedTokenHits(text, protectedTokens);
  return [];
}

/**
 * Flag `removeAttribute("id")`, `setAttribute("id", …)`, and `.id =` — but
 * only where the nearest named enclosing function, or a function lexically
 * enclosing that one (module scope included), references a protected token
 * (see `literalTokens` above). Canvas scripts assign ids to their own
 * components constantly, and a framework runtime sets `.id` on objects that
 * are not elements at all (Vue's scheduler: `job.id = instance.uid`); neither
 * is this rule's business. Findings are keyed to the enclosing function by
 * name (not line), so reformatting a body does not silently drop a reviewed
 * exception.
 *
 * The gate is lexical, which is its trade-off: an element fetched by
 * selector in one function and mutated in another that does not enclose it —
 * `getDrawer().removeAttribute("id")`, with `#search` named only inside
 * `getDrawer` — is not flagged. A reference in an enclosing function or at
 * module scope does reach every function nested inside it, which covers the
 * common closure shape (`const panel = $("#search")` at the top, mutated in a
 * handler below).
 *
 * Two noise-stripped views of the same source are used, and matches on one
 * are safe to look up in the other: both blank comments the same way and
 * preserve length and newline positions exactly, so a character index means
 * the same position in either.
 *
 *   - `clean` blanks string/template/regex contents too — safe for brace-depth
 *     and function-name detection, which must not see a stray `{`, `}`, or
 *     quote hiding inside one — and for reading the code before a literal.
 *   - `withStringsIntact` keeps them — required to see the id-mutation calls
 *     themselves, since `removeAttribute("id")` *is* a string literal: a view
 *     that blanks it can never match the pattern it exists to detect.
 */
export function scanJsFile(file, source, protectedTokens, { exceptions = [] } = {}) {
  const literals = [];
  const withStringsIntact = stripJsNoise(source, { blankStrings: false, literals });
  const clean = stripJsNoise(source);

  // Scope 0 is the module. Every named function opens a scope whose parent is
  // the named scope around it; blocks and anonymous callbacks open none.
  const MODULE = { name: "<module>", scope: 0 };
  const parents = [null];
  const boundaries = [{ index: 0, ...MODULE }];
  const stack = [];
  let bufferStart = 0;

  // The nearest *named* enclosing function, not merely the innermost scope:
  // an anonymous forEach/addEventListener callback is exactly where an id
  // mutation tends to live, and "<anonymous>" is not a usable exception key
  // when a file has more than one of them. Blame the named function around
  // it instead — that is what a human can find and what stays stable if the
  // callback body is reformatted.
  function current() {
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].scope !== null) return stack[k];
    }
    return MODULE;
  }

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === "{") {
      const name = detectFunctionName(clean.slice(bufferStart, i));
      let scope = null;
      if (name && name !== "<anonymous>") {
        scope = parents.length;
        parents.push(current().scope);
      }
      stack.push({ name, scope });
      bufferStart = i + 1;
      boundaries.push({ index: i + 1, ...current() });
    } else if (ch === "}") {
      stack.pop();
      bufferStart = i + 1;
      boundaries.push({ index: i + 1, ...current() });
    }
  }

  function scopeAt(index) {
    let found = boundaries[0];
    for (const boundary of boundaries) {
      if (boundary.index > index) break;
      found = boundary;
    }
    return found;
  }

  const referenced = new Map(); // scope → Set of protected tokens named in it
  for (const { start, end } of literals) {
    const text = withStringsIntact.slice(start + 1, end - 1).replace(/\$\{[^}]*\}/g, " ");
    const from = Math.max(0, start - 64);
    const tokens = literalTokens(text, clean.slice(from, start), withStringsIntact.slice(from, start), protectedTokens);
    if (!tokens.length) continue;
    const { scope } = scopeAt(start);
    if (!referenced.has(scope)) referenced.set(scope, new Set());
    for (const token of tokens) referenced.get(scope).add(token);
  }

  /** Protected tokens named in this scope or any scope lexically enclosing it. */
  function tokensInReach(scope) {
    const tokens = new Set();
    for (let s = scope; s !== null; s = parents[s]) {
      for (const token of referenced.get(s) ?? []) tokens.add(token);
    }
    return [...tokens];
  }

  const findings = [];
  const idMutation = /\bremoveAttribute\(\s*(['"])id\1\s*\)|\bsetAttribute\(\s*(['"])id\2\s*,|\.id\s*=(?!=)/g;
  for (const match of withStringsIntact.matchAll(idMutation)) {
    const { name, scope } = scopeAt(match.index);
    const tokens = tokensInReach(scope);
    if (!tokens.length) continue;
    const line = 1 + countNewlines(withStringsIntact.slice(0, match.index));
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
      tokens,
      detail: `${match[0].trim()} in function "${name}", which (or a function enclosing it) references ${tokens.join(", ")} — the Decorator may own that id at runtime (see the drawer search breakpoint contract)`,
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

// ── declared third-party scripts ─────────────────────────────────────────
//
// decorator-kit.json's optional `thirdParty` lists built third-party code — a
// framework runtime split into its own chunk, a vendored component bundle —
// that tier 4's script scan skips. JS only: third-party CSS is exactly what
// leaks into the shell, so it is always scanned, and canvas-components/ stays
// strict. Every run prints what was skipped (see `describeScope`), and the CI
// workflow flags a pull request that changes the list. It is human-owned
// scope, like chrome-styling.local.json: never an entry added to make a
// finding go away.

/** Glob → RegExp over a project-relative POSIX path: `**` any depth, `*` and `?` within one segment. A pattern without a glob matches that file, or everything under that directory. */
function globToRegExp(pattern) {
  if (!/[*?]/.test(pattern)) {
    const bare = escapeRegExp(pattern.replace(/\/+$/, ""));
    return new RegExp(`^${bare}(?:/.*)?$`);
  }
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      if (pattern[i + 2] === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i += 1;
      }
    } else if (c === "*") source += "[^/]*";
    else if (c === "?") source += "[^/]";
    else source += escapeRegExp(c);
  }
  return new RegExp(`^${source}$`);
}

/**
 * Validate decorator-kit.json's `thirdParty` and compile it. Throws on a
 * malformed list — it is a human-authored scope declaration with a mistake in
 * it, not something to work around. A pattern must be project-relative and
 * start with a literal directory or file name, so `**\/*.js` cannot quietly
 * take every script out of the scan.
 */
export function thirdPartyPatterns(thirdParty = []) {
  if (!Array.isArray(thirdParty)) {
    throw new Error('decorator-kit.json: "thirdParty" must be an array of path or glob patterns.');
  }
  return thirdParty.map((pattern, index) => {
    if (typeof pattern !== "string" || pattern.trim() === "") {
      throw new Error(`decorator-kit.json: thirdParty[${index}] must be a non-empty string.`);
    }
    const normalized = pattern.trim().replace(/^\.\//, "");
    const first = normalized.split("/")[0];
    if (normalized.startsWith("/") || normalized.split("/").includes("..") || /[*?]/.test(first) || first === "") {
      throw new Error(
        `decorator-kit.json: thirdParty[${index}] ("${pattern}") must be a project-relative path that starts with ` +
          `a literal directory or file name, such as "dist/assets/vendor-*.js". This is human-owned scope — ` +
          `see checks/README.md.`,
      );
    }
    return { pattern, regex: globToRegExp(normalized) };
  });
}

/** One line for every run: what tier 4 scanned, and what it skipped as declared third-party. */
export function describeScope(scope) {
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  let line = `tier 4 scanned ${plural(scope.css, "CSS file")} and ${plural(scope.js, "JS file")}`;
  if (scope.skipped.length) {
    line += `; skipped ${plural(scope.skipped.length, "third-party JS file")} (declared in decorator-kit.json): ${scope.skipped.join(", ")}`;
  } else {
    line += "; skipped no third-party JS";
  }
  if (scope.unmatched.length) line += `\n  note: thirdParty pattern${scope.unmatched.length === 1 ? "" : "s"} matched no file: ${scope.unmatched.join(", ")}`;
  return line;
}

/**
 * Run tier 4 against a project: derive the protected token set from already
 * loaded `pages` (see chrome-contract.mjs's `loadRoutePages`), then scan its
 * site-authored CSS and JS. `styleFiles`/`scriptFiles` default to every
 * `*.css`/`*.js` under `cwd` (excluding `*.min.*`, node_modules, vendor,
 * core-template), plus every `*.css` under canvas-components/ — pass explicit
 * lists to scan a narrower or different set. CSS under canvas-components/ is
 * scanned strictly however it got into the list. JS matching a `thirdParty`
 * pattern (decorator-kit.json) is skipped and reported in `scope`.
 */
export async function runStyling(cwd, { pages, canvasSelector, regions, styleFiles, scriptFiles, thirdParty = [] }) {
  const config = await loadStylingConfig(cwd);
  const patterns = thirdPartyPatterns(thirdParty);
  const protectedTokens = deriveProtectedTokens(pages, canvasSelector, regions, config.widgetTokens);
  const relativeTo = (absolute) => path.relative(cwd, absolute).split(path.sep).join("/");

  const css =
    styleFiles ?? [...new Set([...(await discoverStyleFiles(cwd)), ...(await discoverComponentStyleFiles(cwd))])];
  const allJs = scriptFiles ?? (await discoverScriptFiles(cwd));
  const js = [];
  const skipped = [];
  const used = new Set();
  for (const absolute of allJs) {
    const relative = relativeTo(absolute);
    const match = patterns.find(({ regex }) => regex.test(relative));
    if (match) {
      used.add(match.pattern);
      skipped.push(relative);
    } else {
      js.push(absolute);
    }
  }

  const findings = [];
  for (const absolute of css) {
    const relative = relativeTo(absolute);
    const source = await readFile(absolute, "utf8");
    const strict = relative.startsWith(`${CANVAS_COMPONENTS_DIR}/`);
    findings.push(
      ...scanCssFile(relative, source, protectedTokens, { exceptions: config.allow, strict, canvasSelector }),
    );
  }
  for (const absolute of js) {
    const relative = relativeTo(absolute);
    const source = await readFile(absolute, "utf8");
    findings.push(...scanJsFile(relative, source, protectedTokens, { exceptions: config.allow }));
  }
  const scope = {
    css: css.length,
    js: js.length,
    skipped,
    unmatched: patterns.map(({ pattern }) => pattern).filter((pattern) => !used.has(pattern)),
  };
  return { protectedTokens, findings, scope };
}
