---
name: ucsd-decorator
description: Build and edit UC San Diego web pages on the Decorator 5 design system without damaging the page chrome. Use when working on any ucsd.edu site, campus page shell, Decorator template, or kitchen-sink component — and specifically when a task touches the header, navbar, mobile offcanvas drawer, search forms, footer, or an embedded UCSD widget. Enforces one writable canvas, a pinned source of truth for markup, and a CI-checkable chrome contract.
---

# UC San Diego Decorator 5

The Decorator is the shared page shell for UC San Diego web properties. It is
the same on every page of a site: header, title band, navbar, mobile drawer,
footer. Only the content area differs.

That shared-ness is the whole problem this skill exists to solve. When an agent
edits chrome to make a content change fit, the change silently propagates to
every page of the site, and it usually propagates *away* from the campus
standard rather than toward it.

## The rule that matters most

**Never reconstruct Decorator markup from a rendered page, a browser
inspection, or memory. Read it from a file.**

Every real regression traced to this repository's rules came from an agent
reading a DOM and writing back what it saw. That fails for three separate
reasons:

1. **The rendered DOM is not the source markup.** The browser normalizes it,
   scripts mutate it, and serialization differs from what is in the file.
2. **The offcanvas drawer is cloned at runtime.** Jasny Bootstrap duplicates the
   mobile drawer into the body on load, so a live DOM contains navigation
   markup that exists in no file. An agent that "reads the nav" and writes it
   back produces duplicated, broken markup.
3. **Kitchen-sink pages are galleries wrapped in chrome.** Fetching
   `buttons.html` and copying what looks like a button gives you demo scaffolding
   (`.bs-example` wrappers, doc styling) fused into production markup.

So: resolve markup from a file, in this order.

