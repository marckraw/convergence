# Release, Distribution, and Changelog Plan

> Planning document for Convergence release workflows.
> Current scope: macOS distribution for personal/internal use first.

## Objective

Define a release system that covers:

- semantic versioning via Changesets
- installable macOS builds
- GitHub Releases with release notes
- an in-app changelog / "What's New" surface

This document is intentionally separate from auto-update. Auto-update remains out of scope for the first release system.

## Current State

Today the repo has:

- Electron app builds via `electron-vite`
- no packaging layer for installable app artifacts
- no Changesets setup
- no GitHub Actions release workflow
- no bundled release metadata for an in-app changelog

## Release Principles

1. Changesets is the source of truth for version bumps and release note content.
2. GitHub Releases is the public release surface.
3. The app should ship with a bundled changelog, not depend on GitHub availability at runtime.
4. macOS packaging comes first.
5. Public GitHub Releases use Developer ID signing and notarization, while unsigned local packaging remains available for owner-only builds.

## Decision: Unsigned macOS Releases First

### Short-term decision

For local owner-only packaging, unsigned and unnotarized macOS builds are still acceptable.

This is only acceptable because:

- the app can still be built locally for personal/internal use
- unsigned artifacts remain explicitly separated from public releases
- GitHub Releases will follow the signed/notarized path

### Tradeoff

Unsigned/unnotarized macOS builds will not pass the default Gatekeeper trust path cleanly. Opening them may require manual user action such as:

- opening the app through Finder context menu + `Open`
- approving the app from `System Settings > Privacy & Security > Open Anyway`
- removing quarantine attributes manually in local development workflows

This is acceptable for now, but it is not the long-term distribution model.

In practice, Convergence keeps separate unsigned packaging commands for local builds instead of relying on machine state.

### Future rule

When Convergence is intended for other users, the release pipeline must move to:

- Developer ID signing
- hardened runtime
- notarization
- stapled notarization ticket

At that point unsigned releases should be treated as development artifacts only.

## Proposed Tooling

### Versioning and changelog

Use:

- `@changesets/cli`

Responsibilities:

- developers add a changeset for user-visible changes
- `changeset version` updates `package.json`
- `changeset version` updates `CHANGELOG.md`

### App packaging

Use:

- `electron-vite` for build
- `electron-builder` for packaging

Responsibilities:

- build app bundles
- create installable macOS artifacts
- sign and notarize public release artifacts in GitHub Actions

Packaging scripts:

- `npm run package:mac` — build signed/notarized-release-ready macOS DMG + ZIP artifacts
- `npm run package:mac:dir` — build a signed/notarized-release-ready unpacked app directory
- `npm run package:mac:unsigned` — build unsigned macOS DMG + ZIP artifacts for local-only use
- `npm run package:mac:dir:unsigned` — build an unsigned unpacked macOS app directory

### Release publishing

Use:

- GitHub Actions
- GitHub Releases

Responsibilities:

- create packaged artifacts on macOS runners
- publish release assets
- publish release notes derived from Changesets / changelog output

## Proposed Release Flow

### Development flow

For user-facing work:

1. Implement change
2. Add changeset
3. Merge to `master`

### Release flow

1. Run Changesets release flow to prepare version bump and changelog
2. Merge release commit / release PR
3. Tag release version
4. Build macOS artifacts
5. Publish GitHub Release with release notes
6. Attach DMG/ZIP assets

## Proposed Artifact Strategy

Initial macOS targets:

- `.dmg`
- `.zip`

Initial architecture strategy:

- prefer `arm64` first if release speed is the main priority
- optionally add `x64` in the same pipeline shortly after
- universal binaries are not required for the first release system

## GitHub Release Notes Strategy

GitHub Releases should use release notes generated from the versioned changelog produced by Changesets.

Preferred approach:

1. Changesets updates `CHANGELOG.md`
2. release workflow extracts the newest release section
3. that section becomes the GitHub Release body

This keeps:

- version number
- release notes
- repo changelog
- GitHub release text

all aligned from one source.

## In-App Changelog Strategy

### Decision

Use bundled release metadata inside the app, not live GitHub fetches as the primary source.

### Why

Bundled release notes:

- work offline
- always match the installed app version
- have no API dependency
- avoid rate limit/auth concerns
- are simpler to test

### Implementation direction

At release/build time:

1. derive structured release notes from `CHANGELOG.md`
2. generate a JSON artifact, for example `release-notes.json`
3. bundle that JSON into the application

In the app:

- add an `About` surface with current version/build metadata
- add a `What's New` / changelog surface that reads bundled release notes
- store the last viewed version locally so the app can highlight what changed after an update

### Optional future enhancement

Later, the app may also query GitHub Releases to check:

- whether a newer version exists
- whether newer release notes are available online

That should be additive only. The bundled changelog remains the canonical in-app history.

## Planned Work Breakdown

### Step 1: Release metadata foundation

- add Changesets
- add Changesets config
- define contributor workflow for adding changesets

### Step 2: Packaging foundation

- add `electron-builder`
- define app id, product name, mac targets, output naming
- add packaging scripts to `package.json`
- explicitly disable signing auto-discovery in local mac packaging commands

### Step 3: Release automation

- add GitHub Actions workflow for CI validation
- add GitHub Actions workflow for Changesets-managed release PRs
- add GitHub Actions workflow for tag-driven macOS packaging/publishing
- wire changelog section into GitHub Release body

### Step 4: In-app release notes

- define release notes JSON shape
- generate bundled release notes at build time
- add `About` / `What's New` UI

### Step 5: Public signing/notarization

- import the `Developer ID Application` certificate into a temporary CI keychain
- download Apple intermediate certificates during the release workflow
- enable hardened runtime, entitlements, signing, and notarization
- notarize using `APPLE_ID`, the Apple app-specific password, and `APPLE_TEAM_ID`
- publish signed/notarized DMG and ZIP assets to GitHub Releases

Required GitHub secrets:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_ID`
- `APPLE_ID_PASSWORD`

## Open Questions

1. Should the first packaged release be `arm64` only or both `arm64` and `x64`?
2. Should the release flow be tag-driven or release-PR-driven?
3. Where should the app surface the changelog first:
   - About dialog
   - dedicated changelog page
   - first-run "What's New" modal after update

## Recommended Initial Direction

Implement in this order:

1. Changesets
2. electron-builder mac packaging
3. GitHub Release workflow
4. bundled in-app changelog

Do not block the first release system on:

- auto-update
- universal mac binaries
- live GitHub release fetching

## GitHub Actions Workflow Shape

Initial workflow split:

### CI workflow

Runs on:

- pull requests to `master`
- pushes to `master`

Responsibilities:

- install dependencies
- require a changeset on normal PRs
- run `test:pure`
- run `test:unit`
- run `chaperone check --fix`
- run `typecheck`

### Release PR workflow

Runs on:

- pushes to `master`

Responsibilities:

- use the Changesets GitHub Action
- create/update the release PR
- run `changeset version`
- update `package.json` and `CHANGELOG.md`

### Publish release workflow

Runs on:

- pushed tags matching `v*`

Responsibilities:

- verify tag matches `package.json` version
- build unsigned macOS artifacts
- extract the matching changelog section
- create a GitHub Release
- attach DMG/ZIP assets and release metadata files
