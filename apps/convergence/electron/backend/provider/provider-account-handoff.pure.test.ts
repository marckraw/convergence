import { expect, it } from 'vitest'
import { HandoffRefusedError } from './provider-account-handoff.pure'
import { isProviderBusyError } from './provider.types'

it('keeps an unsent account handoff out of the automatic mid-turn requeue path', () => {
  const refusal = new HandoffRefusedError(
    'source-busy',
    'Source account still has work.',
  )
  expect(isProviderBusyError(refusal)).toBe(false)
  expect(refusal.stage).toBe('source-busy')
})
