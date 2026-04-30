import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import {
  useAnalyticsStore,
  type AnalyticsRangePreset,
} from '@/entities/analytics'
import {
  AnalyticsInsights,
  type AnalyticsInsightsTab,
} from './analytics-insights.presentational'

export const AnalyticsInsightsContainer: FC = () => {
  const [activeTab, setActiveTab] = useState<AnalyticsInsightsTab>('usage')
  const rangePreset = useAnalyticsStore((s) => s.rangePreset)
  const overview = useAnalyticsStore((s) => s.overview)
  const isLoading = useAnalyticsStore((s) => s.isLoading)
  const error = useAnalyticsStore((s) => s.error)
  const loadOverview = useAnalyticsStore((s) => s.loadOverview)

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  const handleRangeChange = useCallback(
    (next: AnalyticsRangePreset) => {
      void loadOverview(next)
    },
    [loadOverview],
  )

  const handleRetry = useCallback(() => {
    void loadOverview(rangePreset)
  }, [loadOverview, rangePreset])

  return (
    <AnalyticsInsights
      overview={overview}
      rangePreset={rangePreset}
      activeTab={activeTab}
      isLoading={isLoading}
      error={error}
      onRangeChange={handleRangeChange}
      onTabChange={setActiveTab}
      onRetry={handleRetry}
    />
  )
}
