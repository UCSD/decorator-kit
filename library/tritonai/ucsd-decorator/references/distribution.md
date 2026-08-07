# How Decorator is published, and what to depend on

## What exists today

| Channel | Status |
|---|---|
| `Decorator-V5.zip` on developer.ucsd.edu | The only supported download. 14.7 MB. |
| `github.com/UCSD/Decorator` | Exists. Gulp build. Branch-per-release; **no v5 tags.** |
| CSS/JS on `cdn.ucsd.edu/cms/decorator-5/` | Live, unversioned. Directory listing is 403. |
| npm package | None. |
| Version manifest | None. `cdn.ucsd.edu/cms/decorator-5/version.json` returns 404. |

## The gap, concretely

**Nothing downstream can tell which Decorator version it is running.** The ZIP
carries no version marker. The repo's `package.json` says `5.0.2`, which is
stale. The CDN publishes no manifest. As of 2026-08, `base.min.css` was last
modified 2026-05-08 while the ZIP was cut 2026-07-22 — already out of step, with
no way for a consumer to detect it.

That gap is observable in the markup. The shipped ZIP template renders the
extra-small wordmark as:

```html
<img src="http://cdn.ucsd.edu/developer/decorator/5.0.2/img/ucsd-footer-logo-white.png" alt="" class="img-responsive header-logo" />
```

Live production pages render:

```html
<img alt="UC San Diego Logo" class="img-responsive header-logo" src="https://cdn.ucsd.edu/cms/decorator-5/styles/img/ucsd-footer-logo-white.png"/>
```

Different `alt`, different path, and `http://` versus `https://`. A developer
following the official download gets markup that production does not use, and
has no signal that this is happening.

## What a consuming project should do today

Pin a copy. Fetch the ZIP, extract only the HTML templates plus the unminified
`base.css`, and record the upstream `ETag`, `Last-Modified`, and archive
`sha256` in a lockfile as the version identity. Roughly 1 MB, fully reviewable
in a diff. Run a weekly job that re-checks the `ETag` and opens a pull request
when it moves.

Keep CSS and JS pointed at the CDN. The pinned copy is for reference and
contract derivation, never for serving.

`tritonai-website/scripts/sync-decorator.mjs` is a working implementation.

## Recommendations for the Decorator maintainers

In order of leverage. All four are additive; keep the ZIP for Cascade/CMS and
non-Node users.

### 1. Tag v5 releases

`github.com/UCSD/Decorator` has four tags, all `v4.x`. Decorator 5 has no
release identity at all. Tagging is the prerequisite for everything below and
costs nothing.

### 2. Publish to npm as `@ucsd/decorator`

Highest leverage for both audiences.

- Developers get `npm i -D @ucsd/decorator` and a semver signal — `5.5.1` versus
  `6.0.0` tells every consumer whether their chrome will break.
- Agents get templates at a **local file path** they can read offline. This is
  the single change that stops DOM scraping, because reading a file beats
  fetching a rendered page.
- Renovate and Dependabot then handle "constantly updated" automatically: an
  upstream release becomes a pull request with a diff in every consuming repo.

The existing `package.json` needs four fixes before it can ship:

- `name` is `Decorator-V5`. npm rejects uppercase in new package names — use
  `@ucsd/decorator`.
- `version` is `5.0.2` and stale; drive it from the release tag.
- `repository`, `bugs`, and `homepage` all point at `UCSD/cms-templates`, not
  `UCSD/Decorator`.
- No `files` or `exports`. Add both, so `npm publish` ships only the templates,
  kitchen sink, widgets, and CSS, with stable subpaths:
  `@ucsd/decorator/templates/two-column.html`.

The gulp build already produces the artifacts; this is a publish step, not a new
pipeline.

### 3. Publish a CDN manifest

Cheapest and most urgent, because it fixes the "which version is live" gap for
every consumer at once, including ones that are not Node projects.

```json
{
  "version": "5.5.0",
  "releasedAt": "2026-07-22T07:03:02Z",
  "assets": {
    "styles/base.min.css": { "sha384": "…", "bytes": 87766 }
  },
  "templates": "https://github.com/UCSD/Decorator/tree/v5.5.0",
  "package": "@ucsd/decorator@5.5.0"
}
```

At `https://cdn.ucsd.edu/cms/decorator-5/manifest.json`. Lets consumers pin
subresource integrity and lets any CI detect that the CDN moved. About twenty
lines in the existing gulp publish task.

### 4. Ship bare component fragments

The kitchen-sink pages are galleries wrapped in Decorator chrome. Every
agent-facing ruleset has to teach extraction heuristics — "find the
`.bs-example` wrapper, take only what is inside it" — and every heuristic is a
place to get it wrong.

Shipping `components/buttons/primary.html` as a standalone fragment removes the
heuristic entirely. Pair it with a `components.json` mapping component name to
fragment path, required CSS and JS, and accessibility notes.

### 5. An agent-facing index

`https://developer.ucsd.edu/llms.txt` pointing at the machine-readable sources
above. Small, and it is what redirects agents away from scraping documentation
chrome in the first place.

## Why this ordering

(1) and (3) are hours of work and fix the "no version identity" problem, which
is the one causing silent drift right now. (2) is the durable answer for
developers and agents both. (4) and (5) reduce the amount of instruction an
agent needs in order to get markup right, which is the only reliable way to
reduce how often it gets markup wrong.
