import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MEMORY_FILE_WARN_CHARS, ON_DEMAND_FILE, TARGETS, renderRuleFiles } from "../scripts/lib/rules.mjs";

// The rule files load in full in every session; DECORATOR.md is read only when
// one of them names the task in front of the agent. These tests hold the split
// to that: what a marker moves leaves a pointer behind, every pointer lands on
// a section, and the kit's own rules stay small enough to leave a project room.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Claude Code warns about a CLAUDE.md over MEMORY_FILE_WARN_CHARS, and a
// project's canvas rules compile into the same file. Past this, move detail
// that only some tasks need behind an on-demand marker instead of raising it.
const KIT_BUDGET = 25_000;

const POINTER = /^\*\*(.+), read this section in full in `DECORATOR\.md`\.\*\*$/;

let workdir;

before(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "decorator-kit-rules-test-"));
});

after(async () => {
  await rm(workdir, { recursive: true, force: true });
});

let fixtures = 0;
async function rulesDir(files) {
  const directory = path.join(workdir, `rules-${fixtures++}`);
  await mkdir(directory);
  for (const [name, source] of Object.entries(files)) await writeFile(path.join(directory, name), source);
  return directory;
}

async function render(files, options = {}) {
  const { outputs } = await renderRuleFiles({ rulesDir: await rulesDir(files), ...options });
  return outputs;
}

const rule = (title, body) => `---\ntitle: ${title}\n---\n\n${body}\n`;

