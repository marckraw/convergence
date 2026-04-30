import type { AnalyticsOverview, AnalyticsRangePreset } from './analytics.types'

export const analyticsApi = {
  getOverview: (
    rangePreset: AnalyticsRangePreset,
  ): Promise<AnalyticsOverview> =>
    window.electronAPI.analytics.getOverview(rangePreset),
}
