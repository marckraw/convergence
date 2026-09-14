import type { Ref } from 'react'
import {
  ChevronDown,
  CircleCheck,
  Laptop,
  LoaderCircle,
  MessageCircle,
  Server,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import {
  activityViews,
  activityViewLabels,
  buildFeedFilterSummary,
  toggleFeedChoice,
  type ActivityView,
  type FeedView,
  type buildFeedView,
} from '@/features/needs-you'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'
import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { FilterChoice } from './activity-filter-choice.presentational'

interface Props {
  controlsId: string
  triggerRef: Ref<HTMLButtonElement>
  expanded: boolean
  onToggle: () => void
  onCollapse: () => void
  view: FeedView
  result: ReturnType<typeof buildFeedView>
  onChange: (view: FeedView) => void
  onReset: () => void
}
const viewIcons: Partial<Record<ActivityView, typeof CircleCheck>> = {
  'needs-me': MessageCircle,
  working: LoaderCircle,
  review: CircleCheck,
}
export function NeedsYouControls({
  controlsId,
  triggerRef,
  expanded,
  onToggle,
  onCollapse,
  view,
  result,
  onChange,
  onReset,
}: Props) {
  const summary = buildFeedFilterSummary(view)
  return (
    <TooltipProvider delayDuration={250}>
      <div
        className="space-y-2.5 border-b border-border/60 pb-3 text-[11px]"
        aria-label="Activity controls"
      >
        <div className="flex h-[30px] items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Activity</span>
            <span
              className="tabular-nums text-muted-foreground"
              aria-label={`${result.shown} of ${result.total} cards shown`}
            >
              {result.filtered
                ? `${result.shown} of ${result.total}`
                : result.total}
            </span>
          </div>
          {result.filtered && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              aria-label="Clear activity filters"
              className="h-7 gap-1 px-1.5 text-[11px] font-normal"
            >
              <X aria-hidden="true" className="size-3" /> Clear
            </Button>
          )}
        </div>
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={controlsId}
          aria-label={`${expanded ? 'Collapse' : 'Edit'} activity filters: ${summary.activity}; ${summary.scope}`}
          className="h-auto min-h-14 w-full justify-start gap-2.5 whitespace-normal rounded-lg border border-foreground/25 bg-foreground/5 px-2.5 py-2 text-left text-[11px] font-normal"
        >
          <SlidersHorizontal
            aria-hidden="true"
            className="size-3.5 text-muted-foreground"
          />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-medium">{summary.activity}</span>
            <span className="break-words text-muted-foreground">
              {summary.scope}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-3.5 text-muted-foreground transition-transform motion-reduce:transition-none',
              expanded && 'rotate-180',
            )}
          />
        </Button>
        <div id={controlsId} hidden={!expanded} className="space-y-2.5">
          <div
            role="group"
            aria-label="Activity view"
            className="grid grid-cols-2 gap-1.5"
          >
            {activityViews.map((value) => {
              const label = activityViewLabels[value]
              const Icon = viewIcons[value]
              return (
                <FilterChoice
                  key={value}
                  label={label}
                  selected={view.activity === value}
                  count={result.activityCounts[value]}
                  onClick={() => onChange({ ...view, activity: value })}
                  className="h-9 min-w-0 px-1"
                >
                  {Icon && (
                    <Icon
                      aria-hidden="true"
                      className="size-3.5 text-muted-foreground"
                    />
                  )}
                  {label}
                </FilterChoice>
              )
            })}
          </div>
          <div
            role="group"
            aria-label="Host filters"
            className="flex items-start gap-1"
          >
            <span className="flex h-[30px] w-11 shrink-0 items-center text-[10px] text-muted-foreground">
              Host
            </span>
            <div className="flex min-w-0 flex-wrap gap-1">
              <FilterChoice
                label="All hosts"
                selected={!view.hosts.length}
                onClick={() => onChange({ ...view, hosts: [] })}
              >
                All
              </FilterChoice>
              {(['local', 'remote'] as const).map((host) => {
                const Icon = host === 'local' ? Laptop : Server
                const label =
                  host === 'local'
                    ? 'MacBook · Local conversations'
                    : 'Remote · All remote hosts'
                return (
                  <FilterChoice
                    key={host}
                    label={label}
                    tooltip={`${label} · ${result.hostCounts[host]} conversations`}
                    selected={view.hosts.includes(host)}
                    count={result.hostCounts[host]}
                    onClick={() =>
                      onChange({
                        ...view,
                        hosts: toggleFeedChoice(view.hosts, host),
                      })
                    }
                  >
                    <Icon
                      aria-hidden="true"
                      className="size-3.5 text-muted-foreground"
                    />
                  </FilterChoice>
                )
              })}
            </div>
          </div>
          <div
            role="group"
            aria-label="Provider filters"
            className="flex items-start gap-1"
          >
            <span className="flex h-[30px] w-11 shrink-0 items-center text-[10px] text-muted-foreground">
              Provider
            </span>
            <div className="flex min-w-0 flex-wrap gap-1">
              <FilterChoice
                label="All providers"
                selected={!view.providers.length}
                onClick={() => onChange({ ...view, providers: [] })}
              >
                All
              </FilterChoice>
              {result.providers.map((provider) => (
                <FilterChoice
                  key={provider.value}
                  label={provider.label}
                  tooltip={`${provider.label} · ${provider.count} conversations`}
                  count={provider.count}
                  selected={view.providers.includes(provider.value)}
                  onClick={() =>
                    onChange({
                      ...view,
                      providers: toggleFeedChoice(
                        view.providers,
                        provider.value,
                      ),
                    })
                  }
                >
                  <ProviderIcon
                    providerId={provider.value}
                    title=""
                    className="size-3.5"
                  />
                </FilterChoice>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCollapse}
              className="text-[11px] font-normal"
            >
              Collapse filters
            </Button>
          </div>
        </div>
        {result.hiddenPins > 0 && (
          <p className="text-muted-foreground">
            {result.hiddenPins} pinned{' '}
            {result.hiddenPins === 1 ? 'card hidden' : 'cards hidden'} by
            filters.
          </p>
        )}
        {result.shown === 0 && (
          <p
            role="status"
            className="rounded-lg border border-dashed border-border p-3 text-muted-foreground"
          >
            {result.filtered
              ? 'No activity matches these filters. Edit or clear filters to see your activity.'
              : 'No activity cards yet.'}
          </p>
        )}
      </div>
    </TooltipProvider>
  )
}
