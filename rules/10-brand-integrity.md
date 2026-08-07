---
title: Brand integrity
trigger: always_on
order: 10
---

## Styling

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

## Verified chrome facts

Agents get these wrong from memory. They are verified against live production.

- Footer is UC San Diego Blue `#00629b`, not navy.
- `.layout-header` is `#2b92b9`; the white band is `.layout-title` inside it.
- There is no gold rule on the white title band.
- The `.navbar-default` active item is dark blue `#004268`, not a gold
  underline. Do not apply the `.layout-navbar .navbar-list` underline pattern to
  Bootstrap `.navbar-default .navbar-nav` tabs.
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

## Scope

This covers the Decorator page shell. It is not a general UC San Diego brand
manual and says nothing about print typography, email templates, dark mode,
data-visualization palettes, or design-token maps. For those, fetch the current
official source and keep it separate from the Decorator contract.
