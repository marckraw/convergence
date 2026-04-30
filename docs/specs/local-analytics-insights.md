# Local Analytics Insights

> Parent: `docs/specs/project-spec.md`
> Companion plan: `docs/specs/local-analytics-insights-plan.md`

## Objective

Add a local-first Insights surface that helps a Convergence user understand how
they work with AI agents: how often they talk to agents, which providers and
projects they use, when they are active, how much text moves through the app,
and what broad work patterns emerge over time.

The product inspiration is Wispr Flow's Insights panel: compact metric cards,
streaks, calendar-style activity, and a generated profile that explains the
user's usage style in plain language. Convergence should adapt that idea for AI
coding workflows, not copy it literally.

## Product Principles

1. **Local by default.** Raw analytics are derived from Convergence's local
   SQLite data. No background upload, no remote telemetry, no cloud sync.
2. **Useful, not creepy.** The feature describes collaboration patterns. It
   must not feel like productivity surveillance or judgement.
3. **Opt-in AI summaries.** Generated "work profile" text is created only
   after a user action. If a provider call is needed, the UI must clearly say
   that selected local summary data will be sent to the chosen model.
4. **Derived before tracked.** Prefer computing metrics from existing source
   tables (`sessions`, `session_conversation_items`, `session_turns`,
   `session_turn_file_changes`) before adding new event tables.
5. **Global first, project-aware later.** V1 is a global personal insights
   surface. Project breakdowns are shown inside that surface, but there is no
   per-project insights route yet.

## Current Library Choice

Use ChartGPU for chart-heavy visualizations.

- Core library: `@chartgpu/chartgpu`
- React wrapper: `chartgpu-react`
- Repository: `https://github.com/ChartGPU/ChartGPU`
- React repository: `https://github.com/ChartGPU/chartgpu-react`

ChartGPU is WebGPU-based and supports line, area, bar, scatter, pie,
candlestick, tooltips, crosshair, zoom, annotations, streaming updates, and
multi-chart dashboards through a shared GPU context.

### ChartGPU Constraints

- WebGPU is required. The renderer must detect support with
  `navigator.gpu` before rendering ChartGPU charts.
- If WebGPU is unavailable, the Insights surface must still be usable:
  metric cards, lists, and CSS-only grids should render; chart slots show a
  compact unsupported-state message.
- Do not use ChartGPU for every visual. The streak calendar and summary cards
  are better implemented with semantic HTML/CSS.
- Keep ChartGPU integration behind a small shared wrapper so future fallback
  or library replacement does not leak across the feature.

## Product Surface

### Entry Point

V1 lives inside the global Settings dialog as a new `Insights` section.

Reasons:

- The app already has a settings dialog with section navigation.
- Insights are global/personal, not tied to one active session.
- This avoids adding another primary sidebar destination before the feature
  proves daily value.

Future promotion path:

- Add a sidebar shortcut or command-center action once users need regular
  access.
- Keep the entity/backend API independent of the settings UI so the surface can
  move later.

### Top-Level Layout

The section has two tabs:

1. `Your Usage`
2. `Your Work Style`

The naming intentionally mirrors Wispr Flow's `Your Usage` / `Your Voice`
pattern while staying specific to Convergence.

### `Your Usage`

Show concrete local metrics for the selected time range.

Default range: last 30 days.

Supported ranges:

- 7 days
- 30 days
- 90 days
- All time

Metric cards:

- User messages sent
- Assistant messages received
- User words written
- Assistant words generated
- Sessions created
- Turns completed
- Files changed
- Lines added/deleted
- Approval requests
- Input requests
- Attachments sent
- Current streak
- Longest streak

Charts and grids:

- Daily activity trend: messages, turns, or words by day.
- Provider usage: Codex / Claude Code / Pi / shell-provider, by sessions and
  turns.
- Project distribution: top projects by sessions and turns.
- Time-of-day heatmap: activity by weekday and hour.
- Streak calendar: days with activity and current streak marker.
- Conversation balance: user words vs assistant words over time.

### `Your Work Style`

Show generated and deterministic summaries of how the user collaborates with
agents.

Deterministic local summary:

- Peak day/time
- Most-used provider
- Most-active project
- Common session size bucket (`quick check`, `normal task`, `long-running`)
- Common interaction shape:
  - mostly ask/review
  - mostly implementation
  - mostly debugging
  - mixed exploration and implementation

