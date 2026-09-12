import { useEffect, useRef, useState, type ComponentProps } from 'react'
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

export function NeedsYou(props: ComponentProps<typeof NeedsYouFeed>) {
  const [expanded, setExpanded] = useState(false)
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
  const result = buildFeedView(props.groups, view)
  const displayed = holdFeedOrder(result.groups, heldOrder)
  const pendingOrder = feedOrderKey(displayed) !== feedOrderKey(result.groups)
  const changeView = (next: FeedView) => {
    setHeldOrder(null)
    setView(next)
  }
  return (
    <div className="space-y-3">
      <div className="px-3">
        <NeedsYouControls
          expanded={expanded}
          onExpandedChange={setExpanded}
          view={view}
          result={result}
          onChange={changeView}
          onReset={() => changeView(defaultFeedView())}
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
        <NeedsYouFeed {...props} groups={displayed} />
      </div>
    </div>
  )
}
