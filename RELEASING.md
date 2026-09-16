# Releasing

`ucsd-decorator-kit` is published to npm from GitHub Actions, by
[`.github/workflows/publish.yml`](.github/workflows/publish.yml), when a GitHub
release is published. Nobody runs `npm publish` from a laptop after the first
release.

## Cutting a release

1. In a pull request:
   - Set the new version in `package.json` and `.claude-plugin/plugin.json`.
     `npm test` fails if the two differ.
   - Move the `## Unreleased` entries in `CHANGELOG.md` under a heading for the
     new version.
2. Merge it.
3. Create a GitHub release from `main` with the tag `v<version>` — for example
   `v2.1.0`. Publishing the release starts the workflow.

The workflow refuses a tag that doesn't match `package.json`, and `npm publish`
runs `npm test` first (`prepublishOnly`). That includes
`test/package.test.mjs`, which packs the tarball, installs it into an empty
project, and runs `add`, `check`, and `verify` from the installed copy.

To see exactly what will ship:

```bash
npm pack --dry-run
```

## Ownership

The package belongs to the `chorta` npm account, the same owner as
[`ucsd-decorator-v5`](https://www.npmjs.com/package/ucsd-decorator-v5).

## First publish (one time)

npm trusted publishing is configured from the package's settings page on
npmjs.com, which exists only once the package does. So the first version goes
up by hand:

1. From a clean checkout of `main`, signed in to npm as `chorta` with
   two-factor authentication on, run `npm publish`.
2. On npmjs.com, open the package's **Settings** and add a trusted publisher:
   GitHub Actions, organization `UCSD`, repository `decorator-kit`, workflow
   `publish.yml`.
3. On the same page, under publishing access, require two-factor
   authentication and disallow tokens. Trusted publishing is unaffected, and no
   long-lived token can publish the package.

Every release after that goes through the steps above.
