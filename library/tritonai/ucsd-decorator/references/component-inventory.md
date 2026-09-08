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
| Tiles with links | `.jumbotron-tile-links`, `.flex`, `.wrapper` | background images, text links |
| Contact and map | `.contact-module` | map `iframe`, address, phone, `mailto:` |
| Social icons | `.social-media-module`, `.btn-social-icon` | `href` values |

For JS-driven listings the population logic must not be altered — the only
editable value is the endpoint URL.

### Image size per module

Modules crop and zoom their images rather than letterboxing them, so the size
is part of the contract. Measured 2026-09 against the CMS example site's image
library, `department.ucsd.edu/image-library/`; all 291 assets it ships match the
size its own page documents.

| Module | Image size |
|---|---|
| Hero — homepage, required | 1440 × 530 |
| Intro banner — article template | 1500 × 480 |
| Image rotator — every template but homepage | 900 × 335 |
| Call to action | 550 × 370 |
| Call to action — inset | 1200 × 388 |
| Callout content | 1200 × 410 |
| Text block | 1200 × 410 |
| Tiles with links | 550 × 370 |
| News with images | 388 × 246 |
| Taller callout content or text block | 1200 × 800 |
| Profile photo | 198 × 231 |

Callout content and text block scale their background to a height driven by how
much text sits in the module; the 1200 × 410 crops assume the homepage template,
two or three boxes, and the recommended amount of copy. Four boxes, a long text
block, or another template calls for the 1200 × 800 set.

Hero slides, rotator slides, and the three news items must each be one
consistent size within their own module. Images belong in `_images` — an image
left in the module's default `_modules` folder does not publish.

### Three traps in the shipped demo file

Verified 2026-09 against the live `cdn.ucsd.edu/cms/decorator-5/styles/base.min.css`.

- **`.jumbotron-cta-blocks`, the class `modules.html` puts on the tiles module,
  is styled by nothing** — zero occurrences in the CDN stylesheet and zero in
  the package's `base.css`. The real class is `.jumbotron-tile-links`, whose
  `.background-image` rule is `width: 100%; height: 200px; object-fit: cover`.
  Tile images crop to a 200px-tall box, so keep the subject centered.
- **The six `<img class="background-image">` tags in that block have no `alt`
  attribute at all.** Add one to each.
- **`.embed-video` is `padding-bottom: 51.1%`** (≈1.96:1), not 16:9, despite the
  comment beside it claiming 16:9. A 16:9 video letterboxes inside it.

Social icons render 33px (`.social-list`), 40px (`.md-icons`), and 55px
(`.lg-icons`). Only `.lg-icons` meets the 44 × 44 touch target minimum.

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
