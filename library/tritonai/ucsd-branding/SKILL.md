---
name: ucsd-branding
description: Retired. Superseded by the ucsd-decorator skill, which covers the UC San Diego Decorator 5 page shell, kitchen-sink components, widgets, modules, accessibility, and security. Load ucsd-decorator instead for any UCSD web branding, campus page chrome, Decorator template, or kitchen-sink work.
---

# Retired — use `ucsd-decorator`

This skill has been replaced by **`ucsd-decorator`**. Load that one instead.

## Why it was retired

It instructed agents to resolve markup by fetching the live
`developer.ucsd.edu` pages first. Those pages are themselves Decorator pages
wrapped in chrome, so an agent following the instruction faithfully still ended
up reconstructing markup from a rendered DOM. Two consequences showed up in
production work:

- **The offcanvas drawer is cloned at runtime.** Jasny Bootstrap duplicates the
  mobile drawer into the body on load, so a live DOM contains navigation markup
  that exists in no source file. Reading it back produced duplicated markup.
- **Kitchen-sink pages are galleries.** Copying what looked like a component
  fused demo scaffolding into production markup.

The most visible regression: the mobile drawer's search **form** was replaced
with a **link** to the search page. Near-identical visually; it drops the scope
selector and the typed query and submits nothing to the hosted search API.

## What replaced it

`ucsd-decorator` keeps everything correct here — the CDN asset stack, the
verified chrome colors and dimensions, the "facts agents get wrong" list — and
adds what was missing:

- Markup resolves from **files** (a pinned template copy or the npm package),
  with `developer.ucsd.edu` demoted to an explicitly provisional last resort.
- A hard rule against reconstructing chrome from a rendered DOM, with the
  reasons stated.
- One named **canvas** per project; everything outside it is chrome, with an
  escalation path instead of a silent edit.
- Verbatim markup for the regions that actually break, so there is a canonical
  copy to restore from.
- Component, widget, and module extraction rules; navigation synchronization;
  WCAG 2.1 AA; and UC IS-3 security requirements.
- A three-tier chrome contract that CI can enforce.

Source and full documentation:
<https://github.com/chorta/ucsd-decorator-kit>
