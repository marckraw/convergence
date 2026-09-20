import { describe, expect, it } from 'vitest'
import type { ContextAlertSettings } from '@/shared/lib/context-alert-settings.pure'
import type { SessionContextWindow } from './session.types'
import { readContextAlert } from './context-alert.pure'

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

describe('readContextAlert', () => {
  it('is never over when the alert is switched off', () => {
    expect(
      readContextAlert(window_(199000, 200000), { ...alert, enabled: false }),
    ).toEqual({ over: false })
  })

  it('is never over without a reported context window', () => {
    expect(readContextAlert(null, alert)).toEqual({ over: false })
    expect(readContextAlert(undefined, alert)).toEqual({ over: false })
  })

  it('is never over when the provider reports usage unavailable', () => {
    expect(
      readContextAlert(
        {
          availability: 'unavailable',
          source: 'provider',
          reason: 'Cursor does not report context usage.',
        },
        alert,
      ),
    ).toEqual({ over: false })
  })

  it('is over by tokens when the absolute cap is reached', () => {
    // 410k of 1M is 41 % — under the percent, over the cap.
    expect(readContextAlert(window_(410000, 1000000), alert)).toEqual({
      over: true,
      by: 'tokens',
    })
  })

  it('is over by percent when the share is reached', () => {
    // 152k of 200k is 76 % — over the percent, under the 400k cap.
    expect(readContextAlert(window_(152000, 200000), alert)).toEqual({
      over: true,
      by: 'percent',
    })
  })

  it('is not over below both limits', () => {
    expect(readContextAlert(window_(100000, 200000), alert)).toEqual({
      over: false,
    })
  })

  it('a 1M window trips on the token cap first', () => {
    // Both limits are behind: 800k of 1M is 80 %, and 400k is 40 % of the
    // window, so the cap was crossed long before the percent.
    expect(readContextAlert(window_(800000, 1000000), alert)).toEqual({
      over: true,
      by: 'tokens',
    })
  })

  it('a 200k window trips on the percent first', () => {
    // Both limits are behind: 170k of 200k is 85 %. The percent stood at 150k
    // and the cap at 160k, so the percent was crossed first and is what the
    // popover should name.
    expect(
      readContextAlert(window_(170000, 200000), { ...alert, tokens: 160000 }),
    ).toEqual({ over: true, by: 'percent' })
  })

  it('names tokens when both limits fall on the same point', () => {
    // A cap that is exactly the percent expressed in tokens: the two were
    // reached together, and the absolute figure is the more concrete thing to
    // say, so the tie goes to tokens rather than being left to argument order.
    expect(
      readContextAlert(window_(160000, 200000), { ...alert, tokens: 150000 }),
    ).toEqual({ over: true, by: 'tokens' })
  })

  it('is over at exactly the percent', () => {
    expect(readContextAlert(window_(150000, 200000), alert)).toEqual({
      over: true,
      by: 'percent',
    })
  })

  it('is over at exactly the token cap', () => {
    expect(readContextAlert(window_(400000, 1000000), alert)).toEqual({
      over: true,
      by: 'tokens',
    })
  })

  it('ignores the absolute cap when it is null', () => {
    expect(
      readContextAlert(window_(900000, 1000000), {
        ...alert,
        tokens: null,
        percent: 95,
      }),
    ).toEqual({ over: false })
  })
})
