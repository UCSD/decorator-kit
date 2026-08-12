# Protected regions

Verbatim markup for the regions that break in practice. Restore from here or
from the project's pinned vendor template — never from recall, and never from a
rendered DOM.

Markup below is from `Decorator-V5.zip` → `templates/two-column.html`, pinned
2026-07-22. Site-specific values are called out per region.

---

## Mobile offcanvas drawer search

The single most common regression: this form gets replaced by a link to the
search page. It looks equivalent and is not. A link drops the scope selector and
the typed query, and it submits nothing to the hosted search API.

```html
<div class="navmenu navmenu-default navmenu-fixed-left offcanvas" style="">

    <ul class="nav navbar-nav navbar-right">
      <li>
        <div class="search">
              <button class="search-toggle btn-default">
                  <span class="glyphicon glyphicon-search"></span> <span class="caret"></span>
              </button>

              <div class="search-content" id="search">
                  <form action="https://act.ucsd.edu/cwp/tools/search-redir" method="get" id="cse-site-search">
                      <select class="search-scope" name="search-scope">
                          <option value="default_collection">All UCSD Sites</option>
                          <option value="faculty-staff">Faculty/Staff</option>
                      </select>

                      <div class="input-group">
                          <input placeholder="Search..." type="search" class="form-control search-term"
                          id="q" name="search-term">
                      </div>
                  </form>
              </div>
          </div>
        </li>
    </ul>

    <ul class="nav navmenu-nav">
      <!-- site navigation -->
    </ul>
</div>
```

**Invariant** (this is what a contract should pin): inside `.search-content`
there is a `<form>` containing a `select.search-scope[name="search-scope"]` and
an `input.search-term[type="search"]`, and there is no anchor.

**Site-specific, expected to differ:**

- `action` — sites point at their own search index rather than the campus
  redirector.
- `option` values — a site index adds its own scope, e.g.
  `<option value="tritonai">This Site</option>`.
- Input `name` — a site running both forms on one page distinguishes them, e.g.
  `search-term` on desktop and `search-term-m` in the drawer. **Changing this
  breaks the hosted search API with nothing visible on the page.** And it is
  rewritten at runtime; see the breakpoint contract below before touching it.
- `id` values — **only some of them.** See the next section. The labelled
  control ids are free; the panel id is load-bearing.

**Accessibility:** the ZIP template's form has no `<label>`; Cascade's emits
labels and adds `autofocus`, which disorients screen readers on load. Both want
fixing — `sr-only` labels bound with `for`/`id`, and no `autofocus`.

This is the one place where the right answer is a chrome edit, so it is not
yours to make unilaterally. Raise it, and fix it where the shell is *generated*
— the Cascade template, or the build that emits the page shell — so every page
gets it at once. Do not patch one page's drawer. And if you bind a label to the
term input, bind it to the id that survives: on a Cascade page `#q` and `#q-m`
alternate across 768px, so a static `for` is correct at exactly one width. Pin
the labelled control ids in the build and pin the matching `for` with them.

---

## The drawer search breakpoint contract

The markup above is not the whole region. The Decorator governs the drawer
search **at runtime**, and this is the part no markup contract can see.

`https://cdn.ucsd.edu/cms/decorator-5/scripts/base.min.js` defines
`toggleIdsAndClassesBasedOnScreenWidth()`, binds it to `window.resize`, and runs
it once on load. It exists specifically to support the `ul.msearch` drawer
pattern Cascade emits.

### First, establish which shape the project has

There are two, and the difference decides whether any of the rest applies:

| Shape | Wrapper | Panel as served | Handler |
|---|---|---|---|
| ZIP template | `ul.nav.navbar-nav.navbar-right` | `id="search"` | never runs — no `.msearch` to match |
| Cascade | `ul.nav.navbar-nav.navbar-right.msearch` | `id="search-m"` | runs on load and on every resize |

The ZIP shape is static and already in the state the mobile stylesheet wants, so
it needs no swap. The Cascade shape starts in the desktop state and depends on
the handler to reach the mobile one. Both end up as `#search` below 768px, which
is the only thing `base.min.css` lays out.

Do not "reconcile" the two. Adding `msearch` to a static drawer starts a swap
nothing was built for; removing it from a Cascade drawer strands the panel at
`#search-m` and the search disappears on phones.

### The swap

Scoped to `ul.msearch`, the function swaps this pair of states:

| Element | Below 768px | 768px and up |
|---|---|---|
| `.search-content` panel | `id="search"` | `id="search-m"` |
| `select.search-scope` | `id="search-scope"` | `id="search-scope-m"` |
| `input[type=search]` | `id="q"` | `id="q-m"` |
| `input[type=search]` class | `search-term` | `search-term-m` |
| `input[type=search]` name | `name="search-term"` | `name="search-term-m"` |

