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

**Presence in the kitchen sink is not brand endorsement.** These pages are
Bootstrap 3's own component documentation, vendored — that is why they carry
Bootstrap's docs classes `.bs-example` and `.highlight`, and why `alerts.html`
demonstrates `alert-info`, `alert-success`, and `alert-danger`, none of which
the Decorator styles. Measured 2026-09: 294 of the classes these pages
demonstrate have no rule in `base.css` at all. The kitchen sink shows you what
Bootstrap can do; `base.css` decides what is on brand. Check the class against
`base.css` before shipping it — see "Bootstrap loads, but Bootstrap is not the
brand" in the brand rules.

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
and auto-populated), event listings, tiles with links, contact and map, social
icons.

## Every module is designed for one image size

Modules crop and zoom their images to fit; they do not letterbox. An image at
the wrong size is not merely scaled, it loses whatever the crop takes off.

These are the sizes the campus CMS publishes for each module. Measured 2026-09
against the CMS example site's image library, `department.ucsd.edu/image-library/`
— all 291 assets it ships match the size its page documents.

| Module | Image size | CMS field |
|---|---|---|
| Hero — homepage, required | 1440 × 530 | Background Image |
| Intro banner — article template | 1500 × 480 | Background Image |
| Image rotator — every template but homepage | 900 × 335 | per slide |
| Call to action | 550 × 370 | Image |
| Call to action — inset | 1200 × 388 | Background Image |
| Callout content | 1200 × 410 | Background — Custom Image |
| Text block | 1200 × 410 | Module Style → Custom Background Image |
| Tiles with links | 550 × 370 | Image |
| News with images | 388 × 246 | Image, on each of the three items |
| Taller callout content or text block | 1200 × 800 | as above |
| Profile photo | 198 × 231 | Profile Image |

The homepage hero and the image rotator are different modules. The rotator is
not available on the homepage template, which has the hero built in; the hero
size does not carry over to it.

**Reach for 1200 × 800 when the module grows.** Callout content and text block
scale their background to a height set by how much text is in the module, and
the 1200 × 410 crops assume the homepage template, two or three callout boxes,
and the recommended amount of copy. A fourth box, a long text block, or another
template makes the module taller and the crop deeper. That is what the 1200 × 800
set is for.

**One size throughout a module.** Hero slides, rotator slides, and the three
news items each have to match each other within their own module.

**Every background image gets covered by something.** Choose images that still
read once it is:

- Call to action — inset: the text box covers roughly half the image.
- Callout content: semi-transparent dark blue boxes sit over it.
- Tiles with links: uploaded tile images are shaded automatically so white text
  stays readable, and the shading cannot be turned off.
- Text block: a blue or navy overlay color.
- Call to action overlays 1 and 2: `overlay-glow-1.png` and `overlay-glow-2.png`,
  both exactly 550 × 370, composited over the figure with
  `mix-blend-mode: lighten` and `background-size: cover`. An image at another
  aspect ratio puts the glow in the wrong place.

**Never bake text into the image.** It does not reflow, does not translate, does
not survive the crop, and is invisible to a screen reader. Put the words in the
module's headline, blurb, and link fields, which every one of these modules has.

**Images go in `_images`, never `_modules`.** A module defaults to the
`_modules` folder and its images do not go with it: an image left in `_modules`
does not publish and will not display on the live site.

**Test anything that deviates.** The published sizes were tested on the homepage
template with the recommended amount of text. A different template, a longer
blurb, or a custom size needs checking at several widths before it ships.

Library images are licensed for official UC San Diego marketing and promotional
material only, credited to UC San Diego Publications. Do not repurpose them for
anything else.

## Module facts that contradict the shipped demo file

Three things in `templates/modules.html` will mislead you if you copy them
straight across. All three verified 2026-09 against the live
`cdn.ucsd.edu/cms/decorator-5/styles/base.min.css`, which is the authority.

**The tiles module's wrapper class in the demo file is styled by nothing.**
`modules.html` marks that module `class="jumbotron jumbotron-cta-blocks"`, and
`.jumbotron-cta-blocks` appears zero times in the CDN stylesheet and zero times
in the package's own `base.css`. The class that production pages and the
stylesheet both use is `.jumbotron-tile-links`:

```css
.jumbotron-tile-links .background-image {
  width: 100%;
  height: 200px;
  object-fit: cover;
  border-radius: 14px;
}
```

So a tile image is cropped to a 200px-tall, full-column-width box — keep the
subject centered. Copying the `modules.html` block verbatim instead gives six
800 × 540 images at natural size inside a module nothing lays out.

**Those same six `<img class="background-image">` tags carry no `alt` attribute
at all** — not `alt=""`, no attribute. Add one to each; the accessibility rules
in this kit apply to markup you copy just as much as to markup you write.

**`.embed-video` is not a 16:9 box.** It is `padding-bottom: 51.1%`, roughly
1.96:1, on both the CDN and the package, even though the comment beside the
declaration says `16:9 aspect ratio (most common)`. A 16:9 video letterboxes
inside it. That is how the module ships — do not add CSS to fight it.

## Social icon sizes fall under the touch target minimum

The social icon list has three sizes, and two of them are too small to be the
tap target under the accessibility rules in this kit, which require 44 × 44:

| Class | Rendered size |
|---|---|
| `.social-list li` (default) | 33px tall |
| `.md-icons li` | 40px |
| `.lg-icons li` | 55px |

Only `.lg-icons` clears 44px. Use it whenever the icon itself is what a person
taps. `.horz-icons` lays any of the three out in a row and changes padding, not
icon size.
