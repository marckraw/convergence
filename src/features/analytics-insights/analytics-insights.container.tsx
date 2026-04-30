import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { useSessionStore } from '@/entities/session'
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
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [profileProviderId, setProfileProviderId] = useState('')
  const [profileModelId, setProfileModelId] = useState('')
  const rangePreset = useAnalyticsStore((s) => s.rangePreset)
  const overview = useAnalyticsStore((s) => s.overview)
  const isLoading = useAnalyticsStore((s) => s.isLoading)
  const isGeneratingProfile = useAnalyticsStore((s) => s.isGeneratingProfile)
  const error = useAnalyticsStore((s) => s.error)
  const loadOverview = useAnalyticsStore((s) => s.loadOverview)
  const generateWorkProfile = useAnalyticsStore((s) => s.generateWorkProfile)
  const deleteWorkProfileSnapshot = useAnalyticsStore(
    (s) => s.deleteWorkProfileSnapshot,
  )
  const providers = useSessionStore((s) => s.providers)
  const loadProviders = useSessionStore((s) => s.loadProviders)

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  const profileProviders = providers.filter(
    (provider) => provider.kind === 'conversation',
  )
  const selectedProvider =
    profileProviders.find((provider) => provider.id === profileProviderId) ??
    profileProviders[0] ??
    null
  const selectedModel =
    selectedProvider?.modelOptions.find(
      (model) => model.id === profileModelId,
    ) ??
    selectedProvider?.modelOptions[0] ??
    null

  useEffect(() => {
    if (!selectedProvider) return
    if (profileProviderId !== selectedProvider.id) {
      setProfileProviderId(selectedProvider.id)
    }
    if (selectedModel && profileModelId !== selectedModel.id) {
      setProfileModelId(selectedModel.id)
    }
  }, [profileProviderId, profileModelId, selectedProvider, selectedModel])

  const handleRangeChange = useCallback(
    (next: AnalyticsRangePreset) => {
      void loadOverview(next)
    },
    [loadOverview],
  )

  const handleRetry = useCallback(() => {
    void loadOverview(rangePreset)
  }, [loadOverview, rangePreset])

  const handleProfileProviderChange = useCallback(
    (providerId: string) => {
      const provider = profileProviders.find((item) => item.id === providerId)
      setProfileProviderId(providerId)
      setProfileModelId(provider?.modelOptions[0]?.id ?? '')
    },
    [profileProviders],
  )

  const handleGenerateProfile = useCallback(async () => {
    if (!selectedProvider || !selectedModel) return
    await generateWorkProfile({
      rangePreset,
      providerId: selectedProvider.id,
      model: selectedModel.id,
    })
    setGenerateDialogOpen(false)
  }, [generateWorkProfile, rangePreset, selectedModel, selectedProvider])

  const handleDeleteProfile = useCallback(() => {
    const id = overview?.generatedProfile?.id
    if (!id) return
    void deleteWorkProfileSnapshot(id)
  }, [deleteWorkProfileSnapshot, overview?.generatedProfile?.id])

  return (
    <AnalyticsInsights
      overview={overview}
      rangePreset={rangePreset}
      activeTab={activeTab}
      isLoading={isLoading}
      isGeneratingProfile={isGeneratingProfile}
      error={error}
      providers={profileProviders}
      profileProviderId={selectedProvider?.id ?? ''}
      profileModelId={selectedModel?.id ?? ''}
      generateDialogOpen={generateDialogOpen}
      onRangeChange={handleRangeChange}
      onTabChange={setActiveTab}
      onRetry={handleRetry}
      onGenerateDialogOpenChange={setGenerateDialogOpen}
      onProfileProviderChange={handleProfileProviderChange}
      onProfileModelChange={setProfileModelId}
      onGenerateProfile={handleGenerateProfile}
      onDeleteGeneratedProfile={handleDeleteProfile}
    />
  )
}