| Order | Source | When |
|---|---|---|
| 1 | `node_modules/ucsd-decorator-v5/dist/…` | the package is installed |
| 2 | `vendor/decorator-5/…` (or the project's pinned copy) | a sync script pins it |
| 3 | `core-template/…` | Antigravity Code Kit layout |
| 4 | install or pin the package | nothing local exists |

If you reach step 4, do not fetch a page — run `npm i -D ucsd-decorator-v5` or
the project's pin script, and say that you had to.

**`Decorator-V5.zip` on developer.ucsd.edu is not a source of truth,** even
though the documentation still presents it as the download. Measured 2026-08
against `ucsd-decorator-v5@5.0.4`: every template and kitchen-sink page in the
archive differs from the package, still carrying IE9 conditional blocks the
current build has dropped, and its `scripts/base.min.js` is three years stale
(see "Styling and scripting"). The archive was re-cut 2026-07-22, so its
freshness is not a signal — a recent archive is shipping old contents.

That is the **on-disk path**, not the export specifier. The package declares
`exports`, so `ucsd-decorator-v5/templates/two-column.html` resolves for a
bundler — but you are reading files, not importing them, and the file is at
`node_modules/ucsd-decorator-v5/dist/templates/two-column.html`.

**Read only these paths inside the package.** It leaves `files` unset and so
ships 222 files, `dist/vendor/fullcalendar-3.9.0/demos/` and
`dist/vendor/modernizr/test/` among them. A search for something button-shaped
can land in a third-party demo page that is not Decorator markup.

| Want | Path under `node_modules/ucsd-decorator-v5/` |
|---|---|
| Layout templates and modules | `dist/templates/` |
| Component galleries | `dist/kitchen-sink/` |
| Widget reference pages | `dist/widgets/` |
| Readable stylesheet | `dist/css/base.css` |
| Runtime behavior | `dist/scripts/base.min.js` |

## The canvas

A Decorator project has exactly one writable region. Everything else is chrome.

| Project shape | Canvas |
|---|---|
| TritonAI site (`tritonai-website`) | `main#main-content` |
| Antigravity Code Kit | `div#ag-app-canvas` |
| Plain Decorator template | `main#main-content` |

Content, components, application logic, and generated markup go **inside the
canvas**. The header, title band, navbar, mobile offcanvas drawer, both search
forms, the footer, and any embedded campus widget are **outside** it, and are
not yours to edit.

If the project ships `npm run chrome:explain` (or `checks/chrome-contract.mjs
--explain`), run it — it prints the exact selectors for that project.

**If a task appears to require a chrome change, stop and say so.** Name the
region, explain why the task seems to need it, and let a human decide. Do not
reshape the shell so a content change fits.

That governs the *edit*, not the investigation — diagnose first. For styling
requests in particular, see "When you are asked to restyle the shell" below: the
cause is usually the site's own CSS, and stopping before you look means missing
it.

## Protected regions

These are the regions that break in practice. `references/protected-regions.md`
carries the verbatim markup for each; restore from there or from the vendor
template, never from recall.

- **Mobile drawer search.** A `<form>` with a `select.search-scope` and an
  `input.search-term`, inside `.search-content` in the offcanvas drawer. It is
  not a link. Replacing it with an anchor to the search page is the single most
  common regression: it looks equivalent, and it silently drops the scope
  selector and the typed query. Sites customize the `action` and the scope
  options; the form itself is not customizable. On a live Cascade CMS page its
  ids, term-input class, and term-input `name` are **rewritten at runtime
  across 768px** — see the worked example under Styling and scripting, and the
  breakpoint contract in `references/protected-regions.md`. The npm package's
  own template does not do this; see the next bullet.
- **Desktop navbar search.** A second, independent copy of the same block —
  not the drawer's search relocated by JS — inside `nav.navbar`'s
  `#navbar .navbar-collapse`. In the package template the two copies are
  identical (same ids, same `search-term` name); only Bootstrap's own
  collapse/offcanvas behavior decides which one is visible. Building the
  drawer's copy and treating it as covering both surfaces — easy to do, since
  the two blocks look redundant — removes the search button on every viewport
  above 768px, with nothing in the console to say so. On a live Cascade page
  the two forms' `name`s diverge instead (`search-term` desktop,
  `search-term-m` mobile) — changing either breaks the hosted search API with
  nothing visible on the page.
- **Mobile toggle.** `.mobile-nav-bars` (three `span.icon-bar`) and
  `.mobile-nav-icon` ("MENU") both live *inside* `button.navbar-toggle`. The
  MENU label is not a sibling.
- **Title band.** `.layout-title` is the white band inside `.layout-header`; the
  outer wrapper is `#2b92b9`. There is no gold rule on the white band.
- **Footer.** UC San Diego Blue `#00629b`, not navy.
- **Embedded campus widgets** (TritonGPT/AskTriton, emergency banner, hosted
  search, Today@UCSD). Load them verbatim from `cdn.ucsd.edu`. Do not inline,
  self-host, re-time, restyle, or reconfigure them. A project may defer loading
  in its own build; that is the project's code, not the widget's.

  **Restyling is the one that slips through.** A widget builds its own DOM after
  load, so its elements appear in no source file and no markup check can see
  them — but a site stylesheet can still reach them, and `!important` makes it
  stick. `#chat-bubble` is the TritonGPT launcher; reshaping it into a circle on
  phones clipped the "Ask TritonGPT" label in production. Load `tgpt-loader.js`
  and take what it renders.

## Building a page

**Never pick a template by default.** If the user has not named one, stop and
ask. Present the options:

- `blank-slate.html` — open canvas below the navbar
- `two-column.html` — left sub-navigation, canvas in the wider right column
- `three-column.html` — left menu, wide middle canvas, right info column
- `homepage.html` — carousel hero and callout modules

Copy the whole template to the project root under a new name, then work only
inside its canvas. Do not overwrite `index.html` unless asked.

