# Auto-Updates

## Goal

Allow a packaged Convergence app to discover new releases on its own,
download them with the user's consent, and install them with a single
click. Updates are served from the existing public GitHub Releases that
the `publish-mac-release.yml` workflow already produces, so no new
hosting or infrastructure is introduced.

macOS only (matches current build targets). Windows / Linux follow the
same architecture but land in a separate phase.

## Product intent

- The user should never be surprised by an update. Convergence asks
  before downloading and asks before installing. No silent installs.
- A visible release is surfaced once — through an actionable
  notification — and stays reachable from the Settings dialog and the
  Command Center until acted on or dismissed.
- Background check is opt-in-by-default but fully disable-able. If the
  user turns it off, the app only checks when the user asks.
- Errors (offline, signature mismatch, GitHub API rate-limited) degrade
  gracefully: surface a short reason, never block the app.
- Dev mode never checks, never prompts, never shows update UI. A
  developer running `npm run dev` should see the existing experience
  unchanged.
- Pre-release / draft / unpublished releases are ignored. Only
  published stable releases are considered.

## Non-goals (V1)

- **No Windows / Linux.** Current build targets are `dmg` + `zip` for
  macOS only. Cross-platform support is a separate phase that will add
  NSIS / AppImage artifacts and exercise the same IPC surface.
- **No beta / alpha channel.** Single stable channel. A future channel
  selector would need release-tagging conventions (`v0.17.0-beta.1`)
  that we do not yet produce.
- **No delta / patch updates beyond what electron-updater does by
  default.** Blockmaps are already published, so the updater will pull
  only changed chunks — but no explicit UX around "small update" vs
  "full update".
- **No in-app release notes viewer.** The toast and Settings section
  link to the GitHub release page. A native viewer is a polish item.
- **No forced updates.** If the user clicks "Later", the app keeps
  working on the current version indefinitely.
- **No rollback UX.** If a release is bad, the recovery path is "ship
  a fix faster". Users can reinstall an older DMG manually.
- **No telemetry.** We do not report which version installed, how long
  download took, or error counts. Counter-argument is weak at this
  user scale.
- **No staged rollouts.** All users on the stable channel see every
  release immediately.
- **No automatic restart on idle.** The user clicks "Install now" or
  does nothing; we never restart their session.
- **No code-signature override.** If the downloaded artifact fails
  signature check, the update aborts. We do not offer "install anyway".

## V1 behavior

### User flows

**Background check (default on, every 4 hours, only when packaged):**

1. Service wakes, calls `autoUpdater.checkForUpdates()`.
2. No update → nothing happens. Status stored in memory for the
   Settings panel to show "Up to date, last checked 12 minutes ago".
3. Update available → actionable toast fires:
   `"Update available — Convergence v{new} (you're on v{current})"`
   with buttons `Download` / `Later` / link to release notes.
4. User clicks `Download` → status transitions to `downloading`;
   progress events update a persistent, non-dismissable toast with a
   percent bar. `Later` dismisses the toast but the Command Center and
   Settings still show the pending update until it's acted on or the
   next check supersedes it.
5. Download complete → toast replaces with
   `"Update v{new} ready — Install now / Later"`. `Install now` calls
   `quitAndInstall()`. `Later` dismisses; the next app launch will see
   the already-downloaded update and offer install again.

**Manual check:**

- Command Center item: `Check for updates…` (under `dialogs` section,
  consistent with Settings). Selecting it calls
  `autoUpdater.checkForUpdates()` and surfaces result via toast
  (`Up to date` / `Update available` / `Error: <msg>`).
- Settings → Updates tab → `Check now` button. Same handler, but the
  result also renders inline in the panel (status line, last-checked
  timestamp).

**No network / error:**

