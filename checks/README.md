# Adopting the chrome integrity gate

The reference implementation lives in the TritonAI site:

| File | Role |
|---|---|
| `scripts/lib/chrome-contract.mjs` | Region extraction, normalization, the three tier checks |
| `scripts/chrome-contract.mjs` | CLI — `--check`, `--accept`, `--explain` |
| `scripts/sync-decorator.mjs` | Pins the pristine templates, derives the selector contract |
| `test/chrome-contract.test.mjs` | Regression tests, including the replayed incident |
| `config/chrome-contract.json` | Tier 2 golden — full canonical trees plus verified hashes |
| `config/chrome-selectors.json` | Tier 3 derived rules |
| `config/chrome-selectors.local.json` | Tier 3 site-specific overlay |

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

**Make `--accept` refuse while tier 1 or tier 3 fails.** This is the load-bearing
part. Without it, an agent that trips tier 2 will regenerate the golden and
record its own regression as the new baseline.

See `skills/ucsd-decorator/references/canvas-contract.md` for the full rationale.
