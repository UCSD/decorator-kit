import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { decoratorPage } from "./fixtures/decorator-page.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "bin/cli.mjs");

// The regression these tests exist for: `add` must never write AGENTS.md.
//
// The kit compiles its rules into four files, one of which is named AGENTS.md.
// That is also the conventional name for a repository's own agent contract —
// tritonai-website has one, tracked, 18 KB, and its CONTRIBUTING.md says in as
// many words not to copy the kit's over it. An install that clobbered it would
// replace a specific contract with a generic one and report success.
const CONTRACT = "AGENTS.md";

let workdir;

async function run(args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], {
      cwd: options.cwd ?? workdir,
      // Offline against an empty cache: an `npm install` the CLI starts fails
      // at once instead of reaching the registry. test/package.test.mjs covers
      // an install that succeeds.
      env: {
        ...process.env,
        npm_config_yes: "true",
        npm_config_offline: "true",
        npm_config_cache: path.join(workdir, "npm-cache"),
      },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

const exists = (target) => stat(target).then(() => true).catch(() => false);

before(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "decorator-kit-test-"));
});

after(async () => {
  await rm(workdir, { recursive: true, force: true });
});

describe("add", () => {
  it("never writes AGENTS.md into a project that has one", async () => {
    const project = path.join(workdir, "has-contract");
    await mkdir(project, { recursive: true });
    const ours = "# This repository's own agent contract\n\nDo not overwrite me.\n";
    await writeFile(path.join(project, CONTRACT), ours);

    const result = await run(["add"], { cwd: project });
    assert.equal(result.code, 0);

    assert.equal(await readFile(path.join(project, CONTRACT), "utf8"), ours);
    assert.match(result.stdout, /refused\s+AGENTS\.md/);
  });

  it("never writes AGENTS.md even when the project does not have one", async () => {
    // The dangerous case a "don't overwrite existing files" guard would miss:
    // tritonai-website has no CLAUDE.md and no .cursorrules, so a guard keyed on
    // existence would happily create both — and a repo whose contract is
    // AGENTS.md would end up with two competing rule sets at its root.
    const project = path.join(workdir, "no-contract");
    await mkdir(project, { recursive: true });

    const result = await run(["add"], { cwd: project });
    assert.equal(result.code, 0);

    assert.equal(await exists(path.join(project, CONTRACT)), false);
    assert.equal(await exists(path.join(project, "CLAUDE.md")), true);
  });

  it("refuses AGENTS.md under --force too", async () => {
    const project = path.join(workdir, "forced");
    await mkdir(project, { recursive: true });
    const ours = "# Mine\n";
    await writeFile(path.join(project, CONTRACT), ours);

    const result = await run(["add", "--force"], { cwd: project });
    assert.equal(result.code, 0);
    assert.equal(await readFile(path.join(project, CONTRACT), "utf8"), ours);
  });

  it("omits AGENTS.md from the manifest, so sync can never reach it", async () => {
    const project = path.join(workdir, "manifest");
    await mkdir(project, { recursive: true });
    await run(["add"], { cwd: project });

    const manifest = JSON.parse(await readFile(path.join(project, "decorator-kit.json"), "utf8"));
    assert.ok(!manifest.manages.includes(CONTRACT));
    assert.ok(manifest.manages.includes("CLAUDE.md"));
    assert.ok(manifest.manages.includes(".claude/skills/ucsd-decorator"));

    // Even if AGENTS.md appears later, sync operates on the manifest only.
    await writeFile(path.join(project, CONTRACT), "# Added afterwards\n");
    await run(["sync"], { cwd: project });
    assert.equal(await readFile(path.join(project, CONTRACT), "utf8"), "# Added afterwards\n");
  });

  it("writes the tool rule files and publishes the skill", async () => {
    const project = path.join(workdir, "installed");
    await mkdir(project, { recursive: true });
    await run(["add"], { cwd: project });

    for (const file of ["CLAUDE.md", ".cursorrules", ".github/copilot-instructions.md"]) {
      assert.equal(await exists(path.join(project, file)), true, `${file} should exist`);
    }
    assert.equal(await exists(path.join(project, ".claude/skills/ucsd-decorator/SKILL.md")), true);

    const claude = await readFile(path.join(project, "CLAUDE.md"), "utf8");
    assert.match(claude, /Generated by ucsd-decorator-kit@/);
    // The resolution order must name the package that actually exists.
    assert.match(claude, /node_modules\/ucsd-decorator-v5\/dist/);
    assert.doesNotMatch(claude, /@ucsd\/decorator/);
  });

  it("does not touch package.json or CI without being asked", async () => {
    const project = path.join(workdir, "untouched");
    await mkdir(project, { recursive: true });
    const original = JSON.stringify({ name: "existing", version: "1.0.0" }, null, 2);
    await writeFile(path.join(project, "package.json"), original);

    await run(["add"], { cwd: project });

    assert.equal(await readFile(path.join(project, "package.json"), "utf8"), original);
    assert.equal(await exists(path.join(project, ".github/dependabot.yml")), false);
    assert.equal(await exists(path.join(project, ".github/workflows/decorator.yml")), false);
    assert.equal(await exists(path.join(project, ".claude/settings.json")), false);
  });

  it("keeps AGENTS.md in the manifest of a project init set up", async () => {
    const project = path.join(workdir, "add-over-init");
    await mkdir(project, { recursive: true });
    await run(["add"], { cwd: project });
    const manifestPath = path.join(project, "decorator-kit.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.manages.push(CONTRACT);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const result = await run(["add", "--with-hook"], { cwd: project });
    assert.equal(result.code, 0);
    assert.ok(JSON.parse(await readFile(manifestPath, "utf8")).manages.includes(CONTRACT));
  });
});

// The workflow `--with-ci` writes runs `npm run decorator:check`, and the hook
// `--with-hook` writes runs node_modules/.bin/ucsd-decorator-kit. Neither works
// unless the kit is a devDependency and the scripts exist.
describe("add installs what its flags run", () => {
  for (const flag of ["--with-ci", "--with-hook", "--with-decorator"]) {
    it(`${flag} adds the decorator:* scripts and says how to install the kit when it cannot`, async () => {
      const project = path.join(workdir, `kit${flag}`);
      await mkdir(project, { recursive: true });
      await writeFile(path.join(project, "package.json"), JSON.stringify({ name: "site", version: "1.0.0" }, null, 2));

      const result = await run(["add", flag], { cwd: project });
      assert.equal(result.code, 0);

      const pkg = JSON.parse(await readFile(path.join(project, "package.json"), "utf8"));
      assert.equal(pkg.scripts["decorator:check"], "ucsd-decorator-kit check");
      assert.equal(pkg.scripts["decorator:verify"], "ucsd-decorator-kit verify");
      const version = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8")).version;
      assert.match(result.stdout, new RegExp(`npm install --save-dev ucsd-decorator-kit@${version.replaceAll(".", "\\.")}`));
    });
  }

  it("leaves a kit version the project already declares alone", async () => {
    const project = path.join(workdir, "kit-declared");
    await mkdir(project, { recursive: true });
    await writeFile(
      path.join(project, "package.json"),
      JSON.stringify({ name: "site", version: "1.0.0", devDependencies: { "ucsd-decorator-kit": "^2.0.0" } }, null, 2),
    );

    const result = await run(["add", "--with-ci"], { cwd: project });
    assert.equal(result.code, 0);

    const pkg = JSON.parse(await readFile(path.join(project, "package.json"), "utf8"));
    assert.equal(pkg.devDependencies["ucsd-decorator-kit"], "^2.0.0");
    assert.doesNotMatch(result.stdout, /Installing ucsd-decorator-kit/);
    assert.doesNotMatch(result.stdout, /is not installed here/);
  });
});

describe("add --with-hook", () => {
  it("writes a fresh .claude/settings.json with the Stop hook", async () => {
    const project = path.join(workdir, "hook-fresh");
    await mkdir(project, { recursive: true });

    const result = await run(["add", "--with-hook"], { cwd: project });
    assert.equal(result.code, 0);

    const settings = JSON.parse(await readFile(path.join(project, ".claude/settings.json"), "utf8"));
    assert.equal(settings.hooks.Stop.length, 1);
    const [gate, notice] = settings.hooks.Stop[0].hooks;
    assert.match(gate.command, /node_modules\/\.bin\/ucsd-decorator-kit verify \|\| exit 2/);
    assert.equal(gate.asyncRewake, true, "must background, not block the turn");
    assert.equal(notice.asyncRewake, undefined, "a missing install is the user's to fix, not the agent's");
    for (const hook of [gate, notice]) {
      assert.doesNotMatch(hook.command, /\bnpx\b/, "a hook must never fetch the kit from the registry");
    }
  });

  it("replaces the npx hook an earlier release installed, keeping the project's own hooks", async () => {
    const project = path.join(workdir, "hook-legacy");
    await mkdir(path.join(project, ".claude"), { recursive: true });
    const legacy = { type: "command", command: "npx ucsd-decorator-kit verify || exit 2", asyncRewake: true };
    const own = { type: "command", command: "npm run lint" };
    await writeFile(
      path.join(project, ".claude/settings.json"),
      JSON.stringify({ hooks: { Stop: [{ hooks: [legacy] }, { hooks: [own, { ...legacy }] }] } }, null, 2),
    );

    const result = await run(["add", "--with-hook"], { cwd: project });
    assert.equal(result.code, 0);

    const settings = JSON.parse(await readFile(path.join(project, ".claude/settings.json"), "utf8"));
    const commands = settings.hooks.Stop.flatMap((group) => group.hooks.map((hook) => hook.command));
    assert.ok(!commands.includes(legacy.command), "the legacy hook is gone from every group");
    assert.deepEqual(settings.hooks.Stop[0].hooks, [own], "the project's hook stays in its group");
    assert.equal(settings.hooks.Stop.length, 2, "the group that held only the legacy hook is removed");
    assert.equal(commands.filter((command) => /ucsd-decorator-kit verify/.test(command)).length, 1);
  });

  it("merges into an existing settings.json without disturbing unrelated content", async () => {
    const project = path.join(workdir, "hook-merge");
    await mkdir(path.join(project, ".claude"), { recursive: true });
    const original = {
      permissions: { allow: ["Bash(npm *)"] },
      hooks: { PostToolUse: [{ matcher: "Write|Edit", hooks: [{ type: "command", command: "prettier --write" }] }] },
    };
    await writeFile(path.join(project, ".claude/settings.json"), JSON.stringify(original, null, 2));

    const result = await run(["add", "--with-hook"], { cwd: project });
    assert.equal(result.code, 0);

    const settings = JSON.parse(await readFile(path.join(project, ".claude/settings.json"), "utf8"));
    assert.deepEqual(settings.permissions.allow, original.permissions.allow, "unrelated permissions preserved");
    assert.deepEqual(settings.hooks.PostToolUse, original.hooks.PostToolUse, "unrelated hook preserved");
    assert.equal(settings.hooks.Stop.length, 1, "the chrome gate hook was added alongside it");
  });

  it("also merges permission guards for the chrome *.local.json files and --accept", async () => {
    const project = path.join(workdir, "hook-permissions");
    await mkdir(project, { recursive: true });

    const result = await run(["add", "--with-hook"], { cwd: project });
    assert.equal(result.code, 0);

    const settings = JSON.parse(await readFile(path.join(project, ".claude/settings.json"), "utf8"));
    assert.ok(settings.permissions.deny.includes("Edit(chrome-styling.local.json)"));
    assert.ok(settings.permissions.deny.includes("Write(chrome-contract.local.json)"));
    assert.ok(settings.permissions.ask.includes("Bash(*--accept*)"));
  });

  it("is idempotent — running it twice does not duplicate the hook or permission rules", async () => {
    const project = path.join(workdir, "hook-idempotent");
    await mkdir(project, { recursive: true });

    await run(["add", "--with-hook"], { cwd: project });
    const second = await run(["add", "--with-hook"], { cwd: project });
    assert.equal(second.code, 0);
    assert.match(second.stdout, /already present/);

    const settings = JSON.parse(await readFile(path.join(project, ".claude/settings.json"), "utf8"));
    assert.equal(settings.hooks.Stop.length, 1);
    assert.equal(settings.permissions.deny.filter((rule) => rule === "Write(chrome-contract.local.json)").length, 1);
    assert.equal(settings.permissions.ask.filter((rule) => rule === "Bash(*--accept*)").length, 1);
  });

  it("is not installed by plain `add`, only under the flag", async () => {
    const project = path.join(workdir, "hook-opt-in");
    await mkdir(project, { recursive: true });

    const result = await run(["add"], { cwd: project });
    assert.equal(result.code, 0);
    assert.equal(await exists(path.join(project, ".claude/settings.json")), false);
    assert.match(result.stdout, /add --with-hook/);
  });

  it("fails clearly on a malformed existing settings.json rather than overwriting it", async () => {
    const project = path.join(workdir, "hook-malformed");
    await mkdir(path.join(project, ".claude"), { recursive: true });
    await writeFile(path.join(project, ".claude/settings.json"), "{ not valid json");

    const result = await run(["add", "--with-hook"], { cwd: project });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /settings\.json is not valid JSON/);
    assert.equal(await readFile(path.join(project, ".claude/settings.json"), "utf8"), "{ not valid json");
  });
});

