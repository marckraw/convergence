import type {
  AnalyticsOverview,
  AnalyticsRangePreset,
  GenerateWorkProfileInput,
  GeneratedWorkProfileSnapshot,
} from './analytics.types'

export const analyticsApi = {
  getOverview: (
    rangePreset: AnalyticsRangePreset,
  ): Promise<AnalyticsOverview> =>
    window.electronAPI.analytics.getOverview(rangePreset),
  generateWorkProfile: (
    input: GenerateWorkProfileInput,
  ): Promise<GeneratedWorkProfileSnapshot> =>
    window.electronAPI.analytics.generateWorkProfile(input),
  deleteWorkProfileSnapshot: (id: string): Promise<void> =>
    window.electronAPI.analytics.deleteWorkProfileSnapshot(id),
}
