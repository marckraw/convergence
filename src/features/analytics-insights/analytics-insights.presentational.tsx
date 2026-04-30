import { RefreshCw } from 'lucide-react'
import type {
  AnalyticsOverview,
  AnalyticsRangePreset,
} from '@/entities/analytics'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'
import { RangePicker } from './range-picker.presentational'
import { UsageTab } from './usage-tab.presentational'

export type AnalyticsInsightsTab = 'usage' | 'work-style'

interface AnalyticsInsightsProps {
  overview: AnalyticsOverview | null
  rangePreset: AnalyticsRangePreset
  activeTab: AnalyticsInsightsTab
  isLoading: boolean
  error: string | null
  onRangeChange: (preset: AnalyticsRangePreset) => void
  onTabChange: (tab: AnalyticsInsightsTab) => void
  onRetry: () => void
}

export function AnalyticsInsights({
  overview,
  rangePreset,
  activeTab,
  isLoading,
  error,
  onRangeChange,
  onTabChange,
  onRetry,
}: AnalyticsInsightsProps) {
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
        renderWorkStylePlaceholder()
      )}
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

function renderWorkStylePlaceholder() {
  return (
    <section className="rounded-lg border border-border bg-card/60 p-5">
      <p className="text-sm font-semibold">Work style summaries are next</p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        This tab will use the same local overview data to explain provider,
        project, time-of-day, and interaction patterns. Generated AI summaries
        stay opt-in and are not part of this phase.
      </p>
    </section>
  )
}
