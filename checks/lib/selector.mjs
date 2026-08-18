// A minimal CSS selector engine — not a general one.
//
// It supports exactly the grammar the chrome contracts actually write: type,
// `.class`, `#id`, `[attr]`, `[attr='value']`/`[attr="value"]`, descendant and
// child (`>`) combinators, and `:not(compound)`. That set covers every
// selector in contracts/*.json and skills/ucsd-decorator/references/
// canvas-contract.md. Anything past it throws with the offending text rather
// than silently matching nothing, so an unsupported selector in a new rule
// fails loudly at load time instead of passing every check for free.

import { classList, getAttr, walkElements } from "./html.mjs";

function findMatchingParen(text, openIndex) {
  let depth = 0;
  for (let k = openIndex; k < text.length; k++) {
    if (text[k] === "(") depth++;
    else if (text[k] === ")") {
      depth--;
      if (depth === 0) return k;
    }
  }
  throw new Error(`Unclosed "(" in selector "${text}"`);
}

function parseAttrTest(body, original) {
  const eq = body.indexOf("=");
  if (eq === -1) return { name: body.trim().toLowerCase(), op: "exists" };
  const name = body.slice(0, eq).trim().toLowerCase();
  let value = body.slice(eq + 1).trim();
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
    value = value.slice(1, -1);
  } else if (!value) {
    throw new Error(`Empty attribute value in selector "${original}"`);
  }
  return { name, op: "equals", value };
}

function parseCompound(text) {
  if (!text) throw new Error("Empty compound selector");
  const compound = { tag: null, id: null, classes: [], attrs: [], not: [] };
  let i = 0;
  const n = text.length;

  if (text[i] === "*") {
    i += 1;
  } else {
    const tagMatch = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(text.slice(i));
    if (tagMatch) {
      compound.tag = tagMatch[0].toLowerCase();
      i += tagMatch[0].length;
    }
  }

  while (i < n) {
    const ch = text[i];
    if (ch === ".") {
      const m = /^\.([a-zA-Z0-9_-]+)/.exec(text.slice(i));
      if (!m) throw new Error(`Bad class selector near "${text.slice(i)}" in "${text}"`);
      compound.classes.push(m[1]);
      i += m[0].length;
    } else if (ch === "#") {
      const m = /^#([a-zA-Z0-9_-]+)/.exec(text.slice(i));
      if (!m) throw new Error(`Bad id selector near "${text.slice(i)}" in "${text}"`);
      compound.id = m[1];
      i += m[0].length;
    } else if (ch === "[") {
      const close = text.indexOf("]", i);
      if (close === -1) throw new Error(`Unclosed "[" in selector "${text}"`);
      compound.attrs.push(parseAttrTest(text.slice(i + 1, close), text));
      i = close + 1;
    } else if (ch === ":") {
      const m = /^:not\(/.exec(text.slice(i));
      if (!m) throw new Error(`Unsupported pseudo-class near "${text.slice(i)}" in "${text}" (only :not() is)`);
      const openParen = i + m[0].length - 1;
      const closeParen = findMatchingParen(text, openParen);
      compound.not.push(parseCompound(text.slice(openParen + 1, closeParen)));
      i = closeParen + 1;
    } else {
      throw new Error(`Unexpected character "${ch}" in selector "${text}"`);
    }
  }
  return compound;
}

/** Parse a selector string into an array of `{combinator, compound}` steps. */
export function parseSelector(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Empty selector");
  const steps = [];
  let i = 0;
  const n = trimmed.length;
  let combinator = null;

  while (i < n) {
    while (i < n && /\s/.test(trimmed[i])) i++;
    if (i >= n) break;
    if (trimmed[i] === ">") {
      combinator = ">";
      i++;
      continue;
    }
    const start = i;
    let brackets = 0;
    let parens = 0;
    while (i < n) {
      const c = trimmed[i];
      if (c === "[") brackets++;
      else if (c === "]") brackets--;
      else if (c === "(") parens++;
      else if (c === ")") parens--;
      else if (brackets === 0 && parens === 0 && (/\s/.test(c) || c === ">")) break;
      i++;
    }
    steps.push({ combinator, compound: parseCompound(trimmed.slice(start, i)) });
    combinator = "descendant";
  }
  if (!steps.length) throw new Error(`Selector "${text}" produced no steps`);
  return steps;
}

function compoundMatches(node, compound) {
  if (node.type !== "element") return false;
  if (compound.tag && node.tag !== compound.tag) return false;
  if (compound.id !== null && getAttr(node, "id") !== compound.id) return false;
  if (compound.classes.length) {
    const classes = classList(node);
    for (const cls of compound.classes) if (!classes.includes(cls)) return false;
  }
  for (const attr of compound.attrs) {
    const value = getAttr(node, attr.name);
    if (attr.op === "exists") {
      if (value === undefined) return false;
    } else if (value !== attr.value) {
      return false;
    }
  }
  for (const notCompound of compound.not) {
    if (compoundMatches(node, notCompound)) return false;
  }
  return true;
}

function chainMatches(node, steps, index) {
  if (!compoundMatches(node, steps[index].compound)) return false;
  if (index === 0) return true;
  if (steps[index].combinator === ">") {
    const parent = node.parent;
    return !!parent && parent.type === "element" && chainMatches(parent, steps, index - 1);
  }
  let ancestor = node.parent;
  while (ancestor && ancestor.type === "element") {
    if (chainMatches(ancestor, steps, index - 1)) return true;
    ancestor = ancestor.parent;
  }
  return false;
}

function resolveSteps(selector) {
  return typeof selector === "string" ? parseSelector(selector) : selector;
}

/** Every descendant of `root` (not `root` itself) matching `selector`, in document order. */
export function querySelectorAll(root, selector) {
  const steps = resolveSteps(selector);
  const results = [];
  walkElements(root, (node) => {
    if (chainMatches(node, steps, steps.length - 1)) results.push(node);
  });
  return results;
}

/** The first descendant of `root` matching `selector`, or null. */
export function querySelector(root, selector) {
  const steps = resolveSteps(selector);
  let found = null;
  walkElements(root, (node) => {
    if (!found && chainMatches(node, steps, steps.length - 1)) found = node;
  });
  return found;
}

/** True if `node` itself (not a descendant) matches `selector`. */
export function matches(node, selector) {
  const steps = resolveSteps(selector);
  return chainMatches(node, steps, steps.length - 1);
}
