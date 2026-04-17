# Implementation Plan: Global App Settings

Companion plan for `docs/specs/global-app-settings.md`. Read the spec first —
this document only refines the spec's 6-slice outline into verifiable tasks.

## Overview

Ship an app-wide settings surface whose v1 scope is three persistent session
defaults (`defaultProviderId`, `defaultModelId`, `defaultEffortId`). Storage
reuses the existing SQLite `app_state` key-value table. Backend exposes a
dedicated service + IPC channels. Renderer gets a new entity slice, a new
feature slice (dialog), a sidebar cog entry point, and integration with the
existing session-start flow.

## Architecture decisions

- **One JSON blob at key `app_settings`** (not three flat keys) — keeps future
  settings from fragmenting the KV namespace.
- **Dialog, not route** — matches the existing `MCP Servers` pattern, low risk
  to promote to a route later.
- **`resolveSessionDefaults` lives in the backend** and is called from the
  `session:create` IPC handler as a defensive backstop. The renderer
  **also** resolves defaults locally for UI snappiness via an extended
  `resolveProviderSelection`. This is a deliberate (and acknowledged)
  duplication; collapse later if it drifts.
- **Validation against the live provider registry** — stored ids are
  revalidated on every read so uninstalled providers silently degrade to the
  fallback chain instead of surfacing errors.

## Dependency graph

```
T1 backend service ── T2 IPC/preload ──┬── T3 renderer entity slice ──┬── T5 settings dialog ── T6 sidebar entry
                                       │                              │
                                       │                              └── T7 session-start integration
                                       │
                                       └── T8 session:create defensive defaults

T4 resolveProviderSelection storedDefaults (pure) ── prerequisite of T7
```

T4 is independent of the backend chain and can be picked up in parallel with
T1-T2 if desired.

---

## Task list

### Phase 1 — Backend foundation

#### Task 1: Backend `app-settings` service and types

**Description:** Introduce a dedicated backend slice that owns reading,
validating, and writing the three defaults, plus a `resolveSessionDefaults`
helper that the IPC layer can call. Depends only on `StateService` and the
provider registry.

**Acceptance criteria:**

- [ ] `AppSettings` and `AppSettingsInput` types defined with `defaultProviderId | null`, `defaultModelId | null`, `defaultEffortId: ReasoningEffort | null`.
- [ ] `AppSettingsService.getAppSettings()` returns a valid `AppSettings`. When stored ids are no longer present in the provider registry, the invalidated field is coerced to `null` (never throws).
- [ ] `AppSettingsService.setAppSettings(input)` validates each field against the registry; invalid ids throw a typed error. On success the JSON blob is persisted under key `app_settings`.
- [ ] `resolveSessionDefaults(providers)` returns a `{ providerId, modelId, effortId }` triple guaranteed valid for the given providers list, applying the fallback chain from the spec.
- [ ] Unit tests cover: round-trip, invalid provider id falls back, invalid model id falls back, invalid effort falls back, fully empty state resolves to (first provider, provider's `defaultModelId`, model's `defaultEffort` or `'medium'`).

**Verification:**

- [ ] `npm install`
- [ ] `npm run test:unit -- app-settings`
- [ ] `chaperone check --fix`

**Dependencies:** None.

**Files likely touched:**

- `electron/backend/app-settings/app-settings.types.ts` (new)
- `electron/backend/app-settings/app-settings.service.ts` (new)
- `electron/backend/app-settings/app-settings.service.test.ts` (new)

**Scope:** S-M.

---

#### Task 2: IPC channels, preload bridge, broadcast

**Description:** Expose `appSettings:get` and `appSettings:set` IPC channels
plus an `appSettings:updated` broadcast. Wire an `AppSettingsService` instance
into `registerIpcHandlers` and add the matching preload surface.

**Acceptance criteria:**

- [ ] `appSettings:get` returns the service's `getAppSettings()` result.
- [ ] `appSettings:set` persists via the service, returns the new settings, and broadcasts `appSettings:updated` to all `BrowserWindow` instances.
- [ ] Invalid input to `appSettings:set` is rejected with an error the renderer can read.
- [ ] `window.electronAPI.appSettings.{get,set,onUpdated}` exist on the preload bridge with the shapes described in the spec.
- [ ] Manual smoke check via devtools: `await window.electronAPI.appSettings.set({ defaultProviderId: 'claude-code', defaultModelId: 'sonnet', defaultEffortId: 'medium' })` → returns stored settings; subsequent `get` reflects them.

**Verification:**

- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`
- [ ] `npm run dev` (or the local launch command), open devtools, run the smoke commands above.

**Dependencies:** T1.

**Files likely touched:**

- `electron/main/ipc.ts` (extend)
- `electron/preload/index.ts` (extend)
- `electron/main/index.ts` (construct and inject `AppSettingsService`)

**Scope:** S.

---

### Checkpoint A — Backend reachable from the renderer

- [ ] Tests green (`test:pure`, `test:unit`).
- [ ] Dev app launches.
- [ ] Devtools can read + write settings through the preload bridge.
- [ ] Broadcast fires (add a throwaway `ipcRenderer.on('appSettings:updated', console.log)` if needed to confirm).

---

### Phase 2 — Renderer plumbing

#### Task 3: `app-settings` entity slice

**Description:** Renderer-side types, API wrapper, and Zustand store for app
settings. Mirrors existing entity conventions (see `src/entities/session/`).

**Acceptance criteria:**

- [ ] `AppSettings` type matches the backend shape.
- [ ] `appSettingsApi.get()` and `appSettingsApi.set(input)` call the preload bridge.
- [ ] `useAppSettingsStore` exposes `settings`, `isLoading`, `error`, `load()`, `save(input)`.
- [ ] Store subscribes to `appSettings:updated` on first `load()` and updates state when broadcasts arrive. Unsubscribes when the app unmounts (or leaks harmlessly — single-window app).
- [ ] `index.ts` re-exports the public API; nothing reaches in via deep imports from outside the slice.
- [ ] Unit test verifies load + save + broadcast-driven update using a fake preload API.

**Verification:**

- [ ] `npm run test:unit -- app-settings`
- [ ] `chaperone check --fix`

**Dependencies:** T2.

**Files likely touched:**

- `src/entities/app-settings/app-settings.types.ts` (new)
- `src/entities/app-settings/app-settings.api.ts` (new)
- `src/entities/app-settings/app-settings.model.ts` (new)
- `src/entities/app-settings/app-settings.model.test.ts` (new)
- `src/entities/app-settings/index.ts` (new)
- `src/entities/index.ts` (re-export if pattern matches)

**Scope:** M.

---

#### Task 4: `resolveProviderSelection` accepts stored defaults

**Description:** Extend the existing pure resolver so the session-start form
can prefer stored defaults over the hardcoded fallback chain without
duplicating logic. The function stays pure (no Electron imports).

**Acceptance criteria:**

- [ ] Optional fourth input (e.g. `storedDefaults?: { providerId?, modelId?, effortId? }`) is consumed **before** the existing first-provider / default-model / `'medium'` fallbacks.
- [ ] Existing callers keep working without change (argument is optional).
- [ ] Pure test covers: stored defaults used when valid, ignored when the stored provider is absent from the list, ignored model falls through to provider default, ignored effort falls through to model default.

**Verification:**

- [ ] `npm run test:pure -- provider-selection`
- [ ] `chaperone check --fix`

**Dependencies:** None (independent; can run parallel to T1-T3).

**Files likely touched:**

- `src/entities/session/provider-selection.pure.ts`
- `src/entities/session/provider-selection.pure.test.ts` (new or extend if existing)

**Scope:** S.

---

### Checkpoint B — Renderer can load + save

- [ ] Entity store load/save working from a throwaway `useEffect` somewhere (sanity check, revert before merging).
- [ ] `provider-selection.pure` honors stored defaults in its tests.

---

### Phase 3 — UI surface

#### Task 5: `app-settings` feature (dialog)

**Description:** Build the settings dialog itself — presentational + container
split per FSD-lite rules. Includes the provider/model/effort select cluster
and the Save / Cancel / Restore defaults footer.

**Acceptance criteria:**

- [ ] `session-defaults.presentational.tsx` renders three selects driven purely by props; has no effects, no IPC, no store imports.
- [ ] `app-settings.presentational.tsx` renders the dialog shell and footer, composing `session-defaults.presentational`.
- [ ] `app-settings.container.tsx` loads settings via the entity store, owns draft state while the dialog is open, and dispatches `save(input)` on Save.
- [ ] Changing the provider resets model + effort to that provider's defaults; changing the model resets effort.
- [ ] `Restore defaults` resets the draft to (first provider, its `defaultModelId`, model's `defaultEffort`) without saving until the user clicks Save.
- [ ] Cancel discards draft state and closes without writing.
- [ ] Unit test (or presentational snapshot + container effect test) covers the dependent-reset behaviour.

**Verification:**

- [ ] `npm run test:unit -- app-settings`
- [ ] `chaperone check --fix`
- [ ] Manual: open dialog from a temporary trigger, exercise all three selects and footer buttons.

**Dependencies:** T3.

**Files likely touched:**

- `src/features/app-settings/app-settings.container.tsx` (new)
- `src/features/app-settings/app-settings.presentational.tsx` (new)
- `src/features/app-settings/session-defaults.presentational.tsx` (new)
- `src/features/app-settings/app-settings.container.test.tsx` (new)
- `src/features/app-settings/index.ts` (new)

**Scope:** M.

---

#### Task 6: Sidebar entry point

**Description:** Add a settings cog button to the sidebar footer that opens
the `AppSettingsDialog`. No other sidebar changes.

**Acceptance criteria:**

- [ ] New cog icon button in `src/widgets/sidebar/` footer, colocated with the existing footer actions.
- [ ] Clicking the button opens the settings dialog.
- [ ] The dialog open-state is local to the sidebar (or the settings feature), not global.
- [ ] Keyboard-accessible (button element, not a div; `aria-label="Open settings"`).

**Verification:**

- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`
- [ ] Manual: click cog, dialog opens; Esc closes; Save persists; re-open shows saved values.

