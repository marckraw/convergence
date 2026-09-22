import { expect, it } from 'vitest'
import { readContextAlert } from './context-alert.pure'
import { DEFAULT_CONTEXT_ALERT } from './context-alert-settings.pure'

it('uses the token cap even below the percentage cap', () => {
  expect(
    readContextAlert(
      {
        availability: 'available',
        source: 'provider',
        usedTokens: 410000,
        windowTokens: 1000000,
        usedPercentage: 41,
        remainingPercentage: 59,
      },
      DEFAULT_CONTEXT_ALERT,
    ),
  ).toEqual({ over: true, by: 'tokens' })
})

it('never turns missing telemetry into an alert', () => {
  expect(readContextAlert(null, DEFAULT_CONTEXT_ALERT)).toEqual({ over: false })
  expect(
    readContextAlert(
      {
        availability: 'unavailable',
        source: 'provider',
        reason: 'not reported',
      },
      DEFAULT_CONTEXT_ALERT,
    ),
  ).toEqual({ over: false })
})
