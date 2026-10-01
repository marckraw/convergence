import type { ComponentProps } from 'react'
import { cn } from '#lib/cn.pure'
import {
  formatTimestamp,
  type TimestampFormat,
  type TimestampOptions,
  toDate,
} from './timestamp.pure'

type TimestampProps = Omit<
  ComponentProps<'time'>,
  'className' | 'children' | 'dateTime'
> &
  TimestampOptions & {
    className?: string
    /** The moment: a Date, or an ISO string as the backend stores it. */
    date: Date | string
    /** relative ("4 minutes ago", the default), clock, date or datetime. */
    format?: TimestampFormat
  }

/**
 * A moment, written one of four ways through Intl (MAR-3616), in a `<time>`
 * whose `dateTime` holds the exact instant, so the six formats the
 * conversation writes today become one part (CONV-22). Figures keep one
 * width. A value that names no moment is shown as given.
 *
 * R2 puts the whole date in our Tooltip on hover, never a `title`;
 * `fullDateLabel` writes it, and the tooltip joins when DS3a's Tooltip lands.
 * A relative time is written when it renders: re-render to move it on.
 */
function Timestamp({
  date,
  format = 'relative',
  now,
  locale,
  timeZone,
  className,
  ...props
}: TimestampProps) {
  const moment = toDate(date)
  if (moment === null) {
    return (
      <span data-slot="timestamp" className={className}>
        {String(date)}
      </span>
    )
  }
  return (
    <time
      data-slot="timestamp"
      data-format={format}
      dateTime={moment.toISOString()}
      className={cn('tabular-nums', className)}
      {...props}
    >
      {formatTimestamp(moment, format, { now, locale, timeZone })}
    </time>
  )
}

export { Timestamp, type TimestampProps }
