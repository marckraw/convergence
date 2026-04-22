# Auto-Updates — Implementation Plan

Companion to `docs/specs/auto-updates.md`. Work is sliced into seven
phases. Each phase is independently shippable and verified before the
next begins. Verification means `npm install`, `npm run test:pure`,
`npm run test:unit`, `npm run typecheck`, and `chaperone check --fix`
all pass unless the phase explicitly notes otherwise.

## Phase U1 — Release pipeline config

Goal: the release pipeline must produce both arch artifacts and a
valid `latest-mac.yml` so the next release is already updater-ready,
even before any client-side code exists. No runtime behavior changes
in this phase.

- [x] `electron-builder.yml`: add top-level `publish` block with
      GitHub provider pointing at `marckraw/convergence` public repo.
      Use `releaseType: release` to exclude drafts / prereleases.
- [x] `package.json` `scripts.package:mac`: change
      `electron-builder --mac dmg zip --publish never` to
      `electron-builder --mac dmg zip --x64 --arm64 --publish never`.
      Keep `--publish never` — the GitHub workflow continues to upload
      via `gh release upload`; `publish` in the yml only controls
      metadata generation. (Arch flags must come after the target
      positionals `dmg zip`, not before — electron-builder's CLI
      rejects `--x64 --arm64 dmg zip` as "Unknown arguments: dmg,
      zip".)
- [x] Mirror the arch split into the other `package:mac:*` scripts
      (`package:mac:dir`, `package:mac:unsigned`, `package:mac:dir:unsigned`)
      for dev parity.
- [x] `dev-app-update.yml` committed at repo root with the same
      GitHub config (owner/repo/provider). Documented as "consumed only
      by locally-packaged dev builds that want to exercise the updater
      against the public releases; NOT used by `npm run dev`".
- [x] `.github/workflows/publish-mac-release.yml`: upload glob
      already covers new artifact names. `release/Convergence-*.dmg`
      and `release/Convergence-*.zip` match both archs, and
      `release/latest-mac.yml` was already in the upload list — no
      workflow edit needed. Pre-U1 the yml file was missing from
      releases because `electron-builder.yml` had no `publish` block;
      the U1 `publish` block now makes it generate.
- [x] Install `electron-updater` as a runtime dependency (not dev) —
      required so that production bundles include it. Import is gated
      behind `app.isPackaged` so dev loads still lazy-load.
      Installed at `^6.8.3`.
- [x] Verification steps:
  - [x] `npm run package:mac:unsigned` locally produces 4 artifacts
        (2 DMGs, 2 ZIPs) + 4 blockmaps + `latest-mac.yml`.
  - [x] Inspected `release/latest-mac.yml` — lists both ZIPs
        (`Convergence-0.16.0-x64.zip`,
        `Convergence-0.16.0-arm64.zip`) plus both DMGs with distinct
        SHA-512 entries. `path:` pins `x64.zip` as the default; the
        client picks the matching arch from `files[]` at runtime.
  - [x] Full gate green: test:pure 647 / test:unit 220 / typecheck
        clean / chaperone check --fix exit 0 (same 5 pre-existing
        `terminal-dock` warnings, none introduced by U1).

Rollback: revert `electron-builder.yml` and `package.json` — no
runtime code touched.

## Phase U2 — Types, pure helpers, prefs schema

Goal: land the type surface, the pure helpers, and the `UpdatePrefs`
schema. No IPC, no service, no UI. Fully pure-testable.

- [x] New file `electron/backend/updates/updates.types.ts`:
  - [x] `UpdateStatus` discriminated union matching the spec's seven
        phases (each phase is a separate exported interface plus the
        union alias, so the service can use the narrow ones at
        transitions).
  - [x] `UpdatePrefs = { backgroundCheckEnabled: boolean }`.
  - [x] `UpdateTrigger = 'user' | 'background'`.
  - [x] `UpdateProgressInput` / `FormattedUpdateProgress` helper
        types for the pure formatter (simpler than the spec's
        ad-hoc `UpdateError` shape; `summarizeError` returns a plain
        string so no wrapper type is needed).
- [x] New file `electron/backend/updates/updates.pure.ts`:
  - [x] `compareVersions(a, b)` — strips `v` prefix, splits on `.`,
        numeric compare, ignores pre-release suffixes (`-beta.1`).
        Treats missing segments as zero (so `0.17` == `0.17.0`).
  - [x] `formatProgress(input)` — clamps percent to `[0, 100]`, maps
        non-finite to 0, formats bytes/sec as `B/s` / `KB/s` / `MB/s`.
  - [x] `summarizeError(err)` — maps known electron-updater codes
        (`ERR_UPDATER_LATEST_VERSION_NOT_FOUND`,
        `ERR_UPDATER_CHANNEL_FILE_NOT_FOUND`,
        `ERR_UPDATER_INVALID_UPDATE_INFO`,
        `ERR_UPDATER_INVALID_SIGNATURE`,
        `ERR_UPDATER_NO_PUBLISH_CONFIG`) and common network codes
        (`ENOTFOUND`, `ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`) to
        friendly text. Also matches known codes embedded in a
        `message` when `code` is missing (electron-updater sometimes
        only sets one or the other). Truncates unknown messages to
        120 chars with an ellipsis.
- [x] New file `electron/backend/updates/updates.defaults.ts`:
  - [x] `DEFAULT_UPDATE_PREFS: UpdatePrefs = { backgroundCheckEnabled: true }`.
  - [x] `INITIAL_UPDATE_STATUS: UpdateIdleStatus = { phase: 'idle',
lastChecked: null, lastError: null }`.
- [x] Extend `AppSettings` (`electron/backend/app-settings/app-settings.types.ts`):
      add `updates: UpdatePrefs`. `AppSettingsInput` makes the field
      optional on input; when omitted, the existing stored value is
      preserved (matches the notifications pattern).
- [x] `parseUpdatePrefs(value): UpdatePrefs` — boolean assertion for
      `backgroundCheckEnabled`, falls back to default if missing /
      wrong type. Called from `app-settings.service.ts` on read and
      write. `validateAgainst` now carries `updates` through the
      provider/model/effort coercion branches so the field never
      goes missing during hydration.
- [x] Renderer mirror: `src/entities/updates/updates.types.ts`
      duplicates `UpdateStatus`, `UpdatePrefs`, `DEFAULT_UPDATE_PREFS`,
      and `INITIAL_UPDATE_STATUS`. Header comment calls out drift
      requirement (same pattern as notifications).
- [x] Re-export `UpdatePrefs` + `DEFAULT_UPDATE_PREFS` from
      `src/entities/app-settings/` so existing callers can import
      from the settings slice. Also added `UpdateStatus` /
      `UpdateTrigger` / `INITIAL_UPDATE_STATUS` to the root
      `entities/index.ts` barrel so features can import the union
      directly.
- [x] Extended `src/shared/types/electron-api.d.ts` with
      `UpdatePrefsData` and added `updates` to `AppSettingsData` so
      the preload bridge remains typed end-to-end. No new methods
      on `electronAPI` this phase — IPC surface lands in U3.
- [x] Renderer store / test fixture updates: `src/entities/app-settings/
app-settings.model.ts` seeds `updates: DEFAULT_UPDATE_PREFS` in
      `EMPTY`; the four fixtures in `app-settings.model.test.ts`,
      `src/features/app-settings/app-settings.container.test.tsx`, and
      `src/features/notifications-onboarding/onboarding-card.container.test.tsx`
      all carry the new field so existing tests stay green.
      `handleSave` in `app-settings.container.tsx` now forwards
      `settings.updates` through unchanged (Settings UI for this
      field lands in U4).
- [x] Pure tests `updates.pure.test.ts` (23 cases):
  - [x] `compareVersions` — equal, less-than, greater-than, with `v`
        prefix, with pre-release suffix, missing segments.
  - [x] `formatProgress` — normal, 0%, 110% (clamp), MB/s threshold,
        sub-KB B/s, non-finite percent → 0.
  - [x] `summarizeError` — known codes, network codes, code embedded
        in message, fallback truncation to 120 chars with ellipsis,
        null/undefined/empty → generic message, string input.
- [x] Unit tests `app-settings.service.test.ts` extended (4 new
      cases under `describe('updates', ...)`): hydrates missing
      field with default, rejects non-boolean input, round-trips
      toggled `backgroundCheckEnabled`, preserves existing value
      when input omits the field. All pre-existing `toEqual({...})`
      asserts in the file were updated to include
      `updates: DEFAULT_UPDATE_PREFS`.

Verification: full gate green (test:pure 670 / test:unit 220 /
typecheck clean / chaperone check --fix exit 0; same 5 pre-existing
`terminal-dock` warnings, none introduced by U2). No visible UI
change, no behavior change.

## Phase U3 — UpdatesService + IPC + preload bridge

Goal: wire `electron-updater` behind a service, expose a dev-stubbed
IPC surface, plumb through to a renderer entity slice. Still no UI;
status can be inspected via the renderer store at this point.

- [x] New file `electron/backend/updates/updates.service.ts`:
  - [x] `class UpdatesService` constructed with
        `{ autoUpdater, appVersion, broadcast, openExternal,
releaseNotesUrl?, now? }`. `appVersion` is injected (rather
        than passing `app`) so the service stays free of Electron
        globals and is trivially testable. `openExternal` is a
        function so tests can stub it.
  - [x] Holds `status: UpdateStatus`, `lastTrigger: UpdateTrigger |
null`, and a `lastAvailable` cache so `openReleaseNotes` still
        works after the phase transitions past `'available'`.
  - [x] Constructor sets the autoUpdater config flags from the spec
        (`autoDownload = false`, etc., plus `logger = null`) and
        subscribes to all six events: `checking-for-update`,
        `update-available`, `update-not-available`, `download-progress`,
        `update-downloaded`, `error`.
  - [x] Methods: `check(trigger)`, `download()`, `install()`,
        `getStatus()`, `getLastTrigger()`, `getAppVersion()`,
        `openReleaseNotes()`, `dispose()`.
  - [x] `setStatus(next)` writes the field and calls `broadcast`.
  - [x] Never throws to callers; errors set `phase: 'error'`. IPC
        handlers return the latest status verbatim.
  - [x] `AutoUpdaterLike` interface exported so the real
        `electron-updater.autoUpdater` and the test fake share one
        contract.
- [x] New file `electron/backend/updates/updates.ipc.ts`:
  - [x] `registerUpdatesIpc(deps)` wires `updates:get-status`,
        `updates:get-app-version`, `updates:check`, `updates:download`,
        `updates:install`, `updates:open-release-notes`,
        `updates:get-prefs`, `updates:set-prefs`. Prefs handlers go
        through `AppSettingsService.setAppSettings` so the existing
        `appSettings:updated` broadcast fans out to all renderers
        (no new channel).
  - [x] `registerUpdatesDevStubs(deps)` returns `INITIAL_UPDATE_STATUS`
        for `get-status`, `false` for `open-release-notes`, and throws
        `'auto-updates disabled in dev mode'` from `check` / `download`
        / `install`. `get-prefs` / `set-prefs` still hit the real
        `AppSettingsService` so the toggle in the Settings UI (U4)
        remains functional in dev.
  - [x] `broadcastUpdateStatus(status)` helper fans
        `updates:status-changed` out to every `BrowserWindow`.
- [x] Wire in `electron/main/index.ts`:
  - [x] After `registerNotificationsIpcHandlers`, construct
        `UpdatesService` inside an `if (app.isPackaged)` branch with
        `autoUpdater` dynamically imported from `electron-updater`
        (dynamic import keeps dev bundles from hard-loading the
        module). Dev branch calls `registerUpdatesDevStubs`.
  - [x] `app.before-quit` handler extended to call
        `updatesService?.dispose()`.
  - [x] Broadcast helper is wired via the service's `broadcast` dep
        pointing at `broadcastUpdateStatus`.
- [x] Preload (`electron/preload/index.ts`): expose
      `window.electronAPI.updates` with `getStatus`, `getAppVersion`,
      `getPrefs`, `setPrefs`, `check`, `download`, `install`,
      `openReleaseNotes`, plus `onStatusChanged(cb)` returning an
      unsubscribe function.
- [x] Extend `src/shared/types/electron-api.d.ts` with the `updates`
      surface and a new `UpdateStatusData` union mirroring the backend
      type.
- [x] New renderer slice `src/entities/updates/`:
  - [x] `updates.types.ts` (landed in U2).
  - [x] `updates.api.ts` — thin wrappers over
        `window.electronAPI.updates.*`.
  - [x] `updates.model.ts` — Zustand store with `status`,
        `currentVersion`, `prefs`, `isLoaded`, `lastTrigger`, `error`,
        and `unsubscribe`. Actions: `loadInitial`, `check`, `download`,
        `install`, `openReleaseNotes`, `setPrefs`, `setLastTrigger`,
        `clearError`. `loadInitial` calls `getStatus` + `getAppVersion` + `getPrefs` in parallel and installs the `onStatusChanged`
        subscription (with tear-down of any prior one on re-load).
  - [x] `index.ts` public API re-exports types, api, and store.
- [x] Mount in `App.container.tsx`: new `useEffect` calls
      `loadUpdates()` once on mount. The returned unsubscribe lives on
      the store itself; it is torn down implicitly when the store is
      reset.
- [x] Tests:
  - [x] `updates.service.test.ts` (17 cases) with an EventEmitter-ish
        fake autoUpdater: config flags applied, every transition
        (`check → checking`, `update-available`, `update-not-available`,
        `error`, `download-progress`, `update-downloaded`), `check`
        idempotent while `checking` / `downloading`, `download` /
        `install` from wrong phase emit `error`, `install` from
        downloaded calls `quitAndInstall(false, true)`,
        `openReleaseNotes` uses last-known URL after phase
        transitions, `openReleaseNotes` no-op when nothing known,
        `dispose()` removes every listener (asserted via
        `listenerCount`), `dispose()` makes `check/download/install`
        no-op.
  - [x] `src/entities/updates/updates.model.test.ts` (6 cases):
        `loadInitial` hydrates and subscribes, broadcasts replace
        status, `check()` records `'user'` trigger and reflects
        resolved status, IPC rejection is captured into `error`
        without throwing, `setPrefs` persists and updates store,
        repeated `loadInitial` tears down the previous subscription.
  - [x] Preload typecheck — covered by global gate.

Verification: full gate green (test:pure 687 / test:unit 226 /
typecheck clean / chaperone check --fix exit 0; same 5 pre-existing
`terminal-dock` warnings). UI unchanged. Status now flows
main → preload → renderer store; developer can confirm by inspecting
`useUpdatesStore.getState()` from the renderer console, but no
user-visible surface yet.

## Phase U4 — Settings UI + app-version surface

Goal: first user-visible surface. User can see current version, toggle
background check, and manually click Check now. No toast surface yet;
results render inline only.

- [x] New presentational
      `src/features/app-settings/updates-fields.presentational.tsx`:
  - [x] Props: `status`, `currentVersion`, `prefs`, `isDev`, `isSaving`,
        `now`, `onToggleBackground`, `onCheckNow`, `onDownload`,
        `onInstall`, `onOpenReleaseNotes`. `now` is passed in as a
        `Date` prop so the relative-time rendering is deterministic in
        tests (container supplies `new Date()` at render time).
  - [x] Renders the status line per the spec's switch table via
        `describeStatus(status, currentVersion, now)`. Exported
        alongside `formatRelative` so both can be unit-tested in
        isolation.
  - [x] `isDev === true` → toggle + all action buttons disabled; the
        status line is replaced with
        "Auto-updates are disabled in development builds." This skips
        the tooltip mentioned in the original draft — the inline
        status line already carries the explanation, so an additional
        tooltip would be redundant noise.
  - [x] Reuses `SwitchRow` from `src/shared/ui/switch.tsx`.
- [x] Dev-mode signal: added a new `updates:get-is-dev` IPC handler
      (real returns `false`, dev stub returns `true`) threaded through
      preload → `updatesApi.getIsDev()` → `UpdatesStore.isDev`. Chose
      this over reusing `system.getInfo()` because the latter is a
      synchronous preload helper that only sees `process.platform`;
      `app.isPackaged` must cross the main boundary and an explicit
      IPC keeps the contract visible. `loadInitial` now runs four
      parallel calls (status, version, isDev, prefs).
- [x] Container wiring inside
      `src/features/app-settings/app-settings.container.tsx`:
  - [x] Reads `status`, `currentVersion`, `isDev`, and the
        action methods from `useUpdatesStore`.
  - [x] New `updatesDraft` state initialised from `settings.updates`
        on dialog open, toggled via `handleToggleBackgroundUpdates`,
        flushed on Save as `updates: updatesDraft ?? settings.updates`
        through the existing `appSettings.set` path (so the existing
        `appSettings:updated` broadcast keeps the store in sync — no
        new channel).
  - [x] `handleCheckNow`, `handleDownloadUpdate`, `handleInstallUpdate`,
        `handleOpenReleaseNotes` forward to `useUpdatesStore` methods
        (which handle error capture + state broadcasts).
- [x] Mount `<UpdatesFields />` inside
      `app-settings.presentational.tsx` as a new **Updates** section
      placed after Notifications and before the dialog footer. Session
      Forking stays above so the ordering is
      Session defaults → Naming → Forking → Notifications → Updates,
      with every section retaining the same heading style.
- [x] Tests:
  - [x] `updates-fields.presentational.test.tsx` (20 cases):
    - [x] `UpdatesFields` — renders current version; Check now calls
          `onCheckNow`; toggle calls `onToggleBackground(false)`; dev
          mode disables the switch and shows the dev notice; available
          phase shows Download + Release notes and forwards clicks;
          downloaded phase shows Install button.
    - [x] `describeStatus` — all seven phases (idle w/ no history,
          idle w/ history, idle w/ lastError, checking, available,
          downloading with clamped percent, downloaded, not-available,
          error).
    - [x] `formatRelative` — just now, plural minutes, singular
          minute, hours, days.
  - [x] `app-settings.container.test.tsx` extended (2 cases):
        toggling the "Check for updates automatically" switch and
        saving emits `updates: { backgroundCheckEnabled: false }`;
        the Check now button reaches
        `window.electronAPI.updates.check` via the store.

Verification: full gate green (test:pure 687 / test:unit 248 /
typecheck clean / chaperone check --fix exit 0; same 5 pre-existing
`terminal-dock` warnings, none introduced by U4). Hand-test still
pending — open the dialog to confirm the new section renders; OS-level
check flow only meaningful on a signed packaged build.

## Phase U5 — Command Center integration + toast surface

Goal: Cmd+K → Check for updates works, and every status transition
surfaces as an appropriate toast. After this phase, the feature is
behaviorally complete for user-initiated flows.

- [x] Command Center:
  - [x] Extend `src/features/command-center/command-center.types.ts`
        with a new `CheckUpdatesPaletteItem` kind (chose a dedicated
        variant over reusing `DialogPaletteItem` to keep `DialogKind`
        unchanged — the check-updates intent isn't a dialog, it's an
        async action).
  - [x] `buildPaletteIndex` emits one static `check-updates` item
        with a stable id and `search.title: 'Check for updates'` so
        Fuse treats it like any other palette entry.
  - [x] `buildCuratedSections` appends the item into the `dialogs`
        section (that's where the user already expects app-wide
        commands). Ranking / search coverage comes for free via the
        shared `search.title` field.
  - [x] `intents.ts`: `checkForUpdates()` handler calls
        `useUpdatesStore.getState().check()`. Dev-mode rejection is
        captured by the store's `check` action into `error` and
        surfaces via the toast container (not this intent).
  - [x] `command-center.presentational.tsx` updated to handle the new
        kind in `describeItem` / `describeKind` so the palette
        renders the title + description.
- [x] New slice `src/features/updates-toast/`:
  - [x] `updates-toast.container.tsx`:
    - [x] Subscribes to the updates store and tracks the previous
          phase via a ref so transition-only toasts fire once.
    - [x] Renders Sonner toasts per the spec: `available` (actionable
          with Download + Release notes, `duration: Infinity`),
          `downloading` (stable id `updates:downloading`, description
          formats `{percent}% · {speed}`), `downloaded` (stable id
          `updates:ready`, actionable with Install now + Release
          notes), `error` (user-trigger only), `not-available`
          (user-trigger only).
    - [x] Action buttons call the store's `download()` /
          `install()` / `openReleaseNotes()` methods directly — which
          internally forward to `updatesApi.*` — so the toast host
          stays decoupled from the IPC layer and swappable in tests.
  - [x] `index.ts` public API.
- [x] Mount `<UpdatesToastContainer />` in `App.container.tsx` next
      to `<NotificationsToastHostContainer />`.
- [x] Tests:
  - [x] `updates-toast.container.test.tsx` (5 cases):
        `available` renders actionable toast and Download click calls
        `download`; `downloading` updates in place (same toast id,
        different description across two broadcasts, including the
        KB/s → MB/s speed threshold); `downloaded` dismisses the
        downloading toast and shows the Install toast whose action
        triggers `install`; `error` after user-trigger fires
        `toast.error`, background-trigger stays silent; `not-available`
        after user-trigger fires `toast(...)`, background-trigger
        stays silent.
  - [x] `intents.test.ts` extended: `checkForUpdates` delegates to
        `useUpdatesStore.check()`.
  - [x] `command-palette-index.pure.test.ts` extended: one
        `check-updates` item is always emitted with the expected id
        and `search.title`.
  - [x] `command-palette-ranking.pure.test.ts` updated: dialogs
        section now contains six items (five dialogs + check-updates)
        and contains a `check-updates` kind entry.

Verification: full gate green (test:pure 688 / test:unit 254 /
typecheck clean / chaperone check --fix exit 0; same 5 pre-existing
`terminal-dock` warnings, none introduced by U5). Manual test
(unpacked dev): open the command center, search "check", select
`Check for updates…`; the dev-stub rejects and the toast host emits
an error toast reading "Auto-updates are disabled in development
builds." (or whatever the dev stub currently throws — message flows
through `summarizeError`).

