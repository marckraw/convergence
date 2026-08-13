import { describe, expect, it } from 'vitest'
import type { ProviderInfo } from '@/entities/session'
import { resolveHailOutcome } from './session-hail-outcome.pure'

function provider(
  midRunInput: Partial<ProviderInfo['midRunInput']>,
): Pick<ProviderInfo, 'midRunInput'> {
  return {
    midRunInput: {
      supportsAnswer: false,
      supportsNativeFollowUp: false,
      supportsAppQueuedFollowUp: false,
      supportsSteer: false,
      supportsInterrupt: false,
      defaultRunningMode: null,
      ...midRunInput,
    },
  }
}

// The two first-class providers, as declared in provider-descriptor.pure.ts.
const CLAUDE_CODE = provider({
  supportsAnswer: true,
  supportsAppQueuedFollowUp: true,
  defaultRunningMode: 'follow-up',
})
const CODEX = provider({
  supportsAnswer: true,
  supportsAppQueuedFollowUp: true,
  supportsSteer: true,
  supportsInterrupt: true,
  defaultRunningMode: 'follow-up',
})
const PI = provider({
  supportsNativeFollowUp: true,
  supportsSteer: true,
  defaultRunningMode: 'follow-up',
})

describe('resolveHailOutcome', () => {
  it('starts a new turn for an idle session', () => {
    const outcome = resolveHailOutcome({
      status: 'idle',
      attention: 'none',
      provider: CLAUDE_CODE,
    })

    expect(outcome.kind).toBe('new-turn')
    expect(outcome.label).toBe('Starts a new turn')
    expect(outcome.deliveryMode).toBe('normal')
    expect(outcome.disabled).toBe(false)
  })

  it('starts a new turn for completed and failed sessions too', () => {
    for (const status of ['completed', 'failed'] as const) {
      const outcome = resolveHailOutcome({
        status,
        attention: 'none',
        provider: CLAUDE_CODE,
      })
      expect(outcome.label).toBe('Starts a new turn')
    }
  })

  it('queues behind the current turn for app-queueing providers', () => {
    for (const target of [CLAUDE_CODE, CODEX]) {
      const outcome = resolveHailOutcome({
        status: 'running',
        attention: 'none',
        provider: target,
      })

      expect(outcome.kind).toBe('queued-input')
      expect(outcome.label).toBe('Queues behind the current turn')
      expect(outcome.deliveryMode).toBe('follow-up')
      expect(outcome.disabled).toBe(false)
    }
  })

  it('does not claim to queue when the provider takes follow-ups natively', () => {
    // Pi delivers into the running turn; calling that "queued" would be the
    // surprise the honest label exists to prevent.
    const outcome = resolveHailOutcome({
      status: 'running',
      attention: 'none',
      provider: PI,
    })

    expect(outcome.kind).toBe('current-turn')
    expect(outcome.label).toBe('Delivers into the current turn')
    expect(outcome.deliveryMode).toBe('follow-up')
  })

  it('steers when steering is the only lawful running mode', () => {
    const outcome = resolveHailOutcome({
      status: 'running',
      attention: 'none',
      provider: provider({ supportsSteer: true, defaultRunningMode: 'steer' }),
    })

    expect(outcome.kind).toBe('current-turn')
    expect(outcome.label).toBe('Steers the current turn')
    expect(outcome.deliveryMode).toBe('steer')
  })

  it('answers a session that is holding a question', () => {
    const outcome = resolveHailOutcome({
      status: 'running',
      attention: 'needs-input',
      provider: CLAUDE_CODE,
    })

    expect(outcome.kind).toBe('answer')
    expect(outcome.label).toBe('Answers the pending question')
    expect(outcome.deliveryMode).toBe('answer')
  })

  it('refuses honestly when a running provider takes no mid-run input', () => {
    const outcome = resolveHailOutcome({
      status: 'running',
      attention: 'none',
      provider: provider({}),
    })

    expect(outcome.kind).toBe('unavailable')
    expect(outcome.disabled).toBe(true)
    expect(outcome.label).toBe(
      'Provider does not support messages while running',
    )
  })

  it('refuses honestly when the provider is unknown while running', () => {
    const outcome = resolveHailOutcome({
      status: 'running',
      attention: 'none',
      provider: null,
    })

    expect(outcome.kind).toBe('unavailable')
    expect(outcome.disabled).toBe(true)
  })

  it('still starts a new turn when an idle session has no provider info', () => {
    const outcome = resolveHailOutcome({
      status: 'idle',
      attention: 'none',
      provider: null,
    })

    expect(outcome.kind).toBe('new-turn')
    expect(outcome.disabled).toBe(false)
  })
})
