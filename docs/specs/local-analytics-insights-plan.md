# Implementation Plan: Local Analytics Insights

Companion to `docs/specs/local-analytics-insights.md`. This plan is designed
for multi-phase work where conversation context may be compacted between
phases.

## Agent Process Rules (READ FIRST, EVERY TIME)

The implementing agent must follow this loop at the start of every phase:

1. Re-read both documents in full:
   - `docs/specs/local-analytics-insights.md`
   - `docs/specs/local-analytics-insights-plan.md`
2. Re-check the spec's `Locked Decisions` and `Out Of Scope For V1` sections
   before writing code.
3. Confirm the current phase's dependencies are complete and verified.
4. Update this plan's checkboxes as tasks complete. Do not mark a task done
   until the relevant tests pass.
5. If the implementation discovers that the spec is wrong or incomplete,
   update the spec first, then continue.
6. Keep the surface local-first. Do not add telemetry, sync, background
   profiling, or transcript upload as an implementation shortcut.
7. At the end of every phase, run the repository's required verification
   commands with the Node version from `.nvmrc`:
   - `npm install`
   - `npm run typecheck`
   - `npm run test:pure`
   - `npm run test:unit`
   - `chaperone check --fix`

## Overview

Ship a local-first Insights section inside the global Settings dialog. V1 has
two tabs: `Your Usage` and `Your Work Style`.

Implementation slices:

1. Pure analytics math.
2. Backend read-only overview service and IPC.
3. Renderer entity store and settings-dialog shell.
4. ChartGPU dependency and chart wrapper.
5. Usage UI.
6. Generated work profile storage and opt-in generation.
7. Polish, empty states, and optional sidebar/command entry.

## Dependency Graph

```text
A1 pure helpers
  ├── A2 backend overview service + IPC
  │     └── A3 renderer entity store
  │           ├── A4 ChartGPU wrapper
  │           │     └── A5 Your Usage UI
  │           └── A6 deterministic Work Style UI
  │
  └── A7 profile snapshot storage
        └── A8 opt-in generated work profile

A9 polish depends on A5 + A6 + A8
```

A4 can be started after A3 exists. A7 can run in parallel with A4/A5 because
it mostly touches backend storage and service code.

---

## Phase A1 — Pure Analytics Foundations

Goal: lock the stateless calculations before DB, IPC, React, or ChartGPU.

- [x] Create `electron/backend/analytics/analytics.types.ts` with shared
      backend overview types.
- [x] Create `electron/backend/analytics/analytics.pure.ts` with helpers for:
  - word counting
  - local-date bucketing
  - range preset resolution (`7d`, `30d`, `90d`, `all`)
  - daily activity aggregation
  - current and longest streak calculation
  - provider usage aggregation
  - project usage aggregation
  - weekday/hour heatmap aggregation
  - conversation balance aggregation
  - deterministic work-style facts
- [x] Add `analytics.pure.test.ts` covering empty input, single-day input,
      multi-day streaks, gap handling, provider/project sorting, and range
      boundaries.
- [x] Decide and document in the spec whether archived sessions count in
      totals if the default proposal changes. Default proposal retained:
      archived sessions count because archiving is organization, not deletion.

**Verification**

- [x] `npm install`
- [x] `npm run typecheck`
- [x] `npm run test:pure -- analytics`
- [x] `npm run test:unit`
- [x] `chaperone check --fix`

**Dependencies:** None.

**Files likely touched**

- `electron/backend/analytics/analytics.types.ts` (new)
- `electron/backend/analytics/analytics.pure.ts` (new)
- `electron/backend/analytics/analytics.pure.test.ts` (new)
- `docs/specs/local-analytics-insights.md` if decisions change

---

## Phase A2 — Backend Overview Service And IPC

Goal: the main process can compute local analytics from the existing SQLite
tables and expose them to the renderer.

- [x] Create `electron/backend/analytics/analytics.service.ts`.
- [x] Query existing source tables:
  - `sessions`
  - `session_conversation_items`
  - `session_turns`
  - `session_turn_file_changes`
  - `attachments`
  - `projects`