Generated work profile:

- Manual action: `Generate work profile`
- Stores a timestamped snapshot.
- Shows the source range, e.g. `Based on the last 30 days`.
- May be regenerated.
- May be deleted.

The generated profile should read like:

> You tend to use Convergence for codebase exploration and implementation
> planning before moving into focused edits. Your sessions often include
> follow-up questions, review loops, and requests to verify behavior with
> tests.

Do not overclaim. Generated text must use cautious wording like `tend to`,
`often`, `recently`, and `based on local session history`.

## Privacy Behavior

### Local Rollups

All metrics in `Your Usage` are local-only and derived from SQLite.

### Generated Profile

The generated profile is opt-in because it may use a model provider.

Before generating, the UI must state:

- Convergence will prepare a local summary of recent usage.
- The summary may include aggregate counts, project names, session names, and
  short sanitized examples from user prompts or assistant responses if that
  phase has been explicitly implemented.
- The summary will be sent to the selected provider only when the user
  confirms.

V1 generated summaries should use aggregate data and session metadata only.
Transcript excerpts are out of scope until the UI adds an explicit "include
conversation excerpts" option.

### Deletion

Deleting a generated profile snapshot removes only the generated insight row.
It does not delete source session history.

## Data Sources

Existing source tables:

- `sessions`
- `session_conversation_items`
- `session_queued_inputs`
- `session_turns`
- `session_turn_file_changes`
- `attachments`
- `projects`
- `workspaces`

Derived activity rules:

- A day is active when at least one user message, assistant message, turn, or
  session creation occurs on that local date.
- Current streak counts consecutive active local dates ending today, or ending
  yesterday if today has no activity yet.
- Longest streak is the longest consecutive active-date run in the selected
  data set.
- Word counts are approximate: split text on whitespace after trimming. This is
  sufficient for personal insights and avoids token-provider coupling.
- Token usage and cost are out of scope until providers expose reliable local
  token accounting.

## Data Contracts

Renderer-facing types should live in `src/entities/analytics/`.

Backend-facing types should live in `electron/backend/analytics/`.

Suggested public contract:

```ts
export type AnalyticsRangePreset = '7d' | '30d' | '90d' | 'all'

export interface AnalyticsRange {
  preset: AnalyticsRangePreset
  startDate: string | null
  endDate: string
}

export interface AnalyticsOverview {
  range: AnalyticsRange
  totals: AnalyticsTotals
  streaks: AnalyticsStreaks
  dailyActivity: DailyActivityPoint[]
  providerUsage: ProviderUsagePoint[]
  projectUsage: ProjectUsagePoint[]
  weekdayHourActivity: WeekdayHourActivityPoint[]
  conversationBalance: ConversationBalancePoint[]
  deterministicProfile: DeterministicWorkProfile
  generatedProfile: GeneratedWorkProfileSnapshot | null
}
```

Keep API payloads plain JSON. No Date objects cross IPC.

## Backend Architecture

New backend slice:

- `electron/backend/analytics/analytics.types.ts`
- `electron/backend/analytics/analytics.pure.ts`
- `electron/backend/analytics/analytics.service.ts`
- `electron/backend/analytics/analytics-profile.service.ts`

Responsibilities:

- Query source tables.
- Convert rows into local-date buckets.
- Compute totals, streaks, and chart data.
- Build deterministic profile facts.
- Persist generated profile snapshots.
- Run opt-in profile generation through provider infrastructure in a later
  phase.

### Storage

Do not add rollup tables in V1 unless query performance requires it.

Add one table for generated profile snapshots:

