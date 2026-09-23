// Tiers 1-3 of the chrome integrity gate: region extraction, normalization,
// golden hashing, cross-page consistency, and the structural require/forbid
// contract. See ../README.md for the four-tier design and
// skills/ucsd-decorator/references/canvas-contract.md for the rationale.
//
// This reads two kinds of config:
//
//   - portable, kit-shipped: contracts/chrome-regions.json (this kit's own
//     default protected regions) and contracts/ucsd-decorator-5.json (the
//     structural rules) — both hold for any Decorator site, unmodified.
//   - project-owned: decorator-kit.json's `canvas` field, an optional
//     chrome-regions.local.json / chrome-selectors.local.json overlay, and
//     the recorded golden at chrome-contract.local.json. All four are
//     specific to the project running this, and none of them lives in this
//     kit — that is the whole point of a golden *record*.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_EXCLUDE_DIRS, walkFiles } from "./fs-walk.mjs";
import { getAttr, parseHTML, serialize } from "./html.mjs";
import { loadJSON, loadOptionalJSON } from "./json.mjs";
import { matches, querySelector, querySelectorAll } from "./selector.mjs";

export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const GOLDEN_FILE = "chrome-contract.local.json";
export const REGIONS_OVERLAY_FILE = "chrome-regions.local.json";
export const RULES_OVERLAY_FILE = "chrome-selectors.local.json";

const VOLATILE_CLASSES = new Set(["active", "open", "in", "collapsed"]);
const DROP_ATTRS = new Set(["aria-current"]);
const URL_ATTRS = new Set(["href", "src", "action"]);

function mergeById(defaults, overlay) {
  const map = new Map(defaults.map((entry) => [entry.id, entry]));
  for (const entry of overlay) map.set(entry.id, entry);
  return [...map.values()];
}

/**
 * Resolve everything a project needs: the canvas selector (from
 * decorator-kit.json, defaulting to the plain-template shape), the chrome
 * regions (kit default + optional local overlay, merged by id), and the
 * tier-3 structural rules (same pattern).
 */
export async function loadConfig(cwd) {
  const manifest = await loadOptionalJSON(path.join(cwd, "decorator-kit.json"));
  const canvas = manifest?.canvas ?? "main#main-content";

  const regionDefaults = await loadJSON(path.join(KIT_ROOT, "contracts/chrome-regions.json"));
  const regionOverlay = await loadOptionalJSON(path.join(cwd, REGIONS_OVERLAY_FILE));
  const regions = mergeById(regionDefaults.regions, regionOverlay?.regions ?? []);

  const ruleDefaults = await loadJSON(path.join(KIT_ROOT, "contracts/ucsd-decorator-5.json"));
  const ruleOverlay = await loadOptionalJSON(path.join(cwd, RULES_OVERLAY_FILE));
  const rules = mergeById(ruleDefaults.rules, ruleOverlay?.rules ?? []);

  return { cwd, canvas, regions, rules, manifestFound: manifest !== null };
}

/** Every `*.html` file under `cwd`, excluding node_modules/vendor/core-template and dotfiles. */
export async function discoverRoutes(cwd, { exclude = DEFAULT_EXCLUDE_DIRS } = {}) {
  return walkFiles(cwd, { exclude, matches: (name) => name.toLowerCase().endsWith(".html") });
}

export async function readRoute(filePath, cwd) {
  const source = await readFile(filePath, "utf8");
  return { route: path.relative(cwd, filePath).split(path.sep).join("/"), doc: parseHTML(source) };
}

export function extractRegions(doc, regions) {
  const found = {};
  const missing = [];
  for (const region of regions) {
    const node = querySelector(doc, region.selector);
    if (node) found[region.id] = node;
    else missing.push(region.id);
  }
  return { found, missing };
}

export async function loadRoutePages(cwd, regions, routeFiles) {
  const pages = [];
  for (const file of routeFiles) {
    const { route, doc } = await readRoute(file, cwd);
    const { found, missing } = extractRegions(doc, regions);
    pages.push({ route, doc, found, missing });
  }
  return pages;
}

export function normalizeUrl(value, basePath) {
  if (!basePath || !value.startsWith(basePath)) return value;
  const rest = value.slice(basePath.length);
  return rest.startsWith("/") || rest === "" ? rest || "/" : `/${rest}`;
}

/**
 * Build a canonical, hash-stable structure for a subtree: comments dropped,
 * whitespace-only text dropped and interior whitespace collapsed, volatile
 * classes and aria-current stripped, empty class/style dropped, non-empty
 * style kept, URL attributes normalized past a deployment base path,
 * attributes emitted as a name-sorted array of pairs. `ignoreChildrenOf`
 * empties the children of any descendant (relative to `root`) matching one of
 * the given selectors — for build-generated content, like a data-driven nav
 * list, whose wrapper is chrome but whose contents are not. `ignoreTextOf`
 * drops only the text inside a matching descendant and keeps its elements —
 * for a link whose wording belongs to the site but whose markup does not,
 * like the title band's site name.
 */
