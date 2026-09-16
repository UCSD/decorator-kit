import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { decoratorPage } from "./fixtures/decorator-page.mjs";

// Every other test runs the kit from this checkout, where every file exists.
// A consumer runs it from the published tarball, which holds only what
// package.json `files` lets through. A path missing from that list passes the
// whole suite and breaks every project on the next `npx ucsd-decorator-kit` —
// so this packs the kit, installs the tarball into an empty project, and runs
// the installed copy.

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitPackage = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));

let workdir;
let packed;
let project;
let bin;

const exists = (target) => stat(target).then(() => true).catch(() => false);

async function npm(args, cwd) {
  const { stdout } = await execFileAsync("npm", args, {
    cwd,
    env: { ...process.env, npm_config_update_notifier: "false", npm_config_fund: "false", npm_config_audit: "false" },
  });
  return stdout;
}

async function run(args) {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, { cwd: project });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

before(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "decorator-kit-package-test-"));
  const [result] = JSON.parse(await npm(["pack", "--json", "--pack-destination", workdir], ROOT));
  packed = { tarball: path.join(workdir, result.filename), files: result.files.map((file) => file.path) };

  project = path.join(workdir, "consumer");
  await mkdir(project);
  await writeFile(path.join(project, "package.json"), `${JSON.stringify({ name: "consumer", private: true }, null, 2)}\n`);
  // The kit has no dependencies, so this never needs the registry.
  await npm(["install", "--save-dev", "--offline", packed.tarball], project);
  bin = path.join(project, "node_modules/.bin/ucsd-decorator-kit");
});

after(async () => {
  await rm(workdir, { recursive: true, force: true });
});

describe("published tarball", () => {
  it("ships everything the CLI and the chrome gate read at runtime", () => {
    for (const required of [
      "bin/cli.mjs",
      "scripts/lib/rules.mjs",
      "scripts/pin-decorator.mjs",
      "checks/chrome-contract.mjs",
      "checks/README.md",
      "contracts/chrome-regions.json",
      "contracts/chrome-styling.json",
      "contracts/ucsd-decorator-5.json",
      "contracts/decorator-kit.schema.json",
      "rules/00-canvas.md",
      "skills/ucsd-decorator/SKILL.md",
      "templates/claude-settings.json",
      "templates/decorator.yml",
      "templates/dependabot.yml",
      "templates/canvas-rules-README.md",
      "templates/canvas-components-README.md",
      "README.md",
      "CHANGELOG.md",
      "LICENSE",
    ]) {
      assert.ok(packed.files.includes(required), `${required} is missing from the tarball`);
    }
  });

  it("leaves out the kit's own generated rule files, publishing staging, and dev scripts", () => {
    // The root CLAUDE.md and AGENTS.md govern work on this repository. Shipped,
    // they would sit in node_modules looking like rules for the consumer.
    for (const excluded of [
      "CLAUDE.md",
      "AGENTS.md",
      ".cursorrules",
      "scripts/compile-rules.mjs",
      "scripts/check-library.mjs",
      "scripts/sync-library.mjs",
    ]) {
      assert.ok(!packed.files.includes(excluded), `${excluded} should not be in the tarball`);
    }
    for (const prefix of ["library/", "test/", ".github/", ".claude-plugin/"]) {
      assert.ok(!packed.files.some((file) => file.startsWith(prefix)), `${prefix} should not be in the tarball`);
    }
  });

  it("links the bin, so the decorator:* npm scripts resolve", async () => {
    const result = await run(["help"]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, new RegExp(`ucsd-decorator-kit ${kitPackage.version.replaceAll(".", "\\.")}`));
  });

  it("runs add, check, and the chrome gate from the installed copy", async () => {
    const added = await run(["add"]);
    assert.equal(added.code, 0, added.stderr);
    assert.equal(await exists(path.join(project, "CLAUDE.md")), true);
    assert.equal(await exists(path.join(project, ".claude/skills/ucsd-decorator/SKILL.md")), true);

    // The manifest's $schema points into this version's tarball on the CDN.
    const manifest = JSON.parse(await readFile(path.join(project, "decorator-kit.json"), "utf8"));
    const schemaPath = `contracts/decorator-kit.schema.json`;
    assert.equal(manifest.$schema, `https://cdn.jsdelivr.net/npm/${kitPackage.name}@${kitPackage.version}/${schemaPath}`);
    assert.ok(packed.files.includes(schemaPath));

    const checked = await run(["check"]);
    assert.equal(checked.code, 0, checked.stderr);

    await writeFile(path.join(project, "index.html"), decoratorPage("Home"));
    await writeFile(path.join(project, "about.html"), decoratorPage("About"));
    const accepted = await run(["verify", "--accept", "--reason", "initial baseline", "--yes"]);
    assert.equal(accepted.code, 0, accepted.stderr);
    const verified = await run(["verify"]);
    assert.equal(verified.code, 0, verified.stderr);
    assert.match(verified.stdout, /all four tiers pass/);
  });

  it("wires the decorator:* scripts and the Stop hooks to the installed copy", async () => {
    const declared = JSON.parse(await readFile(path.join(project, "package.json"), "utf8")).devDependencies;
    const added = await run(["add", "--with-ci", "--with-hook"]);
    assert.equal(added.code, 0, added.stderr);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(project, "package.json"), "utf8")).devDependencies,
      declared,
      "the kit the project installed is kept, not reinstalled",
    );

    // What the CI workflow runs.
    await npm(["run", "decorator:check"], project);
    await npm(["run", "decorator:verify"], project);

    // What Claude Code runs after each turn: `sh -c`, with CLAUDE_PROJECT_DIR set.
    const settings = JSON.parse(await readFile(path.join(project, ".claude/settings.json"), "utf8"));
    const [gate, notice] = settings.hooks.Stop[0].hooks.map((hook) => hook.command);
    const hook = async (command, dir) => {
      try {
        const { stderr } = await execFileAsync("sh", ["-c", command], { cwd: tmpdir(), env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
        return { code: 0, stderr };
      } catch (error) {
        return { code: error.code, stderr: error.stderr };
      }
    };

    assert.deepEqual(await hook(notice, project), { code: 0, stderr: "" }, "installed: nothing to tell the user");
    assert.equal((await hook(gate, project)).code, 0, "chrome intact: the agent is not woken");

    await writeFile(path.join(project, "about.html"), decoratorPage("About", { searchAsLink: true }));
    const regressed = await hook(gate, project);
    assert.equal(regressed.code, 2, "a chrome regression wakes the agent");
    assert.match(regressed.stderr, /chrome\/structure/);

    // A project where the kit is not installed: the gate stands down and the
    // user, not the agent, is told why.
    const bare = path.join(workdir, "no-kit");
    await mkdir(bare);
    assert.equal((await hook(gate, bare)).code, 0, "missing kit: the agent is not told of a regression");
    const missing = await hook(notice, bare);
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /not installed in this project/);
  });
});

describe("release metadata", () => {
  it("gives the Claude Code plugin the same version as the npm package", async () => {
    // Claude Code decides whether an installed plugin is out of date from this
    // field. Left behind on a release, plugin users never see the update.
    const plugin = JSON.parse(await readFile(path.join(ROOT, ".claude-plugin/plugin.json"), "utf8"));
    assert.equal(plugin.version, kitPackage.version, "bump .claude-plugin/plugin.json along with package.json");
  });
});
