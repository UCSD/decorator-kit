---
title: Components, widgets, and modules
trigger: always_on
order: 20
---

Never hallucinate markup for a standard component. Copy it from the reference
file.

## Kitchen sink — partial extraction only

`kitchen-sink/*.html` files are galleries with many variations of one component.
Locate the precise variation requested — usually inside a `.bs-example` wrapper
— and extract **only that block**. Never copy a whole kitchen-sink file.

Available: `alerts` · `badges` · `breadcrumbs` · `buttons` ·
`button_dropdowns` · `code` · `dropdowns` · `equal_column_layout` · `forms` ·
`helper_classes` · `icons` · `images` · `input_groups` ·
`javascript_components` · `pagination` · `panels` · `progress_bars` · `tables` ·
`typography`

After extracting, fix relative asset paths for the new location, and confirm the
accessibility attributes that came with the component are still intact.

## Widgets — bring the dependencies

`widgets/*.html` (DataTables, FullCalendar, Wizard, MaxChar) need more than
markup:

1. Extract the component markup into the canvas.
2. Read the reference file's `<head>` and the bottom of its `<body>`; bring
   across the widget-specific `<link>` and `<script>` tags.
3. Fix relative paths for the new file's location.
4. Move initialization logic into a named file under `js/`.

## Modules — preserve structure, replace content

`templates/modules.html` holds structural content blocks. Copy the wrapper, grid
columns, and CSS classes exactly. Replace only text, image `src`/`alt`, and link
`href`.

Never change: `.container`, `.row`, `.col-*`, `.panel`, `.jumbotron*`, or any
module wrapper class.

For JS-driven news and event listings, the **only** editable value is the
endpoint URL. The population logic must not be altered.

Modules available: text and CTA with image, callout content (one to four boxes),
full-width text, video embed, drawer/accordion, rotator, news listings (static
and auto-populated), event listings, callout blocks, contact and map, social
icons.