/** `## ` and `### ` headings outside code fences. */
function headings(markdown) {
  let fenced = false;
  return markdown.split("\n").flatMap((line) => {
    if (/^ {0,3}(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced && /^(#{2,3}) (.+)$/.exec(line);
    return heading ? [{ level: heading[1].length, text: heading[2] }] : [];
  });
}

/** For every pointer in a rule file, the heading of the section it sits in. */
function pointedSections(markdown) {
  const lines = markdown.split("\n");
  return lines.flatMap((line, index) => {
    if (!POINTER.test(line)) return [];
    const heading = headings(lines.slice(0, index).join("\n")).at(-1);
    return [heading.text];
  });
}

describe("on-demand markers", () => {
  it("keep what sits above them in every rule file and move the whole section to DECORATOR.md", async () => {
    const outputs = await render({
      "00-alpha.md": rule(
        "Alpha",
        [
          "## Kept whole",
          "",
          "Always true.",
          "",
          "## Split",
          "",
          "The short rule.",
          "",
          "<!-- on-demand: before you do the thing. -->",
          "",
          "The measured detail.",
          "",
          "## Moved",
          "",
          "<!-- on-demand: when it breaks -->",
          "",
          "Only detail.",
        ].join("\n"),
      ),
    });

    for (const { file } of TARGETS) {
      const compiled = outputs.get(file);
      assert.match(compiled, /### Kept whole\n\nAlways true\.\n/, file);
      assert.ok(
        compiled.includes(
          "### Split\n\nThe short rule.\n\n**Before you do the thing, read this section in full in `DECORATOR.md`.**",
        ),
        `${file}: the text above the marker stays, and a pointer replaces the rest`,
      );
      assert.ok(compiled.includes("### Moved\n\n**When it breaks, read this section in full in `DECORATOR.md`.**"), file);
      assert.doesNotMatch(compiled, /measured detail|Only detail|<!--\s*on-demand/, `${file}: nothing below a marker, and no marker`);
    }

    const reference = outputs.get(ON_DEMAND_FILE);
    assert.ok(reference.includes("## Alpha\n\n### Split\n\nThe short rule.\n\nThe measured detail.\n"));
    assert.ok(reference.includes("### Moved\n\nOnly detail.\n"));
    assert.doesNotMatch(reference, /Kept whole|<!--\s*on-demand/);
  });

  it("move the rest of the rule when the marker sits above its first section", async () => {
    const outputs = await render({
      "00-beta.md": rule(
        "Beta",
        ["Run it first.", "", "<!-- on-demand: before you start -->", "", "Why it exists.", "", "## Step one", "", "Do this."].join(
          "\n",
        ),
      ),
    });

    const compiled = outputs.get("CLAUDE.md");
    assert.ok(compiled.includes("## Beta\n\nRun it first.\n\n**Before you start, read this section in full in `DECORATOR.md`.**"));
    assert.doesNotMatch(compiled, /Why it exists|Step one/);
    assert.ok(outputs.get(ON_DEMAND_FILE).includes("## Beta\n\nRun it first.\n\nWhy it exists.\n\n### Step one\n\nDo this.\n"));
  });

  it("are not markers inside a code fence", async () => {
    const fence = ["```md", "<!-- on-demand: not a marker -->", "```"].join("\n");
    const outputs = await render({ "00-gamma.md": rule("Gamma", `## Sample\n\n${fence}`) });

    assert.ok(outputs.get("CLAUDE.md").includes(`### Sample\n\n${fence}`));
    assert.doesNotMatch(outputs.get(ON_DEMAND_FILE), /Sample/);
  });

  it("are refused without a trigger, across two lines, or twice in one section", async () => {
    const cases = {
      "no trigger": "## A\n\nx\n\n<!-- on-demand -->\n\ny",
      "empty trigger": "## A\n\nx\n\n<!-- on-demand: -->\n\ny",
      "two lines": "## A\n\nx\n\n<!-- on-demand: before you\ncopy it -->\n\ny",
      "twice": "## A\n\n<!-- on-demand: before one -->\n\nx\n\n<!-- on-demand: before two -->\n\ny",
      "rule and section": "Intro.\n\n<!-- on-demand: before one -->\n\n## A\n\n<!-- on-demand: before two -->\n\ny",
    };
    for (const [name, body] of Object.entries(cases)) {
      await assert.rejects(render({ "00-bad.md": rule("Bad", body) }), /on-demand|marker/, name);
    }
  });

  it("are refused when two rules move sections with the same heading", async () => {
    const moved = "## Same\n\n<!-- on-demand: before you look -->\n\nDetail.";
    await assert.rejects(
      render({ "00-one.md": rule("One", moved), "10-two.md": rule("Two", moved) }),
      /rules\/00-one\.md and rules\/10-two\.md both move "Same"/,
    );
  });

  it("are refused in a project's canvas rules, which load in full every session", async () => {
    const canvasRulesDir = path.join(workdir, "canvas-rules-with-marker");
    await mkdir(canvasRulesDir);
    await writeFile(path.join(canvasRulesDir, "tables.md"), "# Tables\n\nShort.\n\n<!-- on-demand: before you add one -->\n\nLong.\n");
    await assert.rejects(
      render({ "00-alpha.md": rule("Alpha", "## A\n\nx") }, { canvasRulesDir }),
      /canvas-rules\/tables\.md: on-demand markers work only in the kit's own rules/,
    );
  });
});

describe("the kit's own rules", () => {
  let outputs;
  before(async () => {
    ({ outputs } = await renderRuleFiles({ rulesDir: path.join(ROOT, "rules") }));
  });

  it(`keep CLAUDE.md within ${KIT_BUDGET.toLocaleString("en-US")} characters`, () => {
    const size = outputs.get("CLAUDE.md").length;
    assert.ok(
      size <= KIT_BUDGET,
      `CLAUDE.md compiles to ${size} characters. Claude Code warns past ${MEMORY_FILE_WARN_CHARS} and a project's canvas rules ` +
        "compile into the same file, so move detail that only some tasks need behind an on-demand marker in rules/.",
    );
  });

  it("point only at sections DECORATOR.md has, and leave nothing there unpointed", () => {
    const reference = new Set(headings(outputs.get(ON_DEMAND_FILE)).map((heading) => heading.text));
    for (const { file } of TARGETS) {
      const pointed = pointedSections(outputs.get(file));
      assert.ok(pointed.length > 0, `${file} points at nothing`);
      for (const heading of pointed) assert.ok(reference.has(heading), `${file} points at "${heading}", which ${ON_DEMAND_FILE} lacks`);
    }

    // Each `###` section there is one a rule file sends agents to, unless the
    // rule it belongs to moved whole and the pointer names the rule.
    const pointed = new Set(pointedSections(outputs.get("CLAUDE.md")));
    let ruleMovedWhole = false;
    for (const { level, text } of headings(outputs.get(ON_DEMAND_FILE))) {
      if (level === 2) ruleMovedWhole = pointed.has(text);
      else assert.ok(ruleMovedWhole || pointed.has(text), `${ON_DEMAND_FILE} holds "${text}", which no rule file points at`);
    }
  });

  it("never import DECORATOR.md, which would load it in every session", () => {
    for (const [file, contents] of outputs) {
      assert.doesNotMatch(contents, /(^|\s)@DECORATOR\.md/, `${file} imports ${ON_DEMAND_FILE}`);
      assert.doesNotMatch(contents, /<!--\s*on-demand/, `${file} kept an on-demand marker`);
    }
  });
});
