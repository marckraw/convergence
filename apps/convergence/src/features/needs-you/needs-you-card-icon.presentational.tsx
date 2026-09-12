import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn.pure'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

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
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          tabIndex={0}
          className={cn(
            'flex items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
            compact ? 'relative z-10 size-3 shrink-0' : 'h-7 w-10',
          )}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}