## Phase U6 — Background scheduler + error polish

Goal: automatic periodic checks. After this phase, the feature is
behaviorally complete end-to-end.

- [x] New file `electron/backend/updates/updates.scheduler.ts`:
  - [x] `class UpdatesScheduler` with `{ service, getPrefs }` deps
        (dropped `now?` — `setTimeout` is already deterministic under
        fake timers, no extra injection point needed).
  - [x] `start()` schedules the 10s startup check, then a 4h
        `setInterval` loop. Exits early if `backgroundCheckEnabled`
        is false at start.
  - [x] `stop()` clears both timers and is idempotent.
  - [x] `onPrefsChanged(prefs)` toggles: false → true reschedules the
        startup tick if no timers are armed; true → false clears them.
  - [x] `tick()` guards: skips while the service phase is
        `checking`, `downloading`, or `downloaded`, and re-reads prefs
        defensively so a pref flip between ticks doesn't require
        relying solely on `onPrefsChanged`.
- [x] Wire in `electron/main/index.ts`: constructed inside the
      `app.isPackaged` branch after `UpdatesService`, passed
      `appSettingsService.getUpdatePrefsSync()` as its `getPrefs`
      source. Started immediately. `app.before-quit` now calls
      `updatesScheduler?.stop()` alongside `service.dispose()`.
