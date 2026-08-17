---
title: Navigation synchronization
trigger: always_on
order: 30
---

**Trigger:** whenever a page, directory, or section is created or moved outside
the pristine template directory.

## Keep every navigation surface in sync

A Decorator page has up to three navigation blocks. Update all that exist:

1. **Mobile offcanvas menu** — `ul.nav.navmenu-nav` inside `.navmenu.offcanvas`
2. **Desktop navbar** — inside `nav.navbar-default.navbar-static-top`
3. **Side nav** — `article.main-content-nav`, present on two- and three-column
   layouts, absent on `blank-slate.html`

A new page that appears in one menu and not the other is a bug.

## Prefer the data file

If the project generates navigation from data — TritonAI builds it from
`content/site.json` — **edit the data file, not the rendered markup.** Editing
generated markup is chrome drift and the build will overwrite it anyway.

Only hand-edit `<li>` and `<a>` elements in projects that have no navigation
data source.

## Paths

Check `href` resolution from the new page's own directory, not from the project
root. A page in a subdirectory needs different relative paths than one at the
root.

## Scope

Never modify navigation inside `core-template/`, `vendor/decorator-5/`, or
`node_modules/ucsd-decorator-v5/`. Those are read-only reference copies.

## What is not navigation

The search forms in the drawer and the navbar are **not** navigation links and
must never be converted into them. Replacing the drawer search form with a link
to the search page is the most common Decorator regression: it looks equivalent
and silently drops the scope selector and the typed query.