describe("sync", () => {
  it("refreshes AGENTS.md when the manifest says it is managed (the init shape)", async () => {
    // `add` never puts AGENTS.md in the manifest, so build that shape directly
    // rather than paying for a real `init`, which installs real npm packages.
    const project = path.join(workdir, "init-shape");
    await mkdir(project, { recursive: true });
    await run(["add"], { cwd: project });

    const manifestPath = path.join(project, "decorator-kit.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.manages.push(CONTRACT);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    await writeFile(path.join(project, CONTRACT), "# stale\n");

    const result = await run(["sync"], { cwd: project });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /wrote\s+AGENTS\.md/);

    const agents = await readFile(path.join(project, CONTRACT), "utf8");
    assert.match(agents, /Generated by ucsd-decorator-kit@/);
    assert.doesNotMatch(agents, /# stale/);
  });
});

describe("init", () => {
  it("refuses to run in a directory that already looks like a project", async () => {
    const project = path.join(workdir, "existing-project");
    await mkdir(path.join(project, "src"), { recursive: true });

    const result = await run(["init"], { cwd: project });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /already looks like a project/);
    assert.match(result.stderr, /ucsd-decorator-kit add/);
    // It must bail before writing anything at all.
    assert.equal(await exists(path.join(project, "CLAUDE.md")), false);
    assert.equal(await exists(path.join(project, CONTRACT)), false);
  });
});

