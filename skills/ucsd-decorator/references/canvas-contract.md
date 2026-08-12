# The canvas contract

A Decorator project has one writable region. Everything else is chrome.

## Why a named canvas

The Decorator shell is identical on every page of a site. In a generated site
one shell file feeds every route; in a hand-authored site every page carries its
own copy. Either way, editing chrome to solve a content problem changes the
whole site, and usually moves it away from the campus standard.

Prose alone does not stop this — the incidents that motivated this kit all
happened under rules that already said "do not modify the header, nav, or
footer." What works is a boundary that is *named*, *machine-checkable*, and
*failing loudly* when crossed.

## Declaring the canvas

A project declares its canvas and its chrome regions in one config. The
reference implementation is `checks/chrome-contract.mjs` in this kit.

```js
export const CANVAS_SELECTOR = "main#main-content";

export const CHROME_REGIONS = [
  { id: "skip-link",     selector: "header.layout-header > a.skip-to-main" },
  { id: "emergency",     selector: "header.layout-header > #uc-emergency" },
  { id: "site-title",    selector: "header.layout-header > section.layout-title" },
  { id: "mobile-drawer", selector: ".navmenu.navmenu-default.navmenu-fixed-left.offcanvas:not(.offcanvas-clone)" },
  { id: "navbar",        selector: "nav.navbar.navbar-default.navbar-static-top" },
  { id: "footer",        selector: "footer.footer > div.container" },
];
```

Known canvases:

| Project | Canvas |
|---|---|
| Plain Decorator template | `main#main-content` |
| TritonAI site | `main#main-content` |
| Antigravity Code Kit | `div#ag-app-canvas` |

## Do not use in-markup markers

`<!-- CHROME:BEGIN -->` sentinels look appealing and do not work. They live in
the same file as the markup they protect, so the agent you are defending against
can delete them along with everything else. The boundary has to live outside the
file, in a selector list the build reads.

## Scoping regions correctly

Two traps, both real:

**Do not pin a region that legitimately varies.** A whole `footer.footer`
usually contains the trailing script block, whose `src` values are
depth-relative and carry per-page extras. Pin `footer.footer > div.container`
and cover the script tail with a separate ordered contract.

**Do not pin build-generated inner HTML.** If navigation is rendered from a data
file, the `<ul>` element is chrome but its `<li>` children are not. Empty those
subtrees before hashing, and let the data file's own validation cover the links.

## The four tiers

A single check is not enough, and the reason is specific.

**Tier 1 — cross-page consistency.** Every route's chrome must match every
other's. Catches a page edited in isolation.

**Tier 2 — golden fingerprint.** The shared chrome must match a recorded
contract. Catches a shell edit. Has an escape hatch — a human reviews the diff
and accepts it — because presentation changes are legitimate.

**Tier 3 — structural contract.** The chrome must satisfy selector rules derived
from the pristine Decorator template.

**Tier 4 — styling and scripting.** No site-authored stylesheet or script may
target the shell. Catches the regressions that leave the markup untouched.

Tier 3 is the one that cannot be dropped. Replay the actual incident: an agent
replaces the drawer search form with a link, in the one shell that feeds every
route. Tier 1 stays **green** — every page changed identically, so they are
perfectly consistent. Tier 2 fails, and its remedy line says "run
`chrome:accept` if this is intentional." The agent believes its own change is
intentional and runs it. The golden regenerates with the form gone, and the gate
has laundered the exact regression it was built to stop.

Tier 3 encodes what the chrome is *for*, independent of what it currently is,
and the accept command must **refuse to write while tier 3 is failing**. That
interlock is the design.

The split is: tier 2 governs presentation, where "a human read the diff" is a
sufficient control. Tier 3 governs function, where it is not.

Tier 4 is outside that split entirely, and this is why it had to be added.
Tiers 1–3 all read markup, and the three chrome regressions that reached
production after the gate was live changed no markup at all — they were CSS
overrides and a runtime JS mutation, and all three tiers passed them. `accept`
must refuse while tier 4 fails as well, for a reason unlike tier 3's: the markup
is intact, so regenerating the golden cannot make the rule legitimate. It would
only hide the finding.

Tier 4's protected token set should be **derived per run** — every class and id
appearing inside a chrome region and nowhere inside the canvas — not
hand-maintained. A hand-written list goes stale the first time a content
component picks up a Bootstrap primitive, and a check with known false positives
gets ignored. The exception is campus-widget ids: those elements are built after
load and never reach the markup, so nothing can derive them.
`contracts/chrome-styling.json` carries that list; `checks/README.md` has the
rest of the design.

## Normalization

Hash a canonical tree, not serialized HTML. Serialized hashing produces false
positives on attribute order, class-token order, void-element serialization
(`<br/>` vs `<br>`), and comments — all of which formatters and re-crawls churn
constantly. It also reports "first divergence at character 599" instead of
naming a node and an attribute, which is the difference between an agent that
can self-correct and one that guesses.

Normalize away: the deployment base-path prefix on URL attributes, `aria-current`,
volatile class tokens (`active`, `open`, `in`, `collapsed`), empty `class` and
`style`, comments, and whitespace. Keep non-empty `style` — that is meaningful.

Emit attributes as a sorted array of pairs, not an object: `JSON.stringify`
preserves object insertion order, which would put source attribute order right
back into the hash.

## Failure messages

The message is the interface an agent self-corrects through. It must carry:

1. the rule name,
2. the markup actually found,
3. the file to restore from,
4. and, for structural failures, the explicit line that regenerating the golden
   will not clear it.

Without (4), the most likely next action is the wrong one.