- [x] Convert DB rows into the pure-helper input shape.
- [x] Implement `getOverview(rangePreset)`.
- [x] Add unit tests with seeded SQLite data covering totals, charts, and
      empty-state output.
- [x] Register IPC channels:
  - `analytics:getOverview`
- [x] Extend `electron/preload/index.ts` with
      `window.electronAPI.analytics.getOverview(rangePreset)`.
- [x] Extend `src/shared/types/electron-api.d.ts` with the analytics preload
      contract.

**Verification**

- [x] `npm install`
- [x] `npm run typecheck`
- [x] `npm run test:pure`
- [x] `npm run test:unit -- analytics`
- [x] `chaperone check --fix`
- [ ] Manual smoke in devtools:
      `await window.electronAPI.analytics.getOverview('30d')`. Deferred to A5
      because the first meaningful manual testing checkpoint is the visible
      Settings -> Insights surface.

**Dependencies:** A1.

**Files likely touched**

- `electron/backend/analytics/analytics.service.ts` (new)
- `electron/backend/analytics/analytics.service.test.ts` (new)
- `electron/main/index.ts`
- `electron/main/ipc.ts`
- `electron/preload/index.ts`
- `src/shared/types/electron-api.d.ts`

---

## Phase A3 — Renderer Analytics Entity Store

Goal: renderer can load analytics overview data without any final UI.

- [x] Create `src/entities/analytics/analytics.types.ts`.
- [x] Create `src/entities/analytics/analytics.api.ts`.
- [x] Create `src/entities/analytics/analytics.model.ts` Zustand store:
  - `rangePreset`
  - `overview`
  - `isLoading`
  - `error`
  - `loadOverview(rangePreset)`
  - `setRangePreset(rangePreset)`
  - `clearError()`
- [x] Add `src/entities/analytics/analytics.pure.ts` if renderer-specific view
      formatting helpers are needed. Not needed in A3; no renderer-specific
      pure formatting helpers were introduced.
- [x] Add `src/entities/analytics/index.ts` public API.
- [x] Add unit tests with a fake preload API for load, range switching, error,
      and empty output.

**Verification**

- [x] `npm install`
- [x] `npm run typecheck`
- [x] `npm run test:pure`
- [x] `npm run test:unit -- analytics`
- [x] `chaperone check --fix`

**Dependencies:** A2.

**Files likely touched**

- `src/entities/analytics/analytics.types.ts` (new)
- `src/entities/analytics/analytics.api.ts` (new)
- `src/entities/analytics/analytics.model.ts` (new)
- `src/entities/analytics/analytics.model.test.ts` (new)
- `src/entities/analytics/index.ts` (new)

---

## Phase A4 — ChartGPU Dependency And Wrapper

Goal: introduce ChartGPU safely behind a Convergence wrapper with WebGPU
fallback.

- [x] Install dependencies:
  - `chartgpu-react`
  - `@chartgpu/chartgpu`
- [x] Create `src/shared/ui/chartgpu-chart.container.tsx` that:
  - checks `navigator.gpu`
  - renders a fallback when unsupported
  - wraps `ChartGPU` from `chartgpu-react`
  - accepts fixed-height class/style props
  - keeps options JSON-serializable where possible
- [x] Create `src/shared/ui/chart-fallback.presentational.tsx`.
- [x] Add tests for supported/unsupported WebGPU paths by stubbing
      `navigator.gpu`.
- [x] Add a tiny internal demo usage in test only; do not wire final Insights
      charts yet.

**Verification**

- [x] `npm install`
- [x] `npm run typecheck`
- [x] `npm run test:pure`
- [x] `npm run test:unit -- chart`
- [x] `chaperone check --fix`

**Dependencies:** A3.

**Files likely touched**

- `package.json`
- `package-lock.json`
- `src/shared/ui/chartgpu-chart.container.tsx` (new)
- `src/shared/ui/chart-fallback.presentational.tsx` (new)
- `src/shared/ui/chartgpu-chart.container.test.tsx` (new)

---

