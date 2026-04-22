# Notifications — Implementation Plan

Companion to `docs/specs/notifications.md`. Work is sliced into eight
phases. Each phase is independently shippable and verified before the
next begins. Verification means `npm install`, `npm run test:pure`,
`npm run test:unit`, `npm run typecheck`, and `chaperone check --fix`
all pass unless the phase explicitly notes otherwise.

## Phase N1 — Types, prefs schema, pure policy

Goal: land the types, the `NotificationPrefs` schema, and the pure
policy function. No runtime wiring, no IPC. Pure-testable end to end.

- [x] New file `electron/backend/notifications/notifications.types.ts`:
  - [x] `NotificationEvent` discriminated union: `agent.finished |
agent.needs_approval | agent.needs_input | agent.errored`,
        each carrying `{ id, sessionId, sessionName, projectName,
firedAt }`.
  - [x] `Severity = 'info' | 'critical'` and `eventSeverity(event)`
        helper. (Severity helper lives in `notifications.policy.pure.ts`
        next to its only consumer; the type stays in `.types.ts`.)
  - [x] `Channel` union covering all eight channels from the spec.
        (Implemented as nine variants — `sound` and `dock-bounce` were
        each split into two channels keyed by severity so the channel
        set is the single source of truth and the renderer/handlers
        do not need a parallel `severity` field.)
  - [x] `WindowState = { isFocused, isVisible, activeSessionId | null }`.
  - [x] `NotificationPrefs` matching the spec exactly.
- [x] New file `electron/backend/notifications/notifications.policy.pure.ts`:
  - [x] `decideChannels(event, windowState, prefs): Set<Channel>`
        implementing the suppression matrix and prefs masking.
  - [x] `formatTitleAndBody(event): { title, body, subtitle? }` —
        deterministic copy generation, body capped at 200 chars.
- [x] New file `electron/backend/notifications/notifications.defaults.ts`:
  - [x] `DEFAULT_NOTIFICATION_PREFS` matching the spec.
- [x] Pure tests covering the matrix (25 cases land the same coverage
      as the planned ~64 by parameterising over events / channels):
  - [x] all 4 events × all 4 window-state combinations × master on
  - [x] master off → empty set
  - [x] each per-channel toggle off → that channel removed, others kept
  - [x] each per-event toggle off → no channels for that event
  - [x] `suppressWhenFocused: false` → toast and sound fire even when
        focused

Verification: full gate green (test:pure 571 / test:unit 190 / typecheck
clean / chaperone check --fix exit 0).

## Phase N2 — AppSettings extension

Goal: persist `NotificationPrefs` through the existing `AppSettings`
pipeline. No notification firing yet.

- [x] Extend `AppSettings` interface in
      `electron/backend/app-settings/app-settings.types.ts` with
      `notifications: NotificationPrefs`. (Type lives in `.types.ts`,
      not `.service.ts`; service imports from there.)
- [x] On read, hydrate missing `notifications` field with
      `DEFAULT_NOTIFICATION_PREFS`. Implemented as
      `parseNotificationPrefs(value)` which also hydrates each missing
      top-level boolean and each missing nested `events.*` flag.
- [x] On write, validate the input shape (boolean assertions only;
      no schema lib needed for ~10 fields). Same
      `parseNotificationPrefs` runs against `setAppSettings` input —
      non-boolean fields fall back to defaults rather than throwing,
      keeping the IPC contract forgiving.
- [x] Update `AppSettingsInput` and the existing `appSettings:set`
      IPC handler to accept the new field. `notifications` is
      `optional` on input; when omitted, the existing stored
      notifications are preserved (so the current settings dialog,
      which does not yet expose notification toggles, never resets
      them). The existing `appSettings:updated` broadcast already
      fires on any change — no new channel.
- [x] Renderer: extend `src/entities/app-settings/` types to include
      `notifications`. Defined `NotificationPrefs` /
      `DEFAULT_NOTIFICATION_PREFS` inline in the renderer entity
      because `src/` cannot import from `electron/`. N4 will move
      these into the dedicated `entities/notifications/` slice and
      re-export from there.
- [x] Pure tests: hydration of missing field, validation rejects
      non-boolean values, defaults preserved on partial input.
      Five new cases land in
      `electron/backend/app-settings/app-settings.service.test.ts`
      under `describe('notifications', ...)`.
