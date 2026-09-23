# The chrome integrity gate

Verifies that a Decorator project's actual built chrome — the header, nav,
mobile drawer, both search forms, footer — is still correct. This is not the
`ucsd-decorator-kit` CLI's own `check` command, which only verifies that
*this kit's generated rule files* (`CLAUDE.md` and friends) are current; see
the root [README](../README.md#staying-current) for that one. `verify` is the
command for this one.

It ships and runs entirely inside this kit — `checks/chrome-contract.mjs`,
`checks/lib/`, and the portable data in `contracts/` are everything it reads,
plus two files a project owns itself (below). No server, no browser, no build
step, and — despite the name of the CLI that wraps it — no dependency on the
`ucsd-decorator-kit` command either:

```bash
# however you got a copy of this kit onto disk —
# node_modules/ucsd-decorator-kit/ as a devDependency, or this repository
# checked out beside a project — this runs the same way:
node checks/chrome-contract.mjs --check     # exit 1 on any finding; wire into CI
node checks/chrome-contract.mjs --explain   # print the resolved canvas, regions, and rules

# --accept requires --reason, and a human's interactive "yes" (or --yes, for a
# human-triggered non-interactive context only — never an agent):
node checks/chrome-contract.mjs --accept --reason "<why this is intentional>"

# or, equivalently, through the kit's own CLI:
npx ucsd-decorator-kit verify
```

## Running it automatically

Two ways, and they answer different questions.

**CI** — `init`, or `add --with-ci`, writes a `verify` job into
`.github/workflows/decorator.yml` (see the root README's "Staying current").
Catches a regression on push or pull request. Cannot catch it before it ships
to a branch. On a pull request, this job also flags — as a check annotation,
not a failure, since a reviewed `--accept` legitimately touches these files —
any change to `chrome-contract.local.json`, `chrome-styling.local.json`, or
`chrome-regions.local.json`, printing the golden's recorded `acceptedReason`
so the reviewer sees it without opening the JSON diff. This is the layer that
catches a self-accepted chrome change no matter which AI tool — or human —
produced the commit, since it runs on GitHub's infrastructure, not inside
whatever session made the change.

**A Claude Code Stop hook, plus permission guards** — `init`, or
`add --with-hook`, merges two `Stop` hooks into `.claude/settings.json` (see
`templates/claude-settings.json`). The first runs `verify` after every turn,
from `node_modules/.bin/ucsd-decorator-kit`. It runs in the background —
`asyncRewake: true` — so it never blocks the turn from ending; if it finds a
regression, the agent is woken back up afterward with the findings fed back as
context, in the same turn that broke it, rather than waiting for CI or a human
to notice. The trigger is exit code 2, not `verify`'s own exit code 1, hence
the command ending `verify || exit 2`.

The hook never calls `npx`. In a project without the kit installed, npx would
download the newest release after every turn — and before the kit was on npm,
it failed, and the agent was told the gate had found a regression. Instead,
when the kit is missing the first hook exits 0 and the second prints a
non-blocking error saying so. That message goes to the person, because
installing a dependency is their call, not the agent's. `add --with-hook` also
installs the kit, and replaces the `npx ucsd-decorator-kit verify || exit 2`
hook earlier releases wrote.

The same template
also adds a `permissions` block: `deny` on editing the three chrome
`*.local.json` files, and `ask` on any Bash command matching `--accept` —
this only protects a project when the person working on it is using Claude
Code with this template installed; the CLI-level gate above is what has to
hold for everyone else.

`add --with-hook` merges into an existing `.claude/settings.json` rather than
overwriting it — a project may already have its own hooks or permissions in
that file — matching each entry by its own content so re-running `add` is
idempotent. It is not tracked in `decorator-kit.json`'s `manages` list, the
same as the CI workflow: install-once, not something `sync` reconciles.

## What's portable and what's project-owned

Four things ship inside this kit, and hold for any Decorator site unmodified:

| File | Role |
|---|---|
| `checks/chrome-contract.mjs` | CLI — `--check`, `--accept`, `--explain` |
| `checks/lib/chrome-contract.mjs` | HTML parsing, region extraction, normalization, tiers 1-3 |
| `checks/lib/chrome-styling.mjs` | Tier 4 — CSS/JS scanning, token derivation |
| `contracts/chrome-regions.json` | The six protected chrome regions, as CSS selectors |
| `contracts/ucsd-decorator-5.json` | Tier 3's structural require/forbid rules |
| `contracts/chrome-styling.json` | Tier 4's campus-widget ids and the (empty by default) exception list |

Two things are specific to the project running this, and neither lives in
this kit:

| File | Role |
|---|---|
| `decorator-kit.json`'s `canvas` field | The one writable region — `main#main-content` for a plain template, `div#ag-app-canvas` for the Antigravity Code Kit. Falls back to `main#main-content` if the file is absent. |
| `chrome-contract.local.json` | Tier 2's recorded golden — written by `--accept`, committed to the project, diffed against on every `--check`. |

A project whose chrome genuinely differs from the six default regions or the
default structural rules — an extra region, a site-specific rule — adds an
overlay rather than editing the kit's copy: `chrome-regions.local.json` and
`chrome-selectors.local.json` at the project root, same shape as the files
they overlay, entries merged in by matching `id`. `chrome-styling.local.json`
does the same for tier 4's widget tokens and exceptions. All three are
optional and absent by default.

## Why this used to say something different

Earlier versions of this file told you to go copy an implementation out of
`tritonai-website` and adapt it — on the reasoning that shipping one copy
here and letting every consuming project fork it would "recreate exactly the
drift problem the gate exists to prevent." That reasoning has it backwards: N
hand-ported copies, each starting from a fork of one downstream site's
version, is *how* you get drift, not how you avoid it. A shared implementation
that every project imports is the fix, the same reason `scripts/lib/rules.mjs`
exists in this kit instead of four copies of the rule renderer.

`tritonai-website` still runs its own, separately maintained
`scripts/chrome-contract.mjs` against 54 routes, with the same
`chrome:check`/`chrome:accept`/`chrome:explain` shape this section used to
send people to go copy — it is the design this engine was modeled on, not a
consumer of it. The two are unrelated in code: that project does not depend
on this package, and nothing here reads from or writes to its repository.
Adopting this engine there instead of its own would be that project's call to
make, not a side effect of anything shipped from here.

## Tier 4: site CSS and JS may not reach into the shell

Tiers 1-3 read markup. **Every chrome regression `tritonai-website` shipped to
production got past all three, because none of them changed a tag.** Three
were live at once:

1. Site CSS rebuilt the drawer search from scratch — navy panel, stacked flex
   form, rounded 42px controls, `.search-toggle { display: none }`. The rules
   were not breakpoint-scoped, so the drawer kept the custom look above 768px
   where the Decorator switches back to its own.
2. `#chat-bubble { … !important }` reshaped the TritonGPT launcher. The widget
   builds its own DOM after load, so no markup check can ever see it.
3. Site JS ran on `decorator-ready`, found the duplicate `id="search"` below
   768px, and called `removeAttribute("id")` on the drawer panel — immediately
   after `base.min.js` had assigned it. That is the id the Decorator's own
   stylesheet keys the mobile drawer layout on. Case 1 was written to paper
   over the collapse this caused.

`checks/lib/chrome-styling.mjs` implements all three checks below; this
section is what to know before changing it or writing an overlay.

**The protected token set is derived per run.** It is every class and id
appearing inside a chrome region on a built page and nowhere inside the
canvas. A Bootstrap primitive that a content component starts using drops out
automatically, with nobody editing a list. Hand-maintained token lists rot
into false positives and then get ignored.

**Campus-widget ids are the one hand-maintained part.** The widget's DOM never
reaches the markup, so it cannot be derived from it. `contracts/chrome-styling.json`
keeps ids only — widget class names include generic words like `.message` and
`.user` that a canvas component may legitimately own.

**Know what the derivation gives up.** Dropping shared tokens is what keeps the
check free of false positives, and it is also a hole: a bare
`.input-group { padding: 2px }` in a site stylesheet reaches into the drawer
search, and tier 4 will not flag it, because the canvas uses `.input-group` too.
The gate cannot close that one — a lint rule requiring every site selector to be
scoped under the canvas selector can, and the skill tells agents to write them
that way.

**CSS: any site selector that hits a protected token is flagged.** `[id="…"]`
and `[class~="…"]` are handled as tokens too, and quoted strings are stripped
*first*, so `a[href="#search"]` is not read as targeting `#search`. Selector
lists are split and each offending selector is reported separately. This is a
scanner, not a CSS parser — it needs selector text and a line number, not a
full parse — but it does track `@media`/`@supports` nesting correctly: the
at-rule's own prelude is never read as a selector, while what's inside it
still gets scanned.

**CSS in `canvas-components/` gets stricter checks.** That folder is where a
project drops the component libraries its canvas uses. A library's own reset
can reach the shell without naming a single chrome class: Tailwind's Preflight
zeroes every margin and list style on the page, header and footer included. So
every `*.css` file there is scanned, `*.min.css` included, and any selector
naming no class, id, or attribute (`*`, `html`, `body`, `h1`, `ul li`) is
flagged as `chrome/styling/global`.

Four cases don't count, which keeps the check from turning into noise:

- A rule that sets only custom properties passes, because the Decorator's CSS
  reads none.
- A selector nested inside a style rule, `@scope`, or `@keyframes` isn't global.
- `:host` only matches inside a shadow root.
- `:not(…)` does not count as anchoring.

Exceptions work the same as for any stylesheet finding. Site CSS outside the
folder isn't held to this: the gate never checked it, and turning the check on
there would fail existing projects on day one.

**JS: `removeAttribute("id")`, `setAttribute("id", …)`, and `.id =` are
flagged — but only in files that also reference a protected token.** Canvas
scripts assign ids to their own components constantly (a drawer component
giving each panel an id so its trigger can point `aria-controls` at it), and
that is not this rule's business. This half is a heuristic, not a parser: it
does not fully disambiguate a regex literal from division, so a regex
containing an unescaped brace placed right around an id mutation could in
principle confuse which function it blames. Real canvas interaction scripts
are short and rarely hit this.

**CSS: repainting the page ground is flagged too, with no token involved.**
Found after tier 4 was live: a canvas-scoped
`.student-canvas.sx-light { box-shadow: 0 0 0 100vmax #f2f4f7;
clip-path: inset(0 -100vmax) }` turned the white behind the canvas gray from
edge to edge of the viewport. Every selector in it belonged to the canvas, so
the token check had nothing to match. `chrome/styling/page-ground` reads
declarations instead, and flags two shapes:

- paint past the element's own box: a `box-shadow` length in viewport units or
  ≥ 1000px, a `clip-path: inset()` with an edge of that size pushed outward, a
  `100vw` width, or a `50vw` breakout margin or offset — on any selector,
  unless the same rule is `position: fixed` (a modal backdrop covers the
  viewport on purpose);
- a background other than white/transparent on the ground itself — a selector
  whose subject is `html`, `body`, `:root`, or the canvas root (its id from the
  canvas selector, or a bare `main` when the canvas is a `main`).

A background on anything *inside* the canvas is not flagged. Exceptions use the
same `allow` list, keyed by file and the rule's selector text.

**JS exceptions are keyed by enclosing function name, not source line.**
Reformatting a body must not silently drop an exception — and an anonymous
callback is not a usable key, so the nearest *named* enclosing function is
what gets blamed, walking outward past `forEach`/`addEventListener`
callbacks if it has to.

**Every exception carries a reason and a `reviewOn` date.** Past that date it
stops applying and reports itself as `chrome/styling/expired-exception` — a
one-time judgement call does not quietly become permanent. `allow` entries use
one field, `selector`, for both cases: the literal CSS selector text for a
stylesheet exception, or the string `function:<name>` for a script exception.

**`--accept` refuses while tier 4 fails, too** — and for a different reason
than tier 3. The golden records markup, and the markup is intact. Regenerating
it cannot make the rule legitimate, so accepting would only hide the finding.

**No rendered check yet.** Neither the markup nor the stylesheet shows whether
the drawer search actually *works* at both viewports — that needs a real
browser, which this kit does not currently take as a dependency. See
`skills/ucsd-decorator/references/protected-regions.md`'s "Verifying it"
section for what to check by hand (or by driving a browser yourself) until
this gate grows one: below 768px, with the drawer open, the panel must be
`#search`, laid out, and at least 49px tall; above it, hidden.

What the canvas contains is not covered by any of this. Styling and scripting
`main#main-content` is the entire point of the site; tier 4 only draws the line
at the shell — and at the page ground behind the canvas, which is part of it.

## The parts that are easy to get wrong

**Hash a canonical tree, not serialized HTML.** Attribute order, class-token
order, `<br/>` vs `<br>`, and comments all churn without meaning anything.
Serialized hashing turns every formatter run into a failure, and reports
"divergence at character 599" instead of naming a node. `canonicalize()` in
`checks/lib/chrome-contract.mjs` does this; `diffCanonical()` reports the first
divergence by node path.

**Normalize URLs through the deployment base path.** If a site builds under
both `/` and `/repo-name/`, an un-normalized `href` differs between them and the
same contract cannot pass in both. `--base-path=/repo-name/` covers this for
both tier 2's hashing and tier 3's `equalsUrl` requirement.

**Empty build-generated subtrees before hashing.** If navigation is rendered
from a data file, the `<ul>` is chrome but its `<li>` children are not — every
project has its own nav links, and tier 2 would otherwise fail the moment a
project added its first one. `contracts/chrome-regions.json` already declares
`ignoreChildrenOf` for the drawer's and navbar's nav-link lists, so this is
handled by default rather than something each project has to discover.

**Drop site-owned text, not the markup around it.** The site name in the title
band is the site's to set, but the two `a.title-header` links carrying it are
chrome. The `site-title` region declares `ignoreTextOf: ["a.title-header"]`:
tier 2 drops the text inside those links and keeps everything else, so a
rename passes without `--accept` while an added `<span>` or a changed `href`
still fails. Tier 1 compares the text, so every page must agree, and tier 3's
`hasText` requirement keeps either link from being emptied. Tier 2 also
re-canonicalizes the recorded tree under the current region options instead
of trusting its stored hash, so a golden accepted before a region gained an
ignore option keeps passing.

**Exclude routes that carry no chrome.** Standalone pages (a presentation deck,
a bare redirect) will otherwise report total chrome loss. `discoverRoutes`
only walks `*.html`; a route with no chrome markup at all needs to live
outside that walk, or a region-missing finding is expected and correct for it.

**`--accept` refuses while tier 1, 3, or 4 fails.** This is the load-bearing
part. Without it, an agent that trips tier 2 would regenerate the golden and
record its own regression as the new baseline.

**That interlock alone is necessary but not sufficient — it says nothing
about *who* is allowed to run `--accept` once it clears.** A presentation-only
chrome edit (a restyled header, a different logo, a swapped footer link) can
leave tiers 1, 3, and 4 all green while still being exactly the unauthorized
chrome edit the rules forbid. `--accept` closes that gap itself: it requires
`--reason "<text>"` (recorded as provenance in the golden), and it refuses to
run non-interactively unless `--yes` is passed — which is documented, in both
`--help` and `rules/00-canvas.md`, as being for a human-triggered
non-interactive context only, never for an agent to pass itself. A project
that installs the Claude Code template (`add --with-hook`) also gets a
`permissions` block denying edits to the three chrome `*.local.json` files
outright, and requiring explicit approval before any Bash command matching
`--accept` — on top of, not instead of, the CLI-level gate above, which holds
for any caller regardless of which AI tool (or none) is involved. A PR that
still changes one of those files gets flagged (not blocked) by the `verify`
CI job, which prints the recorded `acceptedReason`/`acceptedAt` as a check
annotation for the reviewer.

See `skills/ucsd-decorator/references/canvas-contract.md` for the full
rationale and the four-tier design.
