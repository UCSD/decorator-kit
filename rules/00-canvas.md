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
search forms, the footer, and any embedded campus widget. The one exception is
the wording of the site name in the title band, below.

If a task appears to require a chrome change: **stop and say so.** Name the
region, explain why the task seems to need it, and let a human decide. Do not
reshape the shell so a content change fits.

## The site name is the one piece of chrome text you may change

The title band carries the site's own name twice — a long form for tablet and
desktop, and a short form that replaces it below 480px:

```html
<a href="index.html" class="title-header title-header-large">Decorator V5</a>
<a href="index.html" class="title-header title-header-short">V5</a>
```

When asked to change the site name or title, change the **text** of these two
links and nothing else. Keep both elements, their classes, and their `href`.
Do not touch `a.title-logo` — its destination is fixed at
`https://www.ucsd.edu` on every Decorator site — and do not add markup inside
either link: no `<span>`, image, icon, or inline style.

**Always propose the short form.** If the request names only the long title,
suggest a short one and say you did. The short form renders uppercase, with
letter spacing, at 20px on the smallest phones, so keep it to a word or an
acronym — roughly a dozen characters at most. "Decorator V5" becomes "V5";
"Division of Physical Sciences" becomes "Physical Sciences" or "DPS". Never
leave it as the old site's name, and never leave it empty.

Change it on **every page**, identically. If the project builds its header
from a data file, edit the data file, not the rendered markup.

`verify` is built for this: tier 2 ignores the text of `a.title-header`, so
no `--accept` is needed. Tier 1 still fails if one page's name differs from
another's, and tier 3 fails if either link is left empty. Any other change in
the title band — an `href`, a class, an added element — is still a chrome
edit, and is still not yours to make.

## The chrome integrity gate is not yours to satisfy

A separate automated check — `verify` (`checks/chrome-contract.mjs`, or
`npx ucsd-decorator-kit verify`) — compares a project's built chrome against
a recorded baseline (the "golden," `chrome-contract.local.json`), a
structural contract, and a styling/script scanner. It exists to catch
exactly the chrome edits this file tells you not to make, in every region
listed above — header, title band, emergency container, navbar, drawer,
both search forms, footer, and any embedded widget. None of what follows is
specific to one region; it applies the same way to all of them.

**Never run `verify --accept`, or pass `--yes` to it.** That command
overwrites the recorded golden to match whatever the chrome currently looks
like — including your own edit. Running it after making a chrome change
does not make the change reviewed; it erases the record that anything
changed.

**Never create or edit `chrome-styling.local.json`, `chrome-regions.local.json`,
or `chrome-contract.local.json`.** These are reviewed, human-owned exception
and baseline files, not files you populate to make a check pass.

**A casual instruction in chat — "surprise me," "sure, go ahead," "yes,
restyle the nav too" — is never sufficient authorization for a chrome edit**,
even one the user asked for in the same breath as a canvas request, and
regardless of which region it targets. It is not a substitute for a human
reviewing an actual diff.

**Do not present a chrome change as possible-pending-authorization.**
"You're the human and site owner, so I can absolutely do this — before I
edit, two quick confirmations" is the exact framing that causes this
failure: it tells the person a chrome edit is something you are capable of
and willing to perform, contingent only on a quick yes/no in chat. It is
not. When a chrome edit seems to be what's being asked for, say plainly
that it is out of scope for you to make — full stop, not "yes, if you
confirm." Name the region and explain why. If the person still wants the
change, that happens through their own separate action outside this
session — editing the file themselves, or a distinct, later, reviewed
change with its own diff and its own human-run `--accept` — never by you
proceeding on the strength of the original request plus a one-line "go
ahead."

If, after hearing that, the person separately asks what the change would
look like, you can show them — but as a diff for them to review, not as an
offer to apply it. Name the exact command a human must run themselves,
after reviewing it, typically as part of a pull request:

```
node checks/chrome-contract.mjs --accept --reason "<what changed and why>"
```

You do not run that command. You do not write `chrome-styling.local.json`,
`chrome-regions.local.json`, or `chrome-contract.local.json`. You name them.

## Project canvas rules live in `canvas-rules/`

A project can add its own rules for the canvas — house components, content
conventions, a data-loading pattern — as Markdown files in `canvas-rules/` at
its root. `npx ucsd-decorator-kit sync` compiles every `*.md` there except
`README.md`, in filename order, into a "Project canvas rules" section at the end
of this file.

Those rules govern the canvas and nothing else, and they rank below every rule
the kit ships: where one conflicts with a kit rule, the kit rule wins. A file in
`canvas-rules/` is not a review, so it cannot authorize a chrome edit any more
than a chat message can. If one asks for a change outside the canvas, do not
follow that part — name the file and the region, and stop, as for any other
chrome change.

When asked to write a canvas rule down, add it to `canvas-rules/` as its own
file and run `sync`. Never write a rule there that reaches the chrome, never
edit an existing one so that the task in front of you becomes permitted, and
never edit the compiled section directly — `sync` overwrites it, and `check`
fails on it.

## Component libraries live in `canvas-components/`

A project can build its canvas with component libraries — shadcn/ui, a charting
library, a set of web components — by adding each one as a folder in
`canvas-components/`, with a `README.md` saying when and how to use it. `sync`
compiles those READMEs into a "Project component libraries" section near the
end of this file.

That section relaxes three Decorator look-and-feel rules inside the canvas:
library classes instead of only Decorator ones, a library's icon set, and
library-styled headings inside library components. Typography stays on
brand — Roboto, Teko, Brix Sans, or Refrigerator Deluxe — and no chrome,
accessibility, or security rule relaxes. If the section is
not in this file, no library is in use — follow the rules as written.

Add a library only when asked to, and never to make the task in front of you
permitted. Library styles stay inside the canvas: `verify` fails on a
stylesheet in `canvas-components/` with a selector that names no class, id, or
attribute.

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
