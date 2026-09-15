# canvas-components

Component libraries this project uses inside its **canvas**: shadcn/ui, a
charting library, a set of web components. The canvas is the one writable region
of every page, the `canvas` selector in `decorator-kit.json`
(`main#main-content` by default). Give each library its own folder here, and AI
coding agents working in this project can build the canvas with it.

## Adding a library

1. Make a folder for it: `canvas-components/<library>/`.
2. Put the files the page loads in it: CSS, JS, or the library's build output.
3. Add a `README.md` to the folder. `sync` compiles it into the rule files
   agents read, so write it for them. Say what the library is for, how the page
   loads it, which components to reach for, and what to avoid. There's an
   example at the end of this file.
4. Run `npx ucsd-decorator-kit sync`, or `npm run decorator:sync`, and commit
   the result. The `decorator:check` CI job fails if you forget.

A folder with no README still gets listed, but agents are told to ask before
using that library.

## What a library changes

Once a library is here, three Decorator rules relax inside the canvas:

- Agents may use the library's components and classes, not only the ones the
  Decorator stylesheet styles.
- They may use the library's icon set instead of Glyphicons.
- Headings inside a library component may take the library's styling.

What doesn't change:

- **Typography stays on brand:** Roboto, Teko, Brix Sans, or Refrigerator
  Deluxe. Set the library's fonts to them, and load the brand fonts from an
  approved UC San Diego source.
- Every rule about the chrome, accessibility, and security stays as it is.
  The chrome is the header, navbar, mobile drawer, search, and footer.

## Keeping it inside the canvas

A library's own defaults are usually what leaks into the header and footer.
Before adding one, check:

- **No global reset.** Turn off anything like Tailwind's Preflight. If the
  library needs a reset, scope it to your app's root element.
- **No bare element selectors.** Every rule names a class, id, or attribute:
  write `.app h1`, not `h1`.
- **Prefixed class names.** Bootstrap already uses `collapse`, `container`, and
  `hidden`, and the navbar depends on `collapse`. With Tailwind, set a prefix
  and give shadcn's `components.json` the same one.
- **Leave the page ground white.** No background on `html`, `body`, or the
  canvas root (shadcn's default `body` background included), and no full-bleed
  tricks such as `width: 100vw`. `verify` flags both.
- **Popups stay in the canvas.** Dialogs, popovers, menus, and toasts render
  into a container inside the canvas, not `document.body`.
- **Theme variables** go on your app's root element, if the library allows it.

`verify` scans every CSS file in this folder, minified ones included, and fails
on two things:

- a selector that names no class, id, or attribute (`*`, `html`, `body`, `h1`,
  `ul`), unless its rule only sets custom properties
- a selector that reaches a class or id belonging to the Decorator shell

## Example library README

```md
# shadcn/ui

React components for the canvas app. Built from `app/` into this folder's
`dist/`. The page loads `dist/app.css` and `dist/app.js`, which mount into
`#app-root` inside the canvas.

## Use it for

Forms, dialogs, data tables, and menus inside `#app-root`.

## Setup

- Tailwind prefix `tw:`. Preflight is off, and the reset is scoped to `#app-root`.
- Popups render into `#app-portal`, inside the canvas.
- Fonts are set to Roboto for body text and Teko for display headings.

## Avoid

- Decorator module markup inside the React app.
- Library classes on Decorator modules.
```
