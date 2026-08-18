---
title: The canvas and the chrome
trigger: always_on
order: 0
---

## Workspace boundary

A Decorator project has exactly one writable region — the **canvas**. Everything
else is **chrome**: the shared page shell that is identical on every page of the
site.

| Project | Canvas |
|---|---|
| Plain Decorator template | `main#main-content` |
| TritonAI site | `main#main-content` |
| Antigravity Code Kit | `div#ag-app-canvas` |

All new content, components, markup, and application logic go inside the canvas.

**Chrome is not yours to edit.** That means the header, the title band, the
`#uc-emergency` container, the desktop navbar, the mobile offcanvas drawer, both
search forms, the footer, and any embedded campus widget.

If a task appears to require a chrome change: **stop and say so.** Name the
region, explain why the task seems to need it, and let a human decide. Do not
reshape the shell so a content change fits.

## The pristine template is read-only

`core-template/`, `vendor/decorator-5/`, and `node_modules/ucsd-decorator-v5/`
are reference copies. Never create, modify, or store working files inside them.

## Never reconstruct markup from a rendered DOM

Read markup from a file — never from a browser inspection, a screenshot, a
fetched rendered page, or memory. Three reasons, all of which have produced real
regressions:

1. The rendered DOM is not the source markup. Browsers normalize it and scripts
   mutate it.
2. Jasny Bootstrap **clones the offcanvas drawer into the body at runtime**, so
   a live DOM contains navigation markup that exists in no file. Reading it back
   produces duplicated, broken markup.
3. Kitchen-sink pages are galleries wrapped in Decorator chrome. Copying what
   "looks like" a component fuses demo scaffolding into production markup.

Resolution order for markup: `node_modules/ucsd-decorator-v5/dist/` →
`vendor/decorator-5/` → `core-template/`. If none of those exist, install or pin
the package rather than fetching a page — `npm i -D ucsd-decorator-v5`, or run
`pin-decorator.mjs`. Say so if you had to.

**`Decorator-V5.zip` on developer.ucsd.edu is not a source of truth.** Measured
2026-08 against `ucsd-decorator-v5@5.0.4`, the archive is behind on every file it
ships, and its `scripts/base.min.js` is a 2023 build missing the runtime behavior
that governs the drawer search. Read the npm package.

**Read only these paths inside the npm package.** It ships 222 files, including
`dist/vendor/fullcalendar-3.9.0/demos/` and `dist/vendor/modernizr/test/`, so a
search for something button-shaped can land in a third-party demo page:

| Want | Path |
|---|---|
| Layout templates and modules | `node_modules/ucsd-decorator-v5/dist/templates/` |
| Component galleries | `node_modules/ucsd-decorator-v5/dist/kitchen-sink/` |
| Widget reference pages | `node_modules/ucsd-decorator-v5/dist/widgets/` |
| Readable stylesheet | `node_modules/ucsd-decorator-v5/dist/css/base.css` |
| Runtime behavior | `node_modules/ucsd-decorator-v5/dist/scripts/base.min.js` |

Nothing under `dist/vendor/` is Decorator markup.

## Template selection requires an explicit instruction

Never choose a layout template on your own. If the user has not named one,
pause, present the options, and wait:

- `blank-slate.html` — open canvas below the navbar
- `two-column.html` — left sub-navigation, canvas in the wider right column
- `three-column.html` — left menu, wide middle canvas, right info column
- `homepage.html` — carousel hero and callout modules

Once chosen, copy the whole template to the project root under a new name and
work only inside its canvas. Do not overwrite `index.html` unless asked.

## Rewrite the copied template's asset paths before anything else

The reference template's `<head>` and script block point at its own location
inside the package — `../css/bootstrap.min.css`, `../css/base.min.css`,
`../scripts/*.min.js` — because that is where the file sits inside
`node_modules/ucsd-decorator-v5/dist/templates/`. Those paths keep resolving
after the copy, since the same `node_modules/` tree is still there from the
project root. That is what makes this easy to miss: the page loads and looks
almost right.

Rewrite every one of them to the CDN instead:

| Ships as | Rewrite to |
|---|---|
| `../css/bootstrap.min.css` | `https://cdn.ucsd.edu/cms/decorator-5/styles/bootstrap.min.css` |
| `../css/base.min.css` | `https://cdn.ucsd.edu/cms/decorator-5/styles/base.min.css` |
| `../scripts/modernizr.min.js` | `https://cdn.ucsd.edu/cms/decorator-5/scripts/modernizr.min.js` |
| `../scripts/jquery.min.js` | `https://cdn.ucsd.edu/cms/decorator-5/scripts/jquery.min.js` |
| `../scripts/bootstrap.min.js` | `https://cdn.ucsd.edu/cms/decorator-5/scripts/bootstrap.min.js` |
| `../scripts/vendor.min.js` | `https://cdn.ucsd.edu/cms/decorator-5/scripts/vendor.min.js` |
| `../scripts/base.min.js` | `https://cdn.ucsd.edu/cms/decorator-5/scripts/base.min.js` |

Never leave a shipped page loading `node_modules/ucsd-decorator-v5/…` for its
CSS or JS. That is not only the rule in "Brand integrity" — the package's own
compiled `base.min.css` has a live color defect the CDN copy does not (see
"Verified chrome facts" there), so serving the vendored copy doesn't just
break policy, it visibly breaks the active nav state.

## The two- and three-column split is a float order, not a markup order

Both templates put the wider canvas section first in the file and the
narrower nav/info section second, then push the first one to the far side with
`pull-right` — `two-column.html`'s canvas section is
`class="col-xs-12 col-md-9 main-section pull-right"`. Nothing pulls the
nav/info section; it renders on the remaining side because the wide section no
longer occupies it.

Drop `pull-right` while trimming the template's demo modules down to real
content — it reads as decorative on a section that is about to be rewritten
anyway — and both columns fall back to plain source order: canvas on the left,
nav on the right. Keep the class and the DOM order exactly as shipped; replace
only what is inside each `<section>`.

## The chrome ships two independent search blocks

The offcanvas drawer and the desktop navbar each carry their own search
button and form — `<ul class="nav navbar-nav navbar-right">` wrapping a
`.search-toggle` button and a `<form>`, once inside `.navmenu.offcanvas`, once
inside `nav.navbar-default`'s `#navbar .navbar-collapse`. In the template as
shipped, the two copies are identical: same ids, same `name` attributes, just
in two different containers. Nothing relocates one into the other — Bootstrap's
own collapse/offcanvas behavior is what shows only one of them at a time,
matching the viewport. (The id-renaming behavior in "The shell is scripted,
not just styled" is a Cascade-CMS shape that this template does not use.)

Copying only the drawer's search and treating it as covering both surfaces —
easy to do, since the two blocks look redundant — drops the desktop navbar's
search button entirely, with nothing in the console to say so. When trimming a
template's nav down to real content, only the nav-link `<ul>` in each
container changes (`ul.navmenu-nav` in the drawer, the plain
`ul.nav.navbar-nav` in the navbar — not the one carrying `navbar-right`). Both
`ul.navbar-nav.navbar-right` search blocks are chrome: copy them verbatim,
once per container.