Cascade serves the panel as `#search-m`, the select as `#search-scope-m`, and
the input as `#q-m` — but with `class="search-term"` alongside
`name="search-term-m"`, which is neither column of the table. **That mismatch is
normal.** The handler runs on load and normalizes it: below 768px the class is
already right and only the `name` moves; above it, both move together. The
served markup is a starting state, never the rendered one, so do not "correct"
it by hand.

### `#search` is the CSS hook

`base.min.css`, inside `@media only screen and (max-width: 767px)`:

```css
.offcanvas > ul.nav.navbar-nav.navbar-right #search {
  display: block !important;
  position: relative !important;
  width: 100%;
  padding: 10px 15px;
  overflow: hidden;
}
```

That id swap is the only thing that makes the drawer search render on phones.
Nothing else in the Decorator's stylesheet lays the panel out at that width.

### The duplicate `id="search"` is intended

The drawer panel and the desktop navbar panel **deliberately carry the same
id**, and both are styled through it. This is the Decorator's design, not a
defect.

In the ZIP shape both are `id="search"` at every width — the templates ship them
that way. In the Cascade shape the duplicate appears below 768px, once the
handler renames the drawer panel from `#search-m`; above 768px they are distinct
again. Either way the drawer is hidden by the offcanvas mechanism whenever the
navbar is expanded, so only one is ever visible.

**Do not "fix" it.** Site JS that walks the page looking for duplicate ids and
calls `removeAttribute("id")` on one of them silently collapses the drawer
search — the panel is still in the markup, still contains the form, and renders
as nothing. That regression shipped, and the CSS written to compensate for it
shipped on top.

### Which ids are safe to rewrite, and which are not

The distinction matters because these look alike and are not:

| Id | Safe to rename? | Why |
|---|---|---|
| `#search-m` / `#search` | **No** | `base.min.css` keys the panel's mobile layout on `#search`. Rename it, or strip it, and the drawer search stops rendering below 768px. |
| `#search-scope-m` / `#search-scope` | Yes | Only `toggleIdsAndClassesBasedOnScreenWidth()` matches it, and nothing depends on the result. A build that renames it to pair a `<label>` accessibly just drops it out of the swap. |
| `#q-m` / `#q` | Yes | Same. |

If a build renames the labelled control ids, pin the renamed values in the
contract along with the label `for` that matches them. Do not pin `#search-m` as
merely site-specific — pin it as required, and pin that no site script rewrites
it.

Note also that the below-768px branch finds the term input with an **unscoped**
`document.querySelector('input[name="search-term-m"]')` — not scoped to
`ul.msearch` like everything else in the function. On a page with more than one
`search-term-m` input, the first in document order wins — and the drawer
precedes `main#main-content`, so the drawer normally wins and a canvas form
carrying that `name` is the one that gets mutated behind your back.

So a search form built in the canvas must not reuse the shell's names or ids.
Copy the Decorator's markup by all means, then rename. Reserved:

| Reserved | Why |
|---|---|
| `name="search-term"`, `name="search-scope"` | the hosted search API reads these by name, document-wide |
| `name="search-term-m"` | the runtime handler reads this by name, document-wide |
| `id` `search`, `search-m` | `base.min.css` keys the drawer panel's mobile layout on `#search` |
| `id` `q`, `q-m`, `search-scope`, `search-scope-m` | the handler's `ul.msearch`-scoped swap |

The `name` collisions are the dangerous ones: they are document-wide, they are
the names you get by copying the markup, and both failures are invisible on the
page.

### Verifying it

Neither the markup nor the stylesheet shows whether the drawer search actually
works. Only a rendered check at both viewports does. **Inspecting a rendered
page to verify is fine; the rule against rendered DOM is about never writing
what you read there back into a file.**

Check against the shape the project has — the expectations differ, and running
the Cascade checks against a ZIP-shape project reports a false failure on a
working drawer.

**Cascade shape** (`ul.msearch` present):

- **Below 768px**, with the drawer open: the panel is `#search`, the term input
  carries `.search-term`, computed `display` is not `none`, and the panel's
  measured height is at least 49px.
- **768px and up**: the panel is `#search-m`, the term input carries
  `.search-term-m`, and computed `display` is `none`.

**ZIP shape** (no `.msearch`): the handler never runs, so the panel is `#search`
with `.search-term` at every width. Check only the rendered result — laid out
and at least 49px tall below 768px with the drawer open, `display: none` above
it.

