import { describe, expect, it } from 'vitest'
import {
  formatTimestamp,
  fullDateLabel,
  relativeParts,
  toDate,
} from './timestamp.pure'

const now = new Date('2026-10-01T12:00:00Z')
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const options = { now, locale: 'en-US', timeZone: 'UTC' }
/** ICU writes a narrow no-break space before AM and PM; compare it as a space. */
const plain = (text: string) => text.replace(/\s/g, ' ')

describe('toDate', () => {
  it('reads a Date and an ISO string, and refuses what names no moment', () => {
    expect(toDate(now)).toBe(now)
    expect(toDate('2026-10-01T12:00:00Z')?.getTime()).toBe(now.getTime())
    expect(toDate('not a date')).toBeNull()
  })
})

describe('relativeParts', () => {
  it.each([
    [-30_000, 0, 'second'],
    [-4 * MINUTE, -4, 'minute'],
    [-50 * MINUTE, -1, 'hour'],
    [-90 * MINUTE, -2, 'hour'],
    [-30 * HOUR, -1, 'day'],
    [-3 * DAY, -3, 'day'],
    [-10 * DAY, -1, 'week'],
    [-60 * DAY, -2, 'month'],
    [-400 * DAY, -1, 'year'],
    [5 * MINUTE, 5, 'minute'],
  ])('%d ms is %d %s', (offset, value, unit) => {
    expect(relativeParts(at(offset), now)).toEqual({ value, unit })
  })
})

describe('formatTimestamp', () => {
  it('tells a past moment in words', () => {
    expect(formatTimestamp(at(-10_000), 'relative', options)).toBe('now')
    expect(formatTimestamp(at(-4 * MINUTE), 'relative', options)).toBe(
      '4 minutes ago',
    )
    expect(formatTimestamp(at(-30 * HOUR), 'relative', options)).toBe(
      'yesterday',
    )
    expect(formatTimestamp(at(2 * HOUR), 'relative', options)).toBe(
      'in 2 hours',
    )
  })

  it('writes a clock time', () => {
    expect(plain(formatTimestamp(now, 'clock', options))).toBe('12:00 PM')
  })

  it('writes the year only when it is not this year', () => {
    expect(
      formatTimestamp(new Date('2026-09-30T14:00:00Z'), 'date', options),
    ).toBe('Sep 30')
    expect(
      formatTimestamp(new Date('2025-09-30T14:00:00Z'), 'date', options),
    ).toBe('Sep 30, 2025')
    expect(
      plain(
        formatTimestamp(new Date('2026-09-30T14:00:00Z'), 'datetime', options),
      ),
    ).toBe('Sep 30, 2:00 PM')
  })
})

describe('fullDateLabel', () => {
  it('writes the whole moment', () => {
    expect(
      plain(fullDateLabel(now, { locale: 'en-US', timeZone: 'UTC' })),
    ).toBe('Thursday, October 1, 2026 at 12:00 PM')
  })
})
