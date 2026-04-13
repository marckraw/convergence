# Changesets In Convergence

Convergence uses Changesets as the source of truth for:

- application version bumps
- repository changelog entries
- future GitHub Release notes

This repo is a single-package Electron app, so Changesets is used for versioning and changelog management only. We are not publishing to npm.

## Normal workflow

For a user-visible change:

1. Finish the feature/fix
2. Run `npm run changeset`
3. Describe the user-facing change
4. Commit the generated changeset file with the code change

## Release workflow

When preparing a release:

1. Run `npm run changeset:version`
2. Review the updated `package.json` version
3. Review the generated `CHANGELOG.md`
4. Commit the release version/changelog update

Packaging and GitHub Release publishing are handled separately from Changesets.
