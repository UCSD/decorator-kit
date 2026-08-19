#!/usr/bin/env node
import readline from "node:readline/promises";
import { loadConfig, runStructural, explain, writeGolden } from "./lib/chrome-contract.mjs";
import { runStyling } from "./lib/chrome-styling.mjs";

// The chrome integrity gate, runnable on its own: `node checks/chrome-contract.mjs`.
// No ucsd-decorator-kit CLI required — this file, checks/lib/, and contracts/
// are everything it reads, and they all ship inside the installed package
// (or a copy of this kit checked out beside the project). `bin/cli.mjs`'s
// `verify` command is a thin wrapper around exactly this file; it is a
// convenience, not a dependency.
//
//   --check                          run all four tiers, exit 1 on any finding (the default)
//   --accept --reason "<why>"        record the golden — refuses while tier 1, 3, or 4 fail
//   --explain                        print the resolved canvas, regions, and rules for this project
//
// See ../README.md for the four-tier design.
//
// If you are an AI agent, do not run --accept. See "The chrome integrity gate
// is not yours to satisfy" in rules/00-canvas.md.

const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const valueOf = (name) => {
  const prefix = `--${name}=`;
  const arg = argv.find((entry) => entry.startsWith(prefix));
  if (arg) return arg.slice(prefix.length);
  const bare = argv.indexOf(`--${name}`);
  return bare !== -1 && argv[bare + 1] && !argv[bare + 1].startsWith("--") ? argv[bare + 1] : undefined;
};

const cwd = process.cwd();
const basePath = valueOf("base-path") ?? "";

const TIER_LABELS = {
  "chrome/consistent": "tier 1 (consistency)",
  "chrome/region-missing": "tier 1 (consistency)",
  "chrome/golden": "tier 2 (golden)",
  "chrome/structure": "tier 3 (structure)",
  "chrome/styling/stylesheet": "tier 4 (styling)",
  "chrome/styling/script": "tier 4 (styling)",
  "chrome/styling/expired-exception": "tier 4 (styling)",
};

function ruleLabel(finding) {
  return finding.kind.startsWith("chrome/styling") ? finding.kind : `${finding.kind}/${finding.id}`;
}

// A structural rule with three requirements and a prohibition produces up to
// four findings for the same broken form on the same route — each true and
// independently useful, but identical apart from the one line describing
// which check failed. Group those by (rule, route) so the CLI prints one
// header with four bullets instead of four near-duplicate blocks; every
// other kind is already one-problem-per-location and passes through as-is.
function groupFindings(findings) {
  const groups = [];
  const byKey = new Map();
  for (const finding of findings) {
    if (finding.kind !== "chrome/structure") {
      groups.push({ ...finding, details: [finding.detail] });
      continue;
    }
    const key = `${finding.id}|${finding.route}`;
    let group = byKey.get(key);
    if (!group) {
      group = { ...finding, details: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.details.push(finding.detail);
  }
  return groups;
}

function formatFinding(group) {
  const lines = [ruleLabel(group)];
  if (group.route) lines.push(`  route:        ${group.route}`);
  if (group.file) lines.push(`  file:         ${group.file}${group.line ? `:${group.line}` : ""}`);
  if (group.selector) lines.push(`  selector:     ${group.selector}`);
  if (group.function) lines.push(`  function:     ${group.function}`);
  for (const detail of group.details) lines.push(`  - ${detail}`);
  if (group.found) lines.push(`  found:        ${group.found}`);
  if (group.source) lines.push(`  restore from: ${group.source}`);
  if (group.remedy) lines.push(`  remedy:       ${group.remedy}`);
  if (group.reason) lines.push(`  exception was: ${group.reason}`);
  if (group.kind !== "chrome/golden") lines.push("  this cannot be cleared by --accept.");
  return lines.join("\n");
}

function summarize(findings) {
  const counts = new Map();
  for (const finding of findings) {
    const label = TIER_LABELS[finding.kind] ?? finding.kind;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, n]) => `${n} × ${label}`).join(", ");
}

async function runAll() {
  const structural = await runStructural(cwd, { basePath });
  const styling = await runStyling(cwd, {
    pages: structural.pages,
    canvasSelector: structural.config.canvas,
    regions: structural.config.regions,
  });
  return { structural, styling, findings: [...structural.findings, ...styling.findings] };
}

