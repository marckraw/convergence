# Notifications

## Goal

Surface agent state changes through multiple coordinated channels — in-app
toast, sound, dock badge, dock bounce, OS system notification, and an
inline pulse on the session row — so the user knows when an agent
finishes, needs input, or errors without having to keep the Convergence
window in focus.

The "Needs you" sidebar section already aggregates actionable session
state (`needs-approval`, `needs-input`, `finished`, `failed`) and is the
authoritative in-app surface. This spec adds **active** notifications
(push) on top of the existing **passive** surface (poll).

macOS first. Windows runs the same code paths but with platform-specific
quirks documented in `non-goals` and `open questions`.

## Product intent

- When an agent transitions into an actionable state, the user should be
  notified once, through the channels they have enabled, with severity
  appropriate to the event.
- When the user is already looking at the relevant agent, no banner /
  sound / bounce — only a subtle inline pulse on the session row.
- When the window is unfocused or hidden, fall back to OS-level
  surfaces (system notification, dock bounce, badge).
- The "Needs you" sidebar section is the source of truth. System
  notifications are best-effort; if Focus / DND / permission denial
  swallows them, the user still recovers via the sidebar.
- Per-event-type and per-channel toggles in settings. Sensible defaults
  match Linear / Slack: everything on, suppress when focused.

## Non-goals (V1)

- **No notification center / inbox drawer.** The "Needs you" section
  already aggregates actionable state. A separate historical log
  (bell icon, scrollable list of past notifications) is a follow-up if
  users ask for it. V1 does not duplicate "Needs you".
- **No tray / menu bar icon.** Worth doing for an agent app, but a
  separate feature with its own UX surface.
- **No synthetic `needs-input` for Claude Code.** Claude Code's adapter
  only emits `finished`/`failed`/`none`. Codex emits the full set
  (`needs-approval`, `needs-input`, `finished`, `failed`). V1 accepts
  this asymmetry and documents it in the settings UI; an inference
  layer is a separate spec.
- **No `interruptionLevel` / Time-Sensitive escalation.** Electron's
  `Notification` does not expose UNNotificationInterruptionLevel and
  `timeSensitive` requires an Apple entitlement. V1 lives within the
  default delivery tier.
- **No quick-action "Approve" button in system notifications.**
  Approving a tool call from a banner would let the user act without
  reading the call. Click opens the app; approval happens in the
  composer.
- **No inline reply (`hasReply: true`) on macOS notifications.**
  Sending a message from outside the window is appealing but adds a
  second composer surface to maintain. Defer to V2.
- **No notification grouping via macOS `threadIdentifier`.** Electron
  does not expose it. App-layer coalescing (see V1 behavior) is
  sufficient for the expected event volume.
- **No Windows-specific Action Center reactivation (CLSID).** Windows
  uses Electron's built-in `Notification` with `setAppUserModelId`.
  Polishing toast click-back-when-app-closed is a Windows phase.
- **No persistence of notification history.** "Needs you" persists
  dismissals; firing history is live-only.
- **No quiet hours scheduler.** A simple "suppress sounds when window
  unfocused" toggle ships in V1; per-day-of-week schedules are a
  follow-up if users want them. Quiet hours design is sketched in
  open questions.

## V1 behavior

### Event taxonomy

Notifications are emitted on attention-state transitions, not on every
session update. Transitions are detected in `SessionService` by
comparing the previous `attention` value (held in memory keyed by
session id) with the next.

| Transition (prev → next) | Event id               | Severity |
| ------------------------ | ---------------------- | -------- |
| `* → needs-approval`     | `agent.needs_approval` | critical |
| `* → needs-input`        | `agent.needs_input`    | critical |
| `running → finished`     | `agent.finished`       | info     |
| `* → failed`             | `agent.errored`        | critical |
| any other transition     | (no event)             | —        |

`* → finished` requires `prev === 'running'` to avoid firing on app
boot when sessions hydrate from disk already in the `finished` state.

The first attention value seen for a session after boot is treated as
the baseline (no event fires); subsequent transitions fire normally.

### Channels

Each event passes through a pure policy function that decides which
channels fire given the current window state, the user's preferences,
and the event severity.

| Channel               | Surface                                                         | Platform |
| --------------------- | --------------------------------------------------------------- | -------- |
| `inline-pulse`        | ~600ms CSS pulse on the session row in the sidebar              | all      |
| `toast`               | Sonner toast in the existing `<Toaster />`                      | all      |
| `sound`               | Short WAV via `<audio>` in the renderer                         | all      |
| `dock-badge`          | `app.dock.setBadge('<unread>')` — count cleared on window focus | macOS    |
| `dock-bounce-info`    | `app.dock.bounce('informational')` — one bounce                 | macOS    |
| `dock-bounce-crit`    | `app.dock.bounce('critical')` — bounces until activate          | macOS    |
| `flash-frame`         | `BrowserWindow.flashFrame(true)` — taskbar/dock attention       | all      |
| `system-notification` | Main-process `new Notification({...}).show()`                   | all      |

