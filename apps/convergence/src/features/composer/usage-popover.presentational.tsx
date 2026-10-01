import type { FC, ReactNode } from 'react'
import { cn, EmptyState, Meter, type Tone } from '@convergence/ui'

/**
 * The composer's two usage popovers, the Codex quota and the context window,
 * are siblings in one row (CONV-26, MAR-3617): the same heading, the same
 * reading rows, the same "nothing reported" note and the same sections, drawn
 * once here so the two can't drift apart.
 */

/** The popover's title, the line under it, and an action at its end. */
export const UsageHeading: FC<{
  title: string
  detail: ReactNode
  action?: ReactNode
}> = ({ title, detail, action }) => (
  <div className="flex items-start justify-between gap-3">
    <div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-0.5 text-2xs text-ink-muted">{detail}</p>
    </div>
    {action}
  </div>
)

/**
 * One reading: its name (and a line under it), a meter in its tone, and the
 * number at the end, in fixed columns so rows line up.
 */
export const UsageMeterRow: FC<{
  label: string
  detail?: ReactNode
  /** 0 to 100, or null when nothing was reported. */
  value: number | null
  /** The number as it is shown at the end: "64%". */
  valueLabel: string
  tone: Tone
  /** What the meter measures, for a screen reader: "5 hour quota remaining". */
  meterLabel: string
}> = ({ label, detail, value, valueLabel, tone, meterLabel }) => (
  <div className="flex items-center gap-2 text-xs">
    <div className="w-18 shrink-0">
      <p className="font-medium text-ink">{label}</p>
      {detail == null ? null : (
        <p className="mt-0.5 truncate text-3xs text-ink-muted">{detail}</p>
      )}
    </div>
    <Meter
      value={value ?? 0}
      label={meterLabel}
      valueText={valueLabel}
      tone={tone}
      className="min-w-0 flex-1"
    />
    <span className="w-10 shrink-0 text-right font-medium text-ink">
      {valueLabel}
    </span>
  </div>
)

/** Nothing to read yet, or the reading is unavailable: why, in a quiet box. */
export const UsageNote: FC<{ children: ReactNode }> = ({ children }) => (
  <EmptyState size="compact" detail={children} />
)

/** A part of the popover under a hairline: the credits, an action, a footnote. */
export const UsageSection: FC<{
  children: ReactNode
  className?: string
}> = ({ children, className }) => (
  <div className={cn('border-t border-line-soft pt-2', className)}>
    {children}
  </div>
)
