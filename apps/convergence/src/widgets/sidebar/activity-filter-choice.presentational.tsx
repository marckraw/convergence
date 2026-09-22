import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { LOOM_NO_DRAG_STYLE } from '@/shared/ui/no-drag.styles'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

export function FilterChoice({
  label,
  selected,
  count,
  onClick,
  children,
  className,
  tooltip,
}: {
  label: string
  selected: boolean
  count?: number
  onClick: () => void
  children: ReactNode
  className?: string
  tooltip?: string
}) {
  const control = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      aria-description={
        count === undefined ? undefined : `${count} matching conversations`
      }
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'h-[30px] shrink-0 gap-1.5 border border-transparent px-2 text-[11px] font-normal',
        selected && 'border-foreground/25 bg-foreground/5 font-medium',
        className,
      )}
    >
      {children}
      {count !== undefined && (
        <span
          aria-hidden="true"
          className="tabular-nums text-[10px] text-muted-foreground"
        >
          {count}
        </span>
      )}
    </Button>
  )
  return tooltip ? (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent style={LOOM_NO_DRAG_STYLE}>{tooltip}</TooltipContent>
    </Tooltip>
  ) : (
    control
  )
}