describe("check", () => {
  it("passes after add, fails once a managed file is edited, passes after sync", async () => {
    const project = path.join(workdir, "drifted");
    await mkdir(project, { recursive: true });
    await run(["add"], { cwd: project });

    assert.equal((await run(["check"], { cwd: project })).code, 0);

    const claude = path.join(project, "CLAUDE.md");
    await writeFile(claude, `${await readFile(claude, "utf8")}\nlocal edit\n`);

    const failed = await run(["check"], { cwd: project });
    assert.equal(failed.code, 1);
    assert.match(failed.stderr, /CLAUDE\.md/);

    await run(["sync"], { cwd: project });
    assert.equal((await run(["check"], { cwd: project })).code, 0);
  });

  it("notices a stale published skill", async () => {
    const project = path.join(workdir, "stale-skill");
    await mkdir(project, { recursive: true });
    await run(["add"], { cwd: project });

    await rm(path.join(project, ".claude/skills/ucsd-decorator/references/security.md"));

    const failed = await run(["check"], { cwd: project });
    assert.equal(failed.code, 1);
    assert.match(failed.stderr, /skills\/ucsd-decorator/);
  });

  it("errors when the project was never set up", async () => {
    const project = path.join(workdir, "never-added");
    await mkdir(project, { recursive: true });

    const result = await run(["check"], { cwd: project });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /decorator-kit\.json/);
  });
});

