import type { FC } from 'react'
import { Button } from '@/shared/ui/button'

export const NoSessionActions: FC = () => (
  <div className="space-y-2 rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
    <p>Agent handoff requires a session-backed review target.</p>
    <div className="grid gap-2">
      <Button type="button" variant="outline" size="sm" disabled>
        Attach session
      </Button>
      <Button type="button" variant="outline" size="sm" disabled>
        Start review session
      </Button>
      <Button type="button" variant="outline" size="sm" disabled>
        Keep notes local
      </Button>
    </div>
  </div>
)
