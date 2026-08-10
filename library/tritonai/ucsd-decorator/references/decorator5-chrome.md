# Decorator 5 — Annotated Chrome & Component Reference

Sources:

- `https://developer.ucsd.edu/sitemap.xml`
- `https://developer.ucsd.edu/index.html`
- `https://developer.ucsd.edu/design/index.html`
- `https://developer.ucsd.edu/design/decorator/index.html`
- `https://developer.ucsd.edu/design/decorator/templates/index.html`
- `https://developer.ucsd.edu/design/decorator/widgets/index.html`
- `https://developer.ucsd.edu/design/decorator/getting-started/index.html`
- `https://developer.ucsd.edu/design/decorator/getting-started/cms.html`
- `https://developer.ucsd.edu/design/decorator/getting-started/tips.html`
- `https://developer.ucsd.edu/design/decorator/getting-started/file-guide/index.html`
- `https://developer.ucsd.edu/design/v5-kitchen-sink/kitchen-sink/index.html`
- `https://cdn.ucsd.edu/cms/decorator-5/styles/base.min.css`

Verified: June 19, 2026

If this file and the live CDN CSS disagree, the CDN wins — update this file.

The sitemap contains archive pages under `/design/archive/`. Treat those as
historical Decorator 3/4 documentation, not current Decorator 5 behavior, unless
the user explicitly asks for archived guidance.

## Contents

- Full HTML skeleton
- Chrome colors from `base.min.css`
- Current sitemap pages and additions
- Developer Home and documentation shell details
- Widgets and Getting Started details
- Kitchen sink components
- Logo CDN URLs

---

## Full HTML skeleton

```html
<!DOCTYPE html>
<html lang="en-US" class="no-js">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Title — Site Name</title>

  <link href="//cdn.ucsd.edu/cms/decorator-5/styles/bootstrap.min.css" rel="stylesheet">
  <link href="//cdn.ucsd.edu/cms/decorator-5/styles/base.min.css" rel="stylesheet">
  <!-- Fonts: base.min.css imports Roboto from Google Fonts and Teko from the CDN (teko.css) automatically. No separate font link needed for Decorator 5 pages. -->
</head>
<body>

<!-- HEADER: outer wrapper bg #2b92b9 -->
<header class="layout-header">
  <a class="sr-only" href="#main-content">Skip to main content</a>
  <!-- TITLE BAND: white, 92px tall -->
  <section class="layout-title" aria-label="Site Name">
    <div class="layout-container container">
      <!-- Site name: black, uppercase, 1.35rem, 1px letter-spacing -->
      <a class="title-header title-header-large" href="/">Site Name</a>
      <a class="title-header title-header-short" href="/">Short</a>
      <!-- Campus logotype: image-replaced sprite, 229×65px, hidden <560px -->
      <a class="title-logo" href="https://www.ucsd.edu">UC San Diego</a>
    </div>
  </section>
</header>

<!-- NAVBAR: bg #00629b, 50px tall -->
<nav class="navbar navbar-default navbar-static-top" role="navigation">
  <div class="container">
    <div class="navbar-header">
      <!-- Mobile toggle: bars and MENU label both live inside the button -->
      <button type="button" class="navbar-toggle"
              data-toggle="collapse" data-target="#site-nav"
              aria-expanded="false" aria-controls="site-nav">
        <span class="sr-only">Toggle navigation</span>
        <div class="col-sm-1 mobile-nav-bars">
          <span class="icon-bar"></span>
          <span class="icon-bar"></span>
          <span class="icon-bar"></span>
        </div>
        <div class="col-sm-1 mobile-nav-icon">MENU</div>
      </button>
      <div class="col-sm-4 pull-right visible-xs-block">
        <img src="https://cdn.ucsd.edu/developer/decorator/5.0.2/img/ucsd-footer-logo-white.png"
             alt="UC San Diego" class="img-responsive header-logo" />
      </div>
    </div>
    <div class="collapse navbar-collapse" id="site-nav">
      <ul class="nav navbar-nav">
        <!-- Active tab in .navbar-default: background #004268, no yellow underline -->
        <li class="active"><a href="#">Page</a></li>
        <li><a href="#">Another Page</a></li>
      </ul>
    </div>
  </div>
</nav>

<!-- MAIN CONTENT -->
<main class="layout-main" id="main-content" role="main">
  <div class="container">
    <!-- Breadcrumb -->
    <ol class="breadcrumb breadcrumbs-list">
      <li><a href="https://ucsd.edu">Home</a></li>
      <li class="active">Current Page</li>
    </ol>

    <!-- h1: Teko SemiBold, #00629b -->
    <h1 class="page-header">Page Title</h1>
    <!-- Lead paragraph: Roboto 300, 21px -->
    <p class="lead">Introductory paragraph.</p>

    <!-- Body content here -->

  </div>
</main>

<!-- FOOTER: bg #00629b (Blue, NOT navy), border-top: 1px solid #ccc -->
<footer class="footer">
  <div class="container">
    <div class="row">
      <!-- Left: address + copyright + links -->
      <div class="col-sm-8">
        <p>
          <span>UC San Diego 9500 Gilman Dr. La Jolla, CA 92093 (858) 534-2230</span><br>
          <span>Copyright &copy; 2026 Regents of the University of California. All rights reserved.</span>
        </p>
        <!-- Links: white, underlined, pipe-separated via border-right: 1px solid #fff -->
        <ul class="footer-links">
          <li><a href="https://accessibility.ucsd.edu/">Accessibility</a></li>
          <li><a href="https://ucsd.edu/about/privacy.html">Privacy</a></li>
          <li><a href="https://ucsd.edu/about/terms-of-use.html">Terms of Use</a></li>
        </ul>
      </div>
      <!-- Right: white UCSD wordmark, 158×30px -->
      <div class="col-sm-4">
        <img src="https://cdn.ucsd.edu/developer/decorator/5.0.2/img/ucsd-footer-logo-white.png"
             alt="UC San Diego" class="img-responsive footer-logo" />
      </div>
    </div>
  </div>
</footer>

<script src="https://cdn.ucsd.edu/cms/decorator-5/scripts/jquery.min.js"></script>
<script src="https://cdn.ucsd.edu/cms/decorator-5/scripts/bootstrap.min.js"></script>
<script src="https://cdn.ucsd.edu/cms/decorator-5/scripts/vendor.min.js"></script>
<script src="https://cdn.ucsd.edu/cms/decorator-5/scripts/base.min.js"></script>
</body>
</html>
```

