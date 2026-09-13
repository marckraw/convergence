import {
  CircleCheck,
  Laptop,
  LoaderCircle,
  MessageCircle,
  Server,
  X,
} from 'lucide-react'
import {
  activityViews,
  toggleFeedChoice,
  type ActivityView,
  type FeedView,
  type buildFeedView,
} from '@/features/needs-you'
import { Button } from '@/shared/ui/button'
import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { FilterChoice } from './activity-filter-choice.presentational'

interface Props {
  view: FeedView
  result: ReturnType<typeof buildFeedView>
  onChange: (view: FeedView) => void
  onReset: () => void
}
const views: Record<
  ActivityView,
  { label: string; icon?: typeof CircleCheck }
> = {
  all: { label: 'All activity' },
  'needs-me': { label: 'Needs me', icon: MessageCircle },
  working: { label: 'Working', icon: LoaderCircle },
  review: { label: 'Review', icon: CircleCheck },
}
export function NeedsYouControls({ view, result, onChange, onReset }: Props) {
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
        <div
          role="group"
          aria-label="Activity view"
          className="grid grid-cols-2 gap-1.5"
        >
          {activityViews.map((value) => {
            const { label, icon: Icon } = views[value]
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
                    providers: toggleFeedChoice(view.providers, provider.value),
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
              ? 'No activity matches these choices. Change a view or icon, or clear filters to see your activity.'
              : 'No activity cards yet.'}
          </p>
        )}
      </div>
    </TooltipProvider>
  )
}
