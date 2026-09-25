import { describe, expect, it } from 'vitest'
import {
  failureClass,
  REFUSED_TEXT_MAX_CHARS,
  refusedText,
} from './block-sentence-attempt.pure'

describe('what an attempt row may say (MAR-3422 CV3d R3)', () => {
  it('keeps a refused line trimmed and capped', () => {
    expect(refusedText('  Read lib/x.ts.\n')).toBe('Read lib/x.ts.')
    expect(refusedText('a'.repeat(900))).toHaveLength(REFUSED_TEXT_MAX_CHARS)
  })

  it('names a failure by its class, never by its message', () => {
    expect(
      failureClass(new Error('codex oneShot timed out at /Users/me/.codex')),
    ).toBe('timeout')
    expect(failureClass(new Error('codex oneShot turn interrupted'))).toBe(
      'turn-failed',
    )
    expect(failureClass(new Error('account me@example.com signed out'))).toBe(
      'error',
    )
    expect(failureClass('not an error')).toBe('error')
  })
})