---

## Chrome colors (from base.min.css)

| Element | Property | Value |
|---|---|---|
| `.layout-header` | background-color | `#2b92b9` |
| `.layout-title` | background | `#fff` |
| `.layout-title` | height | `92px` |
| `.title-header` | color | `#000` |
| `.title-header` | font-size | `1.35rem` |
| `.title-header` | letter-spacing | `1px` |
| `.title-header` | text-transform | `uppercase` |
| `.title-logo` | width × height | `229px × 65px` |
| `.navbar-default` | background-color | `#00629b` |
| `.navbar-default` | min-height | `50px` |
| `.navbar-default .active > a` | background-color | `#004268` |
| `.layout-navbar .navbar-list > li.active > a` | border-bottom | `3px solid #ffcd00` |
| `.navbar-default li > a:hover` | background-color | `#004268` |
| `.navbar-toggle .mobile-nav-bars` | content | three `.icon-bar` spans inside the button |
| `.navbar-toggle .mobile-nav-icon` | content | `MENU` text inside the button |
| `.header-logo` | source | white UCSD wordmark image, visible on extra-small nav |
| `.footer` | background-color | `#00629b` |
| `.footer` | border-top | `1px solid #ccc` |
| `.footer` | font-size | `90%` (~14.4px) |
| `.footer-logo` | width × height | `158px × 30px` |
| `.layout-container` | max-width | `1200px` (960px below 1200px viewport) |

---

## Current sitemap pages

The active non-archive sitemap pages covered by this skill are:

| Page | URL |
|---|---|
| Developer Home | `https://developer.ucsd.edu/index.html` |
| Design | `https://developer.ucsd.edu/design/index.html` |
| Decorator 5 | `https://developer.ucsd.edu/design/decorator/index.html` |
| Templates | `https://developer.ucsd.edu/design/decorator/templates/index.html` |
| Widgets | `https://developer.ucsd.edu/design/decorator/widgets/index.html` |
| Getting Started | `https://developer.ucsd.edu/design/decorator/getting-started/index.html` |
| CMS setup | `https://developer.ucsd.edu/design/decorator/getting-started/cms.html` |
| HTML Tips | `https://developer.ucsd.edu/design/decorator/getting-started/tips.html` |
| ZIP File Guide | `https://developer.ucsd.edu/design/decorator/getting-started/file-guide/index.html` |

Top navigation on these pages also links to UCSD ITS Frontend - Vue, Kitchen
Sink, Archive, and Developer Community. Those are navigation links; do not
import external Vue, archive, or Atlassian content into this Decorator 5
reference.

---

## Current sitemap additions

### Developer Home

The home page includes a carousel hero and secondary jumbotron band:

| Element | Classes / details |
|---|---|
| Hero carousel | `.carousel.slide.jumbotron.jumbotron-hero.hm` |
| Carousel inner | `.carousel-inner`, `.carousel-indicators`, `.item.active`, `.item` |
| Hero media | `.first-slide` images |
| Hero content | `.cr-item-container`, `.animated.fadeInUp`, `.rt-text-light` |
| Hero buttons | `.btn.btn-lg.btn-default`, `.rt-btn-yellow` |
| Controls | `.left.carousel-control`, `.right.carousel-control`, `glyphicon-pause`, `glyphicon-chevron-left`, `glyphicon-chevron-right` |
| Secondary band | `.layout-container.row`, `.jumbotron.jumbotron-sand.overlay-glow-2` |

Visible home headings are "Design", "Develop", and "Decorator Version 5".

### Documentation shell

Current documentation pages use the Decorator chrome plus:

| Element | Classes / attributes |
|---|---|
| Breadcrumb | `<ol class="breadcrumb breadcrumbs-list" aria-label="Breadcrumb">` |
| Main content | `section.main-section.pull-right`, labelled "Main Content" |
| Sidebar | `section.sidebar-section`, `role="complementary"`, labelled "Sidebar" |
| Logo figure | `figure`, `role="complementary"`, labelled "Logo" |
| Sidebar nav | `article.main-content-nav`, `role="navigation"`, labelled "Sidebar Nav" |

Current sidebar groups include Design, Decorator 5, and Getting Started.

### Current documentation topics

| Page | Visible topic |
|---|---|
| Decorator 5 | "Decorator Version 5"; "Overall goals of this version of Decorator:" |
| Templates | "Decorator 5 Templates" |
| Widgets | "Widgets" |
| Getting Started | "Getting Started Using Decorator 5" |
| CMS setup | "Decorator 5 for CMS Sites" |
| HTML Tips | "HTML Tips for Decorator 5" |
| ZIP File Guide | "ZIP file contents" |

### Widgets

The current Widgets page documents:

- FullCalendar: Interactive calendar
- DataTable: Sortable table
- Wizard: Step-by-step instructions
- MaxChar: Limit characters in a form field

The page uses expandable drawer/accordion sections and "Expand All" links.
Individual widget demos link into older `v4-kitchen-sink/widgets/...` paths;
keep those as linked demos, not new current Decorator 5 rules.

### Getting Started

Non-CMS workflow:

1. Download the ZIP file containing the Decorator 5 files.
2. Review the ZIP contents.
3. Choose the HTML file that corresponds to the template.
4. Modify the HTML file.
5. Consult the HTML file guide, HTML tips, and demo.
6. Use the CMS-specific path for CMS sites.

CMS page:

- Direct CMS users to Workplace Technology Services.
- Use the template page and standard CMS directions.
- Refer to HTML Tips for formatting.

ZIP File Guide folders:

| Folder | Purpose |
|---|---|
| `kitchen-sink` | HTML files for kitchen-sink elements. |
| `fonts` | Fonts used in Bootstrap and other scripts; do not remove or move. |
| `img` | Page images; contains demo images. |
| `scripts` | Page JavaScript; contains demo scripts; do not remove. |
| `css` | Decorator CSS; do not store page images in its `img` subfolder. |

ZIP File Guide template files:

| File | Purpose |
|---|---|
| `blank-slate.html` | Blank Slate template |
| `index.html` | Decorator 5 demo |
| `three-column.html` | Three Columns template |
| `two-column.html` | Two Columns template |
| `homepage.html` | Homepage template |

HTML Tips:

- Avoid inline and in-page styling.
- Do not use font tags.
- Use tables for tabular data only.
- Use proper semantic markup.
- Use `<strong>` instead of `<b>`.
- Use `<em>` instead of `<i>`.
- Avoid `<br>` except legitimate address/name-title cases.
- Use `id` attributes instead of named anchors.
- Use double quotes for attributes.
- Avoid dangling elements.
- Use lowercase tags.

---

## Kitchen sink components

All 19 components — fetch live examples from the kitchen sink for exact markup.
Base URL: `https://developer.ucsd.edu/design/v5-kitchen-sink/kitchen-sink/`