// canvas-rules/ is where a project's developers drop their own rules for the
// canvas. They must reach every tool's rule file, and they must arrive scoped:
// a Markdown file anyone can add is not a review, so the compiled section has to
// say it cannot authorize a chrome edit.
describe("canvas-rules", () => {
  it("add scaffolds canvas-rules/ with a README, never overwrites it, and never compiles it", async () => {
    const project = path.join(workdir, "canvas-scaffold");
    await mkdir(project, { recursive: true });

    await run(["add"], { cwd: project });
    const readme = path.join(project, "canvas-rules/README.md");
    assert.match(await readFile(readme, "utf8"), /inside the canvas/);

    await writeFile(readme, "# Ours\n\nThis project's own notes.\n");
    await run(["add"], { cwd: project });
    assert.equal(await readFile(readme, "utf8"), "# Ours\n\nThis project's own notes.\n");

    await run(["sync"], { cwd: project });
    assert.doesNotMatch(await readFile(path.join(project, "CLAUDE.md"), "utf8"), /^## Project canvas rules$/m);

    const manifest = JSON.parse(await readFile(path.join(project, "decorator-kit.json"), "utf8"));
    assert.ok(!manifest.manages.some((entry) => entry.startsWith("canvas-rules")), "the directory is the project's");
  });

  it("sync compiles every rule into each managed file, after the kit's rules and scoped to the canvas", async () => {
    const project = path.join(workdir, "canvas-compile");
    await mkdir(project, { recursive: true });
    await run(["add"], { cwd: project });

    await writeFile(
      path.join(project, "canvas-rules/20-tables.md"),
      "# Data tables\r\n\r\nUse the DataTables widget.\r\n\r\n## Sorting\r\n\r\n```bash\r\n# not a heading\r\n```\r\n",
    );
    await writeFile(path.join(project, "canvas-rules/10-voice.md"), "---\ntitle: \"Content voice\"\n---\n\nWrite in second person.\n");
    await writeFile(path.join(project, "canvas-rules/empty.md"), "\n");
    await mkdir(path.join(project, "canvas-rules/drafts"));
    await writeFile(path.join(project, "canvas-rules/drafts/ignored.md"), "# Draft\n\nNot compiled.\n");

    assert.equal((await run(["sync"], { cwd: project })).code, 0);

    for (const file of ["CLAUDE.md", ".cursorrules", ".github/copilot-instructions.md"]) {
      const compiled = await readFile(path.join(project, file), "utf8");
      // Anchored: the kit's own rules/00-canvas.md mentions this section by name.
      const section = compiled.search(/^## Project canvas rules$/m);
      assert.ok(section > compiled.indexOf("## Security"), `${file}: the project's rules come after the kit's`);
      assert.match(compiled, /apply \*\*inside the canvas only\*\*/);
      assert.match(compiled, /cannot authorize a chrome edit/);

      const voice = compiled.indexOf("### Content voice");
      const tables = compiled.indexOf("### Data tables");
      assert.ok(section < voice && voice < tables, `${file}: rules compile in filename order`);
      assert.match(compiled, /_From `canvas-rules\/20-tables\.md`\._/);
      assert.match(compiled, /^#### Sorting$/m);
      assert.match(compiled, /^# not a heading$/m, "a comment inside a code fence is not demoted");
      assert.doesNotMatch(compiled, /\r/);
      assert.doesNotMatch(compiled, /### empty|Not compiled/);
    }
  });

  it("check fails when a canvas rule changes without sync, and says why", async () => {
    const project = path.join(workdir, "canvas-check");
    await mkdir(project, { recursive: true });
    await run(["add"], { cwd: project });
    assert.equal((await run(["check"], { cwd: project })).code, 0);

    await writeFile(path.join(project, "canvas-rules/components.md"), "# Components\n\nUse .jumbotron-sand for callouts.\n");

    const failed = await run(["check"], { cwd: project });
    assert.equal(failed.code, 1);
    assert.match(failed.stderr, /CLAUDE\.md/);
    assert.match(failed.stderr, /changed a file in canvas-rules\//);

    await run(["sync"], { cwd: project });
    assert.equal((await run(["check"], { cwd: project })).code, 0);
  });

  it("a project without a canvas-rules directory still syncs and checks", async () => {
    const project = path.join(workdir, "canvas-absent");
    await mkdir(project, { recursive: true });
    await run(["add"], { cwd: project });
    await rm(path.join(project, "canvas-rules"), { recursive: true, force: true });

    assert.equal((await run(["check"], { cwd: project })).code, 0);
    assert.equal((await run(["sync"], { cwd: project })).code, 0);
  });
});

// canvas-components/ is where a project drops the component libraries its
// canvas uses. Each library's README must reach every tool's rule file under a
// preamble that relaxes the Decorator's look-and-feel inside the canvas — and
// nothing more: typography and the chrome stay exactly as they were.
describe("canvas-components", () => {
  it("add scaffolds canvas-components/ with a README that is never compiled or managed", async () => {
    const project = path.join(workdir, "components-scaffold");
    await mkdir(project, { recursive: true });
    await run(["add"], { cwd: project });

    assert.match(await readFile(path.join(project, "canvas-components/README.md"), "utf8"), /Brix Sans/);
    await run(["sync"], { cwd: project });
    assert.doesNotMatch(await readFile(path.join(project, "CLAUDE.md"), "utf8"), /^## Project component libraries$/m);
    const manifest = JSON.parse(await readFile(path.join(project, "decorator-kit.json"), "utf8"));
    assert.ok(!manifest.manages.some((entry) => entry.startsWith("canvas-components")));
  });

  it("sync compiles one section per library folder, before the project's canvas rules", async () => {
    const project = path.join(workdir, "components-compile");
    await mkdir(project, { recursive: true });
    await run(["add"], { cwd: project });

    await mkdir(path.join(project, "canvas-components/shadcn/dist"), { recursive: true });
    await writeFile(
      path.join(project, "canvas-components/shadcn/README.md"),
      "# shadcn/ui\n\nUse it for dialogs and forms.\n\n## Setup\n\nTailwind prefix `tw:`.\n",
    );
    await writeFile(path.join(project, "canvas-components/shadcn/dist/app.css"), ".tw\\:flex{display:flex}");
    await mkdir(path.join(project, "canvas-components/charts"), { recursive: true });
    await mkdir(path.join(project, "canvas-components/.cache"), { recursive: true });
    await writeFile(path.join(project, "canvas-components/notes.md"), "# Loose notes\n\nNot a library.\n");
    await writeFile(path.join(project, "canvas-rules/forms.md"), "# Forms\n\nUse the shadcn form components.\n");

    assert.equal((await run(["sync"], { cwd: project })).code, 0);

    for (const file of ["CLAUDE.md", ".cursorrules", ".github/copilot-instructions.md"]) {
      const compiled = await readFile(path.join(project, file), "utf8");
      const libraries = compiled.search(/^## Project component libraries$/m);
      assert.ok(libraries > compiled.indexOf("## Security"), `${file}: libraries come after the kit's rules`);
      assert.ok(libraries < compiled.search(/^## Project canvas rules$/m), `${file}: and before the project's canvas rules`);
      assert.match(compiled, /relax \*\*inside the canvas only\*\*/);
      assert.match(compiled, /\*\*Typography stays on brand: Roboto, Teko, Brix Sans, or Refrigerator Deluxe\.\*\*/);

      const charts = compiled.indexOf("### charts");
      const shadcn = compiled.indexOf("### shadcn/ui");
      assert.ok(libraries < charts && charts < shadcn, `${file}: one section per folder, in name order`);
      assert.match(compiled, /_Folder `canvas-components\/charts\/`\._\n\n_This folder has no usage notes\./);
      assert.match(compiled, /_From `canvas-components\/shadcn\/README\.md`\._/);
      assert.match(compiled, /^#### Setup$/m);
      assert.doesNotMatch(compiled, /Loose notes|\.cache/);
    }
  });

  it("check fails when a library is added without sync, and says why", async () => {
    const project = path.join(workdir, "components-check");
    await mkdir(project, { recursive: true });
    await run(["add"], { cwd: project });

    await mkdir(path.join(project, "canvas-components/charts"), { recursive: true });
    await writeFile(path.join(project, "canvas-components/charts/README.md"), "# Charts\n\nUse for dashboards.\n");

    const failed = await run(["check"], { cwd: project });
    assert.equal(failed.code, 1);
    assert.match(failed.stderr, /library in canvas-components\//);

    await run(["sync"], { cwd: project });
    assert.equal((await run(["check"], { cwd: project })).code, 0);
  });
});

// `verify` is a thin execFileSync wrapper around checks/chrome-contract.mjs —
// exercised directly and thoroughly in test/chrome-contract.test.mjs. These
// tests are about the wrapper itself: flag passthrough, exit-code
// propagation, and that it stays a distinct command from `check` (rule-file
// staleness) rather than colliding with it.
describe("verify", () => {
  it("passes flags through to checks/chrome-contract.mjs and propagates its exit code", async () => {
    const project = path.join(workdir, "verify-flow");
    await mkdir(project, { recursive: true });
    await writeFile(path.join(project, "index.html"), decoratorPage("Home"));
    await writeFile(path.join(project, "about.html"), decoratorPage("About"));

    const explained = await run(["verify", "--explain"], { cwd: project });
    assert.equal(explained.code, 0);
    assert.match(explained.stdout, /canvas: main#main-content/);

    const before = await run(["verify"], { cwd: project }); // default: --check
    assert.equal(before.code, 1);
    assert.match(before.stderr, /chrome\/golden/);

    const accepted = await run(["verify", "--accept", "--reason", "initial baseline", "--yes"], { cwd: project });
    assert.equal(accepted.code, 0);
    assert.equal(await exists(path.join(project, "chrome-contract.local.json")), true);

    const after = await run(["verify"], { cwd: project });
    assert.equal(after.code, 0);
    assert.match(after.stdout, /all four tiers pass/);
  });

  it("is a different command from `check` — one is rule-file staleness, the other is this project's own chrome", async () => {
    const project = path.join(workdir, "verify-vs-check");
    await mkdir(project, { recursive: true });
    await run(["add"], { cwd: project }); // makes `check` (rule-file staleness) pass
    await writeFile(path.join(project, "index.html"), decoratorPage("Home"));

    const checked = await run(["check"], { cwd: project });
    assert.equal(checked.code, 0, "rule files are current — check has nothing to do with page markup");

    const verified = await run(["verify"], { cwd: project });
    assert.equal(verified.code, 1, "the page's chrome has never been accepted — verify is a different question");
  });
});
