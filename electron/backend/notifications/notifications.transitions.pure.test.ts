import { describe, expect, it } from 'vitest'
import type { AttentionState } from '../provider/provider.types'
import { detectEvent } from './notifications.transitions.pure'

describe('detectEvent', () => {
  it.each([
    ['none', 'finished', 'agent.finished'],
    ['none', 'failed', 'agent.errored'],
    ['none', 'needs-input', 'agent.needs_input'],
    ['none', 'needs-approval', 'agent.needs_approval'],
    ['needs-approval', 'needs-input', 'agent.needs_input'],
    ['needs-input', 'needs-approval', 'agent.needs_approval'],
    ['needs-input', 'finished', 'agent.finished'],
    ['needs-approval', 'failed', 'agent.errored'],
  ] as const)('maps %s → %s to %s', (prev, next, expected) => {
    expect(detectEvent(prev, next)).toBe(expected)
  })

  it.each([
    ['finished', 'none'],
    ['needs-input', 'none'],
    ['needs-approval', 'none'],
    ['failed', 'none'],
  ] as const)('returns null for %s → none (resolution)', (prev, next) => {
    expect(detectEvent(prev, next)).toBeNull()
  })

  it.each([
    'none',
    'needs-input',
    'needs-approval',
    'finished',
    'failed',
  ] as const)('returns null when prev === next (%s)', (state) => {
    expect(detectEvent(state, state)).toBeNull()
  })

  it('exhaustively covers all AttentionState values via the switch', () => {
    const all: AttentionState[] = [
      'none',
      'needs-input',
      'needs-approval',
      'finished',
      'failed',
    ]
    for (const next of all) {
      const result = detectEvent('none', next)
      if (next === 'none') {
        expect(result).toBeNull()
      } else {
        expect(result).not.toBeNull()
      }
    }
  })
})
