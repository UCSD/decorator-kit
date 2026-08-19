# Changelog

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

### Known follow-up, tracked separately

- `contracts/chrome-regions.json`'s `skip-link` selector
  (`header.layout-header > a.skip-to-main`) does not match any real
  Decorator 5 template — every shipped template uses `a.sr-only` instead.
  Found while re-verifying markup for this release; not fixed here, since it
  is an unrelated, pre-existing correctness bug with its own consumer-impact
  question (every existing project has likely had a permanent, unclearable
  `chrome/region-missing` finding for `skip-link` on every route).
