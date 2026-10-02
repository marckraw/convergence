import type { ReactNode } from 'react'
import { cn, focusRingInset, Tooltip } from '@convergence/ui'

export function NeedsYouCardIcon({
  label,
  children,
  compact = false,
}: {
  label: string
  children: ReactNode
  compact?: boolean
}) {
  return (
    <Tooltip label={label} side="right">
      <span
        role="img"
        aria-label={label}
        tabIndex={0}
        className={cn(
          'flex items-center justify-center rounded-md text-ink-muted',
          focusRingInset,
          compact ? 'relative z-10 size-3 shrink-0' : 'h-7 w-10',
        )}
      >
        {children}
      </span>
    </Tooltip>
  )
}
