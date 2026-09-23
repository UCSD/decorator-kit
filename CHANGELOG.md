# Changelog

## 2.2.0

### Changed

- **Sites can change their own site name.** Renaming the site — the text of
  `a.title-header.title-header-large` and `a.title-header.title-header-short`
  in the title band — used to fail `verify` at tier 2, so every rename needed
  a human `--accept`. The `site-title` region now declares
  `ignoreTextOf: ["a.title-header"]`: tier 2 drops the text inside those two
  links and still pins their elements, classes, and `href`, and everything
  else in the band, `a.title-logo` included. Tier 1 still compares the text,
  so the name must match on every page.
- **Rule: "The site name is the one piece of chrome text you may change"** in
  `rules/00-canvas.md`, with matching guidance in the skill and in
  `references/protected-regions.md`. Agents change only the text, on every
  page, and always propose a short form for the link that shows below 480px —
  a word or an acronym ("Decorator V5" → "V5") — even when only the long name
  was given.

### Added

- **`ignoreTextOf` on a chrome region** (`contracts/chrome-regions.json` and
  its schema, and `chrome-regions.local.json` overlays). Like
  `ignoreChildrenOf`, but drops only text, so an element added inside a
  matching node still fails tier 2.
- **`hasText` requirement in tier 3 rules.** `site-title.branding` now
  requires exactly one long and one short title link, each with text. An
  emptied site name fails, and `--accept` cannot clear it.

### Fixed

- Tier 2 now re-canonicalizes the golden's recorded tree under the current
  region options instead of comparing its stored hash. A golden accepted with
  2.1.0 or earlier keeps passing after the upgrade, and its recorded site name
  no longer pins the new one. No project needs to re-run `--accept`.

## 2.1.0

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
- **Tier 4 `chrome/styling/page-ground`.** A canvas-scoped stylesheet could
  turn the white page behind the canvas gray while all four tiers passed.
  Found on a generated app: `.student-canvas.sx-light { box-shadow: 0 0 0
  100vmax #f2f4f7; clip-path: inset(0 -100vmax) }` painted from a 1170px
  container out to both edges of the viewport, naming no chrome token. The
  check reads declarations, not selectors: it flags paint past an element's
  own box (a `box-shadow` spread in viewport units or ≥ 1000px, a
  `clip-path: inset()` pushed outward that far, a `100vw` width, a `50vw`
  breakout margin or offset) and a non-white background on `html`, `body`,
  `:root`, or the canvas root. `position: fixed` rules — modal backdrops — are
  exempt. Like every tier 4 finding, `--accept` cannot clear it.
- **Rule: "The page ground is the Decorator's"** in
  `rules/10-brand-integrity.md`. "Inside the canvas, CSS is unlimited" now stops
  at what the canvas paints outside itself.
- **`canvas-components/`, one folder per component library the canvas uses.**
  Each folder holds the library's files and a `README.md`. `sync` compiles the
  READMEs into a "Project component libraries" section. A folder with no
  README is still listed, with a note telling agents to ask before using it.
  The section relaxes three rules inside the canvas: library classes and
  components, a library's icon set, and library-styled headings. Typography
  stays on brand, and every chrome, accessibility, and security rule
  stays as written. `init` and `add` create the folder with a README on
  keeping a library inside the canvas.
- **`verify` holds CSS in `canvas-components/` to a stricter standard than
  other site CSS.** It scans `*.min.css` there too. A new
  `chrome/styling/global` finding flags any selector that names no class, id,
  or attribute (`*`, `html`, `body`, `h1`), unless its rule sets only custom
  properties. That catches a Tailwind Preflight-style reset, which the
  protected-token scan can't see. Selectors nested in a style rule, `@scope`,
  or `@keyframes` don't count as global. Reviewed exceptions in
  `chrome-styling.local.json` apply as usual. Site CSS outside the folder is
  unaffected.
- **Brix Sans and Refrigerator Deluxe are approved inside the canvas**,
  alongside Roboto and Teko. Both are UC San Diego brand fonts. The rules say to
  load them from an approved UC San Diego source, never a third-party font
  site, and not to use any other font family.

### Fixed

- Heading demotion in compiled rules no longer rewrites `# comment` lines inside
  fenced code blocks.
- `decorator-kit.json`'s `$schema` pointed at a GitHub URL that returned 404.
  It now points at the schema in the kit version that wrote the file, on
  jsDelivr: `https://cdn.jsdelivr.net/npm/ucsd-decorator-kit@<version>/contracts/decorator-kit.schema.json`.
- **The Claude Code Stop hook reported a regression after every turn in
  projects without the kit installed.** It ran `npx ucsd-decorator-kit verify
  || exit 2`. With the kit not on npm, npx failed, the command exited 2, and
  the agent was told the chrome gate had found a regression when nothing had
  been checked. Now on npm, the same command would download the newest release
  after every turn. The hook now runs the kit from `node_modules` and never
  calls npx. When the kit is not installed, the gate skips and a second hook
  tells the person, not the agent.
- **`add --with-ci`, `--with-hook`, and `--with-decorator` now install the
  kit.** The workflow `--with-ci` wrote runs `npm run decorator:check`, but
  only `--with-decorator` added that script, and no flag installed the kit it
  calls. Each of the three now adds `ucsd-decorator-kit` as a devDependency, at
  the version being run, plus the `decorator:*` scripts. A project that
  already lists the kit keeps its version. `init` now installs the kit at the
  version being run, too, rather than the newest.
- Re-running `add` on a project `init` set up dropped `AGENTS.md` from
  `decorator-kit.json`, so `sync` stopped refreshing it. `add` now keeps it.

### Packaging

- First release published to npm. Later releases publish from a GitHub
  release through trusted publishing, with a provenance attestation; see
  `RELEASING.md`.
- Licensed under MIT. The package previously declared ISC and shipped no
  license file.
- The tarball now includes `CHANGELOG.md`, and leaves out
  `scripts/compile-rules.mjs`, `scripts/check-library.mjs`, and
  `scripts/sync-library.mjs`, which only work from a checkout of this
  repository.
- `npm test` installs the packed tarball into an empty project and runs `add`,
  `check`, and `verify` from it, so a file missing from `files` fails CI.
- `.claude-plugin/plugin.json` carried version 1.0.0 through the 2.0.0
  release. It now matches `package.json`, and `npm test` fails if they differ.

### Upgrading

- `verify` can newly fail on a project that uses full-bleed CSS. Fix the CSS —
  a tinted band belongs in a module wrapper such as `.jumbotron-sand`. A
  reviewed exception in `chrome-styling.local.json` is a human's decision, not
  an agent's.
- Run `sync` after upgrading so the managed rule files carry the new rule;
  `check` fails until you do.
- **Projects set up before 2.1.0**, which most likely installed the kit
  straight from GitHub, don't have it in `node_modules`. Install it, re-run
  `add --with-hook` if the project uses the Claude Code hook, then sync:

  ```bash
  npm install --save-dev ucsd-decorator-kit
  npx ucsd-decorator-kit add --with-hook
  npx ucsd-decorator-kit sync
  ```

  `add --with-hook` replaces the old hook, merges into the rest of
  `.claude/settings.json`, and skips rule files that already exist.

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