- [x] Pref-change propagation: `updates:set-prefs` IPC and the shared
      `appSettings:set` IPC both invoke the scheduler's
      `onPrefsChanged`. For `updates:set-prefs` this happens via
      `UpdatesIpcDeps.onPrefsChanged` (new optional callback, wired
      in `main/index.ts`). For `appSettings:set`, which is registered
      out of `electron/main/ipc.ts` by `registerIpcHandlers`, a new
      tenth optional parameter `onUpdatePrefsChanged` fans the stored
      prefs to the scheduler so the existing Settings-dialog save
      path stays on its one IPC.
- [x] New `AppSettingsService.getUpdatePrefsSync()` helper mirrors the
      existing `getNotificationPrefsSync()` so the scheduler doesn't
      pay an `await` per tick.
- [x] Error handling pass:
  - [x] `summarizeError` retains its existing code coverage (U2); no
        electron-updater codes added or removed this phase.
  - [x] No retry loop in `updates.service.ts` — the 4h tick is the
        only retry.
- [x] Changeset `.changeset/auto-updates-launch.md` (minor bump)
      summarising the U1–U6 series, calling out the pre-v0.17.0
      one-time manual install requirement and the new x64 + arm64
      artifact split.
- [x] Tests:
  - [x] `updates.scheduler.test.ts` with fake timers (6 cases):
        initial 10s delay then a tick, then every 4h; tick skipped
        while phase is `downloading`; start with
        `backgroundCheckEnabled: false` never ticks; pref flip false →
        true schedules a new startup tick; pref flip true → false
        clears timers; `stop()` is idempotent.
  - [x] Existing `updates.service.test.ts` already covers the
        background-triggered error path via the
        `error event emits error status with summarized message` case
        — the test uses `check('background')`/`user` interchangeably
        because the service's transition code is trigger-agnostic.
