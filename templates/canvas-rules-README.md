# canvas-rules

Rules for this project's **canvas**: the one writable region of every page, the
`canvas` selector in `decorator-kit.json` (`main#main-content` by default). Drop
a Markdown file in this directory and every AI coding agent working in this
project follows it.

## Adding a rule

1. Add a `.md` file here. One topic per file reads best: `components.md`,
   `content-voice.md`, `data-tables.md`.
2. Run `npx ucsd-decorator-kit sync`, or `npm run decorator:sync`.
3. Commit the new file along with the regenerated `CLAUDE.md`, `.cursorrules`,
   and `.github/copilot-instructions.md`, plus `AGENTS.md` if the kit manages it
   in this project.

`sync` compiles every file here into a "Project canvas rules" section at the end
of each of those files. That is how Claude Code, Cursor, Copilot, and
Antigravity all pick the rules up with no extra setup. The `decorator:check` CI
job fails if a file here changed and nobody ran `sync`.

- Files are compiled in filename order. Prefix them `10-`, `20-`, and so on to
  control the order.
- Each rule's title is its frontmatter `title:` if it has one, otherwise its
  leading `# Heading`, otherwise the filename.
- Only `*.md` files directly in this directory are compiled. Subdirectories and
  this README are not.
- Edit the files here, never the compiled section. `sync` overwrites it.

## What belongs here

Anything about what gets built inside the canvas: house components and when to
use them, content and naming conventions, how the site loads its data, which
Decorator modules it uses, and accessibility requirements specific to this
project.

## What does not

Nothing about the chrome: the header, the title band, `#uc-emergency`, the
navbar, the mobile drawer, either search form, the footer, or any embedded
campus widget. That includes CSS or JS aimed at any of them.

The compiled section tells agents that these rules apply only inside the canvas
and rank below the kit's own rules. An agent ignores a chrome instruction here
and says so. It does not follow it.

A chrome change goes through a reviewed diff and a `verify --accept` that a
human runs. A rule file can't authorize one. For details, see "The chrome
integrity gate is not yours to satisfy" in `CLAUDE.md`.
