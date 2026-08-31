import { describe, expect, it } from 'vitest'
import { isTranscriptNearBottom } from './session-transcript-scroll.pure'

describe('isTranscriptNearBottom', () => {
  it('returns true when the scroll position is within the bottom threshold', () => {
    expect(
      isTranscriptNearBottom({
        scrollHeight: 1_000,
        scrollTop: 380,
        clientHeight: 500,
      }),
    ).toBe(true)
  })

  it('returns false when the user has scrolled away from the bottom', () => {
    expect(
      isTranscriptNearBottom({
        scrollHeight: 1_000,
        scrollTop: 300,
        clientHeight: 500,
      }),
    ).toBe(false)
  })
})
