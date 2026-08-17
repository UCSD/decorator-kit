# How Decorator is published, and what to depend on

## What exists today

| Channel | Status |
|---|---|
| `ucsd-decorator-v5` on npm | **The source of truth**, as of 2026-08-10. `5.0.4`. Ships `dist/` — templates, kitchen sink, widgets, CSS, and a current `base.min.js`. |
| `Decorator-V5.zip` on developer.ucsd.edu | Still the download the docs link to. **Not a source of truth** — behind the package on every file. |
| `github.com/UCSD/Decorator` | Exists. Gulp build. Branch-per-release; **no v5 tags.** |
| CSS/JS on `cdn.ucsd.edu/cms/decorator-5/` | Live, unversioned. Directory listing is 403. |
| Version manifest | None. `cdn.ucsd.edu/cms/decorator-5/version.json` returns 404. |

The npm package is new and changes what a consuming project should depend on;
the rest of this page was written before it existed and has been updated. What
it fixes: a version number, and a local file path for the CDN scripts, which no
other channel provides. What it does not fix: the version identity is a package
version matching no git tag, and the templates carry the same production drift
documented below.

## The gap, concretely

**Downstream can now tell which package it installed, and still cannot tell
which Decorator is live.** npm gives a number — `5.0.4` — but that number
corresponds to no git tag and to nothing the CDN advertises. The ZIP carries no
version marker at all. The CDN publishes no manifest. As of 2026-08,
`base.min.css` was last modified 2026-05-08 while the ZIP was cut 2026-07-22 —
already out of step, with no way for a consumer to detect it.

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

**Publishing to npm did not fix this.** `dist/templates/two-column.html` in
`ucsd-decorator-v5@5.0.4` carries the identical
`http://cdn.ucsd.edu/developer/decorator/5.0.2/img/…` path — an `http://` URL
under a `5.0.2` directory, shipped in a package versioned `5.0.4`. The package is
a newer build than the archive, but newer only in the ways noted below; the drift
away from what production serves is unchanged.

## What a consuming project should do today

Pin from npm, and only from npm. Read the registry metadata for
`ucsd-decorator-v5`, compare `version` and `dist.integrity` against a lockfile,
and extract `package/dist`. Take the HTML templates, the unminified `base.css`,
and `scripts/base.min.js`.

**Do not fall back to the ZIP.** It is tempting to keep it for when the registry
is unreachable, and the cost is not worth it. Measured 2026-08 against `5.0.4`:

- `scripts/base.min.js` in the archive is an 8,024-byte build stamped
  2023-01-26, containing no `toggleIdsAndClassesBasedOnScreenWidth`, no
  `.msearch`, and no `search-term-m`. The CDN serves 9,871 bytes with all three.
  A project that pinned it has a plausible-looking file on disk documenting the
  absence of the behavior that governs the drawer search.
- Every template and kitchen-sink page differs from the package: the current
  build has dropped the IE9 conditional blocks the archive still carries, and is
  reindented.
- The archive's own freshness is not a signal. It was re-cut 2026-07-22 and
  still ships 2023 contents.

What the switch does *not* cost is the chrome contract. Normalizing whitespace
and comments, the two `two-column.html` bodies are identical apart from one stray
space in demo copy, and every marker `contracts/ucsd-decorator-5.json` pins
occurs the same number of times in both. Rules derived from the archive hold
against the package unchanged.

If the registry is unreachable, read `cdn.ucsd.edu` and say that you did. That is
a worse source than a pinned file and a better one than a stale archive.

Keep the served CSS and JS pointed at the CDN. The pinned copy is for reference
and contract derivation, never for serving.

Renovate and Dependabot handle "constantly updated" once the dependency is in
`package.json`: an upstream release becomes a pull request with a diff. Keep a
scheduled check against the CDN as well, because a push to `UCSD/Decorator` or a
CDN deploy without an npm publish is invisible to Dependabot.

`tritonai-website/scripts/sync-decorator.mjs` is a working implementation;
`scripts/pin-decorator.mjs` in this kit is the dependency-free version.

## Recommendations for the Decorator maintainers

In order of leverage.

### 1. Rebuild or retire `Decorator-V5.zip`

