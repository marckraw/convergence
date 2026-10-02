import type { FC } from 'react'
import { Button, DragRegion, EmptyState } from '@convergence/ui'
import type { MainViewRouteFallback } from './routes/main-view-route-resolution.pure'

interface RouteFallbackViewProps {
  fallback: MainViewRouteFallback
  onAction: () => void
}

/**
 * A route that leads nowhere: what happened and the one way back, in the
 * user's words (NAV-19: no developer's "Route fallback" over the title). The
 * screen has no header, so a bare drag strip keeps the window movable from
 * its top (NAV-4).
 */
export const RouteFallbackView: FC<RouteFallbackViewProps> = ({
  fallback,
  onAction,
}) => (
  <div className="flex h-full flex-col">
    <DragRegion />
    {/* The welcome's page-sized EmptyState: one title weight for both (NAV-19). */}
    <EmptyState
      size="page"
      variant="plain"
      layout="centred"
      title={fallback.title}
      detail={fallback.message}
      action={
        <Button type="button" onClick={onAction} size="lg">
          {fallback.actionLabel}
        </Button>
      }
      className="pb-12"
    />
  </div>
)
