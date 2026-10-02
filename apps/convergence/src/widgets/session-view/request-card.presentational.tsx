import type { ReactNode } from 'react'
import { Card, cn } from '@convergence/ui'
import { copyButtonRoom } from './conversation-item.styles'

/**
 * A card where the agent waits on you (CONV-8): an approval, a plan, a form,
 * a link, a question. Each is the warning tone (R1: waiting on you), with its
 * glyph, its title (which also names it) and its time; what it asks goes
 * under them.
 */
export function RequestCard({
  title,
  icon,
  timestamp,
  testId,
  children,
}: {
  title: string
  icon: ReactNode
  timestamp: ReactNode
  testId?: string
  children: ReactNode
}) {
  return (
    <Card
      tone="warning"
      padding="md"
      className="my-2 max-w-full overflow-hidden"
      data-testid={testId}
      role="group"
      aria-label={title}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex shrink-0 text-warning-ink [&_svg]:size-5"
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'flex flex-wrap items-center gap-x-2 gap-y-1',
              copyButtonRoom,
            )}
          >
            <p className="text-sm font-medium">{title}</p>
            {timestamp}
          </div>
          {children}
        </div>
      </div>
    </Card>
  )
}
