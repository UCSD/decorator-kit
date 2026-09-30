---
title: Getting started — the kickoff interview
trigger: always_on
order: 60
---

When a developer asks to get started — "help me get started", "where do I
begin", "start a new project", "what should I build this with" — do not start
writing markup. Run this interview first. Skip it when the request already
answers its questions — a named template, a page name, and the pieces to build —
and ask only what is missing.

<!-- on-demand: before you ask the first question -->

The interview exists for developers who know what the app has to do but not
what it should look like: their answers pick the layout, modules, and patterns,
so the first iteration is already close to the goal and stays on brand.

## The visual guide

Every recommendation links a card in the Decorator Kit Developer Guide, so the
developer can see it before agreeing to it. Base URL:
`https://developer.ucsd.edu/design/decorator/user-guide/`. The anchors below
are relative to it — write them out as full links.

## Round 1 — ask all six at once

Ask in one message, as a numbered list with lettered options, so the developer
can reply "1b, 2 students checking waitlists, 3b…". If your environment has a
structured multiple-choice tool, you may use it instead. Always allow a
free-text answer.

1. **What are you building?** (a) a department or information site
   (b) a request, intake, or multi-step application form (c) a dashboard or
   status board (d) a directory, search, or records admin tool (e) a knowledge
   base or help articles (f) something else — describe it in a sentence.
2. **Who uses it, and what is the one thing they must be able to do?** For
   example: "students — check whether they got off a waitlist."
3. **Which campus area?** (a) advising (b) enrollment and courses (c) research
   (d) housing (e) IT services (f) facilities and energy (g) library (h) HR
   (i) other or none.
4. **How will it be built and hosted?** (a) static HTML (b) a JavaScript
   framework such as React or Vue (c) server-rendered templates (d) Cascade CMS
   (e) not sure. The Decorator is Bootstrap 3 and jQuery whatever language the
   app is written in; this decides where the canvas lives, not the look.
5. **What data does it touch?** (a) public information only (b) it needs campus
   sign-in (c) student records, personal, or health data (d) not sure.
6. **Site name**, and a short form of it for phones — a word or an acronym.

## Round 2 — recommend, link, and let the developer choose

Map the answers with these tables. Link every card you recommend.

| Building | Suggested layout | Guide cards |
|---|---|---|
| (a) information site | `homepage.html` for the landing page, `two-column.html` for inner pages | `index.html#r-dept`, `#lay-home`, `#modules`, `#m-tiles`, `#m-news`, `#m-events` |
| (b) request or application | `two-column.html` or `blank-slate.html` | `index.html#r-form`, `#c-forms`, `#w-wiz`, `app-patterns.html#pat-shell`, `#shell-steps` |
| (c) dashboard | `blank-slate.html` | `index.html#r-dash`, `app-patterns.html#dash-workflow`, `#shell-dashboard`, `#blk-kpi`, `#blk-status`, `#blk-filter` |
| (d) directory, search, admin | `blank-slate.html` or `two-column.html` | `index.html#r-dir`, `#w-dt`, `#c-tables`, `app-patterns.html#shell-search`, `#shell-admin`, `#shell-record` |
| (e) knowledge base | `two-column.html` | `index.html#r-kb`, `#c-drawer`, `#c-crumbs` |

| Campus area | Dashboard example to borrow from |
|---|---|
| advising · enrollment · research · housing | `app-patterns.html#dash-advising` · `#dash-enroll` · `#dash-research` · `#dash-housing` |
| IT · facilities · library · HR | `app-patterns.html#dash-its` · `#dash-energy` · `#dash-library` · `#dash-hr` |

- **Build (b) or (c):** the canvas is still `main#main-content`. If the
  project uses a component library, it goes in `canvas-components/` — link
  `app-patterns.html#brand-layer`. **(d) Cascade:** content goes into the
  page's canvas region only. **(e):** recommend static HTML.
- **Data (b), (c), or (d):** say that the security rules apply from the first
  commit — campus SSO, no real records in placeholder content, nothing
  sensitive in URLs or logs.

**Recommend a layout, but do not choose it.** Link all four layout cards —
`index.html#lay-blank`, `#lay-two`, `#lay-three`, `#lay-home` — say which one
you suggest and why in one sentence, and wait for the developer to pick. The
template-selection rule still holds: the choice is theirs.

## Write the brief before building

Once the layout is chosen, save `BRIEF.md` at the project root and show it:

```markdown
# Build brief — <site name> (<short form>)

- **Building:** <one sentence>  ·  **For:** <audience>  ·  **Must do:** <the one task>
- **Layout:** <template> saved as <file name>
- **Stack:** <build and hosting>  ·  **Data:** <classification, sign-in>
- **Canvas, top to bottom:** 1. <module or pattern> — <purpose> (<guide link>) …
- **Placeholders:** <which content is not real yet>
```

Build from the brief, following every kit rule: copy the chosen template,
rewrite its asset paths to `cdn.ucsd.edu`, set the site name and its short form,
fill only the canvas, and sync every navigation surface. Then run `verify`.

## Finish with next steps

End the first iteration with: what was built, `verify`'s result, the review
prompt at `index.html#g-review`, and two or three next prompts taken from the
guide cards you linked. Later sessions read `BRIEF.md` before changing the
page, and update it when the plan changes.
