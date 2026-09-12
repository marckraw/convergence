import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import {
  feedFacets,
  type FeedFacet,
  type FeedView,
  type buildFeedView,
} from '@/features/needs-you'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

interface Props {
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  view: FeedView
  result: ReturnType<typeof buildFeedView>
  onChange: (view: FeedView) => void
  onReset: () => void
}

export function NeedsYouControls({
  expanded,
  onExpandedChange,
  view,
  result,
  onChange,
  onReset,
}: Props) {
  const toggle = (facet: FeedFacet, value: string) => {
    const selected = view.filters[facet] ?? []
    onChange({
      ...view,
      filters: {
        ...view.filters,
        [facet]: selected.includes(value)
          ? selected.filter((item) => item !== value)
          : [...selected, value],
      },
    })
  }
  const active = Object.entries(view.filters).flatMap(([facet, values]) =>
    (values ?? []).map((value) => ({ facet: facet as FeedFacet, value })),
  )
  const filtered = Boolean(view.query || active.length)
  const order = [
    ...new Set([
      ...view.sectionOrder,
      ...result.groups.map((group) => group.title),
    ]),
  ]
  const move = (index: number, direction: number) => {
    const next = [...order]
    ;[next[index], next[index + direction]] = [
      next[index + direction]!,
      next[index]!,
    ]
    onChange({ ...view, sectionOrder: next })
  }
  return (
    <div className="space-y-2 text-[11px]">
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium text-muted-foreground">
          Activity{' '}
          <span
            className="ml-1 tabular-nums"
            aria-label={`${result.shown} of ${result.total} cards shown`}
          >
            {result.shown} / {result.total}
          </span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-1.5 text-[11px]"
          aria-expanded={expanded}
          aria-controls="sidebar-activity-controls"
          onClick={() => onExpandedChange(!expanded)}
        >
          <SlidersHorizontal aria-hidden="true" className="size-3" /> Filter &
          sort{' '}
          <ChevronDown
            aria-hidden="true"
            className={`size-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </Button>
      </div>
      {filtered && (
        <div className="flex flex-wrap gap-1" aria-label="Active filters">
          {view.query && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="h-auto min-h-6 whitespace-normal text-[11px] flex items-center gap-1 rounded bg-muted px-1.5 py-1"
              onClick={() => onChange({ ...view, query: '' })}
              aria-label="Remove search filter"
            >
              Search: {view.query}
              <X aria-hidden="true" className="size-3" />
            </Button>
          )}
          {active.map(({ facet, value }) => {
            const label =
              result.options[facet].find((option) => option.value === value)
                ?.label ?? value
            return (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                key={`${facet}:${value}`}
                className="h-auto min-h-6 whitespace-normal text-[11px] flex max-w-full items-center gap-1 rounded bg-muted px-1.5 py-1"
                onClick={() => toggle(facet, value)}
                aria-label={`Remove ${feedFacets[facet]} filter: ${label}`}
              >
                <span className="truncate">{label}</span>
                <X aria-hidden="true" className="size-3 shrink-0" />
              </Button>
            )
          })}
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="h-auto min-h-6 whitespace-normal text-[11px] px-1 underline underline-offset-2"
            onClick={() => onChange({ ...view, query: '', filters: {} })}
          >
            Clear filters
          </Button>
        </div>
      )}
      {expanded && (
        <div
          id="sidebar-activity-controls"
          className="space-y-3 rounded-lg border border-border/60 bg-card p-2"
        >
          <label className="block space-y-1">
            <span>Search cards</span>
            <Input
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs"
              placeholder="Name, model, project or PR…"
              value={view.query}
              onChange={(event) =>
                onChange({ ...view, query: event.target.value })
              }
            />
          </label>
          <div className="space-y-1">
            {(Object.keys(feedFacets) as FeedFacet[]).map((facet) => (
              <details
                key={facet}
                className="rounded border border-border/40 p-1.5"
              >
                <summary className="cursor-pointer">
                  {feedFacets[facet]}
                  {view.filters[facet]?.length
                    ? ` · ${view.filters[facet]!.length} selected`
                    : ''}
                </summary>
                <fieldset
                  className="mt-1 max-h-40 space-y-1 overflow-y-auto"
                  aria-label={feedFacets[facet]}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="h-auto min-h-6 whitespace-normal text-[11px] text-muted-foreground underline"
                    onClick={() =>
                      onChange({
                        ...view,
                        filters: { ...view.filters, [facet]: [] },
                      })
                    }
                  >
                    All {feedFacets[facet].toLowerCase()}
                  </Button>
                  {result.options[facet].map((option) => (
                    <label
                      key={option.value}
                      className="flex items-start gap-1.5 py-0.5"
                    >
                      <Input
                        type="checkbox"
                        checked={
                          view.filters[facet]?.includes(option.value) ?? false
                        }
                        onChange={() => toggle(facet, option.value)}
                        className="mt-0.5 size-3 shrink-0 rounded p-0 shadow-none"
                      />
                      <span className="min-w-0 flex-1 break-words">
                        {option.label}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {option.count}
                      </span>
                    </label>
                  ))}
                </fieldset>
              </details>
            ))}
          </div>
          <label className="flex items-center justify-between gap-1">
            Group by
            <select
              aria-label="Group cards by"
              className="min-w-0 rounded bg-background p-1"
              value={view.groupBy}
              onChange={(event) =>
                onChange({
                  ...view,
                  groupBy: event.target.value as FeedView['groupBy'],
                })
              }
            >
              <option value="workflow">Workflow</option>
              <option value="status">Status</option>
              <option value="project">Project</option>
              <option value="none">No groups</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-1">
            Sort
            <select
              aria-label="Sort cards"
              className="min-w-0 rounded bg-background p-1"
              value={view.sort}
              onChange={(event) =>
                onChange({
                  ...view,
                  sort: event.target.value as FeedView['sort'],
                })
              }
            >
              <option value="newest">Latest activity</option>
              <option value="oldest">Oldest activity</option>
              <option value="name">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <Input
              type="checkbox"
              className="size-3 shrink-0 rounded p-0 shadow-none"
              checked={view.pinsFirst}
              onChange={(event) =>
                onChange({ ...view, pinsFirst: event.target.checked })
              }
            />
            Pinned section first
          </label>
          <details>
            <summary className="cursor-pointer">Arrange sections</summary>
            <div className="mt-1 space-y-1">
              {order.map((title, index) => (
                <div key={title} className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate">{title}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    disabled={
                      index === 0 || (title === 'Pinned' && view.pinsFirst)
                    }
                    aria-label={`Move ${title} up`}
                    onClick={() => move(index, -1)}
                    className="rounded p-1 disabled:opacity-30"
                  >
                    <ArrowUp className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    disabled={
                      index === order.length - 1 ||
                      (title === 'Pinned' && view.pinsFirst)
                    }
                    aria-label={`Move ${title} down`}
                    onClick={() => move(index, 1)}
                    className="rounded p-1 disabled:opacity-30"
                  >
                    <ArrowDown className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </details>
          <p className="text-muted-foreground">
            Counts include your other filters. Choices within a filter are
            combined. Project sessions below are unchanged.
          </p>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="h-auto min-h-6 whitespace-normal text-[11px] underline underline-offset-2"
            onClick={onReset}
          >
            Reset view
          </Button>
        </div>
      )}
      {result.hiddenPins > 0 && (
        <p className="text-muted-foreground">
          {result.hiddenPins} pinned{' '}
          {result.hiddenPins === 1 ? 'card hidden' : 'cards hidden'} by filters.
        </p>
      )}
      {result.shown === 0 && (
        <p
          role="status"
          className="rounded-lg border border-dashed border-border p-3 text-muted-foreground"
        >
          {result.total
            ? 'No cards match these filters. Remove a filter or clear filters to see your activity.'
            : 'No activity cards yet.'}
        </p>
      )}
    </div>
  )
}