**Dependencies:** T5.

**Files likely touched:**

- `src/widgets/sidebar/*.presentational.tsx` and/or `*.container.tsx` (extend)
- Possibly `src/widgets/sidebar/index.ts` if the dialog is mounted from the widget

**Scope:** S.

---

### Checkpoint C — Settings live end-to-end

- [ ] Open sidebar cog → dialog appears populated with current stored values.
- [ ] Change provider/model/effort → Save → close.
- [ ] Relaunch the app → dialog reopens with the previously saved values.
- [ ] Uninstall/rename a provider in code → app still launches, dialog shows the fallback without error.

---

### Phase 4 — Apply defaults to new sessions

#### Task 7: Session-start uses stored defaults

**Description:** Wire the session-start container to the stored settings so
the form pre-populates with the user's saved choices when they open it.

**Acceptance criteria:**

- [ ] On mount, the session-start container reads from `useAppSettingsStore` (triggering a `load()` if not yet loaded).
- [ ] The loaded settings are passed through `resolveProviderSelection(..., storedDefaults)`.
- [ ] If the user has already touched any of the three selects in the current form session, re-resolving does not overwrite their in-progress choice.
- [ ] When no settings are stored, behaviour is identical to today.

**Verification:**

- [ ] `npm run test:unit -- session-start`
- [ ] `chaperone check --fix`
- [ ] Manual: set defaults via settings dialog → open session-start form → verify pre-population.

**Dependencies:** T3, T4, T5.

**Files likely touched:**

- `src/features/session-start/session-start.container.tsx`
- `src/features/session-start/session-start.container.test.tsx` (new or extend)

**Scope:** S.

---

#### Task 8: Defensive defaults in `session:create` handler

**Description:** Make the backend authoritative for default resolution. If
the renderer sends a create payload with missing provider/model/effort, the
handler fills them via `AppSettingsService.resolveSessionDefaults()` before
passing to `SessionService.create()`.

**Acceptance criteria:**

- [ ] `session:create` handler calls `resolveSessionDefaults(providers)` when any of provider/model/effort is missing from the input.
- [ ] Explicit values from the renderer still take precedence.
- [ ] Unit test covers a create with all fields missing and asserts the persisted session row has resolved values.

**Verification:**

- [ ] `npm run test:unit -- session`
- [ ] `chaperone check --fix`
- [ ] Manual: temporarily stub renderer to send a create without fields → confirm the created session is valid.

**Dependencies:** T1, T2.

**Files likely touched:**

- `electron/main/ipc.ts`
- Possibly `electron/backend/session/session.service.ts` (signature tolerance for nullable fields)
- `electron/backend/session/session.service.test.ts` (extend) or a new IPC-layer test if one exists

**Scope:** S.

---

### Checkpoint D — Feature complete

- [ ] All tasks' acceptance criteria met.
- [ ] `npm run test:pure`, `npm run test:unit`, `chaperone check --fix` all green.
- [ ] Manual end-to-end: change defaults in settings dialog → start a new session → session is created with the new defaults without touching the form.
- [ ] Changeset written if the repo requires one (see `docs/specs/release-distribution-and-changelog.md` if in doubt).
- [ ] Spec open questions revisited: any still open? Note resolutions in the spec or a follow-up.

---

## Parallelization opportunities

- **T4** (pure resolver extension) is independent of everything and can be
  done first or in parallel with Phase 1.
- Phase 2 tasks (T3, T4) can proceed in parallel once T2 ships.
- Phase 3 tasks (T5, T6) must be sequential (dialog before entry point).
- T8 can ship any time after T1+T2; it is independent of the UI work.

## Risks and mitigations

| Risk                                                                                                                 | Impact | Mitigation                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| Provider id churn invalidates stored defaults silently                                                               | Low    | v1 falls back to first provider; log at debug level so future telemetry can notice.                             |
| Duplicated default-resolution logic (backend `resolveSessionDefaults` vs renderer `resolveProviderSelection`) drifts | Med    | Keep the fallback chain identical and covered by tests in both places; collapse to one home if drift appears.   |
| Dialog scope creeps to "all settings" during T5                                                                      | Med    | v1 is only the three session defaults — resist adding other sections even if the shell obviously supports them. |
| Session-start pre-fill overwrites user's in-progress choice after a broadcast                                        | Med    | T7 acceptance criterion forbids this; test the "user touched field, broadcast arrives, selection stays" case.   |

## Open questions (carry over from spec)

- Should `resolveSessionDefaults` eventually be backend-only? Revisit after
  T7 + T8 are in.
- Dialog vs route promotion — revisit when the second settings section
  (theme default, keybindings, etc.) is scoped.

## Verification checklist before implementation starts

- [ ] Every task has acceptance criteria and a verification step.
- [ ] Dependencies are explicit and acyclic.
- [ ] No task touches more than ~5 files (largest is T5 with 5).
- [ ] Checkpoints exist between phases.
- [ ] Spec and plan are linked from each other.
- [ ] Human has reviewed and approved this plan before T1 begins.