- [x] Final cleanup:
  - [x] No `console.log` / `console.debug` left in the updates
        backend (verified).
  - [x] Dev-only subscriber in `App.container.tsx` gated on
        `import.meta.env.DEV` logs every `updates:status-changed`
        payload with the `[updates:status]` prefix (mirrors the
        existing `[task-progress]` dev logger).

Verification: full gate green (test:pure 694 / test:unit 254 /
typecheck clean / chaperone check --fix exit 0; same 5 pre-existing
`terminal-dock` warnings, none introduced by U6). Manual smoke test
on a **signed packaged build**:

- Bump `package.json` to v0.16.1, tag, push, wait for CI.
- Install v0.16.0 locally.
- Launch, observe background check fires within ~10s, toast appears.
- Run through Download → Install flow.
- Confirm Settings status line updates through each phase.
- Toggle auto-check off, restart, observe no background check.
- Open Command Center → Check for updates → `Up to date` toast.

## Phase U7 — Docs, rollout guardrails

Goal: land the documentation story so operators (future us) know how
to publish and how to debug without digging through this plan.

- [x] `docs/specs/release-distribution-and-changelog.md` updated: the
      top-of-document "auto-update out of scope" caveat now links to
      the shipped spec, the artifact-strategy section documents the
      `--x64 --arm64` split and `latest-mac.yml` expectations, and
      the publish-workflow section calls out the local sanity-check
      step.
