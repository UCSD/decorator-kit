---
title: Brand integrity
trigger: always_on
order: 10
---

## Styling

**Style the canvas, never the shell.** Inside the canvas, CSS is unlimited. The
shell arrives already styled from `cdn.ucsd.edu`, including responsive behavior
an override will not follow, so site CSS must not target a chrome class or id —
not scoped, and least of all with `!important`. If the chrome renders wrong,
read the CDN CSS and JS before writing a rule.

**Scope every site rule under the canvas selector.** The shell and the canvas
share the whole Bootstrap 3 vocabulary — `.form-control`, `.input-group`,
`.btn`, `.container`, `.row` — so a bare `.input-group { padding: 2px }` reaches
into the drawer search without naming a single chrome class. Write
`main#main-content .input-group`, or a component class that only exists inside
the canvas.

- **No new `<style>` blocks and no inline `style` attributes.**
- Use classes that already exist in the Decorator stylesheet. Read the
  unminified `base.css` from the pinned copy to find class names; the page loads
  the minified build from the CDN.
- Keep Decorator CSS and JS pointed at `cdn.ucsd.edu`. Do not vendor them for
  serving. Pinning a copy for reference and contract derivation is a separate
  thing and is fine.
- Typography is Roboto and Teko. Icons are Bootstrap 3 Glyphicons plus the
  Decorator social icons. Font Awesome is not part of the current surface.

## JavaScript

- Custom JavaScript goes in named files under `js/` at the project root. Never
  inside the pristine template directory.
- No inline initialization. Extract `$(document).ready(...)` blocks from
  reference files into a named file.
- **Never rewrite ids, classes, or inline styles on a chrome element at
  runtime.** Reading the shell is fine, and so is syncing `aria-expanded` on a
  control you own. Rewriting what the Decorator put there is not.

## The shell is scripted, not just styled

`base.min.js` defines `toggleIdsAndClassesBasedOnScreenWidth()`, binds it to
`window.resize`, and runs it on load. Scoped to `ul.msearch` — the drawer search
pattern Cascade emits — it renames ids across 768px: below the breakpoint
`#search-m` → `#search`, `#search-scope-m` → `#search-scope`, `#q-m` → `#q`, and
the term input's class and `name` from `search-term-m` to `search-term`. Above
it, all of that reverses.

That id swap is the only thing that makes the drawer search render on phones:
`base.min.css` lays the panel out through
`.offcanvas > ul.nav.navbar-nav.navbar-right #search`, inside a
`max-width: 767px` media query. Two consequences:

- Below 768px the drawer panel's `id="search"` **deliberately duplicates** the
  desktop navbar panel's id. The navbar is collapsed at that width. This is the
  design, not a defect — code that "fixes" the duplicate for accessibility
  silently collapses the drawer search.
- The `name` swap is why the drawer form submits `search-term` on phones and
  `search-term-m` on desktop. The hosted search API reads
  `input[name="search-term"]` and `select[name="search-scope"]`, never ids.
  Changing the input `name` breaks search with nothing visible on the page.

**This is a Cascade-CMS shape, not the template's own shape.** The npm
package's own `dist/templates/two-column.html` — the file this kit tells you
to copy — never emits `ul.msearch` at all. It ships two independent, static
search blocks instead: one inside `.navmenu.offcanvas`, one inside
`nav.navbar-default`'s `#navbar .navbar-collapse`, both wrapped in
`<ul class="nav navbar-nav navbar-right">`, both using the same ids and the
same `search-term` name. Nothing relocates either one; Bootstrap's ordinary
collapse/offcanvas behavior is what shows only one at a time. A page built
from the template needs both blocks copied verbatim — dropping the desktop one
because "the drawer already has search" removes the search button on every
viewport above 768px, with nothing in the console to say so.

Read this from `node_modules/ucsd-decorator-v5/dist/scripts/base.min.js` (or
`vendor/decorator-5/scripts/base.min.js` if the project pins). That build differs
from the live `cdn.ucsd.edu` copy only in minifier output style, with identical
occurrence counts for every behavioral marker; the CDN is still the authority
when the two disagree.