```sql
CREATE TABLE IF NOT EXISTS analytics_profile_snapshots (
  id TEXT PRIMARY KEY,
  range_preset TEXT NOT NULL,
  range_start_date TEXT,
  range_end_date TEXT NOT NULL,
  provider_id TEXT,
  model TEXT,
  profile_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`profile_json` stores a versioned object:

```ts
interface GeneratedWorkProfileSnapshotPayload {
  version: 1
  title: string
  summary: string
  themes: Array<{ label: string; description: string }>
  caveats: string[]
}
```

### IPC

Expose a new `analytics` preload namespace:

- `analytics.getOverview(rangePreset)`
- `analytics.generateWorkProfile(input)`
- `analytics.deleteWorkProfileSnapshot(id)`

Generation input:

```ts
interface GenerateWorkProfileInput {
  rangePreset: AnalyticsRangePreset
  providerId: string
  model: string | null
}
```

The backend must validate provider/model the same way other provider-using
services do.

## Renderer Architecture

Follow FSD-lite.

Entity slice:

- `src/entities/analytics/analytics.types.ts`
- `src/entities/analytics/analytics.api.ts`
- `src/entities/analytics/analytics.model.ts`
- `src/entities/analytics/analytics.pure.ts`
- `src/entities/analytics/index.ts`

Feature slice:

- `src/features/analytics-insights/analytics-insights.container.tsx`
- `src/features/analytics-insights/analytics-insights.presentational.tsx`
- `src/features/analytics-insights/usage-tab.presentational.tsx`
- `src/features/analytics-insights/work-style-tab.presentational.tsx`
- `src/features/analytics-insights/range-picker.presentational.tsx`
- `src/features/analytics-insights/generate-profile-dialog.presentational.tsx`

Shared chart wrapper:

- `src/shared/ui/chartgpu-chart.container.tsx`
- `src/shared/ui/chart-fallback.presentational.tsx`

The ChartGPU wrapper owns:

- `navigator.gpu` support check
- lazy/dynamic import if useful for bundle hygiene
- fixed height requirements
- unsupported fallback rendering
- shared theme mapping from Convergence tokens to ChartGPU options

## UI Direction

Insights should feel compact and operational, not like a marketing dashboard.

Design rules:

- Use the existing settings dialog shell.
- Avoid giant hero cards.
- Use dense metric cards with short labels.
- Keep chart panels un-nested; no cards inside cards.
- Streak calendar uses stable square cells so layout cannot shift.
- Charts have fixed responsive heights.
- Use restrained color with more than one hue; do not make the whole surface
  one teal/purple/blue palette.
- Use lucide icons only where they clarify a control.

## Testing Requirements

Pure tests:

- Date bucket generation.
- Streak calculation.
- Word counting.
- Provider/project aggregation.
- Weekday/hour heatmap bucket calculation.
- Deterministic profile classification.

Backend unit tests:

- `analytics.service` computes an overview from seeded SQLite data.
- Deleted/archived sessions are handled according to the final implementation
  decision.
- Generated profile snapshots can be created, read as latest, and deleted.
- IPC validates range presets and provider/model input.

Renderer unit tests:

- Store load and range switching.
- Presentational rendering for empty state, unsupported WebGPU fallback, and
  populated metrics.
- Generate-profile confirmation flow does not call API until confirmed.

Manual checks:

- Settings dialog opens to Insights section.
- Range picker reloads stats.
- Empty database shows useful empty state.
- WebGPU unsupported path renders without throwing.
- Generated profile action clearly discloses provider call.

## Locked Decisions

- V1 entry point is the global Settings dialog.
- Raw usage metrics are local-only.
- AI-generated profile is manual opt-in.
- Do not send full transcripts in V1 profile generation.
- Use ChartGPU through `chartgpu-react`, behind a wrapper.
- Provide WebGPU fallback UI.
- Compute from existing source tables before adding rollup tables.
- Keep token/cost analytics out of scope until reliable provider-local data
  exists.

## Out Of Scope For V1

- Cloud sync.
- Team analytics.
- Cost analytics.
- Token accounting.
- Full transcript mining.
- Per-project Insights route.
- Ranking productivity or agent quality.
- Export/share cards.
- Notifications based on insights.
- Background AI profiling.
- Any remote telemetry from Convergence itself.

## Open Questions

1. Should archived sessions count in global usage totals? Default proposal:
   yes, because archiving is a UI organization action, not deletion.
2. Should shell/terminal-primary sessions count? Default proposal: yes for
   session and activity counts, no for assistant/user word balance unless
   conversation items exist.
3. Should generated profiles use the same model defaults as session naming or
   expose a separate "Insights model" setting? Default proposal: use a
   one-shot picker in the generate dialog first; add a setting only after
   repeated use.
4. Should the profile snapshot be per range or global latest? Default
   proposal: store snapshots with range metadata and show the latest snapshot
   matching the selected range.
