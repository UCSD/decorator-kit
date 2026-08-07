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
| 1 | `node_modules/@ucsd/decorator/…` | the package is installed |
| 2 | `vendor/decorator-5/…` (or the project's pinned copy) | a sync script pins it |
| 3 | `core-template/…` | Antigravity Code Kit layout |
| 4 | `https://developer.ucsd.edu/…` | nothing local exists — fetch, then pin it |

If you reach step 4, say so, and treat what you fetched as provisional.

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

## Protected regions

These are the regions that break in practice. `references/protected-regions.md`
carries the verbatim markup for each; restore from there or from the vendor
template, never from recall.

- **Mobile drawer search.** A `<form>` with a `select.search-scope` and an
  `input.search-term`, inside `.search-content` in the offcanvas drawer. It is
  not a link. Replacing it with an anchor to the search page is the single most
  common regression: it looks equivalent, and it silently drops the scope
  selector and the typed query. Sites customize the `action` and the scope
  options; the form itself is not customizable.
- **Desktop navbar search.** Same shape, in `nav.navbar`. Note the input `name`
  usually differs between the two forms (`search-term` desktop,
  `search-term-m` mobile). Changing either breaks the hosted search API with
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

## Building a page

**Never pick a template by default.** If the user has not named one, stop and
ask. Present the options:

- `blank-slate.html` — open canvas below the navbar
- `two-column.html` — left sub-navigation, canvas in the wider right column
- `three-column.html` — left menu, wide middle canvas, right info column
- `homepage.html` — carousel hero and callout modules

Copy the whole template to the project root under a new name, then work only
inside its canvas. Do not overwrite `index.html` unless asked.

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

## Styling

- No new `<style>` blocks and no inline `style` attributes.
- Use the classes that already exist in the Decorator stylesheet. Read the
  unminified `base.css` from the pinned copy to find class names; the page loads
  the minified build from the CDN.
- Keep Decorator CSS and JS pointed at `cdn.ucsd.edu`. Do not vendor them for
  serving. Pinning a copy for reference and contract derivation is a different
  thing and is fine.
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

The failure message names the rule, prints the markup it found, and points at
the source file to restore from. Use it; do not guess.

## References

- `references/canvas-contract.md` — the canvas boundary, and how a project declares it
- `references/protected-regions.md` — verbatim markup for each protected region
- `references/chrome-anatomy.md` — the shell, verified colors and dimensions
- `references/component-inventory.md` — kitchen sink, widgets, modules
- `references/accessibility.md` — full WCAG 2.1 AA rule set
- `references/security.md` — full IS-3 / PPM 135-3 rule set
- `references/distribution.md` — how Decorator is published, and what a consuming project should depend on

## Sources

- UCSD Decorator archive: `https://developer.ucsd.edu/_files/decorator-downloads/v5/Decorator-V5.zip`
- Decorator source: `https://github.com/UCSD/Decorator`
- Kitchen sink: `https://developer.ucsd.edu/design/v5-kitchen-sink/kitchen-sink/index.html`
- Developer docs: `https://developer.ucsd.edu/design/decorator/index.html`
- Accessibility: `https://accessibility.ucsd.edu/`
- Brand: `https://brand.ucsd.edu/`

The live site wins over anything written here. If they differ, pin the live
version and update this skill.