## Phase A5 — `Your Usage` UI

Goal: show useful local analytics in the Settings dialog without generated AI
content.

- [x] Add `insights` to `AppSettingsSectionId`.
- [x] Add an `Insights` nav item in the settings dialog.
- [x] Create `src/features/analytics-insights/`.
- [x] Create `analytics-insights.container.tsx` to load overview data from the
      analytics entity store when the section is active.
- [x] Create `analytics-insights.presentational.tsx` with tabs:
  - `Your Usage`
  - `Your Work Style`
- [x] Create `range-picker.presentational.tsx`.
- [x] Create `usage-tab.presentational.tsx` with:
  - metric cards
  - daily activity chart
  - provider usage chart
  - project distribution list/chart
  - time-of-day heatmap
  - streak calendar
  - conversation balance chart
- [x] Ensure empty database state is useful and not visually broken.
- [x] Ensure WebGPU fallback still leaves the metric cards and CSS grids
      visible.

**Verification**

- [x] `npm install`
- [x] `npm run typecheck`
- [x] `npm run test:pure`
- [x] `npm run test:unit -- analytics`
- [x] `chaperone check --fix`
- [ ] Manual: open Settings -> Insights, switch ranges, inspect empty and
      populated databases.

**Dependencies:** A3, A4.

**Files likely touched**

- `src/features/app-settings/app-settings.presentational.tsx`
- `src/features/app-settings/app-settings.container.tsx`
- `src/features/analytics-insights/analytics-insights.container.tsx` (new)
- `src/features/analytics-insights/analytics-insights.presentational.tsx` (new)
- `src/features/analytics-insights/usage-tab.presentational.tsx` (new)
- `src/features/analytics-insights/range-picker.presentational.tsx` (new)
- `src/features/analytics-insights/index.ts` (new)

---

## Phase A6 — Deterministic `Your Work Style`

Goal: add useful non-AI work-style explanations from local aggregates.

- [x] Extend pure deterministic profile helpers if A1 left gaps. No backend
      helper changes were needed; A1 already exposes deterministic profile
      facts in the overview payload.
- [x] Create `work-style-tab.presentational.tsx`.
- [x] Show:
  - most-used provider
  - most-active project
  - peak weekday/hour
  - common session size bucket
  - common interaction shape
  - short deterministic summary text
- [x] Avoid pretending this is AI-generated. Label it as based on local usage
      patterns.
- [x] Add tests for profile empty state and populated rendering.

**Verification**

- [x] `npm install`
- [x] `npm run typecheck`
- [x] `npm run test:pure`
- [x] `npm run test:unit -- analytics`
- [x] `chaperone check --fix`

**Dependencies:** A5.

**Files likely touched**

- `electron/backend/analytics/analytics.pure.ts`
- `electron/backend/analytics/analytics.pure.test.ts`
- `src/features/analytics-insights/work-style-tab.presentational.tsx` (new)
- `src/features/analytics-insights/*.test.tsx`

---

## Phase A7 — Profile Snapshot Storage

Goal: store, retrieve, and delete generated work profile snapshots before any
provider call is wired.

- [x] Add `analytics_profile_snapshots` table to
      `electron/backend/database/database.ts`.
- [x] Extend `electron/backend/database/database.types.ts`.
- [x] Add database tests for table shape and delete behavior.
- [x] Extend `AnalyticsService` or create `analytics-profile.service.ts` with:
  - `getLatestProfileSnapshot(rangePreset)`
  - `createProfileSnapshot(payload)`
  - `deleteProfileSnapshot(id)`
- [x] Add IPC/preload for:
  - `analytics:deleteWorkProfileSnapshot`
- [x] Keep creation internal/test-only until A8 wires generation.

**Verification**

- [x] `npm install`
- [x] `npm run typecheck`
- [x] `npm run test:pure`
- [x] `npm run test:unit -- analytics`
- [x] `chaperone check --fix`

**Dependencies:** A1.

**Files likely touched**

