# Global App Settings

## Objective

Let the user configure app-wide defaults that apply every time a new session
is started. Today these defaults are hardcoded (provider = first registered,
model = `sonnet` for Claude, effort = `medium`). A user who prefers Codex, or
`opus`, or `high` effort, has no way to persist that choice — they must pick it
manually in the session-start form every time.

This spec covers the first pass of a global settings surface in Convergence.
The initial scope is narrow on purpose: only the three session-start defaults.
The surface should be designed so additional settings (theme default, window
behaviour, keybindings, telemetry opt-ins) can be added later without
reshaping the storage, IPC, or UI shell.

## Product behavior

### Scope (v1)

Three persistent app-wide preferences:

- `defaultProviderId` — id of a registered provider (e.g. `claude-code`,
  `codex`). Must be one of the providers detected at launch; if the stored
  value is not present at launch (e.g. provider uninstalled, id renamed), fall
  back to the first registered provider and do not error.
- `defaultModelId` — id of a model offered by the chosen provider. If invalid
  for the current provider, fall back to that provider's
  `defaultModelId` (the hardcoded descriptor default).
- `defaultEffortId` — one of the provider/model's effort options. If invalid,
  fall back to the model's `defaultEffort`, then to `'medium'`, then to the
  first available effort option.

All three values are a single logical unit: changing the provider may
invalidate the stored model and effort, so the UI and validation must keep
them consistent.

### Settings entry point

Add a dedicated settings surface. Two acceptable placements — pick one during
implementation:

- **Sidebar footer icon**: cog icon next to the existing footer actions
  (`What's New`, `MCP Servers`, theme toggle) in
  `src/widgets/sidebar/`. Opens the settings as a dialog.
- **Settings route/panel**: a settings view that replaces the main content
  area (parallel to the session view). This keeps room for future settings
  sections.

Default to the dialog approach for v1. Dialog keeps the change contained and
consistent with the existing `MCP Servers` dialog pattern. The settings panel
can graduate to a full route later without breaking callers.

### Settings dialog content (v1)

Title: `Settings`.

Sections:

1. `Session defaults`
   - Provider select (all registered providers)
   - Model select (models for the currently-selected provider)
   - Effort select (effort options for the currently-selected model)
   - Helper text under each control that explains what the default is used for