**Then rewrite its `<link>`/`<script>` paths before touching anything else.**
The template ships pointed at its own location inside the package —
`../css/base.min.css`, `../scripts/base.min.js`, and so on — and those paths
keep resolving once the file is copied to the project root, because the same
`node_modules/` tree is sitting right there. That is exactly what makes it
easy to ship by accident: the page loads and looks almost right. Point every
one at the CDN instead — see "Asset stack" in `references/chrome-anatomy.md`
for the exact URLs — and never leave a page linking
`node_modules/ucsd-decorator-v5/…` for its CSS or JS. The vendored copy is for
reading. Its compiled `base.min.css` also has a live color defect the CDN copy
does not (see "The rest of the styling rules" below), so serving it doesn't
just break the rule, it visibly breaks the active nav state.

**`two-column.html` and `three-column.html` order their columns with
`pull-right`, not markup order.** Both put the wide canvas section first in the
file and the narrower nav/info section second, then push the first one to the
far side with `class="… pull-right"`. Nothing pulls the nav/info section — it
lands on the remaining side because the wide one no longer occupies it. Trim
the template's demo content down to real content and leave that class alone;
dropping it while cleaning up the wrapper is the single easiest way to
silently swap which side the canvas and the sub-nav render on.

## Components, widgets, and modules

**Components** (`kitchen-sink/*.html`) are galleries. Locate the one variation
requested — usually inside a `.bs-example` wrapper — and extract only that
block. Never copy a whole kitchen-sink file.

**Widgets** (`widgets/*.html` — DataTables, FullCalendar, Wizard, MaxChar) carry
dependencies. Read the reference file's `<head>` and the bottom of its `<body>`,
bring across the widget-specific `<link>` and `<script>` tags, fix the relative
paths for the new location, and move any inline initialization into a named file
under `js/`. Do not leave `$(document).ready(...)` inline.

**Modules** (`templates/modules.html` — callouts, rotators, news listings, video
embeds, contact blocks) are structural. Copy the wrapper, grid columns, and CSS
classes exactly; replace only text, image `src`/`alt`, and link `href`. For
JS-driven listings, the only editable value is the endpoint URL — leave the
population logic alone.

`references/component-inventory.md` lists what lives where.

## Styling and scripting

**Style the canvas, never the shell.**

Inside the canvas, styling and scripting your own components is the job — that
is what the canvas is for, and the rules below do not restrict what you build
there. The shell is different. It arrives already styled and already scripted
from `cdn.ucsd.edu`, including responsive behavior that an override will not
follow. So:

- **Site CSS must not target a chrome class or id.** Not even scoped, not even
  with `!important` — especially with `!important`.
- **Scope every site rule under the canvas selector.** The shell and the canvas
  share the whole Bootstrap 3 vocabulary — `.form-control`, `.input-group`,
  `.btn`, `.container`, `.row` — so a bare `.input-group { padding: 2px }` in a
  site stylesheet reaches into the drawer search without naming a single chrome
  class. Write `main#main-content .input-group`, or a page/component class that
  only exists inside the canvas.
- **Watch what a selector cannot scope.** `@keyframes` and `@font-face` names,
  and custom properties on `:root`, are global. Redefining one the Decorator
  consumes restyles the shell with no chrome selector anywhere in your file.
  Namespace yours.
- **Site JavaScript must not rewrite ids, classes, or inline styles on a chrome
  element.** Reading the shell is fine. Syncing `aria-expanded` on a control you
  own is fine. Rewriting what the Decorator put there is not. `document`-wide
  queries do not respect the canvas, so scope your selectors the same way you
  scope CSS — and never redefine `toggleIdsAndClassesBasedOnScreenWidth` or
  dispatch synthetic `resize` events to re-trigger it.
- **If the chrome renders wrong, read the CDN JavaScript before you write a
  rule.** The behavior you are fighting is usually deliberate, and the fix is
  usually to stop something the site is already doing.