The 49px floor is the shipped panel's own height: `padding: 10px 15px` around a
Bootstrap 3 `.form-control`. It is a "did this collapse" tripwire, not a design
target — for touch-target sizing the 44×44px accessibility minimum governs.

Wait for `window.toggleIdsAndClassesBasedOnScreenWidth` to be defined before
measuring. Reading earlier reads the build's markup, not the rendered result.
(On a ZIP-shape page the function still exists — `base.min.js` defines it
unconditionally — it just matches nothing.)

### None of this is in the pinned sources

`Decorator-V5.zip` and the `ucsd-decorator-v5` npm package ship the templates
and `base.css`, but not the CDN scripts, and `.msearch` appears in neither. An
agent following this skill's own "read it from a file" rule will never see the
behavior that governs this region. That is why it is written down here.

---

## Desktop navbar search

Same shape, inside `nav.navbar`, in a `ul.nav.navbar-nav.navbar-right`. The
container is `.search-content#search`; the form is often `id="cse-search-box"`.
Keep the two forms' input `name` values distinct.

---

## Mobile navigation toggle

`.mobile-nav-bars` and `.mobile-nav-icon` are both **inside** the button. The
MENU label is not a sibling of the toggle.

```html
<button type="button" class="navbar-toggle" data-toggle="offcanvas" data-target=".navmenu" data-canvas="body" aria-expanded="false" aria-controls="navbar">
    <span class="sr-only">Toggle navigation</span>

    <div class="col-sm-1 mobile-nav-bars">
        <span class="icon-bar"></span>
        <span class="icon-bar"></span>
        <span class="icon-bar"></span>
    </div>
    <div class="col-sm-1 mobile-nav-icon">
        MENU
    </div>
</button>
```

Exactly three `span.icon-bar`.

---

## Extra-small navbar wordmark

```html
<div class="col-sm-4 pull-right visible-xs-block">
    <img src="https://cdn.ucsd.edu/cms/decorator-5/styles/img/ucsd-footer-logo-white.png" alt="UC San Diego Logo" class="img-responsive header-logo" />
</div>
```

This is the white footer wordmark asset. Do not resize it or swap in another
UC San Diego logo.

> **Known upstream drift.** The shipped ZIP template has `alt=""` and points at
> `http://cdn.ucsd.edu/developer/decorator/5.0.2/img/…`. Live production pages
> on `developer.ucsd.edu` render `alt="UC San Diego Logo"` and the
> `https://cdn.ucsd.edu/cms/decorator-5/…` path. The ZIP templates lag the CDN.
> Follow production, and see `distribution.md` for why this gap exists.

---

## Header and title band

```html
<header class="layout-header">
    <a class="skip-to-main" href="#main-content">Skip to main content</a>
    <div id="uc-emergency"></div>
    <section class="layout-title">
        <a href="index.html" class="title-header title-header-large">Site Name</a>
        <a href="index.html" class="title-header title-header-short">Short</a>
        <a href="https://www.ucsd.edu" class="title-logo">UC San Diego</a>
    </section>
</header>
```

`#uc-emergency` is populated by the campus emergency broadcast. It is empty in
source and must stay in the document.

---

## Embedded campus widgets

Load verbatim from the CDN. Do not inline, self-host, restyle, or reconfigure.

```html
<script src="https://cdn.ucsd.edu/tritongpt/widget/js/tgpt-loader.js" type="text/javascript"></script>
```

A project may defer loading for performance — that is the project's build code
acting on the tag, not a change to the widget. If a build rewrites `src` into a
`data-*` attribute, the contract should pin the rewritten form, the original
CDN URL, and the absence of a plain `src`.

The same applies to the emergency broadcast, the hosted search API, and any
campus feed embed.

### Restyling is the failure mode that slips through

The tag above is one line, and it is easy to leave alone. The widget's *DOM* is
the exposure: it is built after load, so none of it appears in any source file
or any built page, and no markup check can see it. A site stylesheet can still
reach it, and `!important` makes the override stick.

`#chat-bubble` is the TritonGPT launcher, styled by the widget's own stylesheet
at `cdn.ucsd.edu/tritongpt/widget/css/tgpt.css`. A shipped regression reshaped
it into a 52px circle on phones and clipped the "Ask TritonGPT" label. The
launcher panel's other ids — `#chat-widget`, `#chat-header`, `#chat-messages`,
`#chat-input`, `#chat-footer`, `#message-input`, `#send-btn`, `#close-btn`,
`#menu-btn`, `#info-menu` — belong to the widget the same way.

A styling gate that derives its protected tokens from built markup will miss all
of these, because they are never in the markup. Widget ids are the one part of
such a token list that has to be maintained by hand. List ids only: the widget's
class names include generic words like `.message` and `.user` that a canvas
component may legitimately own.