### Suppression matrix

The pure policy reads three booleans about the window — `isFocused`,
`isVisible` (not minimized / not occluded), `isThisSession` (the user
is actively viewing the session that fired the event) — and returns a
`Set<Channel>`.

```
focused?  visible?  this-session?   channels fired
─────────────────────────────────────────────────────────────────────────
yes       yes       yes             { inline-pulse }
yes       yes       no              { toast, sound (soft), dock-badge }
yes       no        —               { toast, sound (soft), dock-badge } (rare)
no        yes       —               { toast, sound, system-notification,
                                      dock-bounce, flash-frame, dock-badge }
no        no        —               { toast (queued for next focus), sound,
                                      system-notification, dock-bounce,
                                      flash-frame, dock-badge }
```

`this-session` is window-level: if Convergence is the focused
application AND its main window is focused AND the session that fired
the event is the renderer's `activeSessionId`, treat as "user already
sees it". If the user is focused on Convergence but a different session
tab is active, fire the toast (because the user is here but not on this
agent).

`dock-bounce` severity follows event severity: `info` for
`agent.finished`, `critical` for `needs_approval`/`needs_input`/`errored`.

User preferences additionally mask channels — see "Preferences" below.
The matrix above is the maximum set; prefs can only subtract.

### Coalescing

Electron does not expose macOS `threadIdentifier`. App-layer batcher in
`notifications.coalescer.ts`:

- Sliding 5s window per severity (`info` and `critical` batch separately).
- Within a window, the **first** event of a given severity fires
  immediately. Subsequent events buffer.
- On window close, if the buffer has ≥1 additional events, the system-
  notification + sound channels of the _first_ event are skipped and
  one summary is fired instead: `"3 agents finished"` with the action
  "Open Convergence".
- Toasts and dock badge always fire per-event (no coalescing on
  in-app surfaces — they are already designed to stack).
- Hard cap of 3 system notifications per minute regardless of severity;
  overflow is dropped from the system channel only (toast + badge
  still fire so the event is recoverable from the sidebar).

### IPC contract

Backend-only events:

- `notifications:fire(event)` — internal call from `SessionService`'s
  attention transition hook into `NotificationsService`. Not exposed to
  the renderer.

Main → renderer broadcasts:

- `notifications:show-toast` — payload
  `{ id, severity, title, body, sessionId | null }`. Renderer's toast
  host calls Sonner with appropriate styling.
- `notifications:play-sound` — payload `{ id: 'soft' | 'alert' }`.
  Sound is played in the renderer for low latency and so it respects
  the renderer's audio context (single switch, no spawn cost).
- `notifications:focus-session` — payload `{ sessionId }`. Fired when
  the user clicks a system notification or toast. Renderer activates
  the session.

Renderer → main invokes:

- `notifications:get-prefs()` → `NotificationPrefs`
- `notifications:set-prefs(input)` → persisted prefs
- `notifications:test-fire(severity)` — used by onboarding and the
  settings dialog's "Try a test notification" button. Bypasses
  preferences and the suppression matrix.

`notifications:prefs-updated` broadcasts on change so all renderer
windows stay in sync.

### Preferences

Persisted in `AppSettings` under a new `notifications` key:

```ts
type NotificationPrefs = {
  enabled: boolean // master switch (default: true)
  toasts: boolean // (default: true)
  sounds: boolean // (default: true)
  system: boolean // (default: true; macOS may still deny at OS level)
  dockBadge: boolean // (default: true; macOS only)
  dockBounce: boolean // (default: true; macOS only)
  events: {
    finished: boolean // (default: true)
    needsInput: boolean // (default: true)
    needsApproval: boolean // (default: true)
    errored: boolean // (default: true)
  }
  suppressWhenFocused: boolean // (default: true)
}
```

When `enabled === false`, the policy returns an empty channel set for
every event — equivalent to muting the system. The "Needs you"
sidebar continues to update (it is independent of this setting).

UI lives in a new "Notifications" section inside the existing app
settings dialog (`src/features/app-settings/`). No new dialog.

### macOS specifics

- **Permission flow**: the OS prompts on the first `Notification.show()`
  call. The settings dialog's **"Try a test notification"** button is
  the canonical first-show site so the prompt appears at a moment the
  user expects. Onboarding card on first run links to it.
- **`Info.plist`**: `NSUserNotificationAlertStyle = alert` set via
  `electron-builder.yml`'s `mac.extendInfo`. Required for action
  buttons. Lives in the build config (separate from spec text).
- **AppUserModelID**: `app.setAppUserModelId('com.convergence.app')`
  set early in `main/index.ts` for Windows forward-compatibility.
- **Autoplay policy**: `app.commandLine.appendSwitch('autoplay-policy',
'no-user-gesture-required')` in `main/index.ts` before
  `app.whenReady()` so the renderer can play sounds without a user
  gesture.
