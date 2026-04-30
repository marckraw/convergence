import { RefreshCw } from 'lucide-react'
import type {
  AnalyticsOverview,
  AnalyticsRangePreset,
} from '@/entities/analytics'
import type { ProviderInfo } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'
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
  onProfileModelChange: (modelId: string) => void
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
    label: provider.vendorLabel || provider.name,
    description:
      provider.vendorLabel && provider.vendorLabel !== provider.name
        ? provider.name
        : undefined,
  }))
  const modelItems =
    selectedProvider?.modelOptions.map((model) => ({
      id: model.id,
      label: model.label,
      description: model.id,
    })) ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="inline-flex w-fit rounded-lg border border-border bg-background p-1"
          role="tablist"
          aria-label="Insights view"
        >
          {renderTabButton({
            label: 'Your Usage',
            selected: activeTab === 'usage',
            onClick: () => onTabChange('usage'),
          })}
          {renderTabButton({
            label: 'Your Work Style',
            selected: activeTab === 'work-style',
            onClick: () => onTabChange('work-style'),
          })}
        </div>

        <RangePicker
          value={rangePreset}
          disabled={isLoading}
          onChange={onRangeChange}
        />
      </div>

      {error ? (
        <div
          className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <span>{error}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit border-destructive/40 bg-background text-destructive hover:bg-destructive/10"
            onClick={onRetry}
          >
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      ) : null}

      {activeTab === 'usage' ? (
        <UsageTab overview={overview} isLoading={isLoading} />
      ) : (
        <WorkStyleTab
          overview={overview}
          isLoading={isLoading}
          isGeneratingProfile={isGeneratingProfile}
          canGenerateProfile={providers.length > 0}
          onGenerateProfile={() => onGenerateDialogOpenChange(true)}
          onDeleteGeneratedProfile={onDeleteGeneratedProfile}
        />
      )}

      <GenerateProfileDialog
        open={generateDialogOpen}
        providerId={selectedProvider?.id ?? ''}
        providerLabel={
          selectedProvider?.vendorLabel || selectedProvider?.name || 'Provider'
        }
        modelId={selectedModel?.id ?? ''}
        modelLabel={selectedModel?.label ?? 'Model'}
        providerItems={providerItems}
        modelItems={modelItems}
        isGenerating={isGeneratingProfile}
        onOpenChange={onGenerateDialogOpenChange}
        onProviderChange={onProfileProviderChange}
        onModelChange={onProfileModelChange}
        onConfirm={onGenerateProfile}
      />
    </div>
  )
}

function renderTabButton({
  selected,
  onClick,
  label,
}: {
  selected: boolean
  onClick: () => void
  label: string
}) {
  return (
    <Button
      key={label}
      type="button"
      role="tab"
      aria-selected={selected}
      variant={selected ? 'secondary' : 'ghost'}
      size="sm"
      className={cn(
        'h-8 rounded-md px-3 text-xs',
        selected && 'shadow-none ring-1 ring-ring',
      )}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}
