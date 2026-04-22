import { describe, expect, it } from 'vitest'
import { compareVersions, formatProgress, summarizeError } from './updates.pure'

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('0.16.0', '0.16.0')).toBe(0)
  })

  it('returns -1 when a is older by patch', () => {
    expect(compareVersions('0.16.0', '0.16.1')).toBe(-1)
  })

  it('returns 1 when a is newer by minor', () => {
    expect(compareVersions('0.17.0', '0.16.9')).toBe(1)
  })

  it('handles leading v prefix', () => {
    expect(compareVersions('v0.16.0', '0.16.0')).toBe(0)
    expect(compareVersions('v0.17.0', 'v0.16.5')).toBe(1)
  })

  it('ignores pre-release suffixes and compares release parts', () => {
    expect(compareVersions('0.17.0-beta.1', '0.17.0')).toBe(0)
    expect(compareVersions('0.18.0-rc.1', '0.17.5')).toBe(1)
  })

  it('treats missing segments as zero', () => {
    expect(compareVersions('0.17', '0.17.0')).toBe(0)
    expect(compareVersions('1', '0.99.99')).toBe(1)
  })
})

describe('formatProgress', () => {
  it('rounds percent and formats KB/s', () => {
    expect(formatProgress({ percent: 42.7, bytesPerSecond: 1536 })).toEqual({
      percent: 43,
      humanSpeed: '1.5 KB/s',
    })
  })

  it('clamps percent below 0 to 0', () => {
    expect(formatProgress({ percent: -5, bytesPerSecond: 0 })).toEqual({
      percent: 0,
      humanSpeed: '0 B/s',
    })
  })

  it('clamps percent above 100 to 100', () => {
    expect(formatProgress({ percent: 110, bytesPerSecond: 2_097_152 })).toEqual(
      {
        percent: 100,
        humanSpeed: '2.0 MB/s',
      },
    )
  })

  it('formats MB/s for large rates', () => {
    expect(
      formatProgress({ percent: 50, bytesPerSecond: 15 * 1024 * 1024 }),
    ).toEqual({ percent: 50, humanSpeed: '15 MB/s' })
  })

  it('formats B/s for sub-KB rates', () => {
    expect(formatProgress({ percent: 10, bytesPerSecond: 512 })).toEqual({
      percent: 10,
      humanSpeed: '512 B/s',
    })
  })

  it('treats non-finite percent as 0', () => {
    expect(formatProgress({ percent: NaN, bytesPerSecond: 0 })).toEqual({
      percent: 0,
      humanSpeed: '0 B/s',
    })
  })
})

describe('summarizeError', () => {
  it('maps known electron-updater error codes to friendly text', () => {
    expect(
      summarizeError({ code: 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND' }),
    ).toBe('No releases published yet.')
    expect(summarizeError({ code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' })).toBe(
      "Couldn't read update metadata.",
    )
    expect(summarizeError({ code: 'ERR_UPDATER_INVALID_SIGNATURE' })).toBe(
      'Downloaded update failed verification.',
    )
  })

  it('maps network error codes to offline message', () => {
    expect(summarizeError({ code: 'ENOTFOUND' })).toBe(
      'Offline or GitHub unreachable.',
    )
    expect(summarizeError({ code: 'ETIMEDOUT' })).toBe(
      'Offline or GitHub unreachable.',
    )
  })

  it('matches error codes embedded in message when code is missing', () => {
    expect(
      summarizeError({ message: 'getaddrinfo ENOTFOUND api.github.com' }),
    ).toBe('Offline or GitHub unreachable.')
  })

  it('falls back to truncated message when unknown code', () => {
    expect(summarizeError({ message: 'Something specific went wrong' })).toBe(
      'Something specific went wrong',
    )
  })

  it('truncates long messages to 120 chars', () => {
    const long = 'x'.repeat(200)
    const result = summarizeError({ message: long })
    expect(result.length).toBeLessThanOrEqual(120)
    expect(result.endsWith('…')).toBe(true)
  })

  it('returns generic message for null/undefined/empty inputs', () => {
    expect(summarizeError(null)).toBe('Unknown error.')
    expect(summarizeError(undefined)).toBe('Unknown error.')
    expect(summarizeError({})).toBe('Unknown error.')
  })

  it('accepts string errors directly', () => {
    expect(summarizeError('boom')).toBe('boom')
  })
})