Promoted to the top because it is the only item here that actively misleads
rather than merely omits. The archive is the download the documentation points
at, it was re-cut 2026-07-22 so it looks current, and it ships a `base.min.js`
from January 2023 that contains none of the runtime behavior the CDN serves. A
developer who follows the official instructions gets markup and script that
production does not use, with no signal that this is happening.

Either regenerate it from the same build that produces the package, or replace
the download link with the npm package and the CDN. Leaving a stale artifact at
the canonical URL is worse than having no download.

### 2. Tag v5 releases

`github.com/UCSD/Decorator` has four tags, all `v4.x`. Decorator 5 has no
release identity at all — the npm version is a number in a `package.json`, not a
point in history. Tagging is the prerequisite for the manifest below and costs
nothing.

### 3. Finish the npm package — done, with four things left

This was the top recommendation on this page and it shipped on 2026-08-10.
`ucsd-decorator-v5` now gives developers a semver signal and gives agents
templates *and scripts* at a local file path they can read offline, which is the
single change that stops DOM scraping. What remains:

- **`files` is unset.** `exports` narrows what can be imported, not what gets
  installed, so every consumer downloads 222 files and 17.5 MB — including
  `dist/vendor/fullcalendar-3.9.0/demos/` and `dist/vendor/modernizr/test/`.
  Those are third-party demo pages sitting in the same tree agents are told to
  read from. Adding `files` cuts the install and removes the hazard.
- **The version matches no tag.** `5.0.4` is the only version identity Decorator
  5 has, and it is a number in a `package.json` rather than a point in history.
  This makes recommendation 2 more urgent, not less — drive the package version
  from the release tag.
- **`5.0.3` was published and unpublished** on 2026-08-11. Fine during a
  shakedown; worth knowing as a reason for consumers to pin by version and
  integrity rather than float on `latest`.
- **The templates still carry the stale `5.0.2` logo path.** See "The gap,
  concretely" above. This one predates the package and was inherited from the
  build, not introduced by publishing.

Two smaller things now visible in the published metadata: the `exports` map has
no `"."` entry, so a bare `import "ucsd-decorator-v5"` throws rather than
resolving; and `prepack` runs `gulp build`, which means the tarball's contents
depend on the publisher's local toolchain rather than on a CI artifact.

### 4. Publish a CDN manifest

The cheapest of these, and it fixes the "which version is live" gap for every
consumer at once, including ones that are not Node projects.

```json
{
  "version": "5.5.0",
  "releasedAt": "2026-07-22T07:03:02Z",
  "assets": {
    "styles/base.min.css": { "sha384": "…", "bytes": 87766 }
  },
  "templates": "https://github.com/UCSD/Decorator/tree/v5.5.0",
  "package": "ucsd-decorator-v5@5.5.0"
}
```

At `https://cdn.ucsd.edu/cms/decorator-5/manifest.json`. Lets consumers pin
subresource integrity and lets any CI detect that the CDN moved. About twenty
lines in the existing gulp publish task.

### 5. Ship bare component fragments

The kitchen-sink pages are galleries wrapped in Decorator chrome. Every
agent-facing ruleset has to teach extraction heuristics — "find the
`.bs-example` wrapper, take only what is inside it" — and every heuristic is a
place to get it wrong.

Shipping `components/buttons/primary.html` as a standalone fragment removes the
heuristic entirely. Pair it with a `components.json` mapping component name to
fragment path, required CSS and JS, and accessibility notes.

### 6. An agent-facing index

`https://developer.ucsd.edu/llms.txt` pointing at the machine-readable sources
above. Small, and it is what redirects agents away from scraping documentation
chrome in the first place.

## Why this ordering

(3) has shipped, and it is the durable answer for developers and agents both.
That reorders everything else.

(1) is first because a stale artifact at the canonical download URL is worse
than an absent one: it does not fail, it answers wrong, and the developer has no
way to know. Everything else on this list is an omission, which a careful person
can work around.

(2) and (4) are hours each and fix the "no version identity" problem — a package
version matching no tag and no manifest is a number, not an identity. Once they
land, a consumer can answer "which Decorator am I running, and is it the one
production is serving?" without comparing file hashes. Today nobody can.

(5) and (6) reduce the amount of instruction an agent needs in order to get
markup right, which is the only reliable way to reduce how often it gets markup
wrong.