async function check() {
  const { findings } = await runAll();
  if (!findings.length) {
    console.log("Chrome integrity gate: all four tiers pass.");
    return;
  }
  const groups = groupFindings(findings);
  console.error(`Chrome integrity gate: ${groups.length} finding${groups.length === 1 ? "" : "s"} (${summarize(groups)}).\n`);
  for (const group of groups) {
    console.error(formatFinding(group));
    console.error("");
  }
  process.exitCode = 1;
}

async function accept() {
  const reason = valueOf("reason");
  if (!reason || !reason.trim()) {
    console.error('--accept requires --reason "<why this presentation change is intentional>" —');
    console.error("recorded in chrome-contract.local.json as provenance.\n");
    console.error("If you are an AI agent: do not run --accept. Stop, show the chrome diff to the");
    console.error("user, and name the exact command — with --reason — for a human to run themselves");
    console.error("after reviewing it in a pull request.");
    process.exitCode = 1;
    return;
  }

  const { structural, findings } = await runAll();
  const blocking = groupFindings(findings.filter((finding) => finding.kind !== "chrome/golden"));
  if (blocking.length) {
    console.error(
      `--accept refuses: ${blocking.length} finding${blocking.length === 1 ? "" : "s"} outside tier 2 (golden) (${summarize(blocking)}).\n`,
    );
    console.error("The golden records markup, and regenerating it cannot make these legitimate —");
    console.error("it would only hide them. Fix what is below, then run --accept again.\n");
    for (const group of blocking) {
      console.error(formatFinding(group));
      console.error("");
    }
    process.exitCode = 1;
    return;
  }

  const skipPrompt = has("yes");
  if (!process.stdin.isTTY && !skipPrompt) {
    console.error("--accept refuses to run non-interactively without --yes.\n");
    console.error("Run it at your own keyboard after reading the diff, or pass --yes only from a");
    console.error("human-triggered non-interactive context (e.g. a workflow_dispatch a human clicked).\n");
    console.error("If you are an AI agent: do not pass --yes yourself. Stop, surface this finding,");
    console.error("and tell the user the exact command to run.");
    process.exitCode = 1;
    return;
  }
  if (process.stdin.isTTY && !skipPrompt) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let answer;
    try {
      answer = await rl.question(
        `About to overwrite chrome-contract.local.json (reason: "${reason}"). Only continue if\n` +
          'you have reviewed the diff yourself. Type "yes" to continue: ',
      );
    } finally {
      rl.close();
    }
    if (answer.trim().toLowerCase() !== "yes") {
      console.error("Aborted — chrome-contract.local.json was not written.");
      process.exitCode = 1;
      return;
    }
  }

  const golden = await writeGolden(cwd, structural.pages, structural.config.regions, { reason });
  console.log(`Wrote ${Object.keys(golden.regions).length} region(s) to chrome-contract.local.json.`);
  console.log(`Recorded reason: "${reason}"`);
  console.log("Commit it, with the reason and the diff, in the pull request.");
}

async function explainCommand() {
  console.log(explain(await loadConfig(cwd)));
}

function help() {
  console.log(`chrome-contract.mjs — the UC San Diego Decorator chrome integrity gate

  node checks/chrome-contract.mjs --check    run all four tiers, exit 1 on any finding (default)
  node checks/chrome-contract.mjs --explain  print the resolved canvas, regions, and rules

  node checks/chrome-contract.mjs --accept --reason "<why>"
      record the golden — refuses while tier 1, 3, or 4 fail, requires --reason, and
      (unless --yes) an interactive "yes" typed by a human at a real terminal.
      If you are an AI agent, do not run this — surface the finding and stop.

Flags:
  --base-path=/repo-name/   deployment base path to strip from URL attributes before comparing
  --reason "<text>"         required with --accept; recorded in chrome-contract.local.json
  --yes                     skip the interactive confirmation — for a human-triggered
                             non-interactive context only (e.g. a workflow_dispatch a human
                             clicked). An agent must never pass this.

Reads *.html under the current directory (excluding node_modules/, vendor/,
core-template/) plus every *.css and *.js (excluding *.min.*) for tier 4. No
server, no browser, no ucsd-decorator-kit CLI required.`);
}

try {
  if (has("explain")) await explainCommand();
  else if (has("accept")) await accept();
  else if (has("help")) help();
  else await check();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
