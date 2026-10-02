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
  feedOrders,
  feedOrderLabels,
  NEEDS_YOU,
  toggleFeedChoice,
  type ActivityView,
  type FeedView,
  type buildFeedView,
} from '@/features/needs-you'
import {
  Button,
  Card,
  CardAction,
  cn,
  EmptyState,
  SectionHeader,
  textStack,
} from '@convergence/ui'
import {
  noConversationMatchesLine,
  normalizeNameQuery,
} from '@/shared/lib/name-search.pure'
import { ProviderIcon } from '@/entities/provider'
import { FilterChoice } from './activity-filter-choice.presentational'
import { filterChoices, filterRowLabel } from './sidebar.styles'

interface Props {
  controlsId: string
  triggerRef: Ref<HTMLButtonElement>
  expanded: boolean
  onToggle: () => void
  onCollapse: () => void
  view: FeedView
  result: ReturnType<typeof buildFeedView>
  nameSearchQuery?: string
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
  nameSearchQuery = '',
  onChange,
  onReset,
}: Props) {
  const summary = buildFeedFilterSummary(view)
  const activeNameSearch = normalizeNameQuery(nameSearchQuery)
  return (
    <div
      role="group"
      className="space-y-2.5 border-b border-line-soft pb-3 text-2xs"
      aria-label={`${NEEDS_YOU} controls`}
    >
      <div className="flex h-control-sm items-center justify-between gap-2">
        {/* The feed's head, the kit's SectionHeader (NAV-12). */}
        <SectionHeader
          className="flex-1"
          label={NEEDS_YOU}
          count={
            <span aria-label={`${result.shown} of ${result.total} cards shown`}>
              {result.filtered
                ? `${result.shown} of ${result.total}`
                : result.total}
            </span>
          }
        />
        {result.filtered && (
          <Button
            type="button"
            variant="ghost"
            onClick={onReset}
            aria-label="Clear activity filters"
            size="sm"
            className="gap-1 font-normal"
          >
            <X aria-hidden="true" className="size-3" /> Clear
          </Button>
        )}
      </div>
      {/* The filters' summary is a card whose door opens them (DS-21). */}
      <Card interactive padding="none">
        <CardAction
          ref={triggerRef}
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={controlsId}
          aria-label={`${expanded ? 'Collapse' : 'Edit'} activity filters: ${summary.activity}; ${summary.scope}; Order: ${summary.order}`}
          className="flex min-h-14 w-full items-center gap-2.5 px-2.5 py-2"
        >
          <SlidersHorizontal
            aria-hidden="true"
            className="size-3.5 shrink-0 text-ink-muted"
          />
          <span className={textStack}>
            <span className="font-medium">{summary.activity}</span>
            <span className="break-words text-ink-muted">{summary.scope}</span>
            <span className="break-words text-ink-muted">
              Order: {summary.order}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-3.5 shrink-0 text-ink-muted transition-transform motion-reduce:transition-none',
              expanded && 'rotate-180',
            )}
          />
        </CardAction>
      </Card>
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
                selected={
                  value === 'all'
                    ? !view.activities.length
                    : view.activities.includes(value)
                }
                count={result.activityCounts[value]}
                onClick={() =>
                  onChange({
                    ...view,
                    activities:
                      value === 'all'
                        ? []
                        : toggleFeedChoice(view.activities, value),
                  })
                }
                className="h-control-lg min-w-0 px-1"
              >
                {Icon && (
                  <Icon
                    aria-hidden="true"
                    className="size-3.5 text-ink-muted"
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
          <span className={filterRowLabel}>Host</span>
          <div className={filterChoices}>
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
                    className="size-3.5 text-ink-muted"
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
          <span className={filterRowLabel}>Provider</span>
          <div className={filterChoices}>
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
        <div
          role="group"
          aria-label="Order by"
          className="flex items-start gap-1"
        >
          <span className={filterRowLabel}>Order</span>
          <div className={filterChoices}>
            {feedOrders.map((order) => (
              <FilterChoice
                key={order}
                label={feedOrderLabels[order].label}
                tooltip={feedOrderLabels[order].tooltip}
                selected={view.order === order}
                onClick={() => onChange({ ...view, order })}
              >
                {feedOrderLabels[order].label}
              </FilterChoice>
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={onCollapse}
            className="font-normal"
          >
            Collapse filters
          </Button>
        </div>
      </div>
      {result.hiddenPins > 0 && (
        <p className="text-ink-muted">
          {result.hiddenPins} pinned{' '}
          {result.hiddenPins === 1 ? 'card hidden' : 'cards hidden'} by filters.
        </p>
      )}
      {result.shown === 0 && (
        <div role="status">
          <EmptyState
            size="compact"
            title={
              activeNameSearch.length > 0
                ? noConversationMatchesLine(nameSearchQuery.trim())
                : result.filtered
                  ? 'No activity matches these filters. Edit or clear filters to see your activity.'
                  : 'No activity cards yet.'
            }
          />
        </div>
      )}
    </div>
  )
}
