# Auto-updates — operator runbook

Short operational guide for the auto-update system. See
`docs/specs/auto-updates.md` for the full design and
`docs/specs/auto-updates-plan.md` for the phased implementation
history.

## Publishing a release

Covered by the existing release playbook. Summary of the relevant
bits for auto-updates:

1. Land a changeset on `master`.
2. The Changesets GitHub Action opens a release PR that bumps
   `package.json` and `CHANGELOG.md`.
3. Merging the release PR triggers `tag-release.yml`, which pushes a
   `v{version}` tag.
4. The tag fires `publish-mac-release.yml`:
   - builds arm64 + x64 artifacts (DMG + ZIP + blockmap for each)
   - generates `latest-mac.yml`
   - signs + notarizes everything
   - uploads all artifacts to the GitHub Release

Every published release **must** contain `latest-mac.yml`. If it is
missing, auto-update is broken for that release.

## Testing the updater without shipping

You have two options.

**A. Local packaged build against the public repo.** Bump
`package.json` to a version lower than the latest published release,
build locally with `npm run package:mac:unsigned`, install the DMG
into `/Applications`, then launch. The updater reads
`dev-app-update.yml` to locate the public releases (`marckraw/convergence`,
stable channel) and will offer the newer version. Useful for exercising
the full flow without cutting a new release.

**B. Prerelease via a temporary tag.** Push a `v0.X.Y-test.1` tag. The
publish workflow has `releaseType: release` in `electron-builder.yml`,
so electron-updater will skip prereleases. To exercise the flow
end-to-end, either edit the publish config temporarily or promote the
prerelease to a non-prerelease on GitHub after it publishes.

Prefer (A). It's faster and doesn't pollute the release history.

## Diagnosing "no update detected"

If a user reports they aren't seeing an update that has clearly been
published:

1. **Check `latest-mac.yml` at the release.** Open
   `https://github.com/marckraw/convergence/releases/download/v{version}/latest-mac.yml`
   in a browser. It must list both x64 and arm64 ZIPs under `files[]`,
   each with a distinct SHA-512 and matching size. If either is
   missing, the auto-updater silently refuses to serve that arch.
   Re-run the publish workflow (`gh workflow run publish-mac-release`)
   with the same tag to regenerate.
2. **Confirm the release isn't a draft or prerelease.** Our
   `electron-updater` config is `releaseType: release`, so drafts and
   prereleases are ignored.
3. **Confirm the tag matches `package.json`.** The publish workflow
   enforces this at build time — if the user installed an artifact
   whose embedded version doesn't match the tag name, they won't get
   updates until they reinstall.
4. **Check `app.isPackaged`.** If the user is running from a local dev
   build (`npm run dev`), every update path is disabled by design.

## Diagnosing "signature failed" errors

If the toast shows "Downloaded update failed verification", the most
likely causes:

- The release was signed with a cert that doesn't match the installed
  app's cert. Re-sign and re-publish.
- The notarization ticket never stapled. Check the publish workflow
  logs for `notarizing failed` entries.

Never ship a "install anyway" escape hatch — a signature mismatch is
the only protection the user has against a compromised release asset.

## Disabling auto-updates

Per user: Settings → Updates → turn off "Check for updates
automatically". The switch is backed by `AppSettings.updates.backgroundCheckEnabled`
and respected by the scheduler without a restart.

Globally (emergency only): unpublish the latest GitHub Release so the
updater can't detect anything newer. Users who already downloaded the
update will still be prompted to install it — if you need to prevent
that, remove the specific ZIP and blockmap assets from the release.

## Rollback

If a bad release slips out:

1. Publish a fix release immediately — this is the primary path. Users
   on auto-update will get the fix within 4 hours.
2. Manual fallback for affected users: download the prior version's
   DMG from the release history and reinstall.

There is no automatic rollback and no server-side pin-to-version
mechanism in V1. Keep that in mind when shipping risky changes.
