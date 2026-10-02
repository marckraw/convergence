import type { FC } from 'react'
import { Button, DragRegion } from '@convergence/ui'
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
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-12 text-center">
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">
          {fallback.title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          {fallback.message}
        </p>
        <Button type="button" onClick={onAction} size="lg" className="mt-6">
          {fallback.actionLabel}
        </Button>
      </div>
    </div>
  </div>
)
