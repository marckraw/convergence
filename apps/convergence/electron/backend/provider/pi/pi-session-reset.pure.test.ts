import { describe, expect, it } from 'vitest'
import {
  buildPiResetFailureNote,
  PI_RESET_VETOED_REASON,
  readPiNewSessionVerdict,
  readPiSessionFile,
} from './pi-session-reset.pure'

describe('readPiNewSessionVerdict (MAR-3215)', () => {
  it('reads the measured unvetoed answer as a switch', () => {
    expect(
      readPiNewSessionVerdict({ success: true, data: { cancelled: false } }),
    ).toEqual({ kind: 'switched' })
  })

  it('reads a successful response carrying cancelled: true as a veto — read success alone turns red', () => {
    expect(
      readPiNewSessionVerdict({ success: true, data: { cancelled: true } }),
    ).toEqual({ kind: 'cancelled' })
  })

  it('reads a failed response as a refusal and keeps its error', () => {
    expect(
      readPiNewSessionVerdict({ success: false, error: 'no session manager' }),
    ).toEqual({ kind: 'refused', error: 'no session manager' })
    expect(readPiNewSessionVerdict({ success: false })).toEqual({
      kind: 'refused',
      error: 'unknown error',
    })
  })
})

describe('readPiSessionFile (MAR-3215)', () => {
  it('names the file get_state reports', () => {
    expect(
      readPiSessionFile({
        success: true,
        data: { sessionFile: '/s/two.jsonl', sessionId: 'x' },
      }),
    ).toBe('/s/two.jsonl')
  })

  it('names nothing for --no-session, an empty path, or a failed read', () => {
    expect(
      readPiSessionFile({ success: true, data: { sessionId: 'x' } }),
    ).toBeNull()
    expect(
      readPiSessionFile({ success: true, data: { sessionFile: '' } }),
    ).toBeNull()
    expect(
      readPiSessionFile({
        success: false,
        data: { sessionFile: '/s/two.jsonl' },
      }),
    ).toBeNull()
    expect(readPiSessionFile({ success: true, data: 'nope' })).toBeNull()
  })
})

describe('buildPiResetFailureNote (MAR-3215)', () => {
  it('says the previous conversation is still the one the next message resumes', () => {
    expect(buildPiResetFailureNote(PI_RESET_VETOED_REASON)).toBe(
      'Could not clear the conversation: a Pi extension cancelled the new session. The previous conversation is still active; your next message will resume it.',
    )
  })
})
