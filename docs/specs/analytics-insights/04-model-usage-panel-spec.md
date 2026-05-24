# Model Usage Panel in Settings > Insights — Spec

**Status**: draft
**Created**: 2026-05-23
**Target**: Per-model usage tracking alongside existing per-provider usage bars

## 1. Problem Statement

The Analytics > Insights > Usage tab currently shows usage breakdown by provider only. A user switching between multiple models (e.g., `codex/gpt-5.4` and `codex/claude-sonnet-4-20250514` from the same provider) cannot see which model is being invoked most. We need a model-level usage breakdown that answers:

- Which model IDs have been invoked and how many times?
- How many turns/sessions per model?
- When a model spans providers, does the count reflect global usage or per-provider?

## 2. Design Decisions

### 2.1 Global model tracking (not per-provider)

We track model usage globally by `modelId` across all providers. The rationale:

- A session's `model` column already stores the full model identifier (e.g., `gpt-5.4`).
- Users care about "how many times was this model used?" not "how many times on Codex vs Pi?"
- Provider breakdown is still shown separately.
- For local models (not tied to any provider), we use `providerId: null` and `providerName: 'Local Model'`.

### 2.2 UI Placement

The model usage breakdown appears as a new chart panel **below** the existing Provider usage panel in the Usage tab. This keeps the relationship clear: provider at the top (category level), model beneath it (granular level).

### 2.3 Metrics Tracked

For each distinct `modelId`, we track:

- `modelId` — the concrete model identifier (e.g., `gpt-5.4`)
- `modelLabel` — a human-readable label, derived from the model picker metadata when available (otherwise falls back to the raw modelId)
- `sessionsCreated` — count of sessions using this model
- `turnsCompleted` — total completed turns across those sessions
- `userMessages` — user messages sent via this model
- `assistantMessages` — assistant messages received from this model
- `providerId` — the session's provider, or `null` if the session has no provider
- `providerName` — the session's provider name, or `"Local Model"` if no provider

### 2.4 No New Database Schema Required

The `sessions` table already has a `model` column. We only need to include it in existing SQL queries. No migration needed.

## 3. Architecture & File Map

### 3.1 Entity Types (`src/entities/analytics/`)

| File                      | Change                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `analytics.types.ts`      | Add `ModelUsagePoint` interface; add `modelUsage: ModelUsagePoint[]` to `AnalyticsOverview` |
| `analytics.model.test.ts` | Update mock `overview` to include `modelUsage: []`                                          |
| `analytics.api.ts`        | No changes (IPC already passes full `AnalyticsOverview`)                                    |

### 3.2 Backend Analytics (`electron/backend/analytics/`)

