---
name: ucsd-decorator-kit
description: Install the UC San Diego Decorator Kit before building a UC San Diego web page on the Decorator 5 design system. Use when someone wants to start a new ucsd.edu site, page, or app, or to add the Decorator to a project that does not have the kit yet (no decorator-kit.json at the project root). This skill only installs the kit; the kit's generated rule files, not this skill, govern the work after that.
---

# UC San Diego Decorator Kit — get started

This skill is a pointer, not the rules. The Decorator Kit exists because a skill
file on its own is not enough to keep an agent from damaging the shared
campus page shell. The kit installs the real Decorator source, the rules in the
format your tool reads, and a check that catches shell damage. Install it first,
then follow what it installs.

Source: <https://github.com/UCSD/decorator-kit>

## Install

Requires Node 22 or later.

**New, empty directory:**

```bash
npx ucsd-decorator-kit@latest init
```

**Existing project** (`init` refuses a directory that already has files in it):

```bash
npx ucsd-decorator-kit@latest add --with-decorator
```

`add` writes the rule files and the skill and leaves the rest of the project
alone. `--with-decorator` also installs `ucsd-decorator-v5`, the Decorator
source the rules tell you to read markup from; without it there is nothing on
disk to read.

If you can run shell commands, run the one that fits. If you cannot, give the
person the command and wait for them to run it.

## After it installs

1. Read the rule file it wrote at the project root — `CLAUDE.md`, `AGENTS.md`,
   or your tool's equivalent — and follow it. It overrides anything here.
2. Do not write Decorator markup from memory or from this skill. The rules name
   where to read it from on disk.
3. If the person is not sure what to build, they can say "help me get started"
   and the installed rules run a short interview first.

If the project already has `decorator-kit.json` at its root, the kit is
installed: skip this skill and follow the rule files.
