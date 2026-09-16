import { describe, expect, it } from 'vitest'
import { buildRecordingFailedNoteText } from './accepted-recording-note.pure'

/**
 * The bytes of the recording-failure note (MAR-3023 R4). The rendered format
 * is judged in `accepted-recording-note.render.test.tsx` (the MAR-2280 law);
 * these pin the pieces the renderer does not care about.
 */
describe('buildRecordingFailedNoteText', () => {
  it('names the lost write, the turn, the source of truth, and the no-resend rule', () => {
    expect(
      buildRecordingFailedNoteText({
        turnId: 'turn-fixture',
        label: 'the conversation item',
      }),
    ).toBe(
      'This turn was accepted and may still be running, but Convergence ' +
        'could not save the conversation item to the local conversation ' +
        'record (turn turn-fixture). The local transcript for this turn may ' +
        'be incomplete. The provider\u2019s own transcript is the source of ' +
        'truth for what happened in it. The message was sent; do not resend ' +
        'it because of this warning.',
    )
  })

  it('omits the turn parenthetical when the turn is unknown, inventing nothing', () => {
    const text = buildRecordingFailedNoteText({
      turnId: null,
      label: 'the turn publication',
    })
    expect(text).toContain('could not save the turn publication')
    expect(text).not.toContain('(turn ')
    expect(text).toContain('do not resend it')
  })
})