export function canonicalize(root, { basePath = "", ignoreChildrenOf = [], ignoreTextOf = [] } = {}) {
  function canonElement(node, inIgnoredText = false) {
    const attrs = [];
    for (const [name, rawValue] of node.attrs) {
      if (DROP_ATTRS.has(name)) continue;
      let value = rawValue;
      if (name === "class") {
        const kept = value.split(/\s+/).filter((token) => token && !VOLATILE_CLASSES.has(token));
        if (!kept.length) continue;
        value = kept.slice().sort().join(" ");
      } else if (name === "style" && value.trim() === "") {
        continue;
      } else if (URL_ATTRS.has(name)) {
        value = normalizeUrl(value, basePath);
      }
      attrs.push([name, value]);
    }
    attrs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const emptied = ignoreChildrenOf.some((selector) => matches(node, selector));
    const textIgnored = inIgnoredText || ignoreTextOf.some((selector) => matches(node, selector));
    const children = emptied ? [] : node.children.map((child) => canonAny(child, textIgnored)).filter(Boolean);
    return { tag: node.tag, attrs, children };
  }
  function canonAny(node, inIgnoredText) {
    if (node.type === "comment") return null;
    if (node.type === "text") {
      if (inIgnoredText) return null;
      const text = node.value.replace(/\s+/g, " ").trim();
      return text ? { text } : null;
    }
    return canonElement(node, inIgnoredText);
  }
  return canonElement(root);
}

/**
 * Rebuild a parsed-element tree from a canonical one, so a golden recorded by
 * an earlier release can be canonicalized again under today's region options.
 * Without this, adding an ignore option to a region would fail every existing
 * project's golden on the day it upgraded.
 */
export function fromCanonical(canonical, parent = null) {
  if (canonical.text !== undefined) return { type: "text", value: canonical.text, parent };
  const node = { type: "element", tag: canonical.tag, attrs: canonical.attrs.map(([k, v]) => [k, v]), children: [], parent };
  node.children = canonical.children.map((child) => fromCanonical(child, node));
  return node;
}

/** Tier 1 compares routes with each other, so it keeps text a site owns: the site name must still match on every page. */
function consistencyOptions(region) {
  return { ignoreChildrenOf: region.ignoreChildrenOf ?? [] };
}

/** Tier 2 compares against a recorded golden, so it also drops text a site owns. */
function goldenOptions(region) {
  return { ignoreChildrenOf: region.ignoreChildrenOf ?? [], ignoreTextOf: region.ignoreTextOf ?? [] };
}