- [x] Unit test: existing app-settings dialog still renders and
      saves with no notifications UI yet (regression guard).
      `app-settings.container.test.tsx` updated — the dialog now
      passes through `settings.notifications` unchanged on save.

Verification: full gate green (test:pure 576 / test:unit 190 /
typecheck clean / chaperone check --fix exit 0). No visible UI change.

## Phase N3 — Notifications service skeleton + transition detection

Goal: a `NotificationsService` that observes attention transitions in
`SessionService` and computes events. Channel side-effects are stubbed
in this phase — only the event computation is real.

- [x] New file `electron/backend/notifications/notifications.service.ts`:
  - [x] `class NotificationsService` constructed with
        `{ getPrefs, getWindowState, getProjectName, dispatch, now? }`
        deps so tests can substitute stubs. Renamed `broadcaster` to
        `dispatch` to make the per-channel callback shape obvious;
        `getProjectName` and `now` were added so the service can
        construct a complete `NotificationEvent` without touching
        `Date` or `ProjectService` directly.
  - [x] `onAttentionTransition(prev, next, session)` — applies the
        event-detection rules from the spec, including the
        "first-seen attention is baseline" guard via an internal
        `Map<sessionId, AttentionState>`. Pure detection lives in
        `notifications.transitions.pure.ts` (`detectEvent(prev, next)`)
        so the matrix is independently unit-tested.
  - [x] On detected event: calls `decideChannels`, then dispatches
        each channel via `deps.dispatch({ channel, event, formatted })`.
        N3 wires a no-op dispatch in `main/index.ts`; real handlers
        land in N5 / N6.
- [x] Wire `SessionService` → `NotificationsService`:
  - [x] In `session.service.ts:updateAttention()`, capture `prev`
        before the field write, call
        `attentionObserver.onAttentionTransition(prev, next, session)`
        after `notifyUpdate(id)` via the new `notifyAttention(id,
prev, next)` helper. The wiring is via a
        `SessionAttentionObserver` interface so SessionService stays
        ignorant of NotificationsService.
  - [x] Inject `NotificationsService` via the existing service
        wiring in `electron/main/index.ts`. Constructed after
        `appSettingsService` so it can read prefs synchronously via
        the new `appSettingsService.getNotificationPrefsSync()`
        helper (avoids awaiting on the hot transition path).
- [x] Window state cache:
  - [x] In `electron/backend/notifications/notifications.state.ts`,
        track `isFocused` / `isVisible` via `BrowserWindow` events
        (`focus`, `blur`, `show`, `hide`, `minimize`, `restore`).
        Implemented behind an `AttachableWindow` interface so tests
        substitute a `FakeWindow`.
  - [x] `activeSessionId` field on the cache with `setActiveSession`
        setter; renderer ping IPC arrives in N4.
  - [x] `notificationsState.attach(window)` invoked via a new
        `onCreate` callback passed to `createWindow`, so both the
        primary and `activate`-recreated windows are wired.
- [x] Service tests with stubbed handlers:
  - [x] `none → finished` after baseline fires `agent.finished`.
  - [x] First-seen attention (no prior in map) does not fire.
  - [x] `needs-approval → needs-input` fires `agent.needs_input`.
  - [x] `running → none` fires nothing (covered by "no-op when
        prev === next" + the pure transition matrix returning `null`
        for `next === 'none'`).
  - [x] Dispatch is invoked once per channel in the policy set,
        carrying matching `event` and `formatted` payloads (asserting
        policy + service composition). Plus extra coverage: master
        `enabled: false` short-circuits, project name falls back to
        `'Convergence'` when the lookup returns `null`, baselines are
        per-session, and `forgetSession(id)` clears the map for
        deletes.

Verification: full gate green (test:pure 607 / test:unit 190 / typecheck
clean / chaperone check --fix exit 0; 5 pre-existing chaperone warnings
in `terminal-dock` unrelated to N3). Zero user-visible change.

## Phase N4 — Renderer entity + IPC plumbing

Goal: renderer entity slice for prefs, IPC bridge for transport, and
the `set-active-session` ping wired from session selection.