| Component | URL path | Key classes |
|---|---|---|
| Alerts | `alerts.html` | `.alert .alert-{success\|info\|warning\|danger}`, `.alert-dismissable`, `.msg.alert`, `.msg.info`, `.styled` |
| Badges | `badges.html` | `<span class="badge">` |
| Breadcrumbs | `breadcrumbs.html` | `<ol class="breadcrumb breadcrumbs-list">`, `.active` on current page `<li>` |
| Buttons | `buttons.html` | `.btn .btn-primary` (Blue), `.btn .btn-default` (Navy); sizes: `-lg -sm -xs`; `.btn-block`; `disabled` |
| Button Dropdowns | `button_dropdowns.html` | `.btn-group`, `.dropdown-toggle[data-toggle="dropdown"]`, `.dropdown-menu` |
| Code | `code.html` | `<code>` (inline), `<pre><code>` (block), `<kbd>`, `<samp>`, `<var>` |
| Dropdowns | `dropdowns.html` | `.dropdown`, `.dropdown-menu`, `.dropdown-header`, `<li class="divider">`, `.disabled` |
| Equal Column Layout | `equal_column_layout.html` | Bootstrap 3 grid: `.row .col-md-{n}` (12-column), `.equal-columns` |
| Forms | `forms.html` | `.form-group`, `.form-control`, `.form-horizontal`, `.form-inline`; validation: `.has-{success\|warning\|error}`; `.help-block`; `<fieldset disabled>` |
| Helper Classes | `helper_classes.html` | `.pull-{left\|right}`, `.center-block`, `.clearfix`, `.sr-only`, `.text-{left\|center\|right\|muted}`, `.bg-{primary\|success\|info\|warning\|danger}` |
| Icons | `icons.html` | `<span class="glyphicon glyphicon-{name}">` — Bootstrap Glyphicons only; Font Awesome not included |
| Images | `images.html` | `.img-responsive`, `.img-rounded`, `.img-circle`, `.img-thumbnail` |
| Input Groups | `input_groups.html` | `.input-group`, `.input-group-addon`, `.input-group-btn`; sizes: `-lg -sm` |
| JavaScript Components | `javascript_components.html` | Tabs (`.nav.nav-tabs`), modals (`.modal`), tooltips, popovers, collapse — all require Bootstrap JS |
| Pagination | `pagination.html` | `<ul class="pagination">`, `<ul class="pager">`; `.active`, `.disabled`, `.previous`, `.next` |
| Panels | `panels.html` | `.panel .panel-{default\|primary}`, `.panel-heading`, `.panel-body`, `.panel-title`; tables nest directly inside panels |
| Progress Bars | `progress_bars.html` | `.progress > .progress-bar[role="progressbar"]`; variants: `-success -info -warning -danger`; `.progress-striped.active` for animated; `<span class="loading">` for indeterminate spinner |
| Tables | `tables.html` | `.table`, `.table-{striped\|bordered\|hover\|condensed}`; wrap in `.table-responsive` for mobile scroll; row/cell context: `.active .success .info .warning .danger` |
| Typography | `typography.html` | `.lead`, `.page-header`, `.list-unstyled`, `.list-inline`, `.dl-horizontal`, `<blockquote>`, `.blockquote-reverse`, `<address>`; external links get a window icon automatically; suppress with `.nonewwin` |

---

## Logo CDN URLs

| Asset | URL |
|---|---|
| Header sprite 1x | `https://cdn.ucsd.edu/cms/decorator-5/styles/img/sprite_base.png` |
| Header sprite 2x | `https://cdn.ucsd.edu/cms/decorator-5/styles/img/sprite_base2x.png` |
| Footer wordmark (white) | `https://cdn.ucsd.edu/developer/decorator/5.0.2/img/ucsd-footer-logo-white.png` |
| Teko font woff2 files | `https://cdn.ucsd.edu/cms/decorator-5/fonts/` |
| Official logo downloads | https://brand.ucsd.edu (Visual Brand → Logos) |

---

## Provenance

Carried forward from the retired `ucsd-branding` skill so its annotated chrome
and component reference is not lost. Where this file and the other references
in this skill disagree, prefer the others: they are derived from pinned vendor
templates, and this one was written from live pages.

## Known upstream inconsistency: two paths for one logo

The UCSD wordmark is served from two different CDN paths on the same page, in
both cases inside protected chrome:

| Region | Path |
|---|---|
| Header, `.visible-xs-block` wordmark | `https://cdn.ucsd.edu/cms/decorator-5/styles/img/ucsd-footer-logo-white.png` |
| Footer logo | `https://cdn.ucsd.edu/developer/decorator/5.0.2/img/ucsd-footer-logo-white.png` |

The footer path is pinned to a frozen `5.0.2` directory under `/developer/`,
outside the `decorator-5` tree everything else tracks. It is consistent across
every page, so a chrome contract will pin it rather than flag it — but if that
frozen directory is ever cleaned up, every footer logo breaks at once and no
Decorator release would signal it.

Do not "fix" this by editing a page. It is a Decorator distribution question:
either the frozen path stays supported, or the templates move to the
`decorator-5` path and every consuming site picks the change up from upstream.
