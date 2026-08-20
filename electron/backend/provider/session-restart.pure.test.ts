import { describe, expect, it } from 'vitest'
import {
  CONTEXT_RESTARTED_NOTE_TEXT,
  SESSION_RESTARTED_EVENT_TYPE,
} from './session-restart.pure'

describe('the conversation-restart boundary', () => {
  /**
   * The renderer matches this literal
   * (`src/widgets/session-view/transcript-entry.presentational.tsx`), because
   * the two trees share no module. Changing the spelling on one side alone
   * turns the boundary back into an ordinary grey note nobody sees, and
   * nothing else would fail -- so it fails here.
   */
  it('keeps the tag the transcript renderer looks for', () => {
    expect(SESSION_RESTARTED_EVENT_TYPE).toBe('session.restarted')
  })

  it('tells the reader what they lost, not what the process did', () => {
    // "A new session id was minted" is true and useless. What changes what
    // the user types next is that the model can no longer see any of it.
    expect(CONTEXT_RESTARTED_NOTE_TEXT).toContain('Context cleared')
    expect(CONTEXT_RESTARTED_NOTE_TEXT).toContain('can no longer see')
    expect(CONTEXT_RESTARTED_NOTE_TEXT).not.toMatch(/session[_ ]?id/i)
  })
})