| File                   | Change                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analytics.types.ts`   | Add `ModelUsagePoint` interface; add `model` field to `AnalyticsSessionInput`; update `BuildAnalyticsOverviewInput` docstring if needed                                                                                                                                                                                           |
| `analytics.service.ts` | Include `sessions.model` in SQL query for `listSessions()`; update `AnalyticsSessionRow` type                                                                                                                                                                                                                                     |
| `analytics.pure.ts`    | Add `ModelUsagePoint` import; add `ModelUsagePoint` import to `BuildAnalyticsOverviewInput` doc; add `buildModelUsage()` function; update `buildDatedActivities()` to carry `model` on `DatedActivity` (or read from session directly during aggregation); wire into `buildAnalyticsOverview()` to include `modelUsage` in return |

### 3.3 Frontend UI (`src/features/analytics-insights/`)

| File                              | Change                                                                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `usage-tab.presentational.tsx`    | Import `modelUsage` from overview; add `renderModelUsageBars()` helper (mirrors `renderProviderUsageBars`); add a new `renderChartPanel` section below Provider usage |
| `analytics-insights.pure.test.ts` | Add `modelUsage: []` to test `overview` fixture                                                                                                                       |
| `analytics-insights.pure.test.ts` | Add tests for `renderModelUsageBars` if any pure formatting logic is added                                                                                            |

### 3.4 Tests

| File                             | Change                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `analytics.pure.test.ts`         | Update `BuildAnalyticsOverviewInput` fixture to include `model` in sessions; add assertions for `modelUsage` output |
| `analytics.profile.pure.test.ts` | No changes                                                                                                          |

## 4. Detailed Design

### 4.1 `ModelUsagePoint` Type

```ts
export interface ModelUsagePoint {
  modelId: string
  modelLabel: string
  sessionsCreated: number
  turnsCompleted: number
  userMessages: number
  assistantMessages: number
  providerId: string | null
  providerName: string
}
```

### 4.2 Backend — `analytics.types.ts` additions

```ts
export interface ModelUsagePoint {
  modelId: string
  modelLabel: string
  sessionsCreated: number
  turnsCompleted: number
  userMessages: number
  assistantMessages: number
  providerId: string | null
  providerName: string
}
```

Also add `model: string` to `AnalyticsSessionInput`:

```ts
export interface AnalyticsSessionInput {
  id: string
  projectId: string
  projectName: string
  providerId: string
  providerName: string
  model: string // ← new field
  status: string
  primarySurface: string
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}
```

### 4.3 Backend — `analytics.service.ts` changes

In `listSessions()`, add `model` to the SQL query and to the mapping:

```sql
-- Add to SELECT:
sessions.model,
```

Update `AnalyticsSessionRow` interface:

```ts
interface AnalyticsSessionRow {
  id: string
  project_id: string
  project_name: string | null
  provider_id: string
  model: string | null // ← new
  status: string
  primary_surface: string
  archived_at: string | null
  created_at: string
  updated_at: string
}
```

Update `analyticsSessionFromRow` to include `model`.

### 4.4 Backend — `analytics.pure.ts` additions

Add `buildModelUsage()` function — structurally identical to `buildProviderUsage()`:

```ts
function buildModelUsage(
  input: BuildAnalyticsOverviewInput,
  range: AnalyticsRange,
): ModelUsagePoint[] {
  const points = new Map<string, ModelUsagePoint>()

  for (const session of input.sessions) {
    if (!isInRange(toLocalDate(session.createdAt), range)) continue
    const key = makeUsagePointKey(session.model ?? '__none__')

    const existing = points.get(key) ?? {
      modelId: session.model ?? '__none__',
      modelLabel: session.model ?? '__none__',
      sessionsCreated: 0,
      turnsCompleted: 0,
      userMessages: 0,
      assistantMessages: 0,
      providerId: session.providerId || null,
      providerName: session.providerName,
    }

    existing.sessionsCreated += 1
    points.set(key, existing)
  }

  // Now fold in turns & conversation items per-session
  const sessionsByModel = new Map<string, AnalyticsSessionInput[]>()
  // ... similar pattern to buildProviderUsage

  return [...points.values()].sort(
    (left, right) =>
      right.sessionsCreated - left.sessionsCreated ||
      right.turnsCompleted - left.turnsCompleted ||
      left.modelLabel.localeCompare(right.modelLabel),
  )
}
```

Actually, the aggregation should also include per-model turns & messages. The cleanest approach: iterate through DatedActivity items and use the session's model. Since `DatedActivity` already carries `providerId`/`providerName`, we extend it to also carry `model`/`modelLabel`:

```ts
// In buildDatedActivities(), carry model from session on each activity:
model: sessionActivity.model,
modelLabel: sessionActivity.modelLabel,
```

Then `buildModelUsage()` iterates the enriched activities:

```ts
function buildModelUsage(
  activities: DatedActivityExtended[],
  range: AnalyticsRange,
): ModelUsagePoint[] {
  const points = new Map<string, ModelUsagePoint>()

  for (const activity of activities) {
    if (!isInRange(activity.date, range)) continue
    const key = makeUsagePointKey(activity.model)
    const point = points.get(key) ?? {
      modelId: activity.model ?? '__none__',
      modelLabel: activity.model ?? '__none__',
      sessionsCreated: 0,
      turnsCompleted: 0,
      userMessages: 0,
      assistantMessages: 0,
      providerId: activity.providerId || null,
      providerName: activity.providerName,
    }

    if (activity.kind === 'session') point.sessionsCreated += 1
    if (activity.kind === 'turn') point.turnsCompleted += 1
    if (activity.kind === 'message' && activity.actor === 'user')
      point.userMessages += 1
    if (activity.kind === 'message' && activity.actor === 'assistant')
      point.assistantMessages += 1

    points.set(key, point)
  }

  return [...points.values()].sort(
    (left, right) =>
      right.sessionsCreated - left.sessionsCreated ||
      right.turnsCompleted - left.turnsCompleted ||
      left.modelLabel.localeCompare(right.modelLabel),
  )
}
```

Actually, I'm overcomplicating the `DatedActivity` extension. The simpler approach: fold model data directly from sessions (like `buildProviderUsage` does from activities) but use `session.model` as the grouping key. Since sessions already carry provider info, we get both.

```ts
function buildModelUsage(
  sessions: AnalyticsSessionInput[],
  range: AnalyticsRange,
): ModelUsagePoint[]
```

This is the cleanest — it avoids touching `DatedActivity` at all. Let me finalize this in the spec.

### 4.5 Frontend — `usage-tab.presentational.tsx` additions

New `renderModelUsageBars` function — pattern mirrors `renderProviderUsageBars` exactly, just with model columns:

```tsx
function renderModelUsageBars(overview: AnalyticsOverview) {
  const points = overview.modelUsage.slice(0, 8)
  const max = Math.max(
    ...points.map((point) =>
      Math.max(point.sessionsCreated, point.turnsCompleted),
    ),
    1,
  )

  return (
    <div className="space-y-3">
      {points.map((point) => (
        <div
          key={point.modelId}
          className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3"
        >
          <span className="truncate text-sm font-medium">
            {point.modelLabel}
          </span>
          <div className="space-y-1.5">
            {renderModelUsageRow({
              label: 'Sessions',
              value: point.sessionsCreated,
              max,
              barClassName: 'bg-blue-500',
            })}
            {renderModelUsageRow({
              label: 'Turns',
              value: point.turnsCompleted,
              max,
              barClassName: 'bg-teal-500',
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
```

New chart panel in the `<section className="grid gap-4">` that holds Provider usage:

```tsx
{
  renderChartPanel({
    title: 'Model usage',
    description: 'Sessions and completed turns by model.',
    legend: [
      { label: 'Sessions', colorClassName: 'bg-blue-600' },
      { label: 'Turns', colorClassName: 'bg-teal-500' },
    ],
    empty: overview.modelUsage.length === 0,
    children: renderModelUsageBars(overview),
  })
}
```

### 4.6 Sorting / Display

Models are sorted by `sessionsCreated` descending (break ties by `turnsCompleted`, then alphabetical by `modelLabel`). This mirrors the existing provider sorting.

### 4.7 Empty / Fallback Handling

- If a session's `model` is `null` or empty, we use `__none__` as the modelId and display `"No model"` as `modelLabel`.
- If no sessions exist in the range, the panel shows the same empty state as Provider usage ("No chart data").

## 5. Implementation Phases

### Phase A: Backend types + DB query

1. Add `ModelUsagePoint` type to `electron/backend/analytics/analytics.types.ts`
2. Add `model: string` to `AnalyticsSessionInput` in same file
3. Update `AnalyticsSessionRow` in `analytics.service.ts` to include `model` field
4. Wire `model` into `listSessions()` SQL query
5. Wire `model` through `analyticsSessionFromRow()` mapping

### Phase B: Backend aggregation

6. Add `model` column to `analytics.service.ts` row mapping
7. Add `buildModelUsage()` to `analytics.pure.ts` — groups by `model` from sessions
8. Add `modelUsage` to `buildAnalyticsOverview()` return
9. Add `modelUsage` to `BuildAnalyticsOverviewInput` (already implicit — it receives all sessions)

### Phase C: Entity types + API

10. Add `ModelUsagePoint` to `src/entities/analytics/analytics.types.ts`
11. Add `modelUsage: ModelUsagePoint[]` to `AnalyticsOverview`
12. Update test fixture in `analytics.model.test.ts` — add `modelUsage: []`

### Phase D: UI component

13. Add `renderModelUsageBars()` to `usage-tab.presentational.tsx`
14. Add model usage `<ChartPanel>` below provider usage
15. Update test fixture in `analytics-insights.pure.test.ts` — add `modelUsage: []`

### Phase E: Tests + polish

16. Update `electron/backend/analytics/analytics.pure.test.ts` fixture to include `model` in sessions, add assertions for `modelUsage`
17. Run `chaperone check --fix`, `npm run test:unit`, `npm run test:pure`

## 6. Acceptance Criteria

### 6.1 Backend

- [ ] `ModelUsagePoint` type exists in both `electron/backend/analytics/analytics.types.ts` and `src/entities/analytics/analytics.types.ts`
- [ ] `AnalyticsSessionInput` includes `model: string`
- [ ] `AnalyticsOverview` includes `modelUsage: ModelUsagePoint[]`
- [ ] `listSessions()` SQL query reads `sessions.model`
- [ ] `buildModelUsage()` correctly groups by `model` across all sessions
- [ ] `modelUsage` is included in `buildAnalyticsOverview()` return object
- [ ] `null` / missing model values are handled without crash

### 6.2 Frontend

- [ ] `"Model usage"` chart panel renders below Provider usage panel in the Usage tab
- [ ] Panel shows model name, sessions bar, turns bar (reuses `renderProviderUsageRow` or identical implementation)
- [ ] Panel has same empty state as Provider panel ("No chart data")
- [ ] Models are sorted by sessions (desc)
- [ ] `npm run typecheck` passes
- [ ] `npm run test:unit` passes
- [ ] `npm run test:pure` passes

### 6.3 Data Integrity

- [ ] Model counts match session table model column distribution
- [ ] No double-counting when same model appears under multiple providers
- [ ] Provider usage and model usage data are independent (no shared mutable state)

## 7. Open Questions

1. **Should we show provider badge alongside model name?** e.g., `"gpt-5.4 · Codex"` — helpful when the same model ID (or similar) could appear under multiple providers. Decision: not in v1; model label alone is sufficient.
2. **Should we deduplicate model labels that are ambiguous?** e.g., if two providers both have `"gpt-5"`, the global count still works because we group by raw `modelId`.
3. **Should we show model usage in the Work Style tab?** No — the Work Style tab focuses on deterministic profiling. Model usage belongs in Usage tab.
4. **Should `modelLabel` be resolved from the model picker metadata?** Only as a nice-to-have enhancement. For now, `modelLabel === modelId` (i.e., the raw model identifier). This avoids coupling the pure analytics function to the model picker store.

## 8. Risk Assessment

| Risk                                                | Mitigation                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| SQL query change breaks existing analytics          | `model` column already exists; adding to SELECT is additive only. Existing queries unaffected.                              |
| Duplicate model IDs across providers get aggregated | This is intentional — we want global model-level counts. If we ever need per-provider-per-model, we'll add a second column. |
| Frontend type mismatch if `modelUsage` is missing   | TypeScript will flag the missing field at compile time.                                                                     |
| Chart panel ordering confusing to users             | Provider → Model is a natural top-down drill-down. Text description clarifies the relationship.                             |