- [x] `docs/architecture/quick-reference.md` — new section 8
      (Auto-updates) with a short description and a link to the spec;
      the old section 8 (Verification rules) became section 9.
- [x] `CLAUDE.md` post-task requirement section: appended a note that
      when modifying `electron-builder.yml`, any `package:mac*`
      script, or the `publish-mac-release.yml` workflow, agents must
      run `npm run package:mac:unsigned` locally and confirm
      `release/latest-mac.yml` still lists both archs.
- [x] `AGENTS.md` mirror of the same note (the two files were
      already byte-identical up to that section).
- [x] New operator runbook `docs/runbook/auto-updates.md` covering
      release publishing, two strategies for testing without
      shipping, "no update detected" diagnostics (latest-mac.yml,
      prerelease flag, tag/version mismatch, dev mode), signature
      failure diagnostics, per-user and emergency global disable,
      and the V1 rollback policy (ship-a-fix, no automatic
      rollback).

Verification: chaperone check --fix exit 0; no code changes in this
phase. test:pure 694 / test:unit 254 / typecheck clean from U6
remain valid — no files in the test graph were touched.

## Rollback notes

Each phase is additive:

- **U1** touches only build config. Revert = one commit on
  `electron-builder.yml` and `package.json`.
- **U2, U3** add code with zero user-visible change.
- **U4** is the first visible surface (Settings panel only). Revert
  removes the panel; backend continues to broadcast silently.
- **U5** adds toasts + command center item. Revert independently if
  toast UX is wrong; Settings panel still works.
- **U6** adds the background scheduler. Revert = no periodic check;
  manual check still works.
- **U7** is doc-only.

Revert granularity: one phase = one or two commits. The load-bearing
piece is U3 (service + IPC); everything else is UI or scheduling
around it.
