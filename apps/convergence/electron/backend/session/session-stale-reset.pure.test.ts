import { describe, expect, it } from 'vitest'
import {
  readStaleResetFromQueue,
  staleResetNoteText,
} from './session-stale-reset.pure'
import type { StaleResetQueueRow } from './session-stale-reset.pure'

function row(
  id: string,
  queuePosition: number,
  state: StaleResetQueueRow['state'],
  text: string,
): StaleResetQueueRow & { id: string } {
  return { id, queuePosition, state, text }
}

describe('readStaleResetFromQueue (MAR-3307 R1)', () => {
  it('the MAR-3298 shape: an opener sent, the payload queued behind it', () => {
    const opener = row('opener', 1, 'sent', '/clear')
    const payload = row('payload', 2, 'queued', 'the brief that must ride')
    expect(readStaleResetFromQueue([payload, opener])).toEqual({
      reset: opener,
      behind: [payload],
    })
  })

  it('an opener still dispatching counts as the turn in flight', () => {
    const opener = row('opener', 1, 'dispatching', '/clear')
    const payload = row('payload', 2, 'queued', 'brief')
    expect(readStaleResetFromQueue([opener, payload])?.behind).toEqual([
      payload,
    ])
  })

  it('a queue whose last sent row is a normal message is not a reset', () => {
    // An old, finished reset sits earlier in line. The turn in flight is the
    // normal message after it. Matching by place in line ("an opener leads")
    // or by delivery mode would read this as a reset and fail the follow-up.
    expect(
      readStaleResetFromQueue([
        row('old-opener', 1, 'sent', '/clear'),
        row('old-payload', 2, 'sent', 'yesterday'),
        row('work', 3, 'sent', 'a normal message'),
        row('follow-up', 4, 'queued', 'later brief'),
      ]),
    ).toBeNull()
  })

  it('a reset with nothing behind it answers an empty list', () => {
    const opener = row('opener', 5, 'sent', '/clear')
    expect(readStaleResetFromQueue([opener])).toEqual({
      reset: opener,
      behind: [],
    })
  })

  it('only rows still queued stand behind it', () => {
    const opener = row('opener', 1, 'sent', '/clear')
    const kept = row('kept', 4, 'queued', 'second')
    expect(
      readStaleResetFromQueue([
        opener,
        row('dismissed', 2, 'cancelled', 'first'),
        row('ended', 3, 'failed', 'older'),
        kept,
      ])?.behind,
    ).toEqual([kept])
  })

  it('a queue with nothing sent answers null', () => {
    expect(
      readStaleResetFromQueue([row('waiting', 1, 'queued', '/clear')]),
    ).toBeNull()
  })

  it('the note counts what was not delivered, in words that fit the count', () => {
    expect(staleResetNoteText(1)).toBe(
      'Convergence restarted during /clear; 1 message behind it was not delivered — send it again.',
    )
    expect(staleResetNoteText(3)).toBe(
      'Convergence restarted during /clear; 3 messages behind it were not delivered — send them again.',
    )
  })
})
