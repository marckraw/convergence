import { create } from 'zustand'
import { analyticsApi } from './analytics.api'
import type { AnalyticsOverview, AnalyticsRangePreset } from './analytics.types'

interface AnalyticsState {
  rangePreset: AnalyticsRangePreset
  overview: AnalyticsOverview | null
  isLoading: boolean
  error: string | null
}

interface AnalyticsActions {
  loadOverview: (rangePreset?: AnalyticsRangePreset) => Promise<void>
  setRangePreset: (rangePreset: AnalyticsRangePreset) => void
  clearError: () => void
}

export type AnalyticsStore = AnalyticsState & AnalyticsActions

export const useAnalyticsStore = create<AnalyticsStore>((set, get) => ({
  rangePreset: '30d',
  overview: null,
  isLoading: false,
  error: null,

  loadOverview: async (rangePreset = get().rangePreset) => {
    set({ rangePreset, isLoading: true, error: null })
    try {
      const overview = await analyticsApi.getOverview(rangePreset)
      set({ overview, rangePreset, isLoading: false })
    } catch (err) {
      set({
        isLoading: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load analytics overview',
      })
    }
  },

  setRangePreset: (rangePreset) => set({ rangePreset }),

  clearError: () => set({ error: null }),
}))
