import { describe, expect, it } from 'vitest'
import type { SessionContextWindow } from '@/entities/session'
import type { ContextAlertSettings } from '@/shared/lib/context-alert-settings.pure'
import {
  describeContextAlert,
  getContextTone,
} from './context-window-tone.pure'

const alert: ContextAlertSettings = {
  enabled: true,
  percent: 75,
  tokens: 400000,
}

function window_(
  usedTokens: number,
  windowTokens: number,
): SessionContextWindow {
  const usedPercentage = Math.round((usedTokens / windowTokens) * 100)
  return {
    availability: 'available',
    source: 'provider',
    usedTokens,
    windowTokens,
    usedPercentage,
    remainingPercentage: 100 - usedPercentage,
  }
}

describe('getContextTone', () => {
  it('is muted without a context window', () => {
    expect(getContextTone(null, alert)).toBe('muted')
    expect(getContextTone(undefined, alert)).toBe('muted')
  })

  it('is muted when the provider reports usage unavailable', () => {
    expect(
      getContextTone(
        {
          availability: 'unavailable',
          source: 'provider',
          reason: 'Cursor does not report context usage.',
        },
        alert,
      ),
    ).toBe('muted')
  })

  it('is red at 15 % remaining or less', () => {
    expect(getContextTone(window_(170000, 200000), alert)).toBe('red')
  })

  it('is amber when the alert threshold is crossed', () => {
    // 152k of 200k is 76 % used, 24 % left: past the 75 % alert but not yet
    // into red, where the old fixed band would have said green.
    expect(getContextTone(window_(152000, 200000), alert)).toBe('amber')
  })

  it('is amber on a big window the old band would have called green', () => {
    // 410k of 1M is 41 % used, 59 % left — green under the fixed 35 %-left
    // band, amber because 410k is past the absolute cap.
    expect(getContextTone(window_(410000, 1000000), alert)).toBe('amber')
  })

  it('is green below the alert threshold', () => {
    expect(getContextTone(window_(100000, 200000), alert)).toBe('green')
  })

  it('falls back to the fixed 35 %-remaining band when the alert is off', () => {
    const off = { ...alert, enabled: false }
    // 70 % used / 30 % left: amber by the old band, and green by the alert
    // (which is off), so this asserts the fallback and not the new rule.
    expect(getContextTone(window_(140000, 200000), off)).toBe('amber')
    expect(getContextTone(window_(120000, 200000), off)).toBe('green')
  })

  it('stays green on a big window when the alert is off', () => {
    // 410k of 1M: amber by the alert, green by the old band. With the alert
    // off the dot must go back to its old colour.
    expect(
      getContextTone(window_(410000, 1000000), { ...alert, enabled: false }),
    ).toBe('green')
  })

  it('red outranks amber', () => {
    // 190k of 200k is over the alert AND at 5 % remaining. Red is the answer.
    expect(getContextTone(window_(190000, 200000), alert)).toBe('red')
  })
})

describe('describeContextAlert', () => {
  it('says nothing below the threshold', () => {
    expect(describeContextAlert(window_(100000, 200000), alert)).toBeNull()
    expect(describeContextAlert(null, alert)).toBeNull()
  })

  it('names the percent when the percent was reached first', () => {
    expect(describeContextAlert(window_(152000, 200000), alert)).toBe(
      'Over your alert threshold (75 %)',
    )
  })

  it('names the token cap when the cap was reached first', () => {
    expect(describeContextAlert(window_(410000, 1000000), alert)).toBe(
      'Over your alert threshold (400k tokens)',
    )
  })
})
