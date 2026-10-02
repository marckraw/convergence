import type { ReactNode } from 'react'
import { cn, Toggle, Tooltip } from '@convergence/ui'

/**
 * One choice among the Activity feed's filters: a Toggle, so it says
 * aria-pressed and, chosen, is the raised chip every pick-one control wears
 * (R7, NAV-18; it was a hand-drawn border and a 5% fill).
 */
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
    <Toggle
      size="sm"
      pressed={selected}
      aria-label={label}
      aria-description={
        count === undefined ? undefined : `${count} matching conversations`
      }
      onClick={onClick}
      className={cn('shrink-0 px-2 font-normal', className)}
    >
      {children}
      {count !== undefined && (
        <span
          aria-hidden="true"
          className="tabular-nums text-3xs text-ink-muted"
        >
          {count}
        </span>
      )}
    </Toggle>
  )
  return tooltip ? <Tooltip label={tooltip}>{control}</Tooltip> : control
}