2. Footer
   - `Save` — persists, closes the dialog, broadcasts change event
   - `Cancel` — discards edits, closes the dialog
   - `Restore defaults` — resets the three values to the code-level defaults
     (first provider, its `defaultModelId`, model's `defaultEffort`)

When the user changes the provider, reset the model to that provider's
`defaultModelId` and the effort to that model's `defaultEffort`. When the user
changes the model, reset the effort likewise.

### Session-start integration

The existing session-start form already calls `resolveProviderSelection()` to
pick a default. That function must learn to prefer stored defaults over its
current fallback chain:

1. Use the explicit user selection in the form (unchanged).
2. Otherwise use the stored `defaultProviderId` / `defaultModelId` /
   `defaultEffortId` if they are valid for the current `providers` list.
3. Otherwise fall back to today's behaviour (first provider, provider's
   `defaultModelId`, model's `defaultEffort`, `medium`).

The user must still be able to override the defaults per session in the
session-start form. Picking something non-default in session-start does
**not** update the stored app-wide defaults.

### Reactivity

When defaults change through the settings dialog:

- Broadcast a `appSettings:updated` event over IPC to all renderers.
- The session-start container re-reads defaults on the next mount. It does
  **not** retroactively change an already-rendered session-start form unless
  the user has not touched any field yet.

### Non-goals (v1)

- Per-project or per-workspace overrides of defaults.
- Other settings surfaces (theme default, window restore, logging, etc.) —
  listed here only as future sections so the shell can accommodate them.
- Settings import/export.
- Keyboard shortcuts to open settings.
- Settings search.
- Multi-user / cloud sync.

## Architecture

### Storage

Reuse the existing `app_state` SQLite table via
`electron/backend/state/state.service.ts`. No new table.

Use a single JSON-serialised value under one key rather than three flat keys,
so future additions to the settings object do not fragment the key space:

- key: `app_settings`
- value: `JSON.stringify({ defaultProviderId, defaultModelId, defaultEffortId })`

A dedicated service wraps the JSON serialisation and validation so callers
never touch raw `StateService.get` / `set`.

### Backend feature

New backend slice:

- `electron/backend/app-settings/`
  - `app-settings.types.ts` — `AppSettings`, `AppSettingsInput` interfaces.
  - `app-settings.service.ts` — `getAppSettings()`, `setAppSettings(input)`,
    `resolveSessionDefaults(providers)`:
    - `getAppSettings()` reads the JSON blob, returns `null` fields if unset.
    - `setAppSettings(input)` validates against provider descriptors and
      persists.
    - `resolveSessionDefaults(providers)` returns a
      `{ providerId, modelId, effortId }` tuple that is guaranteed valid for
      the given providers list — applies the fallback chain described above.
      This is the function the session-creation path calls.

The service depends on the provider registry (or a providers snapshot) so it
can validate stored ids against currently-registered providers.

### IPC

Extend `electron/main/ipc.ts` with:

- `appSettings:get` → returns `{ defaultProviderId, defaultModelId, defaultEffortId }`
  (any field may be `null` when not yet set).
- `appSettings:set` with payload `{ defaultProviderId, defaultModelId, defaultEffortId }` →
  returns the stored settings after validation, or throws on invalid input.
- broadcast `appSettings:updated` to all renderer windows after a successful
  `set`.

The `session:create` handler must also start calling
`resolveSessionDefaults()` server-side when the renderer sends a session
create with missing provider/model/effort. Do not rely solely on the renderer
to resolve defaults — the IPC boundary should be defensive.

### Preload bridge

Extend `electron/preload/index.ts`:

```ts
appSettings: {
  get: () => ipcRenderer.invoke('appSettings:get'),
  set: (input) => ipcRenderer.invoke('appSettings:set', input),
  onUpdated: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('appSettings:updated', listener)
    return () => ipcRenderer.off('appSettings:updated', listener)
  },
}
```

### Renderer

Follow FSD-lite layering.

New entity slice:

- `src/entities/app-settings/`
  - `app-settings.types.ts` — renderer-facing `AppSettings` type.
  - `app-settings.api.ts` — wraps the preload bridge.
  - `app-settings.model.ts` — Zustand store with `settings`, `isLoading`,
    `load()`, `save(input)`. Subscribes to `appSettings:updated` on mount.
  - `index.ts` — public API.

New feature slice:

- `src/features/app-settings/`
  - `app-settings.container.tsx` — orchestrates load/save, validation,
    controlled form state.
  - `app-settings.presentational.tsx` — the dialog UI (provider/model/effort
    selects, Save / Cancel / Restore defaults). Pure props-in-JSX-out.
  - `session-defaults.presentational.tsx` — the three-picker cluster so it can
    be reused later if we ever embed it elsewhere.
  - `index.ts`.

Session-start change:

- `src/features/session-start/session-start.container.tsx` loads settings via
  the entity store and passes them into `resolveProviderSelection()` as the
  starting selection when the user has not yet picked anything.
- `src/entities/session/provider-selection.pure.ts` gains an optional
  `storedDefaults` argument used before the current hardcoded fallbacks.

Sidebar entry point:

- Add a settings cog button to the sidebar footer. Clicking opens the
  `AppSettingsDialog` container.

### Data flow on `Save`

1. User clicks `Save` in the settings dialog.
2. Container calls `appSettingsApi.set(input)`.
3. Preload → `appSettings:set` IPC → `appSettingsService.setAppSettings(input)`.
4. Service validates against the provider registry and persists JSON into
   `app_state`.
5. Main broadcasts `appSettings:updated` with the new settings object.
6. Renderer Zustand store updates from the broadcast (and from the direct
   response for the caller).
7. Next session-start uses the new defaults.

## Testing

At minimum:

- `app-settings.service.test.ts` (unit, under `vitest.unit.config.ts`)
  - round-trips settings through the state store
  - validates provider/model/effort ids against a fake provider registry
  - falls back gracefully when stored ids are no longer valid
  - `resolveSessionDefaults` applies the full fallback chain
- `provider-selection.pure.test.ts` extension (pure, under
  `vitest.pure.config.ts`) covering stored-defaults precedence.
- Renderer store test for `app-settings.model.ts` with a fake preload API,
  covering load + save + broadcast subscription.

Run after each task per `CLAUDE.md`:

- `npm install`
- `npm run test:pure`
- `npm run test:unit`
- `chaperone check --fix`

## Risks and open questions

- **Provider id churn.** If a provider id is renamed in code, the stored
  default silently becomes invalid. V1 falls back to the first provider
  without warning. Acceptable for now; revisit if it causes confusion.
- **Dialog vs route.** The spec defaults to a dialog. If we expect multiple
  settings sections within the next two phases, promote to a full route
  instead to avoid rework.
- **Where does `resolveSessionDefaults` live?** Backend (validates against
  live registry) vs pure renderer helper (fast, testable, but trusts
  renderer's provider list). This spec places it in the backend service and
  calls it from the `session:create` handler as a defensive backstop, while
  the renderer still resolves defaults locally for UI snappiness. If this
  duplication proves annoying, collapse to backend-only in a follow-up.
- **Legacy sessions.** Existing sessions already have a provider/model/effort
  tuple stored per row; this feature does not migrate them.

## Implementation outline (for planning-and-task-breakdown)

Proposed task slices, each independently shippable:

1. Backend storage + service (`electron/backend/app-settings/*`) with tests.
   No UI wiring yet.
2. IPC + preload bridge. Expose `appSettings:get|set|updated` and broadcast.
   Smoke-test from devtools.
3. Renderer entity slice (`src/entities/app-settings/*`) with Zustand store +
   API wrapper + tests.
4. Settings feature slice (`src/features/app-settings/*`): dialog UI wired to
   the entity store. Sidebar cog button to open it.
5. Session-start integration: extend `resolveProviderSelection()` with stored
   defaults and load them in the container.
6. Backend defensive defaults in `session:create` handler using
   `resolveSessionDefaults`.

Each slice should land green through `npm run test:pure`, `npm run test:unit`,
and `chaperone check --fix` before the next begins.
