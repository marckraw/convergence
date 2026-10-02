import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'
import { RefreshCw } from 'lucide-react'
import type {
  AnalyticsOverview,
  AnalyticsRangePreset,
} from '@/entities/analytics'
import type { ProviderInfo } from '@/entities/session'
import { getProviderLifecycleBadge } from '@/entities/session'
import {
  Button,
  Notice,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
} from '@convergence/ui'
import { GenerateProfileDialog } from './generate-profile-dialog.presentational'
import { RangePicker } from './range-picker.presentational'
import { UsageTab } from './usage-tab.presentational'
import { WorkStyleTab } from './work-style-tab.presentational'

export type AnalyticsInsightsTab = 'usage' | 'work-style'

interface AnalyticsInsightsProps {
  overview: AnalyticsOverview | null
  rangePreset: AnalyticsRangePreset
  activeTab: AnalyticsInsightsTab
  isLoading: boolean
  isGeneratingProfile: boolean
  error: string | null
  providers: ProviderInfo[]
  profileProviderId: string
  profileModelId: string
  generateDialogOpen: boolean
  onRangeChange: (preset: AnalyticsRangePreset) => void
  onTabChange: (tab: AnalyticsInsightsTab) => void
  onRetry: () => void
  onGenerateDialogOpenChange: (open: boolean) => void
  onProfileProviderChange: (providerId: string) => void
  onProfileModelChange: (modelId: string, providerId?: string) => void
  onGenerateProfile: () => void
  onDeleteGeneratedProfile: () => void
}

export function AnalyticsInsights({
  overview,
  rangePreset,
  activeTab,
  isLoading,
  isGeneratingProfile,
  error,
  providers,
  profileProviderId,
  profileModelId,
  generateDialogOpen,
  onRangeChange,
  onTabChange,
  onRetry,
  onGenerateDialogOpenChange,
  onProfileProviderChange,
  onProfileModelChange,
  onGenerateProfile,
  onDeleteGeneratedProfile,
}: AnalyticsInsightsProps) {
  const selectedProvider =
    providers.find((provider) => provider.id === profileProviderId) ??
    providers[0]
  const selectedModel =
    selectedProvider?.modelOptions.find(
      (model) => model.id === profileModelId,
    ) ?? selectedProvider?.modelOptions[0]
  const providerItems = providers.map((provider) => ({
    id: provider.id,
    icon: (
      <ProviderIcon
        providerId={provider.id}
        vendorLabel={provider.vendorLabel}
        name={provider.name}
      />
    ),
    label: provider.vendorLabel || provider.name,
    description:
      provider.vendorLabel && provider.vendorLabel !== provider.name
        ? provider.name
        : undefined,
    badge: getProviderLifecycleBadge(provider) ?? undefined,
  }))
  return (
    <Tabs
      value={activeTab}
      onValueChange={(next: AnalyticsInsightsTab) => onTabChange(next)}
      className="gap-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <TabsList aria-label="Insights view" className="w-fit">
          <TabsTab value="usage">Your usage</TabsTab>
          <TabsTab value="work-style">Your work style</TabsTab>
        </TabsList>

        <RangePicker
          value={rangePreset}
          disabled={isLoading}
          onChange={onRangeChange}
        />
      </div>

      {error ? (
        <Notice
          tone="danger"
          title={error}
          actions={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRetry}
            >
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          }
        />
      ) : null}

      <TabsPanel value="usage">
        <UsageTab overview={overview} isLoading={isLoading} />
      </TabsPanel>
      <TabsPanel value="work-style">
        <WorkStyleTab
          overview={overview}
          isLoading={isLoading}
          isGeneratingProfile={isGeneratingProfile}
          canGenerateProfile={providers.length > 0}
          onGenerateProfile={() => onGenerateDialogOpenChange(true)}
          onDeleteGeneratedProfile={onDeleteGeneratedProfile}
        />
      </TabsPanel>

      <GenerateProfileDialog
        open={generateDialogOpen}
        providerId={selectedProvider?.id ?? ''}
        providerLabel={
          selectedProvider?.vendorLabel || selectedProvider?.name || 'Provider'
        }
        modelId={selectedModel?.id ?? ''}
        modelLabel={selectedModel?.label ?? 'Model'}
        providers={providers}
        providerItems={providerItems}
        isGenerating={isGeneratingProfile}
        onOpenChange={onGenerateDialogOpenChange}
        onProviderChange={onProfileProviderChange}
        onModelChange={onProfileModelChange}
        onConfirm={onGenerateProfile}
      />
    </Tabs>
  )
}