export function hashCanonical(canonical) {
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * The first point of divergence between two canonical trees, described by
 * node path — not a character offset. "First divergence at character 599"
 * cannot be self-corrected from; "footer > div.container > p: attribute href
 * changed" can.
 */
export function diffCanonical(expected, actual, breadcrumb = "") {
  if (!expected && !actual) return null;
  if (!expected) return `${breadcrumb || "(root)"}: an unexpected node was added`;
  if (!actual) return `${breadcrumb || "(root)"}: the expected node is missing`;
  if (expected.text !== undefined || actual.text !== undefined) {
    if (expected.text !== actual.text) {
      return `${breadcrumb || "(root)"}: text changed from ${JSON.stringify(expected.text)} to ${JSON.stringify(actual.text)}`;
    }
    return null;
  }
  const here = breadcrumb ? `${breadcrumb} > ${actual.tag}` : actual.tag;
  if (expected.tag !== actual.tag) return `${here}: tag changed from <${expected.tag}> to <${actual.tag}>`;
  const expectedAttrs = new Map(expected.attrs);
  const actualAttrs = new Map(actual.attrs);
  for (const [name, value] of expectedAttrs) {
    if (!actualAttrs.has(name)) return `${here}: attribute "${name}" was removed (was "${value}")`;
    if (actualAttrs.get(name) !== value) {
      return `${here}: attribute "${name}" changed from "${value}" to "${actualAttrs.get(name)}"`;
    }
  }
  for (const name of actualAttrs.keys()) {
    if (!expectedAttrs.has(name)) return `${here}: attribute "${name}" was added ("${actualAttrs.get(name)}")`;
  }
  if (expected.children.length !== actual.children.length) {
    return `${here}: child count changed from ${expected.children.length} to ${actual.children.length}`;
  }
  for (let i = 0; i < expected.children.length; i++) {
    const diff = diffCanonical(expected.children[i], actual.children[i], here);
    if (diff) return diff;
  }
  return null;
}

/** A region a route's chrome does not have at all — the most basic failure. */
export function checkRegionsPresent(pages, regions) {
  const findings = [];
  for (const page of pages) {
    for (const id of page.missing) {
      const region = regions.find((r) => r.id === id);
      findings.push({
        kind: "chrome/region-missing",
        id,
        route: page.route,
        detail: `no element matched "${region?.selector ?? id}"`,
        clearableByAccept: false,
      });
    }
  }
  return findings;
}

/** Tier 1 — every route's chrome must match every other route's. */
export function checkConsistency(pages, regions) {
  const findings = [];
  if (pages.length < 2) return findings;
  const [reference, ...rest] = pages;
  for (const region of regions) {
    const refNode = reference.found[region.id];
    if (!refNode) continue;
    const refCanon = canonicalize(refNode, consistencyOptions(region));
    const refHash = hashCanonical(refCanon);
    for (const page of rest) {
      const node = page.found[region.id];
      if (!node) continue;
      const canon = canonicalize(node, consistencyOptions(region));
      if (hashCanonical(canon) !== refHash) {
        findings.push({
          kind: "chrome/consistent",
          id: region.id,
          route: page.route,
          detail: `differs from ${reference.route}: ${diffCanonical(refCanon, canon) ?? "chrome differs"}`,
          clearableByAccept: false,
        });
      }
    }
  }
  return findings;
}

/** Tier 2 — the shared chrome must match the recorded golden. Has an escape hatch: --accept. */
export function checkGolden(pages, regions, golden) {
  const findings = [];
  for (const region of regions) {
    const page = pages.find((p) => p.found[region.id]);
    if (!page) continue;
    const canon = canonicalize(page.found[region.id], goldenOptions(region));
    const hash = hashCanonical(canon);
    const recorded = golden?.regions?.[region.id];
    if (!recorded) {
      findings.push({
        kind: "chrome/golden",
        id: region.id,
        route: page.route,
        detail: "no golden recorded yet for this region",
        remedy: "Only a human, after reviewing the current chrome, should run --accept. If you are an AI agent, do not run it — surface this finding and stop.",
        clearableByAccept: true,
      });
      continue;
    }
    // Re-canonicalize the recorded tree under today's options rather than
    // trusting its stored hash, so a golden accepted before a region gained
    // ignoreTextOf still matches — and its old site name does not pin the new one.
    const expected = recorded.tree ? canonicalize(fromCanonical(recorded.tree), goldenOptions(region)) : null;
    if ((expected ? hashCanonical(expected) : recorded.hash) !== hash) {
      findings.push({
        kind: "chrome/golden",
        id: region.id,
        route: page.route,
        detail: (expected && diffCanonical(expected, canon)) ?? "chrome no longer matches the recorded contract",
        remedy: "If a human intended this presentation change, they should run --accept --reason \"…\" themselves after reviewing the diff. If you are an AI agent, do not run --accept — surface this finding and stop. If this was not intended, revert — the shell was edited by accident.",
        clearableByAccept: true,
      });
    }
  }
  return findings;
}

function resolveScope(regionNode, rule) {
  if (!rule.within) return regionNode;
  return querySelector(regionNode, rule.within);
}

function textContent(node) {
  if (node.type === "text") return node.value;
  return (node.children ?? []).map(textContent).join("");
}

function checkRequirement(scope, requirement, basePath) {
  if (requirement.hasText) {
    const targets = querySelectorAll(scope, requirement.selector);
    if (!targets.length) return `no element matched "${requirement.selector}" to check its text`;
    const blank = targets.filter((target) => !textContent(target).trim());
    if (blank.length) return `${blank.length} × "${requirement.selector}" has no text`;
    return null;
  }
  if (requirement.attribute) {
    const targets = requirement.selector ? querySelectorAll(scope, requirement.selector) : [scope];
    if (!targets.length) {
      return `no element matched "${requirement.selector}" to check attribute "${requirement.attribute}" on`;
    }
    for (const target of targets) {
      const raw = getAttr(target, requirement.attribute);
      if (requirement.absent) {
        if (raw !== undefined) return `attribute "${requirement.attribute}" is present ("${raw}"), expected absent`;
        continue;
      }
      if (requirement.equals !== undefined && raw !== requirement.equals) {
        return `attribute "${requirement.attribute}" is "${raw}", expected "${requirement.equals}"`;
      }
      if (requirement.equalsUrl !== undefined) {
        const normalized = normalizeUrl(raw ?? "", basePath);
        if (normalized !== requirement.equalsUrl) {
          return `attribute "${requirement.attribute}" is "${raw}" (normalized "${normalized}"), expected "${requirement.equalsUrl}"`;
        }
      }
    }
    return null;
  }
  const count = querySelectorAll(scope, requirement.selector).length;
  const expected = requirement.count ?? 1;
  if (count !== expected) return `expected ${expected} × "${requirement.selector}", found ${count}`;
  return null;
}

function checkProhibition(scope, prohibition) {
  const hits = querySelectorAll(scope, prohibition.selector);
  if (hits.length) return `found ${hits.length} × "${prohibition.selector}" — ${prohibition.reason}`;
  return null;
}

/**
 * Tier 3 — the chrome must satisfy rules derived from what it is *for*,
 * independent of what it currently is. No escape hatch: regenerating the
 * golden cannot make a broken search form correct again.
 */
export function checkStructure(pages, regions, rules, { basePath = "" } = {}) {
  const findings = [];
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  for (const rule of rules) {
    if (!regionsById.has(rule.region)) {
      findings.push({
        kind: "chrome/structure",
        id: `${rule.id}.unknown-region`,
        detail: `rule "${rule.id}" names region "${rule.region}", which is not declared in chrome-regions.json`,
        clearableByAccept: false,
      });
      continue;
    }
    for (const page of pages) {
      const regionNode = page.found[rule.region];
      if (!regionNode) continue;
      const scope = resolveScope(regionNode, rule);
      if (!scope) {
        findings.push({
          kind: "chrome/structure",
          id: rule.id,
          route: page.route,
          detail: `scope "${rule.within}" was not found inside region "${rule.region}"`,
          remedy: rule.remedy,
          source: rule.source,
          found: serialize(regionNode),
          clearableByAccept: false,
        });
        continue;
      }
      const problems = [
        ...(rule.require ?? []).map((r) => checkRequirement(scope, r, basePath)),
        ...(rule.forbid ?? []).map((f) => checkProhibition(scope, f)),
      ].filter(Boolean);
      for (const detail of problems) {
        findings.push({
          kind: "chrome/structure",
          id: rule.id,
          route: page.route,
          detail,
          remedy: rule.remedy,
          source: rule.source,
          found: serialize(scope),
          clearableByAccept: false,
        });
      }
    }
  }
  return findings;
}

export async function readGolden(cwd) {
  return loadOptionalJSON(path.join(cwd, GOLDEN_FILE));
}

export async function writeGolden(cwd, pages, regions, { reason } = {}) {
  const record = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ...(reason ? { acceptedReason: reason, acceptedAt: new Date().toISOString() } : {}),
    regions: {},
  };
  for (const region of regions) {
    const page = pages.find((p) => p.found[region.id]);
    if (!page) continue;
    const canon = canonicalize(page.found[region.id], goldenOptions(region));
    record.regions[region.id] = { hash: hashCanonical(canon), route: page.route, tree: canon };
  }
  await writeFile(path.join(cwd, GOLDEN_FILE), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

/** Run tiers 1-3 (region presence, consistency, golden, structure) for a project. */
export async function runStructural(cwd, { routes, basePath = "" } = {}) {
  const config = await loadConfig(cwd);
  const routeFiles = routes ?? (await discoverRoutes(cwd));
  if (!routeFiles.length) {
    throw new Error(
      `No *.html routes found under ${cwd} (excluding node_modules/, vendor/, core-template/). Pass explicit paths if routes live elsewhere.`,
    );
  }
  const pages = await loadRoutePages(cwd, config.regions, routeFiles);
  const golden = await readGolden(cwd);

  const findings = [
    ...checkRegionsPresent(pages, config.regions),
    ...checkConsistency(pages, config.regions),
    ...checkGolden(pages, config.regions, golden),
    ...checkStructure(pages, config.regions, config.rules, { basePath }),
  ];
  return { config, pages, golden, findings };
}

export function explain(config) {
  const lines = [`canvas: ${config.canvas}`, "", "chrome regions:"];
  for (const region of config.regions) {
    lines.push(`  ${region.id.padEnd(14)} ${region.selector}`);
    if (region.ignoreChildrenOf?.length) {
      lines.push(`  ${" ".repeat(14)} (tier 2 ignores children of ${region.ignoreChildrenOf.join(", ")})`);
    }
    if (region.ignoreTextOf?.length) {
      lines.push(`  ${" ".repeat(14)} (tier 2 ignores the text of ${region.ignoreTextOf.join(", ")}; tier 1 still compares it)`);
    }
  }
  lines.push("", `structural rules (tier 3): ${config.rules.length}`);
  for (const rule of config.rules) {
    lines.push(`  ${rule.id} — region "${rule.region}"${rule.within ? `, within "${rule.within}"` : ""}`);
  }
  if (!config.manifestFound) {
    lines.push("", "note: no decorator-kit.json here — using the default canvas main#main-content.");
  }
  return lines.join("\n");
}
