# Decorator 5 shell anatomy

## Asset stack

Load the real Decorator styles and scripts from the CDN. Do not vendor them for
serving.

```html
<link href="//cdn.ucsd.edu/cms/decorator-5/styles/bootstrap.min.css" rel="stylesheet">
<link href="//cdn.ucsd.edu/cms/decorator-5/styles/base.min.css" rel="stylesheet">
```

```html
<script src="https://cdn.ucsd.edu/cms/decorator-5/scripts/modernizr.min.js"></script>
<script src="https://cdn.ucsd.edu/cms/decorator-5/scripts/jquery.min.js"></script>
<script src="https://cdn.ucsd.edu/cms/decorator-5/scripts/bootstrap.min.js"></script>
<script src="https://cdn.ucsd.edu/cms/decorator-5/scripts/vendor.min.js"></script>
<script src="https://cdn.ucsd.edu/cms/decorator-5/scripts/base.min.js"></script>
```

Order matters. `modernizr` goes in `<head>`; the rest go at the end of `<body>`.

## Structure

```text
.layout-header        bg: #2b92b9
  a.skip-to-main      first focusable element on the page
  #uc-emergency       campus emergency broadcast target, empty in source
  .layout-title       bg: #fff, height 92px
    .title-header     black uppercase site title, 1.35rem, 1px letter spacing
    .title-logo       229x65 sprite link to ucsd.edu
.navmenu.offcanvas    mobile drawer — a SIBLING of nav.navbar, not a child
  ul.navbar-nav       drawer search
  ul.navmenu-nav      drawer navigation
nav.navbar-default    bg: #00629b, white links
  hover/open/active   bg: #004268
  .navbar-toggle      contains .mobile-nav-bars (3x .icon-bar) and .mobile-nav-icon
  .navbar-collapse    desktop navigation and search
.layout-main          content area
  main#main-content   THE CANVAS
  .main-section       primary content section
  .sidebar-section    complementary sidebar
  .main-content-nav   sidebar navigation
.footer               bg: #00629b, white links/text, 158x30 footer logo
```

## Facts agents get wrong

- The footer is UC San Diego Blue `#00629b`, not navy.
- There is no gold rule on the white title band.
- The outer `.layout-header` wrapper is `#2b92b9`; the white band is
  `.layout-title` inside it.
- The `.navbar-default` active item is dark blue `#004268`. Do not apply the
  `.layout-navbar .navbar-list` gold underline pattern to Bootstrap
  `.navbar-default .navbar-nav` tabs.
- The mobile `MENU` label lives inside `.navbar-toggle`, in `.mobile-nav-icon`,
  alongside `.mobile-nav-bars`. It is not a loose sibling.
- The offcanvas drawer is a sibling of `nav.navbar`, not nested inside it.
- Jasny Bootstrap **clones the drawer into the body at runtime**. A live DOM
  therefore contains navigation markup that exists in no file. Never read chrome
  out of a browser.
- Icons are Bootstrap 3 Glyphicons plus the Decorator social icons. Font
  Awesome is not part of the current surface.
- Typography is Roboto and Teko. Do not introduce other families.

## Out of scope

This is the Decorator page shell, not a general UC San Diego brand manual. It
does not cover print typography, email templates, dark mode, data-visualization
palettes, Tailwind or shadcn token maps, or React/Vue application architecture.
For those, fetch the relevant current official source and keep it separate from
the Decorator contract.
