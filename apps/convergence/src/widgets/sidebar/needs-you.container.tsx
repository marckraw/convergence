import { useEffect, useId, useRef, useState, type ComponentProps } from 'react'
import {
  buildFeedView,
  defaultFeedView,
  readFeedView,
  holdFeedOrder,
  feedOrderKey,
  type FeedGroup,
  type FeedView,
} from '@/features/needs-you'
import { NeedsYou as NeedsYouFeed } from './needs-you.presentational'
import { NeedsYouControls } from './needs-you-controls.presentational'
import { Button } from '@/shared/ui/button'

const preferenceKey = 'convergence:sidebar-activity-view:v1'
const filtersExpandedKey = 'convergence:sidebar-activity-filters-expanded:v1'
const foldedKey = 'convergence:sidebar-activity-folded:v1'

/** A stored set of folded section titles; anything else folds nothing. */
function readFoldedTitles(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(foldedKey) ?? '[]')
    return new Set(
      Array.isArray(value)
        ? value.filter((title): title is string => typeof title === 'string')
        : [],
    )
  } catch {
    return new Set()
  }
}

export function NeedsYou({
  nameSearchQuery = '',
  ...props
}: Omit<
  ComponentProps<typeof NeedsYouFeed>,
  'foldedTitles' | 'onToggleFold'
> & {
  nameSearchQuery?: string
}) {
  const controlsId = useId()
  const controlsTrigger = useRef<HTMLButtonElement>(null)
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    try {
      return localStorage.getItem(filtersExpandedKey) === 'true'
    } catch {
      return false
    }
  })
  const [foldedTitles, setFoldedTitles] = useState(readFoldedTitles)
  useEffect(() => {
    try {
      localStorage.setItem(foldedKey, JSON.stringify([...foldedTitles]))
    } catch {
      /* Preferences remain usable for this window. */
    }
  }, [foldedTitles])
  const toggleFold = (title: string) =>
    setFoldedTitles((previous) => {
      const next = new Set(previous)
      if (!next.delete(title)) next.add(title)
      return next
    })
  const [heldOrder, setHeldOrder] = useState<FeedGroup[] | null>(null)
  const pointerInside = useRef(false)
  const [view, setView] = useState<FeedView>(() => {
    try {
      return readFeedView(localStorage.getItem(preferenceKey))
    } catch {
      return defaultFeedView()
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(view))
    } catch {
      /* Preferences remain usable for this window. */
    }
  }, [view])
  useEffect(() => {
    try {
      localStorage.setItem(filtersExpandedKey, String(filtersExpanded))
    } catch {
      /* Preferences remain usable for this window. */
    }
  }, [filtersExpanded])
  const result = buildFeedView(props.groups, view)
  const displayed = holdFeedOrder(result.groups, heldOrder)
  const pendingOrder = feedOrderKey(displayed) !== feedOrderKey(result.groups)
  const changeView = (next: FeedView) => {
    setHeldOrder(null)
    setView(next)
  }
  const collapseFilters = () => {
    setFiltersExpanded(false)
    controlsTrigger.current?.focus()
  }
  return (
    <div className="space-y-3">
      <div
        className="px-3"
        onKeyDown={(event) => {
          if (
            filtersExpanded &&
            event.key === 'Escape' &&
            !event.defaultPrevented
          ) {
            event.preventDefault()
            event.stopPropagation()
            collapseFilters()
          }
        }}
      >
        <NeedsYouControls
          controlsId={controlsId}
          triggerRef={controlsTrigger}
          expanded={filtersExpanded}
          onToggle={() => setFiltersExpanded((expanded) => !expanded)}
          onCollapse={collapseFilters}
          view={view}
          result={result}
          nameSearchQuery={nameSearchQuery}
          onChange={changeView}
          onReset={() => {
            changeView({ ...defaultFeedView(), order: view.order })
            controlsTrigger.current?.focus()
          }}
        />
      </div>
      {pendingOrder && (
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="mx-3 text-[11px] text-muted-foreground underline"
          onClick={() => setHeldOrder(null)}
        >
          Order paused · Update order
        </Button>
      )}
      <div
        onPointerEnter={() => {
          pointerInside.current = true
          setHeldOrder(displayed)
        }}
        onPointerLeave={(event) => {
          pointerInside.current = false
          if (!event.currentTarget.contains(document.activeElement))
            setHeldOrder(null)
        }}
        onFocusCapture={() => setHeldOrder((previous) => previous ?? displayed)}
        onBlurCapture={(event) => {
          if (
            !pointerInside.current &&
            !event.currentTarget.contains(event.relatedTarget)
          )
            setHeldOrder(null)
        }}
      >
        <NeedsYouFeed
          {...props}
          groups={displayed}
          foldedTitles={foldedTitles}
          onToggleFold={toggleFold}
        />
      </div>
    </div>
  )
}
