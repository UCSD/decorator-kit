# Component inventory

Three kinds of reusable markup, with different extraction rules.

## Templates — `templates/`

Whole-page layouts. Copy the entire file to the project root under a new name,
then work only inside its canvas.

| File | Shape |
|---|---|
| `blank-slate.html` | Open canvas below the navbar |
| `two-column.html` | Left sub-navigation, canvas in the wider right column |
| `three-column.html` | Left menu, wide middle canvas, right info column |
| `homepage.html` | Carousel hero and callout modules |
| `index.html` | Documentation landing |
| `modules.html` | The module gallery — see below |
| `event-detail.html`, `profile-test.html` | Specialized layouts |

**Never pick one by default.** If the user has not named a template, stop and
ask.

## Kitchen sink — `kitchen-sink/`

Galleries with many variations of one component. **Extract only the variation
requested**, usually from inside a `.bs-example` wrapper. Never copy a whole
kitchen-sink file.

`alerts` · `badges` · `breadcrumbs` · `buttons` · `button_dropdowns` · `code` ·
`dropdowns` · `equal_column_layout` · `forms` · `helper_classes` · `icons` ·
`images` · `input_groups` · `javascript_components` · `pagination` · `panels` ·
`progress_bars` · `tables` · `typography`

`javascript_components.html` covers modals, tooltips, popovers, tabs, and
carousels.

## Widgets — `widgets/`

Heavier components with their own dependencies: `datatables`, `fullcalendar`,
`wizard`, `MaxChar`.

Procedure:

1. Extract the component markup into the canvas.
2. Read the reference file's `<head>` and the bottom of its `<body>`; bring
   across the widget-specific `<link>` and `<script>` tags.
3. Fix relative paths for the new file's location.
4. Move initialization out of inline `<script>` into a named file under `js/`.

## Modules — `templates/modules.html`

Structural content blocks. Copy the wrapper, grid columns, and CSS classes
**exactly**; replace only text, image `src`/`alt`, and link `href`.

| Module | Structure (do not change) | Replaceable |
|---|---|---|
| Text and CTA with image | `.jumbotron.side-image-white`, `.col-md-6`, `<figure>` | headings, copy, CTA, image |
| Callout content (1–4 boxes) | `.jumbotron-callout-content-*`, `.panel.panel-primary` | background, headings, blurbs, links |
| Full width text | `.jumbotron-full-width` | heading, copy, CTA |
| Video embed | `.embed-video` | `<iframe>` `src`, adjacent text |
| Drawer / accordion | `.drawer-wrapper`, `.drawer.dark-theme` | headings, body content |
| Rotator | `.carousel.slide.qb-carousel`, `.carousel-indicators`, `.item` | images, captions, links — keep indicator count matching slides |
| News listings | `.jumbotron-news`, `.panel.panel-default` | cards; for the JS-driven variant, **only** the endpoint URL |
| Event listings | `.event-listing`, `.col-md-3` / `.col-md-9` | image, title, date, blurb |
| Callout blocks | `.jumbotron-cta-blocks`, `.flex`, `.wrapper` | background images, text links |
| Contact and map | `.contact-module` | map `iframe`, address, phone, `mailto:` |
| Social icons | `.social-media-module`, `.btn-social-icon` | `href` values |

For JS-driven listings the population logic must not be altered — the only
editable value is the endpoint URL.

## Where these files live

In resolution order: `node_modules/ucsd-decorator-v5/dist/`, the project's pinned
`vendor/decorator-5/`, then `core-template/`. If none of those exist, install or
pin the package — `npm i -D ucsd-decorator-v5` — rather than fetching the hosted
kitchen sink, which is a gallery wrapped in Decorator chrome and the source of
the demo-scaffolding regressions this page exists to prevent.

Inside the package, component galleries are at `dist/kitchen-sink/` and widget
reference pages at `dist/widgets/`. Nothing under `dist/vendor/` is Decorator
markup — that tree holds FullCalendar and Modernizr demo pages, which will match
a component search and are not ours.
