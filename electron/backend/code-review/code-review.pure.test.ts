import { describe, expect, it } from 'vitest'
import { formatPullRequestLabel, prioritizeTargets } from './code-review.pure'

describe('code-review pure helpers', () => {
  it('prioritizes targets for the focused session without mutating input order', () => {
    const targets = [
      { id: 'project', sessionId: null },
      { id: 'other-session', sessionId: 'session-2' },
      { id: 'focused-session', sessionId: 'session-1' },
      { id: 'workspace', sessionId: null },
    ]

    const prioritized = prioritizeTargets(targets, 'session-1')

    expect(prioritized.map((target) => target.id)).toEqual([
      'focused-session',
      'project',
      'other-session',
      'workspace',
    ])
    expect(targets.map((target) => target.id)).toEqual([
      'project',
      'other-session',
      'focused-session',
      'workspace',
    ])
  })

  it('returns the original target array when no session is focused', () => {
    const targets = [
      { id: 'project', sessionId: null },
      { id: 'session', sessionId: 'session-1' },
    ]

    expect(prioritizeTargets(targets, null)).toBe(targets)
  })

  it('formats cached pull request labels', () => {
    expect(
      formatPullRequestLabel({
        number: 42,
        title: 'Implement review flow',
        state: 'open',
      }),
    ).toBe('#42 Implement review flow · open')
    expect(
      formatPullRequestLabel({
        number: null,
        title: null,
        state: 'closed',
      }),
    ).toBe('Pull Request · closed')
  })
})