**Do not read it from `Decorator-V5.zip`.** The archive ships a file by that
name, and that is the trap: measured 2026-08 it is an 8,024-byte build stamped
2023-01-26 with no `toggleIdsAndClassesBasedOnScreenWidth`, no `.msearch`, and no
`search-term-m`, against 9,871 bytes on the CDN carrying all three. Reading it
and concluding this behavior does not exist is the wrong answer arrived at
honestly.

## The vendored npm package's CSS has a live color defect

Measured 2026-08 against `ucsd-decorator-v5@5.0.4`: `dist/css/base.min.css`
re-expresses some of the Decorator's hex colors as percentage `rgb()` — the
active-nav dark blue is `rgb(0%, 25.7862112587%, 40.7843137255%)` in the
unminified `base.css` — and the package's own minifier then strips the unit
off a bare-zero channel, producing `rgb(0,25.7862112587%,40.7843137255%)`.
Mixing a number and percentages in one legacy `rgb()` is invalid CSS, so a
standards-compliant browser drops the whole declaration and falls through to
whatever rule is next in the cascade. Eleven declarations in the file are
corrupted this way; the active-nav background is the one that gets noticed,
because it falls back to Bootstrap's default `#e7e7e7` instead of `#004268`.

The live `https://cdn.ucsd.edu/cms/decorator-5/styles/base.min.css` has none
of this — every color in it ships as plain hex, zero `rgb()` functions in the
whole file. This is why "Keep Decorator CSS and JS pointed at `cdn.ucsd.edu`"
above is a hard requirement, not a style preference: a page that links the
vendored copy instead of the CDN inherits this defect.

## Verified chrome facts

Agents get these wrong from memory. They are verified against live production.

- Footer is UC San Diego Blue `#00629b`, not navy.
- `.layout-header` is `#2b92b9`; the white band is `.layout-title` inside it.
- There is no gold rule on the white title band.
- The `.navbar-default` active item is dark blue `#004268`, not a gold
  underline. Do not apply the `.layout-navbar .navbar-list` underline pattern to
  Bootstrap `.navbar-default .navbar-nav` tabs. If it renders gray instead, the
  page is almost certainly linking Decorator CSS from `node_modules` instead of
  `cdn.ucsd.edu` — see "The vendored npm package's CSS has a live color defect"
  above.
- The mobile `MENU` label lives **inside** `button.navbar-toggle`, in
  `.mobile-nav-icon`, alongside `.mobile-nav-bars` (exactly three
  `span.icon-bar`).
- The offcanvas drawer is a **sibling** of `nav.navbar`, not a child.
- The extra-small navbar wordmark is the white footer logo asset inside
  `.col-sm-4.pull-right.visible-xs-block`. Do not resize it or swap in another
  UC San Diego logo.

## Embedded campus widgets

The TritonGPT/AskTriton widget, the emergency broadcast, the hosted search API,
and campus feed embeds load verbatim from `cdn.ucsd.edu`.

Do not inline, self-host, restyle, re-time, or reconfigure them. Do not "improve"
a widget you found by reading the page it renders into. A project's build may
defer loading for performance — that is the project's code acting on the tag,
not a change to the widget.

**Restyling is the failure mode that slips through.** A widget builds its own
DOM after load, so its elements appear in no source file and no markup check can
see them — but a site stylesheet can still reach them, and `!important` makes it
stick. `#chat-bubble` is the TritonGPT launcher; reshaping it into a circle on
phones clipped the "Ask TritonGPT" label in production. Load `tgpt-loader.js`
and take what it renders.

## Scope

This covers the Decorator page shell. It is not a general UC San Diego brand
manual and says nothing about print typography, email templates, dark mode,
data-visualization palettes, or design-token maps. For those, fetch the current
official source and keep it separate from the Decorator contract.
