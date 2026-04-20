import { describe, expect, it } from 'vitest'
import {
  buildContinuationRecoveryEntry,
  isMissingContinuationError,
} from './continuation-recovery.pure'

describe('isMissingContinuationError', () => {
  it('matches dead session-style messages', () => {
    expect(
      isMissingContinuationError(
        new Error('session file not found: /tmp/pi-session.json'),
        ['session'],
      ),
    ).toBe(true)
  })

  it('matches dead resume-style messages', () => {
    expect(
      isMissingContinuationError('Unable to resume conversation: invalid id', [
        'resume',
        'conversation',
      ]),
    ).toBe(true)
  })

  it('ignores unrelated provider failures', () => {
    expect(
      isMissingContinuationError(new Error('authentication failed'), [
        'session',
        'resume',
      ]),
    ).toBe(false)
  })
})

describe('buildContinuationRecoveryEntry', () => {
  it('formats a provider-specific recovery message', () => {
    expect(
      buildContinuationRecoveryEntry('Claude Code', '2026-04-20T14:00:00.000Z'),
    ).toEqual({
      type: 'system',
      text: 'Claude Code continuation was no longer available. Started a new session; previous provider context may be missing.',
      timestamp: '2026-04-20T14:00:00.000Z',
    })
  })
})
