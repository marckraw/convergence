import { describe, expect, it } from 'vitest'
import type { ProviderInfo } from '@/entities/session'
import { resolveMidRunInputPolicy } from './mid-run-input.pure'

const provider = (
  midRunInput: ProviderInfo['midRunInput'],
): Pick<ProviderInfo, 'midRunInput'> => ({ midRunInput })

describe('resolveMidRunInputPolicy', () => {
  it('uses answer mode for needs-input sessions', () => {
    expect(
      resolveMidRunInputPolicy({
        status: 'running',
        attention: 'needs-input',
        provider: null,
      }),
    ).toEqual({
      disabled: false,
      defaultMode: 'answer',
      availableModes: ['answer'],
      reason: null,
    })
  })

  it('uses normal mode when the session is not running', () => {
    expect(
      resolveMidRunInputPolicy({
        status: 'completed',
        attention: 'finished',
        provider: null,
      }),
    ).toEqual({
      disabled: false,
      defaultMode: 'normal',
      availableModes: ['normal'],
      reason: null,
    })
  })

  it('disables running sessions without provider capability', () => {
    expect(
      resolveMidRunInputPolicy({
        status: 'running',
        attention: 'none',
        provider: null,
      }),
    ).toMatchObject({
      disabled: true,
      availableModes: [],
    })
  })

  it('offers follow-up before steer when both are supported', () => {
    expect(
      resolveMidRunInputPolicy({
        status: 'running',
        attention: 'none',
        provider: provider({
          supportsAnswer: true,
          supportsNativeFollowUp: false,
          supportsAppQueuedFollowUp: true,
          supportsSteer: true,
          supportsInterrupt: true,
          defaultRunningMode: 'follow-up',
        }),
      }),
    ).toMatchObject({
      disabled: false,
      defaultMode: 'follow-up',
      availableModes: ['follow-up', 'steer'],
    })
  })

  it('uses steer as default only when follow-up is unavailable', () => {
    expect(
      resolveMidRunInputPolicy({
        status: 'running',
        attention: 'none',
        provider: provider({
          supportsAnswer: false,
          supportsNativeFollowUp: false,
          supportsAppQueuedFollowUp: false,
          supportsSteer: true,
          supportsInterrupt: false,
          defaultRunningMode: null,
        }),
      }),
    ).toMatchObject({
      disabled: false,
      defaultMode: 'steer',
      availableModes: ['steer'],
    })
  })
})