- Error toast fires only for user-initiated checks ("Couldn't check
  for updates — offline?"). Background-check errors are stored in
  status but do not toast (avoids repeated nagging). Settings panel
  shows the last error if any.

### State machine

A single `UpdateStatus` tagged union, broadcast on every transition:

```ts
type UpdateStatus =
  | { phase: 'idle'; lastChecked: string | null; lastError: string | null }
  | { phase: 'checking'; startedAt: string }
  | {
      phase: 'available'
      version: string
      releaseNotesUrl: string
      detectedAt: string
    }
  | {
      phase: 'downloading'
      version: string
      percent: number
      bytesPerSecond: number
    }
  | { phase: 'downloaded'; version: string; releaseNotesUrl: string }
  | { phase: 'not-available'; currentVersion: string; lastChecked: string }
  | { phase: 'error'; message: string; lastChecked: string | null }
```

Transitions:

```
idle ─ check() ──────→ checking
checking ─ found ────→ available
checking ─ none ─────→ not-available
checking ─ err ──────→ error
available ─ user ok ─→ downloading
downloading ─ done ──→ downloaded
downloading ─ err ───→ error
downloaded ─ quit ───→ (process exits)
not-available ──────→ idle (on next check())
error ──────────────→ idle (on next check())
```

The `phase: 'downloaded'` state persists across app restarts only
implicitly: electron-updater's cache dir holds the DMG/ZIP, so the
next startup check sees it and emits `update-downloaded` before any
network call. Service treats that as a normal `available → downloaded`
fast path.

### Architecture

One backend slice: `electron/backend/updates/`.

- `updates.types.ts` — `UpdateStatus` union, `UpdateCheckResult`,
  `UpdatePrefs`.
- `updates.pure.ts` — `compareVersions(a, b)` (semver-lite; handles
  the 0.x.y range we operate in), `formatProgress(progress)`,
  `summarizeError(err)` — no side effects.
- `updates.service.ts` — wraps `electron-updater`'s `autoUpdater`.
  Holds current `UpdateStatus`, subscribes to autoUpdater events,
  exposes `check({ trigger: 'user' | 'background' })`, `download()`,
  `install()`, `getStatus()`.
- `updates.ipc.ts` — registers `updates:*` handlers.
- `updates.scheduler.ts` — owns the 4h interval and the startup delay;
  separate file so it's trivially mockable.

The service is constructed in `electron/main/index.ts` after
`appSettingsService` and before the main window is shown. It is guarded
by `app.isPackaged`:

```ts
if (app.isPackaged) {
  updatesService = new UpdatesService({ autoUpdater, appSettings, broadcast })
  updatesIpc.register(updatesService)
  updatesScheduler.start(updatesService, appSettings)
} else {
  updatesIpc.registerDevStubs() // returns idle / up-to-date for every call
}
```

Dev stubs return `{ phase: 'idle', lastChecked: null, lastError: null }`
for every `getStatus` call and immediately reject `check/download/install`
calls with `{ error: 'auto-updates disabled in dev mode' }`. The
settings panel and command-center item stay visible but disabled with
a tooltip explaining the limitation, so the UI is still exercisable
under `npm run dev`.

### electron-updater configuration

- `autoUpdater.autoDownload = false` — we ask first.
- `autoUpdater.autoInstallOnAppQuit = false` — we never install without
  an explicit click.
- `autoUpdater.allowPrerelease = false` — stable only.
- `autoUpdater.allowDowngrade = false` — normal semver direction.
- `autoUpdater.forceDevUpdateConfig = false` — irrelevant because we
  gate on `app.isPackaged`, but set for clarity.
- `autoUpdater.logger = undefined` — we forward relevant events into
  our status broadcast; the default logger is too chatty.

### IPC contract

Renderer → main:

- `updates:get-status()` → `UpdateStatus`
- `updates:check()` → fires `check({ trigger: 'user' })`, returns
  `UpdateStatus` (post-transition). Rejects in dev stub mode.
- `updates:download()` → starts download from `available` state. Rejects
  if phase is not `'available'` or in dev stub mode.
- `updates:install()` → calls `autoUpdater.quitAndInstall(false, true)`
  (force-runafter: true so the user ends up back in Convergence). Rejects
  if phase is not `'downloaded'` or in dev stub mode.
- `updates:open-release-notes()` → `shell.openExternal(releaseNotesUrl)`.
  Rejects if no URL known.

Main → renderer broadcast:

- `updates:status-changed(UpdateStatus)` — fires on every transition.
  Renderer store subscribes and re-renders.

### Release pipeline requirements

Existing `publish-mac-release.yml` produces DMG + ZIP + blockmap + the
release tag. Required changes:

1. **Add `publish` block to `electron-builder.yml`** pointing at the
   public GitHub repo so electron-builder generates `latest-mac.yml`:

   ```yaml
   publish:
     - provider: github
       owner: marckraw
       repo: convergence
       releaseType: release
   ```

   The workflow keeps `--publish never` (continues uploading via
   `gh release upload`), but having `publish` configured is what makes
   electron-builder emit `latest-mac.yml` at build time.

2. **Build both architectures.** Change `package:mac` from
   `electron-builder --mac dmg zip` to
   `electron-builder --mac --x64 --arm64 dmg zip`. Output files become
   four artifacts (`-x64.dmg`, `-x64-mac.zip`, `-arm64.dmg`,
   `-arm64-mac.zip`) plus their blockmaps. `latest-mac.yml` then lists
   both ZIPs under `files[]`, and `autoUpdater` at runtime selects the
   one matching `process.arch`.

3. **Workflow glob update.** The upload step already uses
   `release/Convergence-*.dmg` etc., which covers both archs, so no
   change needed there. `release/latest-mac.yml` remains a single
   file.

4. **Tag → version invariant.** Keep the existing check:
   `tag v{version}` must match `package.json` version before publish.
   If this ever breaks, electron-updater clients refuse the update.

5. **`dev-app-update.yml` at repo root** — committed, consumed only by
   dev builds, contains the same GitHub config as `publish`. Used only
   if a developer runs a locally-packaged build to test end-to-end.
   Not used by `npm run dev`.

### Preferences

Persisted in `AppSettings` under a new `updates` key:

```ts
type UpdatePrefs = {
  backgroundCheckEnabled: boolean // (default: true)
  // Channel / cadence are intentionally omitted from V1 UI;
  // cadence is hardcoded to 4h. Channel is stable-only.
}
```

Defaults hydrate when missing on read; setter validates boolean.
Lives alongside `notifications` and `onboarding` in the settings blob.

Background scheduler reads this flag on start, and re-reads on
`appSettings:updated` broadcast so toggling in Settings takes effect
without restart.

### Settings UI

New section `src/features/app-settings/updates-fields.presentational.tsx`
mounted after Notifications in `app-settings.presentational.tsx`:

- `Current version: 0.17.0` (read from `app.getVersion()` exposed via
  a new `updates:get-app-version` IPC; cached).
- `Check for updates automatically` toggle (master for background
  check). Persists to `updates.backgroundCheckEnabled`.
- `Check now` button. Calls `updatesApi.check()`.
- Status line: renders current `UpdateStatus` in plain text:
  - `idle` + no history → "Never checked."
  - `idle` + history → "Up to date. Last checked 3 minutes ago."
  - `checking` → "Checking…"
  - `available` → "Update available: v0.18.0. [Download] [Release notes]"
  - `downloading` → "Downloading… 42% (1.4 MB/s)"
  - `downloaded` → "Update v0.18.0 ready. [Install now] [Release notes]"
  - `not-available` → "Up to date (last check 10s ago)."
  - `error` → "Couldn't check for updates: <short message>."
- In dev mode, the toggle is disabled and the panel shows
  "Auto-updates are disabled in development builds."

### Command Center integration

One new palette item in `src/features/command-center/`:

- Item type: extend `DialogPaletteItem` kind list with `check-updates`,
  section: `dialogs`. Label: `Check for updates…`. Visible in all
  contexts (no scope filter).
- Intent handler in `intents.ts`:
  `checkForUpdates()` → calls `updatesApi.check()` then opens a
  toast with the result. If `available`, the toast is the same
  actionable toast as the background-check flow.
- In dev mode, the item still appears but the intent shows a toast
  "Auto-updates are disabled in development builds." (instead of
  hiding the item — discoverability beats correctness here, and the
  error is self-explanatory).

### Update toast surface

New feature slice `src/features/updates-toast/`:

- `updates-toast.container.tsx` — subscribes to `updates:status-changed`,
  routes each phase to a Sonner toast:
  - `available` → `toast.info(..., { action: 'Download', cancel: 'Later' })`
    with a second `description` line and a release-notes link rendered
    as a plain anchor in the description slot.
  - `downloading` → `toast.loading` with dynamic `description` pulling
    from the `percent` and `bytesPerSecond` fields. One long-lived
    toast (uses stable id `updates:downloading`) that updates rather
    than spawns.
  - `downloaded` → promotes the loading toast to
    `toast.success(..., { action: 'Install now', cancel: 'Later' })`.
  - `error` fires a `toast.error` only if the triggering check was
    user-initiated. Background errors are silent.
  - `not-available` toast fires only for user-initiated checks.
- Mounted in `App.container.tsx` next to `NotificationsToastHostContainer`.
  Reuses the existing Sonner `<Toaster />`.

The toast host coexists with the notifications host because their
trigger sources are orthogonal — they share the Sonner surface but not
the IPC pipeline.

### Scheduler

`updates.scheduler.ts`:

- On service start, waits 10 seconds (avoid contention with the
  existing startup services), then calls `check({ trigger: 'background' })`.
- Then every 4 hours via `setInterval`.
- Skips a tick if phase is `checking`, `downloading`, or
  `downloaded` (no point re-checking while mid-flow).
- Listens for `appSettings:updated`; if `backgroundCheckEnabled` flips
  from true → false, clears the interval. From false → true, restarts
  the interval (and runs one check immediately after the 10s settle).
- On `app.before-quit`, clears the interval.

### Error handling

Normalized via `summarizeError(err)`:

- `ERR_UPDATER_LATEST_VERSION_NOT_FOUND` → "No releases published yet."
- `ERR_UPDATER_CHANNEL_FILE_NOT_FOUND` → "Couldn't read update metadata."
- Network errors (`ENOTFOUND`, `ETIMEDOUT`) → "Offline or GitHub
  unreachable."
- Signature mismatch → "Downloaded update failed verification."
- Anything else → the error's `message`, truncated to 120 chars.

The service never throws to its callers; errors set `phase: 'error'`
and the IPC handlers return the status as usual. User-initiated
checks show the error via toast; background checks remain silent.

## Data model

Renderer slice `src/entities/updates/`:

```ts
type UpdatesState = {
  status: UpdateStatus
  currentVersion: string | null
  prefs: UpdatePrefs
}
```

Backend state lives inside `UpdatesService`; nothing persists beyond
`UpdatePrefs` in `AppSettings` and whatever electron-updater caches on
disk (which it manages itself).

## Testing

Pure (no Electron):

- `updates.pure.test.ts`:
  - `compareVersions`: `0.16.0 < 0.17.0`, `0.16.0 < 0.16.1`,
    `0.16.0 == 0.16.0`, pre-release tags ignored.
  - `formatProgress`: formats bytes, caps percent at 100, handles zero.
  - `summarizeError`: maps each known electron-updater error code to
    its human message; unknown falls through.

Unit (electron-updater stubbed, AppSettings stubbed):

- `updates.service.test.ts`:
  - `check` transitions `idle → checking → available` when stub fires
    `update-available`.
  - `check` transitions `idle → checking → not-available` when stub
    fires `update-not-available`.
  - `check` transitions `idle → checking → error` when stub throws.
  - `download` no-ops (+ emits `error`) if called from non-`available`
    state.
  - `install` no-ops if called from non-`downloaded` state.
  - Baseline idempotency: calling `check` while `checking` does not
    enqueue a second autoUpdater call.
  - `dispose()` unhooks autoUpdater listeners.

- `updates.scheduler.test.ts` with fake timers:
  - 10s startup delay, then 4h interval.
  - Skips tick when service phase is `downloading`.
  - Restarts on pref flip from false → true.
  - Clears on pref flip from true → false.

- `updates-toast.container.test.tsx`:
  - `available` broadcast renders actionable toast; click on
    `Download` calls `updatesApi.download()`.
  - `downloading` toast updates in place on subsequent broadcasts
    (same toast id, new description).
  - `downloaded` replaces with `Install now` toast.
  - `error` toast only fires when `lastTrigger === 'user'`.

- `updates-fields.presentational.test.tsx`:
  - All phases render their expected status line.
  - Toggle disabled in dev mode.
  - `Check now` button calls the API.

- `app-settings.service.test.ts` extended: `updates` field round-trips,
  defaults hydrate when missing.

- `command-center` intent test: `check-updates` intent calls
  `updatesApi.check()`.

Manual (signed, packaged):

- Install v0.X into `/Applications`, publish v0.X+1 as a release,
  launch the app, observe the background toast within 10–15s.
- Click `Download`, observe progress toast, watch download finish.
- Click `Install now`, confirm relaunch into the new version.
- Toggle "Check for updates automatically" off, restart, confirm no
  background check fires.
- Unplug the network, run `Check now`, observe error toast for
  user-triggered path; then re-enable network and confirm recovery.

## Rollout

- V1 ships to users on v0.16.0 or newer. Users on v0.16.0 (no
  updater code yet) must manually install the first release that
  contains this feature. Note this in the changeset.
- After the first updater-enabled release is live, every subsequent
  release gets picked up automatically within ~4h of publication for
  users who leave the default on.

## Open questions (defer to follow-ups)

- **Release-notes in-app viewer.** Native scrollable view instead of
  an external link. Low priority; link-out is adequate.
- **Channel selector** (stable / beta). Requires our release process
  to tag pre-releases explicitly.
- **Per-major upgrade gating.** If we ever ship a 1.0 that requires
  a migration, we may want to refuse to skip over the migration
  release.
- **Differential downloads UX.** electron-updater already does
  blockmap-based delta fetches; surfacing "small vs full update" to
  the user is a polish item.
- **Windows + Linux.** Requires NSIS / AppImage build targets, the
  `latest.yml` / `latest-linux.yml` metadata variants, and per-OS
  testing.
- **Telemetry.** Which clients updated, how long downloads took,
  error codes. Needs a data pipeline we do not have.
- **Background install during idle.** macOS supports this via
  LaunchServices but it conflicts with "never install silently".
- **Rollback / pin-to-version.** A user setting that says "don't
  update past v0.X.Y" for users who hit a regression.
