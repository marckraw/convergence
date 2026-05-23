---
'convergence': patch
---

feat: add global model usage tracking to analytics insights

Track AI model usage globally across all providers in the
analytics > insights > usage panel. Adds a new model usage
breakdown chart that aggregates sessions, turns, and message
counts by model, plus a model label per provider in the
existing provider usage bars.

Key additions:

- `ModelUsagePoint` type and `modelUsage` array in
  `AnalyticsOverview` type and entity/API types
- `buildModelUsage()` aggregation function in `analytics.pure.ts`
- Model column included in `listSessions()` SQL query
- Model usage panel rendered in `usage-tab.presentational.tsx`
- All test fixtures updated with `modelUsage: []` placeholders
  and assertions
