import type { FC } from 'react'
import { Button } from '@/shared/ui/button'
import type { MainViewRouteFallback } from './routes/main-view-route-resolution.pure'

interface RouteFallbackViewProps {
  fallback: MainViewRouteFallback
  onAction: () => void
}

export const RouteFallbackView: FC<RouteFallbackViewProps> = ({
  fallback,
  onAction,
}) => (
  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
    <div className="max-w-md">
      <p className="text-sm font-medium text-muted-foreground">
        Route fallback
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {fallback.title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {fallback.message}
      </p>
      <Button type="button" className="mt-6" onClick={onAction}>
        {fallback.actionLabel}
      </Button>
    </div>
  </div>
)