- `electron/backend/database/database.ts`
- `electron/backend/database/database.types.ts`
- `electron/backend/database/database.test.ts`
- `electron/backend/analytics/analytics-profile.service.ts` (new)
- `electron/backend/analytics/analytics-profile.service.test.ts` (new)
- `electron/main/ipc.ts`
- `electron/preload/index.ts`
- `src/shared/types/electron-api.d.ts`

---

## Phase A8 — Opt-In Generated Work Profile

Goal: generate Wispr-like profile text only after explicit user confirmation.

- [ ] Add `generateWorkProfile(input)` backend path.
- [ ] Build the generation prompt from aggregate overview data and
      deterministic profile facts only.
- [ ] Do not include full transcripts or raw conversation excerpts.
- [ ] Validate provider/model input.
- [ ] Store the generated profile snapshot from the model response.
- [ ] Return the new snapshot and include it in future overview responses.
- [ ] Add `generate-profile-dialog.presentational.tsx` with privacy copy and
      provider/model selection.
- [ ] Wire `Generate work profile`, `Regenerate`, and `Delete profile`
      controls in `Your Work Style`.
- [ ] Tests prove the API is not called until the user confirms.

**Verification**

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit -- analytics`
- [ ] `chaperone check --fix`
- [ ] Manual: generate with a configured provider, close/reopen settings,
      verify snapshot persists, delete it, verify removal.

**Dependencies:** A6, A7.

**Files likely touched**

- `electron/backend/analytics/analytics-profile.service.ts`
- `electron/backend/analytics/analytics-profile.service.test.ts`
- `electron/main/ipc.ts`
- `electron/preload/index.ts`
- `src/entities/analytics/*`
- `src/features/analytics-insights/generate-profile-dialog.presentational.tsx`
- `src/features/analytics-insights/work-style-tab.presentational.tsx`

---

## Phase A9 — Polish, Accessibility, And Entry-Point Decision

Goal: make the feature feel native and decide whether it remains settings-only
or earns a faster entry point.

- [ ] Audit layout at narrow and wide settings-dialog widths.
- [ ] Confirm no text overflows inside metric cards, buttons, chart panels, or
      tabs.
- [ ] Confirm keyboard navigation across range picker, tabs, and profile
      generation dialog.
- [ ] Confirm color palette is not one-note and works in light/dark themes.
- [ ] Add loading skeletons or compact loading states.
- [ ] Add command-center action `Open Insights` if command-center patterns
      make that cheap.
- [ ] Decide whether a sidebar shortcut is warranted. If yes, add it as a
      small icon/button that opens Settings directly to `Insights`.
- [ ] Update this plan with final verification notes and any follow-up ideas.

**Verification**

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`
- [ ] Manual: open app, use Insights with populated local data, unsupported
      WebGPU fallback, and empty database.

**Dependencies:** A5, A6, A8.

**Files likely touched**

- `src/features/analytics-insights/*`
- `src/features/app-settings/*`
- `src/features/command-center/*` if adding action
- `src/widgets/sidebar/*` if adding shortcut

---

## Phase Boundary Template

Append a short note below after each completed phase:

```md
### A{n} verification (YYYY-MM-DD)

- Summary:
- Tests:
  - `npm install`: pass/fail
  - `npm run typecheck`: pass/fail
  - `npm run test:pure`: pass/fail
  - `npm run test:unit`: pass/fail
  - `chaperone check --fix`: pass/fail
- Decisions changed:
- Next phase:
```

### A1 verification (2026-04-30)

- Summary: Added pure analytics contracts and helpers for local date ranges,
  word counts, totals, daily activity, streaks, provider/project usage,
  weekday/hour heatmap buckets, conversation balance, and deterministic
  work-style classification. Retained the spec default that archived sessions
  count in usage totals.
- Tests:
  - `npm install`: pass
  - `npm run typecheck`: pass
  - `npm run test:pure`: pass
  - `npm run test:unit`: pass
  - `chaperone check --fix`: pass
- Decisions changed: none.
- Next phase: A2 backend overview service and IPC.

### A2 verification (2026-04-30)

- Summary: Added `AnalyticsService` to query existing local SQLite tables,
  convert rows into the pure analytics input shape, and expose
  `analytics:getOverview` through IPC, preload, and `ElectronAPI` types.
- Tests:
  - `npm install`: pass
  - `npm run typecheck`: pass
  - `npm run test:pure`: pass
  - `npm run test:unit`: pass
  - `chaperone check --fix`: pass
- Decisions changed: manual devtools smoke deferred until A5, when there is a
  visible Settings -> Insights surface to test end to end.
- Next phase: A3 renderer analytics entity store.

### A3 verification (2026-04-30)

- Summary: Added the renderer analytics entity slice with shared renderer
  types, a preload API wrapper, a Zustand store for range selection and
  overview loading, public exports, and mocked preload-store tests.
- Tests:
  - `npm install`: pass
  - `npm run typecheck`: pass
  - `npm run test:pure`: pass
  - `npm run test:unit`: pass
  - `chaperone check --fix`: pass
- Decisions changed: none.
- Next phase: A4 ChartGPU dependency and wrapper.

### A4 verification (2026-04-30)

- Summary: Installed `chartgpu-react` and `@chartgpu/chartgpu`, added a shared
  `ChartGpuChart` wrapper with `navigator.gpu` detection, added a compact
  fallback presentational, and covered supported/unsupported WebGPU paths with
  a mocked ChartGPU component.
- Tests:
  - `npm install`: pass
  - `npm run typecheck`: pass
  - `npm run test:pure`: pass
  - `npm run test:unit`: pass
  - `chaperone check --fix`: pass
- Decisions changed: none. `npm install chartgpu-react @chartgpu/chartgpu`
  required network access after the sandboxed registry request failed with
  `ENOTFOUND`.
- Next phase: A5 `Your Usage` UI. This is the first useful manual testing
  checkpoint because Settings will expose a visible Insights section.

### A5 verification (2026-04-30)

- Summary: Added the Settings -> Insights section, renderer
  `analytics-insights` feature slice, range picker, `Your Usage` tab, metric
  cards, ChartGPU-backed daily/provider/balance charts, project distribution,
  time-of-day heatmap, streak calendar, empty states, and WebGPU fallback
  coverage. `Your Work Style` is present as a tab placeholder for A6.
- Tests:
  - `npm install`: pass
  - `npm run typecheck`: pass
  - `npm run test:pure`: pass
  - `npm run test:unit`: pass; existing jsdom canvas `getContext()` warnings
    still print from the chart environment.
  - `chaperone check --fix`: pass
- Decisions changed: none.
- Manual checkpoint: ready now. Open Settings -> Insights, switch ranges, and
  inspect empty and populated local databases.
- Next phase: A6 deterministic `Your Work Style`.

### A6 verification (2026-04-30)

- Summary: Replaced the `Your Work Style` placeholder with a deterministic
  local profile tab showing peak weekday/hour, most-used provider,
  most-active project, common session size, interaction shape, and the backend
  summary. The tab explicitly states that no model call is made and no
  transcripts are sent.
- Tests:
  - `npm install`: pass
  - `npm run typecheck`: pass
  - `npm run test:pure`: pass
  - `npm run test:unit`: pass; existing jsdom canvas `getContext()` warnings
    still print from the chart environment.
  - `chaperone check --fix`: pass
- Decisions changed: none.
- Next phase: A7 profile snapshot storage.

### A7 verification (2026-04-30)

- Summary: Added the local `analytics_profile_snapshots` table, database row
  type, profile snapshot service for latest/create/delete, overview inclusion
  of the latest snapshot for the selected range, and the
  `analytics:deleteWorkProfileSnapshot` IPC/preload/API path. Snapshot
  creation remains service-only for tests until A8 wires opt-in generation.
- Tests:
  - `npm install`: pass
  - `npm run typecheck`: pass
  - `npm run test:pure`: pass
  - `npm run test:unit`: pass; existing jsdom canvas `getContext()` warnings
    still print from the chart environment.
  - `chaperone check --fix`: pass
- Decisions changed: none.
- Next phase: A8 opt-in generated work profile.
