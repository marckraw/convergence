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
 * - `log`: a running record's moment, to the second on a 24-hour clock, as
 *   the transcript has always written it (DS6): "Today, 14:07:33",
 *   "Yesterday, 14:07:33", "20 Apr 2026, 14:07:33". The day words are
 *   English, as they were.
 */
export type TimestampFormat = 'relative' | 'clock' | 'date' | 'datetime' | 'log'

export type TimestampOptions = {
  /** The moment "ago" is measured from; now unless told otherwise (tests). */
  now?: Date
  /** The reader's language unless told otherwise. */
  locale?: Intl.LocalesArgument
  /** The reader's time zone unless told otherwise (tests). */
  timeZone?: string
  /**
   * `clock` and `datetime` to the second ("2:07:33 PM"), for a moment a
   * reader compares with the next: a run's start and end, a status's change.
   */
  seconds?: boolean
  /**
   * `false` writes `clock` and `datetime` on a 24-hour clock ("21:40"), as
   * Loom's dispatch clocks are (MC-27); the reader's own unless told.
   */
  hour12?: boolean
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

/** The calendar day a moment falls on in a time zone, counted in days since 1970. */
const daySerial = (date: Date, timeZone?: string): number | null => {
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value)
  const year = part('year')
  const month = part('month')
  const day = part('day')
  if (!year || !month || !day) return null
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

/** How many calendar days before `now` a moment fell, in a time zone: 0 today, 1 yesterday. */
export const calendarDaysBefore = (
  date: Date,
  now: Date,
  timeZone?: string,
): number | null => {
  const day = daySerial(date, timeZone)
  const today = daySerial(now, timeZone)
  return day === null || today === null ? null : today - day
}

/** The `log` form: the transcript's own, to the second (see TimestampFormat). */
const logTimestamp = (
  date: Date,
  { now = new Date(), locale, timeZone }: TimestampOptions,
): string => {
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone,
  }).format(date)
  const before = calendarDaysBefore(date, now, timeZone)
  if (before === 0) return `Today, ${time}`
  if (before === 1) return `Yesterday, ${time}`
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: false,
    timeZone,
  }).format(date)
}

/** The moment in one of the four forms. */
export const formatTimestamp = (
  date: Date,
  format: TimestampFormat,
  options: TimestampOptions = {},
): string => {
  const {
    now = new Date(),
    locale,
    timeZone,
    seconds = false,
    hour12,
  } = options
  const second = seconds ? ('2-digit' as const) : undefined
  if (format === 'log') return logTimestamp(date, options)
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
      second,
      hour12,
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
    second,
    hour12,
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

/**
 * The moment to the second, for a `log` time's tooltip: "22 Apr 2026,
 * 10:05:06", as the transcript has always written it.
 */
export const exactDateLabel = (
  date: Date,
  { locale, timeZone }: Omit<TimestampOptions, 'now' | 'seconds'> = {},
): string =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone,
  }).format(date)
