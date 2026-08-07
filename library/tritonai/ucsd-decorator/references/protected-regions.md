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
  breaks the hosted search API with nothing visible on the page.**
- `id` values — a build may rewrite these to pair labels accessibly. Do not pin
  ids in a contract.

**Accessibility:** the pristine markup has no `<label>` and uses `autofocus`.
Both are wrong for production. Add `sr-only` labels bound with `for`/`id`, and
drop `autofocus` — it disorients screen readers on load.

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