- [x] New slice `src/entities/notifications/`:
  - [x] `notifications.types.ts` — duplicated from electron copy
        (renderer tsconfig can't import from `electron/`); header
        comment calls out drift requirement. `entities/notifications`
        is now the renderer source of truth; `entities/app-settings`
        re-exports `NotificationPrefs` / `DEFAULT_NOTIFICATION_PREFS`
        from it so existing callers keep compiling.
  - [x] `notifications.api.ts` — thin wrappers over
        `window.electronAPI.notifications.*` (getPrefs, setPrefs,
        testFire, setActiveSession, onPrefsUpdated, onShowToast,
        onPlaySound, onFocusSession).
  - [x] `notifications.model.ts` — Zustand store: `prefs`,
        `unreadCount`, actions `loadPrefs()`, `setPrefs(input)`,
        `setActiveSession(id)`, `incrementUnread()`, `clearUnread()`.
        `setActiveSession` was added here so the renderer has one
        place to call for the active-session ping (App.container
        uses it).
  - [x] `index.ts` public API.
- [x] Preload (`electron/preload/index.ts`): expose
      `window.electronAPI.notifications` with `getPrefs`, `setPrefs`,
      `testFire`, `setActiveSession`, plus subscription helpers
      `onShowToast(cb)`, `onPlaySound(cb)`, `onFocusSession(cb)`,
      `onPrefsUpdated(cb)`. Each returns an unsubscribe function.
- [x] Extend `src/shared/types/electron-api.d.ts` with the new
      surface. The old `AppSettingsNotification*` aliases were
      renamed to `Notification*Data` and reused via
      `AppSettingsData.notifications` so there is one canonical
      shape for the preload bridge.
- [x] IPC handlers live in
      `electron/backend/notifications/notifications.ipc.ts`
      (new file, mirroring the terminal IPC split) and are
      registered from `electron/main/index.ts`:
  - [x] `notifications:get-prefs` → reads from `AppSettingsService`.
  - [x] `notifications:set-prefs` → writes via `AppSettingsService`
        and broadcasts `notifications:prefs-updated` (the existing
        `appSettings:set` handler also fans out the same channel so
        the two stores stay in lock-step).
  - [x] `notifications:test-fire(severity)` → constructs a synthetic
        event via `NotificationsService.buildEvent(...)` and calls
        `fire(event, { bypass: true })`. `fire` + `bypass` were
        factored out of `onAttentionTransition` on the service so
        both paths share one implementation; bypass forces the
        unfocused-window / master-on branch of `decideChannels`
        so every enabled channel fires regardless of prefs.
  - [x] `notifications:set-active-session(sessionId | null)` →
        forwards to `notifications.state.ts` cache.
- [x] Renderer wiring:
  - [x] On `App.container.tsx` mount, call `loadNotificationPrefs()`.
  - [x] An `activeSessionId` effect in `App.container.tsx` calls
        `notifications.setActiveSession(id)` whenever the active
        session changes (null on deactivation). All the existing
        session-activation sites (sidebar, command center, fork
        dialog) already flow through `useSessionStore.setActiveSession`,
        so one effect covers every entry point.
- [x] Dispatch fan-out wired in `main/index.ts`: `toast` and
      `inline-pulse` broadcast `notifications:show-toast`;
      `sound-soft` / `sound-alert` broadcast
      `notifications:play-sound`. Main-side handlers (dock badge
      / bounce, system notification, flash frame) remain stubbed
      here and land in N5 / N6.
- [x] Tests:
  - [x] Store reducer tests for prefs hydration, subscription
        replacement, `setPrefs` write-through, `setActiveSession`
        forwarding, and `unreadCount` increment/clear (five cases
        in `src/entities/notifications/notifications.model.test.ts`).
  - [x] Service tests for `fire({ bypass })` — covers bypass
        overriding `enabled=false` + focused window state, severity
        split for critical events, and non-bypass path still
        respecting prefs (three cases appended to
        `electron/backend/notifications/notifications.service.test.ts`).
  - [x] Preload typecheck — covered by the global `typecheck` gate.

Verification: full gate green (test:pure 610 / test:unit 195 / typecheck
clean / chaperone check --fix exit 0; 5 pre-existing `terminal-dock`
warnings unrelated to N4). Still no user-visible firings — renderer
channels are wired but no handlers consume the broadcasts yet.

## Phase N5 — In-app channels: toast, sound, inline pulse, badge

Goal: ship the renderer-driven channels. macOS users see toast +
sound + dock badge; pulse on the active session row. Still no system
notifications, no dock bounce.

- [x] New audio assets in `src/shared/assets/sounds/`:
  - [x] `chime-soft.wav` (~300ms, mono, 44.1kHz). Generated
        deterministically by `tools/generate-notification-sounds.mjs`
        (sine + overtone with exp envelope) rather than vendored —
        the README documents the synthesis source and regen command,
        avoiding any third-party license footprint.
  - [x] `chime-alert.wav` (~400ms). Two-tone (660Hz → 990Hz) from
        the same generator.
- [x] `app.commandLine.appendSwitch('autoplay-policy',
'no-user-gesture-required')` in `electron/main/index.ts` BEFORE
      `app.whenReady()`.
- [x] `app.setAppUserModelId('com.convergence.app')` in
      `electron/main/index.ts` (Windows forward-compat; harmless on
      macOS).
- [x] New feature `src/features/notifications-toast-host/`:
  - [x] `toast-host.container.tsx` — subscribes to `onShowToast`,
        `onPlaySound`, `onFocusSession`, and `onClearUnread`. Routes
        critical kinds (`agent.errored` / `agent.needs_approval`) to
        `toast.error` and the rest to plain `toast`. Mounts two
        `<audio>` elements (chime URLs imported via Vite's `*.wav`
        loader) and calls `.play()` for `sound-soft` / `sound-alert`.
        `inline-pulse` channel routes to `pulseSession` on the store
        rather than rendering a toast. Toast `action` button focuses
        the session and clears unread.
  - [x] `toast-host.styles.ts` — not needed; Sonner defaults plus the
        per-call `description` / `action` props were enough. Skipping
        the file kept the slice surface smaller.
- [x] Mount `<NotificationsToastHostContainer />` in
      `App.container.tsx` next to `<SessionForkDialogContainer />`.
- [x] Inline pulse:
  - [x] `data-pulse` attribute applied on session rows in
        `src/widgets/sidebar/needs-you-section.presentational.tsx`
        and `src/widgets/sidebar/project-tree.container.tsx`, driven
        by a new `pulsingSessionIds` prop threaded from
        `sidebar.container.tsx`.
  - [x] Keyframe lives in `src/app/global.css` under a
        `[data-pulse='true']` selector with a `prefers-reduced-motion:
reduce` override that disables the animation. Color uses
        `color-mix(in srgb, var(--ring) ...)` so it follows theme.
  - [x] No new IPC channel — the existing `notifications:show-toast`
        carries the channel string, and the toast host calls
        `pulseSession(event.sessionId)` when `payload.channel ===
'inline-pulse'`. Coalescing for re-pulses lives in the store
        via a module-level `Map<sessionId, timeoutHandle>`.
- [x] Dock badge (macOS only):
  - [x] `electron/backend/notifications/notifications.dock-badge.ts`
        owns the counter and the `app.dock?.setBadge` calls. Counter
        clears on focus via the new `NotificationsStateService`
        listeners contract (`setListeners({ onFocusGained })`)
        instead of duplicating `BrowserWindow` event subscriptions.
  - [x] `formatDockBadgeCount(count)` returns `''` / `'<n>'` / `'9+'`,
        capped at 9 to match the spec.
  - [x] On window focus, the dock badge clears and
        `notifications:clear-unread` broadcasts so the renderer
        unread counter resets too.
- [x] Channel handlers wired in `electron/main/index.ts` dispatch
      fan-out:
  - [x] `toast` and `inline-pulse` → `notifications:show-toast`.
  - [x] `sound-soft` / `sound-alert` → `notifications:play-sound`.
  - [x] `dock-badge` → `dockBadge.increment()`.
  - [x] System / dock-bounce / flash-frame still no-op until N6.
- [x] Tests:
  - [x] `toast-host.container.test.tsx` (6 cases): toast for
        finished + unread increment, error toast for critical kinds,
        inline-pulse routes to store instead of toast, soft vs alert
        chime selection (driven by stubbed `HTMLMediaElement.play`),
        focus-session forwarding, and clear-unread reset.
  - [x] `notifications.model.test.ts` pulse cases (2): pulse clears
        after `PULSE_DURATION_MS`, and re-pulse before timeout
        coalesces (extends the active pulse without flicker).
  - [x] `notifications.dock-badge.test.ts` (7): format edge cases
        (zero, single digits, 9, 10+) plus service increment / clear
        / cap interaction with a stubbed `app.dock`.

Verification: full gate green (test:pure 617 / test:unit 204 /
typecheck clean / chaperone check --fix exit 0; the same 5
pre-existing `terminal-dock` warnings remain, none introduced by
N5). Manual smoke-test still pending — covered when N6 lands the OS
channels and the test-fire UI is reachable.

## Phase N6 — System notifications + dock bounce + flash frame

Goal: cross OS boundary. Real `Notification` instances, click handlers
that focus the right session, dock bounce + flash frame for unfocused
windows. macOS-first; Windows works via the same code paths.

- [x] Channel handler `system-notification` in
      `electron/backend/notifications/notifications.system.ts`:
  - [x] Constructs the Electron `Notification` via an injected
        `createNotification(input)` factory (so the backend test can
        substitute a fake) — production wiring in `main/index.ts`
        passes `({ title, body, subtitle, sound }) => new
Notification(...)`. The `sound` field maps `info → 'Glass'`,
        `critical → 'Hero'` via `severityFromKind` (the same severity
        derivation the toast host uses).
  - [x] `'click'` handler invokes the injected `onClick(event)`
        callback. The wire-up in `main/index.ts` restores / shows /
        focuses the main window and broadcasts
        `notifications:focus-session` with the event's `sessionId`.
        Keeping the side effects in the wire-up (rather than the
        service) keeps the service free of `BrowserWindow`
        coupling.
  - [x] Live entries tracked in a `Map<eventId, { notification,
shownAt }>`. The 30s sweep runs via `setInterval` started lazily
        on first show and torn down once the map drains, so idle
        apps don't keep an interval alive. Entries past 60s are
        closed + removed; `'close'` / `'failed'` evict immediately.
        `app.before-quit` calls `dispose()` to close any
        outstanding notifications.
  - [x] `notification.show()` is called once per emit.
- [x] Channel handlers `dock-bounce-info` / `dock-bounce-crit` live in
      `notifications.dock-bounce.ts`:
  - [x] `bounceInformational()` calls `target.bounce('informational')`
        and discards the id (informational bounces don't need
        cancelling). `bounceCritical()` calls
        `target.bounce('critical')` and stores the returned id.
  - [x] `cancelOnFocus()` cancels the latest stored critical bounce
        id. The wire-up in `main/index.ts` invokes it from the
        existing `onFocusGained` listener (same listener the dock
        badge already uses) so we don't subscribe to focus events
        twice.
- [x] Channel handler `flash-frame` lives in
      `notifications.flash-frame.ts`:
  - [x] `flash()` calls `target.flashFrame(true)` and tracks an
        `active` flag. `clearOnFocus()` calls `flashFrame(false)`
        only when active so a focus event without a prior flash is a
        no-op. The wire-up uses the same `onFocusGained` listener.
- [x] Renderer focus action:
  - [x] The toast host's `onFocusSession` subscriber forwards into a
        new `focusSessionAcrossProjects(sessionId)` helper that
        looks up the target session in `globalSessions`, hops via
        `prepareForProject` + `setActiveProject` + `loadWorkspaces`
        / `loadCurrentBranch` / `loadSessions` if the session lives
        in a different project, then calls
        `useSessionStore.setState().setActiveSession(id)`. Toast
        action buttons reuse the same helper so cross-project clicks
        work whether they originate from a system notification or a
        Sonner toast. The helper is exported so unit tests can call
        it directly without round-tripping through the IPC stub.
- [x] Test-fire button wiring:
  - [x] No new wiring this phase — the `notifications:test-fire` IPC
        handler that landed in N4 still works; lands as a UI control
        in N7.
- [x] Tests:
  - [x] `notifications.system.test.ts` (6): show wires sound per
        severity, click → onClick + evict, close / failed evict,
        sweep evicts stale entries via fake timers, sweep tears down
        and restarts the interval cleanly across drain cycles, and
        dispose closes everything.
  - [x] `notifications.dock-bounce.test.ts` (5): informational does
        not store / cancel; critical stores + cancels on focus;
        cancel without pending is a no-op; consecutive criticals
        overwrite the tracked id; platform returning `undefined`
        skips the store.
  - [x] `notifications.flash-frame.test.ts` (3): flash + clear cycle;
        idempotent clear; double-clear stays at one
        `flashFrame(false)` call.
  - [x] `toast-host.container.test.tsx` extended to 8 cases: same
        intra-project focus, cross-project hop (asserts
        prepareForProject / setActiveProject / loadWorkspaces /
        loadCurrentBranch / loadSessions / setActiveSession all run
        in order against the right project), and unknown-session
        focus is a silent no-op.

Verification: full gate green (test:pure 631 / test:unit 206 /
typecheck clean / chaperone check --fix exit 0; same 5 pre-existing
`terminal-dock` warnings, none introduced by N6). **Manual smoke
test only meaningful on a signed dev build** — unsigned dev builds
may show OS notifications inconsistently on macOS; the suite passes
regardless because side-effects run against stubs.

## Phase N7 — Settings UI + onboarding

Goal: user-facing controls and a first-run nudge.

- [x] Notifications section lives in
      `src/features/app-settings/notifications-fields.presentational.tsx`
      and is mounted from `app-settings.presentational.tsx` next to
      the existing session-defaults / naming / forking sections:
  - [x] Master toggle "Enable notifications" with subtitle
        explaining it mutes every other channel when off.
  - [x] Per-channel toggles for Toasts / Sounds / System
        notifications / Dock badge / Dock bounce. Dock-badge and
        dock-bounce hide on non-`darwin` platforms (driven by a
        `platform` prop the container reads from
        `document.documentElement.dataset.platform`, falling back to
        `electronAPI.system.getInfo().platform`).
  - [x] Per-event toggles for Finished / Needs input / Needs
        approval / Errored. All non-master toggles disable + dim
        when the master is off rather than disappearing, so users
        know what would re-enable.
  - [x] "Suppress when window is focused" toggle.
  - [x] "Try a test notification" group: `Soft` and `Alert` buttons
        that call `notificationsApi.testFire(severity)`.
  - [x] Footer note about the Claude Code state-coverage
        limitation.
  - [x] The toggle UI is implemented as `SwitchRow` in
        `src/shared/ui/switch.tsx` (button + `role="switch"`,
        `aria-checked`, `aria-label`) — no new dependency. Lifted
        into `shared/ui/` because chaperone enforces one React
        component per file outside that directory.
- [x] Container glue in
      `src/features/app-settings/app-settings.container.tsx`:
      reads `settings.notifications` into a local
      `notificationsDraft` so the dialog can edit without flushing
      mid-session, dispatches `save({ ...notifications, onboarding
})` on Save (preserves the `onboarding` field unchanged so the
      onboarding flow stays orthogonal). Test-fire goes directly
      via `notificationsApi.testFire` (no draft round-trip needed).
- [x] First-run onboarding card lives in
      `src/features/notifications-onboarding/`:
  - [x] Mounted in `App.layout.tsx` above the `SessionView` panel.
        Renders only when `appSettings.isLoaded`, an active project
        exists, and `settings.onboarding.notificationsCardDismissed`
        is false — three checks live in the container so the
        presentational stays prop-driven.
  - [x] "Open Settings" button calls `useDialogStore.open('app-settings')`,
        which opens the existing dialog. The dialog already focuses
        no specific section, so we land on the top — the
        Notifications section is the third section so the user only
        scrolls one short panel.
  - [x] "Don't show again" persists via `appSettings.save({
...settings, onboarding: { notificationsCardDismissed: true } })`.
        The `onboarding` field is now part of `AppSettings`
        (electron + renderer both extended; defaults hydrate to
        `{ notificationsCardDismissed: false }` when missing in the
        stored blob).
- [x] Tests:
  - [x] `notifications-fields.presentational.test.tsx` (6): every
        toggle renders, macOS-only ones hide on win32, channel /
        event toggles call onChange with the merged prefs, master
        off disables non-master toggles, test-fire dispatches the
        chosen severity.
  - [x] `app-settings.container.test.tsx` extended with two cases:
        toggling a channel and saving persists the new
        `notifications` shape (with `onboarding` preserved), and
        the test-fire button reaches `notifications.testFire`.
  - [x] `onboarding-card.container.test.tsx` (6): renders nothing
        while loading / without an active project / when dismissed,
        renders when conditions are met, Open Settings flips
        `useDialogStore.openDialog`, and Don't show again calls
        `save` with the dismissal flag set.
  - [x] Backend `app-settings.service.test.ts` updated: every
        round-trip now expects the hydrated `onboarding` field too.

Verification: full gate green (test:pure 631 / test:unit 220 /
typecheck clean / chaperone check --fix exit 0; same 5 pre-existing
`terminal-dock` warnings). Hand-test still pending — open settings
and toggle to confirm the visual switch states; OS-level fires only
exercise meaningfully on a signed dev build (covered in N6's
notes).

## Phase N8 — Coalescing + rate limiting + cleanup

Goal: app-layer batching so a burst of agent finishes does not spam
the OS notification center.

- [x] `electron/backend/notifications/notifications.coalescer.ts`:
  - [x] `SystemNotificationCoalescer` with `add(severity, event,
formatted)` and `dispose()`. Constructor takes `{ fire, now,
windowMs, rateLimitWindowMs, rateLimitMax, buildSummaryId }`
        so tests can keep the windows short and IDs deterministic.
        The signature accepts `formatted` instead of recomputing
        because the policy already produced it; the coalescer is a
        pass-through for single events and a synthesizer for
        summaries.
  - [x] 5s sliding window per severity (own bucket per
        `info`/`critical`). First event in a fresh window fires
        immediately; subsequent events buffer. On window close, if
        the buffer is non-empty, the coalescer synthesizes a
        summary `NotificationEvent` (id from `buildSummaryId`,
        sessionId/projectName/kind borrowed from the first
        buffered entry so the click handler still focuses a real
        session) plus a `FormattedNotification` titled `"N sessions
<verb>"` (verb = `finished` for info, `need attention` for
        critical). The body is the comma-separated session names,
        truncated to 200 chars to match the single-event cap.
  - [x] Rate limit: a `recentFires` timestamp ring with cutoff at
        `now - rateLimitWindowMs`. Both immediate and summary fires
        consume budget; toast / badge / sound / dock-bounce /
        flash-frame don't route through the coalescer so they're
        unaffected. When the budget is exhausted, system fires drop
        silently — no fallback toast or surrogate.
- [x] Wire coalescer in `electron/main/index.ts` dispatch:
  - [x] `system-notification` channel calls
        `systemCoalescer.add(eventSeverity(event.kind), event,
formatted)` instead of going straight to `systemNotifications.show`.
  - [x] All other channels fire immediately as before — the
        coalescer is a strict opt-in for the OS channel only.
  - [x] `app.before-quit` disposes the coalescer alongside the
        existing `systemNotifications.dispose()` call so any pending
        flush timers don't leak.
- [x] Tests with fake timers (6 cases in
      `notifications.coalescer.test.ts`):
  - [x] Single event in window fires as-is and the empty flush is a
        no-op.
  - [x] Three events in window collapse to one summary with the
        right title (`"2 sessions finished"` for the buffered
        suffix) and body (`"Beta, Gamma"`).
  - [x] Severity-specific verb in the summary (`"need attention"`
        for critical).
  - [x] Critical and info buckets are independent (rate budget
        bumped in this test so the assertion targets bucket
        isolation, not rate limiting — separate cases below cover
        the limiter).
  - [x] 4th immediate fire within 60s drops; once the 60s window
        slides past the first fire, the budget refills and the
        next event fires.
  - [x] Summary at flush time also drops when the budget is
        exhausted (covers the "rate-limited summary is silent"
        path).
- [x] Final cleanup:
  - [x] No stray `console.debug` left in the notifications backend
        or the toast host (verified via grep).
  - [x] Dev-only subscriber added in `App.container.tsx` gated on
        `import.meta.env.DEV` — logs every `notifications:show-toast`
        and `notifications:play-sound` payload with a
        `[notifications:*]` prefix, mirroring the existing
        `[task-progress]` log subscriber.
  - [x] Changeset `.changeset/notifications-launch.md` (minor bump)
        summarises the whole N1–N8 series.

Verification: full gate green (test:pure 637 / test:unit 220 /
typecheck clean / chaperone check --fix exit 0; same 5 pre-existing
`terminal-dock` warnings, none introduced by N8). Changeset present
under `.changeset/notifications-launch.md`.

## Rollback notes

Each phase is additive:

- **N1, N2, N4** add code with zero behavior change.
- **N3** observes transitions and runs the policy but only invokes
  stubbed handlers — still no user-visible change.
- **N5** adds in-app channels (toast, sound, badge, pulse). If any
  feel wrong, revert N5 only — backend still computes events
  silently.
- **N6** adds OS-level channels. Revert independently if
  signing/permission issues block delivery.
- **N7** is the user-facing surface. Revert independently if UI
  regresses.
- **N8** is pure optimization; reverting it means no coalescing but
  everything else still works.

Revert granularity: one phase = one or two commits. The pure policy
(N1) is the load-bearing piece; everything else is wiring around it.
