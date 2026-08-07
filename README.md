# UCSD Decorator Kit

The official agent-facing contract for building on the UC San Diego Decorator 5
design system.

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

**3. A gate that fails the build, with an interlock.** Three tiers:

| Tier | Asks | Escape hatch |
|---|---|---|
| `chrome/consistent/*` | do all routes agree? | none needed |
| `chrome/golden/*` | does chrome match the recorded contract? | `chrome:accept`, after a human reads the diff |
| `chrome/structure/*` | is it still a search form? | **none** |

Tier 3 is the load-bearing one. When one shell feeds every route, a shell edit
is *perfectly consistent* drift — tier 1 stays green. Tier 2 fails, but its
remedy says "accept if intentional," and an agent that believes its own change
is intentional will do exactly that, rebaselining the regression. So
`chrome:accept` must **refuse to write while tier 3 fails**. That refusal is the
design.

## Contents

```
skills/ucsd-decorator/       the skill — SKILL.md plus references
library/                     Skills Library publishing staging (see below)
rules/                       canonical rule source
scripts/compile-rules.mjs    rules/ -> CLAUDE.md, AGENTS.md, .cursorrules,
                             .github/copilot-instructions.md
scripts/check-library.mjs    validates library/ against the sync contract
scripts/pin-decorator.mjs    dependency-free template bootstrap
contracts/                   portable chrome selector rules + JSON schema
checks/                      how to adopt the gate
```

`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, and `.github/copilot-instructions.md`
are **generated**. Edit `rules/` and run:

```bash
node scripts/compile-rules.mjs
```

`--check` verifies the committed output is current; wire it into CI.

## Using the skill

**Claude Code** — install as a plugin, or copy `skills/ucsd-decorator/` into a
project's `.claude/skills/`.

**Cursor, Copilot, Antigravity** — the compiled instruction files are picked up
automatically once present at the project root.

## Publishing to the TritonAI Skills Library

The public page at <https://tritonai.ucsd.edu/skills/index.html> is generated
from a Skills Library repository, synced by `tritonai-website` and rendered from
`content/skills/library.json`. Only paths matching
`<collection>/<name>/SKILL.md` are read — nothing deeper.

`library/` holds the publish-ready shape:

```
library/tritonai/ucsd-decorator/SKILL.md   + references/
library/tritonai/ucsd-branding/SKILL.md    retirement pointer
```

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

## Reference implementation

`TritonAI/tritonai-website` runs the full gate against 54 routes in two
deployment modes. See `checks/README.md` for what to copy and what to adapt.

## Related

- [`skills/ucsd-decorator/references/distribution.md`](skills/ucsd-decorator/references/distribution.md)
  — how Decorator is published today, the version-identity gap, and what the
  maintainers should add
- [`chorta/antigravity-code-kit`](https://github.com/chorta/antigravity-code-kit)
  — the Antigravity starter this kit generalizes
- [`UCSD/Decorator`](https://github.com/UCSD/Decorator) — Decorator source
- <https://developer.ucsd.edu/design/decorator/> — official documentation
