# UCSD Decorator Kit

The official agent-facing contract for building on the UC San Diego Decorator 5
design system.

## Getting started

Building a new UC San Diego site with an AI agent:

```bash
mkdir my-site && cd my-site
npx ucsd-decorator-kit@latest init
```

That installs `ucsd-decorator-v5` — the Decorator itself — plus this kit, writes
the rules in the format each AI tool reads, installs the skill, wires
Dependabot and a CI workflow, and — for Claude Code — adds a `Stop` hook that
runs the chrome integrity gate after every turn. It runs in the background and
only speaks up if it finds a regression: see
["Running it automatically"](checks/README.md#running-it-automatically).

Then open Claude Code, Cursor, Copilot or Antigravity in that directory and
describe the site you want. There is nothing to point the tool at: the rule files
sit at the project root, which is where all of them already look, and they name
`node_modules/ucsd-decorator-v5/dist/` as the source of truth for markup.

The agent will ask which layout to start from rather than picking one. That is
deliberate — choosing a template unasked is exactly the class of decision this
kit exists to prevent.

### Already have a project

```bash
npx ucsd-decorator-kit add
```

`add` installs the rules and the skill and touches nothing else. It does not
modify `package.json`, does not add CI, and **never writes `AGENTS.md`** — that
filename is also the convention for a repository's own agent contract, and yours
is the more specific document. Pass `--with-decorator` to add the Decorator
dependency, `--with-ci` for the Dependabot config and workflow, `--with-hook`
for the Claude Code Stop hook. The last one merges into an existing
`.claude/settings.json` rather than overwriting it, so a project's own hooks
and permissions survive.

### Staying current

| Command | Does |
|---|---|
| `npx ucsd-decorator-kit sync` | rewrite the generated files after a kit upgrade |
| `npx ucsd-decorator-kit check` | fail if they are stale — wire this into CI |
| `npx ucsd-decorator-kit drift` | report whether the Decorator moved upstream |
| `npx ucsd-decorator-kit verify` | run the chrome integrity gate against this project's actual markup — wire this into CI too |

Both `ucsd-decorator-v5` and `ucsd-decorator-kit` are devDependencies, so
Dependabot opens a pull request when either moves: the Decorator and the rules
update through one mechanism. `check` fails the build if a kit upgrade landed
without a `sync`, so a project cannot quietly run last year's rules.

`drift` covers the gap Dependabot cannot see — a push to `UCSD/Decorator` or a
`cdn.ucsd.edu` deploy with no npm release.

`check` and `verify` answer different questions and are easy to conflate: `check`
is about whether *this kit's generated rule files* are current, `verify` is
about whether *the project's built chrome* is still correct. `verify` needs
nothing this CLI doesn't already give it — `node checks/chrome-contract.mjs
--check` works standalone, with `--accept` and `--explain` alongside it. See
[`checks/README.md`](checks/README.md).

### Where markup comes from

`ucsd-decorator-v5` on npm is the source of truth. **`Decorator-V5.zip` is not**,
despite being the download the documentation links to: measured 2026-08, the
archive is behind the package on every file it ships, and its
`scripts/base.min.js` is a January 2023 build missing the runtime behavior that
governs the mobile drawer search. See
[`references/distribution.md`](skills/ucsd-decorator/references/distribution.md).

## The problem this solves

The Decorator shell is identical on every page of a site. That is the point of
it, and it is also why agent-authored changes to it are dangerous: a shell edit
propagates to every page at once, and it usually propagates away from the campus
standard rather than toward it.

Two real regressions motivated this kit:

- An agent deleted the mobile drawer's search **form** and replaced it with a
  **link** to the search page. Visually near-identical; functionally it drops
  the scope selector and the typed query and submits nothing to the hosted
  search API.
- An agent altered an embedded campus widget after reading the DOM it renders
  into.

Both happened under rules that already said "do not modify the header, nav, or
footer." Prose was not the missing piece.

Three more reached production after the markup gate was live, and **none of them
changed a tag**: site CSS rebuilt the drawer search, `#chat-bubble { …
!important }` reshaped the TritonGPT launcher, and site JS deleted an id the
Decorator assigns at runtime and styles the mobile drawer search through. A
markup contract cannot see any of that, which is why there is a fourth tier.

## What actually prevents it

Three things, in order of how much they matter.

**1. A source of truth that is a file, not a rendered page.** The rules tell
agents to fetch official documentation — but that documentation is itself
Decorator pages wrapped in chrome, so an agent following the rules faithfully
still ends up reconstructing markup from a DOM. Worse, Jasny Bootstrap clones
the offcanvas drawer into the body at runtime, so a live DOM contains navigation
markup that exists in no file at all. Pin the templates; read from disk.

**2. A named canvas.** One writable region per project. Everything else is
chrome, declared as a selector list that lives outside the markup it protects.
In-file `<!-- DO NOT EDIT -->` markers do not work — the agent you are defending
against can delete them too.

**3. A gate that fails the build, with an interlock.** Four tiers:

| Tier | Asks | Escape hatch |
|---|---|---|
| `chrome/consistent/*` | do all routes agree? | none needed |
| `chrome/golden/*` | does chrome match the recorded contract? | `--accept`, after a human reads the diff |
| `chrome/structure/*` | is it still a search form? | **none** |
| `chrome/styling/*` | does site CSS or JS reach into the shell? | **none** — a reviewed exception with an expiry date |

This is not a design to go implement — it ships, as `checks/chrome-contract.mjs`
and `checks/lib/`, reading `contracts/`. `npx ucsd-decorator-kit verify` runs it.

Tier 3 is the load-bearing one. When one shell feeds every route, a shell edit
is *perfectly consistent* drift — tier 1 stays green. Tier 2 fails, but its
remedy says "accept if intentional," and an agent that believes its own change
is intentional will do exactly that, rebaselining the regression. So
`--accept` **refuses to write while tier 3 fails**. That refusal is the
design.

Tier 4 exists because tiers 1–3 all read markup, and the shell can be wrecked
without touching any. Its protected token set is derived per run — every class
and id inside a chrome region and nowhere inside the canvas — so it tracks the
Decorator instead of a list someone has to remember to update. `--accept`
refuses while it fails too, for a different reason: the markup is intact, so
regenerating the golden would hide the finding rather than resolve it.

## Contents

```
bin/cli.mjs                  init / add / sync / check / drift / verify
rules/                       canonical rule source
skills/ucsd-decorator/       the skill — SKILL.md plus references
library/                     Skills Library publishing staging (see below)
templates/                   Dependabot config and workflow written into projects
scripts/lib/rules.mjs        the renderer, shared by the CLI and the compiler
scripts/compile-rules.mjs    rules/ -> CLAUDE.md, AGENTS.md, .cursorrules,
                             .github/copilot-instructions.md
scripts/check-library.mjs    validates library/ against the sync contract
scripts/pin-decorator.mjs    dependency-free Decorator pinning, npm only
contracts/                   portable chrome regions, selector rules, and
                             styling policy — each with a JSON schema
checks/                      the chrome integrity gate: chrome-contract.mjs
                             (CLI) and lib/ (tiers 1-4) — runs standalone,
                             `bin/cli.mjs verify` is a thin wrapper around it
test/                        including the AGENTS.md refusal and the replayed
                             chrome-regression incidents
```

`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, and `.github/copilot-instructions.md`
are **generated**. Edit `rules/` and run:

```bash
node scripts/compile-rules.mjs
```

`--check` verifies the committed output is current; `npm test` runs it along with
the library contract and the CLI tests.

## Using the skill without the CLI

**Claude Code** — install as a plugin (`/plugin marketplace add UCSD/decorator-kit`),
or copy `skills/ucsd-decorator/` into a project's `.claude/skills/`.

**Cursor, Copilot, Antigravity** — the compiled instruction files are picked up
automatically once present at the project root.

**Any tool that reads `AGENTS.md`** — read this repository's copy in place, in a
checkout beside your project. Do not copy it in: your repository's own
`AGENTS.md`, if it has one, is the more specific contract and the more important
of the two. `add` will not write that file for the same reason.

## Publishing to the TritonAI Skills Library

The public page at <https://tritonai.ucsd.edu/skills/index.html> is generated
from a Skills Library repository, synced by `tritonai-website` and rendered from
`content/skills/library.json`. Only paths matching
`<collection>/<name>/SKILL.md` are read — nothing deeper.

**Do not put this repository inside the Skills Library.** The sync only reads
`<collection>/<name>/SKILL.md` and nothing deeper, so a kit dropped at
`tritonai/ucsd-decorator-kit/` would leave the skill at
`.../skills/ucsd-decorator/SKILL.md` — two levels too deep, and invisible. The
kit is the upstream source; the Skills Library is one of its distribution
channels, alongside the Claude Code plugin and the generated IDE rule files.

`library/` holds the publish-ready shape:

```
library/tritonai/ucsd-decorator/SKILL.md   + references/  (published from skills/)
library/tritonai/ucsd-branding/SKILL.md    retirement pointer
```

`library/tritonai/ucsd-decorator/` is a **published copy** of
`skills/ucsd-decorator/`. Regenerate it with `npm run sync:library`;
`check:library` fails if the two have drifted, because a hand-maintained
duplicate is the same failure mode this kit exists to prevent.

`ucsd-branding` is the skill this one replaces. It is reduced to a pointer
rather than deleted, so anyone already invoking that slug is told where it went
instead of silently loading guidance that routes agents into rendered chrome.

Validate before publishing:

```bash
npm run check:library
```

It enforces exactly what the sync enforces — path shape, non-empty `name` and
`description`, name matching the directory, `maintainer` on community skills,
no duplicate names, and no nested `SKILL.md` files that would be silently
ignored.

Copy `library/tritonai/*` into the Skills Library repository to publish.

## The chrome integrity gate

`npx ucsd-decorator-kit verify` runs it against this project — four tiers,
described above, reading nothing but files on disk. It needs no CLI, either:
`node checks/chrome-contract.mjs --check` is the same thing, standalone, and
`checks/` ships inside the installed package. See
[`checks/README.md`](checks/README.md) for the full design, what's portable
versus project-owned, and tier 4's CSS/JS scanning in detail.

`tritonai-website` runs its own, separately maintained implementation of this
same four-tier design at 54-route scale — the project this engine was modeled
on, not a consumer of it. It does not depend on this package; nothing here
reads from or writes to that repository.

## Related

- [`skills/ucsd-decorator/references/distribution.md`](skills/ucsd-decorator/references/distribution.md)
  — how Decorator is published today, the version-identity gap, and what the
  maintainers should add
- [`chorta/antigravity-code-kit`](https://github.com/chorta/antigravity-code-kit)
  — the Antigravity starter this kit generalizes
- [`UCSD/Decorator`](https://github.com/UCSD/Decorator) — Decorator source
- <https://developer.ucsd.edu/design/decorator/> — official documentation
