/**
 * How Timestamp writes a moment (MAR-3616): four forms, all through Intl, so
 * every surface that shows a time writes it the same way in the reader's
 * language. Which form a surface uses is that surface's choice (R0, DS4).
 */

/**
 * - `relative`: "4 minutes ago", "yesterday", "now".
 * - `clock`: "2:07 PM", a time today.
 * - `date`: "Sep 30", with the year when it isn't this year's.
 * - `datetime`: "Sep 30, 2:00 PM", with the year when it isn't this year's.
 */
export type TimestampFormat = 'relative' | 'clock' | 'date' | 'datetime'

export type TimestampOptions = {
  /** The moment "ago" is measured from; now unless told otherwise (tests). */
  now?: Date
  /** The reader's language unless told otherwise. */
  locale?: Intl.LocalesArgument
  /** The reader's time zone unless told otherwise (tests). */
  timeZone?: string
}

/** A Date from a Date or an ISO string, or null when it names no moment. */
export const toDate = (value: Date | string): Date | null => {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * The unit a span of time is told in, and how many of it: the largest unit
 * that fits at least once, rounded, so 50 minutes is "50 minutes" and 90
 * minutes is "2 hours". Under 45 seconds is "now".
 */
export const relativeParts = (
  date: Date,
  now: Date,
): { value: number; unit: Intl.RelativeTimeFormatUnit } => {
  const span = date.getTime() - now.getTime()
  const size = Math.abs(span)
  const sign = span < 0 ? -1 : 1
  const told = (unitMs: number, unit: Intl.RelativeTimeFormatUnit) => ({
    value: sign * Math.round(size / unitMs),
    unit,
  })
  if (size < 45 * SECOND) return { value: 0, unit: 'second' }
  if (size < 45 * MINUTE) return told(MINUTE, 'minute')
  if (size < 22 * HOUR) return told(HOUR, 'hour')
  if (size < 7 * DAY) return told(DAY, 'day')
  if (size < 30 * DAY) return told(7 * DAY, 'week')
  if (size < 365 * DAY) return told(30 * DAY, 'month')
  return told(365 * DAY, 'year')
}

const sameYear = (date: Date, now: Date, timeZone?: string) => {
  const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone })
  return year.format(date) === year.format(now)
}

/** The moment in one of the four forms. */
export const formatTimestamp = (
  date: Date,
  format: TimestampFormat,
  { now = new Date(), locale, timeZone }: TimestampOptions = {},
): string => {
  if (format === 'relative') {
    const { value, unit } = relativeParts(date, now)
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
      value,
      unit,
    )
  }
  if (format === 'clock') {
    return new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    }).format(date)
  }
  const year = sameYear(date, now, timeZone) ? undefined : 'numeric'
  if (format === 'date') {
    return new Intl.DateTimeFormat(locale, {
      year,
      month: 'short',
      day: 'numeric',
      timeZone,
    }).format(date)
  }
  return new Intl.DateTimeFormat(locale, {
    year,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(date)
}

/**
 * The whole moment, for the tooltip a Timestamp shows (R2): "Tuesday,
 * September 30, 2026 at 2:00 PM".
 */
export const fullDateLabel = (
  date: Date,
  { locale, timeZone }: Omit<TimestampOptions, 'now'> = {},
): string =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone,
  }).format(date)
