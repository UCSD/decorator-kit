# Adopting the chrome integrity gate

The reference implementation lives in the TritonAI site:

| File | Role |
|---|---|
| `scripts/lib/chrome-contract.mjs` | Region extraction, normalization, the tier 1–3 checks |
| `scripts/lib/chrome-styling.mjs` | Tier 4 — CSS and JS scanning, token derivation, the exception list |
| `scripts/chrome-contract.mjs` | CLI — `--check`, `--accept`, `--explain` |
| `scripts/sync-decorator.mjs` | Pins the pristine templates, derives the selector contract |
| `test/chrome-contract.test.mjs` | Regression tests, including the replayed incident |
| `test/chrome-styling.test.mjs` | Tier 4 tests, including all three shipped styling regressions |
| `config/chrome-contract.json` | Tier 2 golden — full canonical trees plus verified hashes |
| `config/chrome-selectors.json` | Tier 3 derived rules |
| `config/chrome-selectors.local.json` | Tier 3 site-specific overlay |
| `config/chrome-styling.json` | Tier 4 widget tokens and reviewed exceptions |

This directory deliberately does **not** ship a fourth copy of that code.
Vendoring the same implementation into every consuming repo recreates exactly
the drift problem the gate exists to prevent. Copy it once, adapt it, and keep
your copy.

## What to change when you adopt it

Only two things are project-specific:

```js
export const CANVAS_SELECTOR = "main#main-content";

export const CHROME_REGIONS = [ /* your protected selectors */ ];
```

Everything else — normalization, hashing, diffing, the three tiers, the accept
interlock — is generic.

Start from `contracts/ucsd-decorator-5.json` for tier 3. Those rules pin
structure only, so they hold for any Decorator site. Put anything
site-specific (your search index URL, your scope options, ids your build
assigns) in a local overlay rather than editing the derived file.

Start from `contracts/chrome-styling.json` for tier 4. It carries the one part
of that tier which cannot be derived — the campus-widget ids — and nothing
site-specific.

## Tier 4: site CSS and JS may not reach into the shell

Tiers 1–3 read markup. **Every chrome regression `tritonai-website` shipped to
production got past all three, because none of them changed a tag.** Three were
live at once:

1. Site CSS rebuilt the drawer search from scratch — navy panel, stacked flex
   form, rounded 42px controls, `.search-toggle { display: none }`. The rules
   were not breakpoint-scoped, so the drawer kept the custom look above 768px
   where the Decorator switches back to its own.
2. `#chat-bubble { … !important }` reshaped the TritonGPT launcher. The widget
   builds its own DOM after load, so no markup check can ever see it.
3. Site JS ran on `decorator-ready`, found the duplicate `id="search"` below
   768px, and called `removeAttribute("id")` on the drawer panel — immediately
   after `base.min.js` had assigned it. That is the id the Decorator's own
   stylesheet keys the mobile drawer search on. Case 1 was written to paper over
   the collapse this caused.

Port `scripts/lib/chrome-styling.mjs` and its tests rather than re-deriving
them. The design points that matter:

**Derive the protected token set per run.** It is every class and id appearing
inside a chrome region on a built page and nowhere inside the canvas. A
Bootstrap primitive that a content component starts using drops out
automatically, with nobody editing a list. Hand-maintained token lists rot into
false positives and then get ignored.

**Campus-widget ids are the one hand-maintained part.** The widget's DOM never
reaches the markup, so it cannot be derived from it. Keep ids only — widget
class names include generic words like `.message` and `.user` that a canvas
component may legitimately own.

**Know what the derivation gives up.** Dropping shared tokens is what keeps the
check free of false positives, and it is also a hole: a bare
`.input-group { padding: 2px }` in a site stylesheet reaches into the drawer
search, and tier 4 will not flag it, because the canvas uses `.input-group` too.
The gate cannot close that one — a lint rule requiring every site selector to be
scoped under the canvas selector can, and the skill tells agents to write them
that way.

**CSS: flag any site selector that hits a protected token.** Handle
`[id="…"]` and `[class~="…"]` as tokens, and strip quoted strings *first*, so
`a[href="#search"]` is not read as targeting `#search`. Split selector lists and
report each offending selector separately. A scanner is enough — you need
selector text and a line number, not a CSS parse.

**JS: flag `removeAttribute("id")`, `setAttribute("id", …)`, and `.id =` — but
only in files that also reference a protected token.** Canvas scripts assign ids
to their own components constantly (a drawer component giving each panel an id
so its trigger can point `aria-controls` at it), and that is not this rule's
business.

**Key JS exceptions by enclosing function name, not source line.** Reformatting
a body must not silently drop an exception.

**Give every exception a reason and a `reviewOn` date.** Past that date it stops
applying and reports itself as `chrome/styling/expired-exception`. A one-time
judgement call should not quietly become permanent.

**`--accept` must refuse while tier 4 fails, too** — and for a different reason
than tier 3. The golden records markup, and the markup is intact. Regenerating
it cannot make the rule legitimate, so accepting would only hide the finding.

**Add a rendered check at both viewports.** Neither the markup nor the
stylesheet shows whether the drawer search actually works. Below 768px, with the
drawer open, the panel must be `#search`, laid out, and at least 49px tall;
above it, `#search-m` and hidden. Wait for
`window.toggleIdsAndClassesBasedOnScreenWidth` to be defined before measuring —
earlier than that you are reading the build's markup, not the rendered result.
`scripts/ux-agent/browser.mjs` in the reference implementation has it.

The canvas is not covered by any of this. Styling and scripting
`main#main-content` is the entire point of the site; tier 4 only draws the line
at the shell.

## The parts that are easy to get wrong

**Hash a canonical tree, not serialized HTML.** Attribute order, class-token
order, `<br/>` vs `<br>`, and comments all churn without meaning anything.
Serialized hashing turns every formatter run into a failure, and reports
"divergence at character 599" instead of naming a node.

**Normalize URLs through the deployment base path.** If your site builds under
both `/` and `/repo-name/`, an un-normalized `href` differs between them and the
same contract cannot pass in both. This applies to tier 3 selector rules too —
match on `equalsUrl`, not on a literal `[action='/search/index.html']`.

**Empty build-generated subtrees before hashing.** If navigation is rendered
from a data file, the `<ul>` is chrome but its `<li>` children are not.

**Exclude routes that carry no chrome.** Standalone pages (a presentation deck,
a bare redirect) will otherwise report total chrome loss.

**Make `--accept` refuse while tier 1, 3, or 4 fails.** This is the load-bearing
part. Without it, an agent that trips tier 2 will regenerate the golden and
record its own regression as the new baseline.

See `skills/ucsd-decorator/references/canvas-contract.md` for the full rationale.