This is the failure mode that gets past a markup contract, because nothing in
the markup changes. Three of them shipped to `tritonai.ucsd.edu` at once: a
drawer search rebuilt in site CSS, a `#chat-bubble { … !important }` block
reshaping the TritonGPT launcher, and site JS deleting an id that `base.min.js`
had just assigned.

### Worked example: the drawer search across 768px

`https://cdn.ucsd.edu/cms/decorator-5/scripts/base.min.js` defines
`toggleIdsAndClassesBasedOnScreenWidth()`, binds it to `window.resize`, and runs
it once on load. It exists to support the `ul.msearch` drawer-search pattern
Cascade emits. Below 768px, scoped to `ul.msearch`, it renames:

| Below 768px | 768px and up |
|---|---|
| `#search` | `#search-m` |
| `#search-scope` | `#search-scope-m` |
| `#q` | `#q-m` |
| term input class `search-term` | `search-term-m` |
| term input `name="search-term"` | `name="search-term-m"` |

**There are two drawer-search shapes, and only one of them moves.** The ZIP
templates ship the panel as a static `#search` inside a plain
`ul.nav.navbar-nav.navbar-right`; it never matches `ul.msearch`, the handler
never touches it, and it is already in the state the mobile stylesheet wants.
Cascade adds `msearch` to that `ul` and serves the panel as `#search-m`, so
the handler has to move it. Check which shape your project has before you reason
about this region — and never mix them by adding `msearch` to a static drawer or
removing it from a Cascade one.

For the Cascade shape, that id swap is **the only thing that makes the drawer
search render on phones.** `base.min.css` styles the panel through
`.offcanvas > ul.nav.navbar-nav.navbar-right #search`, inside a
`max-width: 767px` media query. Two consequences:

1. The drawer panel's `id="search"` **deliberately duplicates** the desktop
   navbar panel's id — always in the ZIP shape, and below 768px in the Cascade
   shape. That is the Decorator's design, not a defect: both are styled through
   the same id, and the drawer is hidden whenever the navbar is expanded. Site
   code that "fixes" the duplicate for accessibility silently collapses the
   drawer search.
2. The `name` swap is why the drawer form submits `search-term` on phones and
   `search-term-m` on desktop. The hosted search API
   (`cdn.ucsd.edu/cms/search/js/search-api.js`) reads
   `input[name="search-term"]` and `select[name="search-scope"]`, never ids.
   Changing the input `name` breaks search with nothing visible on the page.

**Read this from the npm package**, at
`node_modules/ucsd-decorator-v5/dist/scripts/base.min.js`, or from
`vendor/decorator-5/scripts/base.min.js` if the project pins. That build differs
from the live CDN copy only in minifier output style — an arrow IIFE where the
CDN emits `function` — with identical occurrence counts for every behavioral
marker. The CDN remains the authority when the two disagree.

**`Decorator-V5.zip` will tell you this behavior does not exist.** It ships a
`scripts/base.min.js` too, and measured 2026-08 it is an 8,024-byte build stamped
2023-01-26 with zero occurrences of `toggleIdsAndClassesBasedOnScreenWidth`,
`.msearch`, or `search-term-m` — against 9,871 bytes on the CDN carrying all
three. An agent that reads the archive and reports the behavior absent has
followed every rule in this skill and reached the wrong answer, which is why the
archive is no longer a source of truth here and `scripts/pin-decorator.mjs` will
not read it.

`references/protected-regions.md` carries the full breakpoint contract.

### When you are asked to restyle the shell

"The mobile drawer search looks cramped, tighten it up" is a chrome change. It
does not stop being one because it is CSS rather than markup, or because the
change is small, or because the request was specific about what it wanted.

The "stop and say so" rule governs the *edit*, not the investigation. Diagnose
first — an agent that stops before step 2 never finds the site override that was
the actual bug. Work it in this order:

1. **Read the shipped presentation first.** Open the unminified `base.css` in
   the pinned copy — same resolution order as markup, so
   `node_modules/ucsd-decorator-v5/dist/css/base.css`, then
   `vendor/decorator-5/styles/base.css`, then `core-template/` — and find the
   rules that already govern the region. For the drawer search, that is the
   block inside `@media only screen and (max-width: 767px)`. Very often what
   looks like a missing rule is a site rule already fighting one of these, and
   the fix is to delete the site rule. For behavior, read
   `node_modules/ucsd-decorator-v5/dist/scripts/base.min.js` or
   `vendor/decorator-5/scripts/base.min.js`. If a pinned file and the live CDN
   disagree about a rule you are relying on, the live CDN wins — re-pin, and say
   that you did.
2. **Check whether site code broke it.** Search the project's own CSS and JS for
   the region's classes and ids, and for the bare Bootstrap classes it shares
   with the canvas. A shell that renders wrong is much more often a site
   override or a runtime mutation than a Decorator bug.
3. **Prefer an existing Decorator class.** If the canvas needs a search UI that
   looks different, build it in the canvas with Decorator classes. The shell's
   copy stays as shipped. Give the canvas copy its own `name` and `id` values:
   the runtime handler finds the term input with an **unscoped**
   `document.querySelector('input[name="search-term-m"]')`, so a canvas form
   that inherits that `name` can capture a swap meant for the drawer.
4. **Otherwise, stop and say so.** Name the region, quote the rule you would
   have had to write, and let a human decide. Do not add a `.msearch`,
   `.search-content`, `#search`, `.navmenu`, `.navbar-default`, or `#chat-bubble`
   rule to a site stylesheet to close out the task.

A human may conclude the rule is warranted anyway — normally when it repairs
layout around site-authored markup rather than restyling the shell. That answer
is recorded as an exception in the project's chrome-styling config
(`config/chrome-styling.json`, shaped like `contracts/chrome-styling.json` in
this kit), with a reason and a `reviewOn` date after which it expires and
reports itself. There is no command for it — it is a reviewed edit to a config
file, and it is not yours to grant.

Before and after any change here, verify by rendering at both viewports.
`references/protected-regions.md` has the exact checks — the markup and the
stylesheet cannot tell you whether the drawer search works.

A breakpoint-scoped override is not a safe compromise either. The regression that
shipped was breakpoint-*un*scoped and so leaked past 768px, but scoping it
correctly would only have made it harder to find — the Decorator still owns the
region, and its next release moves out from under the override either way.

### The rest of the styling rules

- No new `<style>` blocks and no inline `style` attributes.
- Use the classes that already exist in the Decorator stylesheet. Read the
  unminified `base.css` from the pinned copy to find class names; the page loads
  the minified build from the CDN.
- Keep Decorator CSS and JS pointed at `cdn.ucsd.edu`. Do not vendor them for
  serving. Pinning a copy for reference and contract derivation is a different
  thing and is fine. This is not only policy: measured 2026-08, the pinned
  `ucsd-decorator-v5@5.0.4` package's compiled `base.min.css` has eleven
  declarations where the minifier turned a valid percentage `rgb()` color
  invalid by stripping the unit off a zero channel, and browsers silently drop
  an invalid declaration. The active-nav background is one of them — a page
  serving this file instead of the CDN gets Bootstrap's default gray `#e7e7e7`
  instead of `#004268`. The live CDN copy has zero `rgb()` functions in it;
  every color ships as hex.
- Icons are Bootstrap 3 Glyphicons plus the Decorator social icons. Font Awesome
  is not part of the current surface.

## Navigation

When you add a page, update every navigation surface that exists in the project:
the mobile offcanvas menu, the desktop navbar, and the side nav on two- and
three-column layouts. Check relative paths from the new page's directory.

If the project generates navigation from data (TritonAI builds it from
`content/site.json`), edit the data file — not the rendered markup.

## Accessibility

