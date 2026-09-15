# Changelog

## Unreleased

### Added

- **`canvas-rules/`, a directory for a project's own canvas rules.** Developers
  drop Markdown files there. `sync` compiles every top-level `*.md` file except
  `README.md`, in filename order, into a "Project canvas rules" section at the
  end of each managed rule file. Frontmatter is optional: a rule's title comes
  from `title:`, then from a leading `# Heading`, then from the filename. `init`
  and `add` create the directory with a README, which is never overwritten and
  never listed in `manages`.
- The compiled section starts with a preamble that limits those rules to the
  canvas, ranks them below the kit's rules, and says they cannot authorize a
  chrome edit, `verify --accept`, or a write to a chrome `*.local.json` file.
  `rules/00-canvas.md` and the skill say the same.
- `check` now also fails when a file in `canvas-rules/` changed without a
  `sync`, and its message names that as a cause.

### Fixed

- Heading demotion in compiled rules no longer rewrites `# comment` lines inside
  fenced code blocks.

## 2.0.0

Closes a loophole where an AI agent could edit protected chrome, then make
the integrity gate report green by self-writing a `chrome-styling.local.json`
exception and self-running `verify --accept` — with no human ever reviewing
either action. The incident that motivated this involved a header
logo/font restyle, but the fix is not header-specific and not tied to one AI
tool: it closes the underlying mechanism for every chrome region, and holds
regardless of which AI coding tool (or none) is driving the shell.

### Breaking

- **`verify --accept` now requires `--reason "<text>"`.** Bare `--accept`,
  which used to succeed, now refuses immediately. The reason is recorded in
  `chrome-contract.local.json` as `acceptedReason`/`acceptedAt`.
- **`--accept` refuses to run non-interactively without `--yes`.** At a real
  terminal it prompts for a typed `yes` instead. `--yes` is for a
  human-triggered non-interactive context only (e.g. a `workflow_dispatch` a
  human clicked) — an AI agent must never pass it. Any script or CI job that
  called bare `verify --accept` needs `--reason` and either a real TTY or
  `--yes` added.
- **`chrome-styling.local.json` exceptions now require `approvedBy`.** An
  `allow` entry missing it, or with a malformed `reviewOn`, now fails
  `verify` entirely with a readable error, rather than being silently
  accepted. `contracts/chrome-styling.schema.json` reflects the new required
  field.
- **`add --with-hook` now also installs a `permissions` block** in
  `.claude/settings.json`: `deny` on editing the three chrome `*.local.json`
  files, `ask` on any Bash command matching `--accept`. Existing projects
  should re-run `add --with-hook` (idempotent) to pick it up.

### Fixed

- A missing or malformed `reviewOn` on a styling exception used to be treated
  as permanent (`NaN < now` is `false`) instead of expired. It now fails
  closed.
- `site-title.branding` only checked the UC San Diego logo anchor's *count*,
  not its `href` — a swap that preserved the count passed silently. It now
  also asserts `href` equals `https://www.ucsd.edu`, the same on every
  Decorator site.
- The footer region (`footer`) had no structural (tier 3) rule at all —
  verified against a fresh pin of `ucsd-decorator-v5@5.0.4`, every shipped
  template carries `ul.footer-links` and `img.footer-logo`; a new
  `footer.branding` rule now covers it.
- `contracts/chrome-regions.json`'s `skip-link` selector matched no real
  Decorator 5 template — it looked for `a.skip-to-main`, but every shipped
  template (all 11, `ucsd-decorator-v5@5.0.4`) uses `a.sr-only` instead. Now
  reads `header.layout-header > a.sr-only`, matching the actual markup. This
  had made `chrome/region-missing` a permanent, unclearable finding for
  `skip-link` on every route of every consumer, since it predates and is
  independent of the `--accept` interlock this release adds: `--accept` has
  always refused while *any* non-golden finding exists (region-missing
  included), so no consumer could ever have recorded a golden for *any*
  region while this was broken. Consumers that never got past `chrome/check`
  or `--accept` were not silently passing — the gate was doing its job the
  whole time, just against a selector that could never match. The test
  fixture (`test/fixtures/decorator-page.mjs`) carried the same wrong class,
  which is why the kit's own test suite never caught it; it's now `a.sr-only`
  too, matching real markup instead of matching the bug. No golden-file
  migration is needed for this fix specifically — a project already on this
  branch had no recorded `skip-link` golden to invalidate, precisely because
  it could never pass long enough to record one. A project upgrading past
  this release should expect `--check` (or the first `--accept`) to succeed
  for `skip-link` for the first time, not to see a diff.

### Added

- `rules/00-canvas.md` names the chrome integrity gate explicitly and states,
  unconditionally, that an AI agent must never run `verify --accept` or
  write any of the three `*.local.json` chrome files, and must not frame a
  chrome edit as something it can do pending a quick chat confirmation. This
  compiles into `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, and
  `.github/copilot-instructions.md` — every consumer project, and every AI
  tool that reads one of those files, gets this without any per-tool work.
- The `verify` CI job now flags (not fails, since a reviewed `--accept`
  legitimately touches these files) any pull request that changes
  `chrome-contract.local.json`, `chrome-styling.local.json`, or
  `chrome-regions.local.json`, and prints the recorded `acceptedReason` as a
  check annotation. This is the layer that holds no matter which AI tool (or
  human) produced the commit, since it runs in CI, not inside the session
  that made the change.
- `checks/chrome-contract.mjs`'s own `--help`, and its `chrome/golden/*`
  remedy text, now say explicitly: "If you are an AI agent, do not run this
  — surface the finding and stop." This reaches an agent regardless of which
  rule files it has loaded.