- **Notification GC footgun**: `Notification` instances must be held
  in a `Map<eventId, Notification>` until the user clicks/closes or
  60s elapses. Otherwise the click handler can be GC'd and clicks
  silently no-op. Sweep runs every 30s.
- **Body length**: capped at 200 chars before truncation in service
  layer. macOS truncates at ~256 bytes.
- **`Notification.permission` is unreliable on macOS Electron** — do
  not gate on it. Fire and trust the OS to swallow if denied.
- **No Focus / DND detection**. If the OS swallows a notification, the
  "Needs you" sidebar still surfaces the state — that is the recovery
  path, not a re-show.
- **Custom sound bundling**: V1 ships sounds as renderer assets played
  via `<audio>`. Native `Notification` `sound` field uses macOS system
  sounds (`'Glass'` for soft, `'Hero'` for alert) — no bundled `.aiff`
  required. Bundling our own `.aiff` is a polish item.

### Sounds

Two assets in `src/shared/assets/sounds/`:

- `chime-soft.wav` — used for `agent.finished`. ~300ms, gentle.
- `chime-alert.wav` — used for `agent.needs_approval`, `agent.needs_input`,
  `agent.errored`. ~400ms, slightly more attention-grabbing.

Single `<audio>` element per sound, mounted once in the toast host
container. `play()` is called from the IPC handler. Renderer also
respects `prefs.sounds` and `policy.channels.has('sound')`.

## Data model

Renderer-only state added to `src/entities/notifications/`:

```ts
type NotificationsState = {
  prefs: NotificationPrefs
  unreadCount: number // mirrors dock badge for windows that don't show one
}
```

Backend state (in-memory only):

```ts
type NotificationsRuntimeState = {
  prevAttention: Map<sessionId, AttentionState> // for transition detection
  liveNotifications: Map<eventId, Notification> // GC guard
  recentSystemFires: number[] // timestamps for rate-limit
  coalescerBuffer: { info: Event[]; critical: Event[] }
}
```

Nothing notification-specific persists beyond `NotificationPrefs` in
`AppSettings`.

## Testing

- `notifications.policy.pure.ts` — exhaustive matrix tests:
  - 4 event types × 4 window states × prefs variants
    (master off, per-channel off, per-event off, suppress-when-focused
    off) = ~64 cases. Cover all severities × all channels.
- `notifications.coalescer.ts` — fake-timer tests:
  - Single event fires immediately.
  - Two events within 5s collapse to one summary.
  - Critical and info bucket independently.
  - Rate-limit: 4th system notification within a minute is dropped from
    system channel but still produces toast + badge update.
- `notifications.service.ts` — with stubbed broadcaster:
  - Transition `none → finished` after `running` fires `agent.finished`.
  - First-seen attention does NOT fire (boot-time hydration guard).
  - GC map is populated and swept after 60s.
- Renderer store — Zustand reducer tests for `prefs` updates and
  `unreadCount` reset on focus.
- Toast host container — RTL: receives IPC events, calls Sonner with
  expected severity styling, plays the right sound, dismisses on
  click.
- Settings dialog — renders all toggles, reflects backend prefs,
  persists changes.
- Test-fire button — dispatches `notifications:test-fire`, asserts
  bypass of prefs/policy.

Manual verification (signed-build only, document in plan):

- macOS permission prompt on first test fire.
- Dock badge appears and clears on focus.
- Dock bounce on critical event when window unfocused.
- System notification click activates correct session.

## Open questions (defer to follow-ups)

- **Notification center drawer.** A bell icon + history list. Decide
  after V1 ships and we see if "Needs you" alone is enough.
- **Tray / menu bar icon** with per-state indicator. Separate spec.
- **macOS Focus / DND awareness.** No Electron API today. If Apple or
  Electron exposes one, gate the system channel on it.
- **Quiet hours.** Per-day-of-week schedule; suppress sound + bounce
  but keep toast + badge. Add when users ask.
- **Synthetic `needs-input` for Claude Code.** Inference rule:
  `running → finished` AND last transcript turn is an assistant
  message with no tool call AND no continuation token requested. Risk
  of false positives if Claude Code wraps a final answer.
- **Inline reply on macOS** via `hasReply: true`. Means a second
  composer surface and message-send pipeline outside the window.
- **Custom `.aiff` sound bundling** via `extraResources` for native
  notification sound field. Currently using macOS system sounds.
- **Windows polish.** Action Center reactivation needs
  `ToastActivatorCLSID` (NodeRT path). Click-doesn't-focus footgun
  may need `windows-dummy-keystroke` workaround.
- **APNs / push notifications.** Electron supports `pushNotifications`
  on macOS. Out of scope until we have a server-side trigger model.
- **Telemetry on suppression decisions.** A dev-only console log of
  policy outputs would help tune defaults; production telemetry is a
  follow-up.
