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