WCAG 2.1 AA and the UCSD accessibility standards apply to everything you
generate. `references/accessibility.md` has the full rule set. The ones that get
missed:

- One `<h1>` per page; heading levels descend without gaps.
- Every `<img>` gets a meaningful `alt`, or `alt=""` if genuinely decorative.
- Every interactive element is keyboard reachable with a visible focus state.
- `tabindex` is only ever `0` or `-1`.
- Never use `title` for tooltips. Never disable viewport zoom.
- Never use color alone to carry meaning; keep 3:1 minimum contrast.
- Bind every input to a `<label>` with `for`/`id`.
- `target="_blank"` requires visible text saying so.
- Touch targets at least 44×44 px.

## Security

`references/security.md` has the full set (IS-3, PPM 135-3). In brief: no
hardcoded secrets, HTTPS everywhere, parameterized queries, sanitize and encode
all user input, CSRF tokens on state-changing requests, campus SSO over custom
credential stores, least privilege, and no sensitive values in logs.

## When the chrome gate fails

Projects that adopt `checks/chrome-contract.mjs` fail the build on chrome drift.
Read the rule name in the failure:

- **`chrome/consistent/*`** — routes disagree. One page's chrome was edited in
  isolation. Reconcile it against the reference route named in the message.
- **`chrome/golden/*`** — the chrome no longer matches the recorded contract.
  If a human intended this presentation change, `chrome:accept` records it and
  the config diff goes in the pull request. If you did not intend it, you edited
  the shell by accident — revert.
- **`chrome/structure/*`** — the chrome no longer satisfies a rule derived from
  the pristine Decorator template. **This cannot be cleared by running
  `chrome:accept`,** and the tool will refuse. Something functional is gone.
  Restore the markup from the vendor template.
- **`chrome/styling/*`** — a site stylesheet or script reaches into the shell.
  `…/stylesheet` names the selector and the protected tokens it hits;
  `…/script` names the file and the function rewriting an element id;
  `…/expired-exception` means a recorded exception passed its `reviewOn` date
  and stopped applying. **This cannot be cleared by running `chrome:accept`
  either,** and not for the same reason as `structure`: the markup is intact.
  That is the point — the golden records markup, so regenerating it cannot make
  the rule legitimate. Move the rule inside the canvas, or record a reviewed
  exception with a reason and a `reviewOn` date.

The failure message names the rule, prints the markup it found, and points at
the source file to restore from. Use it; do not guess.

## References

- `references/canvas-contract.md` — the canvas boundary, and how a project declares it
- `references/protected-regions.md` — verbatim markup for each protected region
- `references/chrome-anatomy.md` — the shell, verified colors and dimensions
- `references/decorator5-chrome.md` — annotated skeleton, colors, and component
  table written from live pages; where it disagrees with the references above,
  prefer them
- `references/component-inventory.md` — kitchen sink, widgets, modules
- `references/accessibility.md` — full WCAG 2.1 AA rule set
- `references/security.md` — full IS-3 / PPM 135-3 rule set
- `references/distribution.md` — how Decorator is published, and what a consuming project should depend on

## Sources

- **Decorator package (source of truth): `https://www.npmjs.com/package/ucsd-decorator-v5`**
- Decorator source: `https://github.com/UCSD/Decorator`
- Served assets: `https://cdn.ucsd.edu/cms/decorator-5/`
- Developer docs: `https://developer.ucsd.edu/design/decorator/index.html`
- Kitchen sink: `https://developer.ucsd.edu/design/v5-kitchen-sink/kitchen-sink/index.html`
- `Decorator-V5.zip` — **not a source of truth.** Still linked from the docs;
  behind the package on every file. See `references/distribution.md`.
- Accessibility: `https://accessibility.ucsd.edu/`
- Brand: `https://brand.ucsd.edu/`

The live site wins over anything written here. If they differ, pin the live
version and update this skill.
