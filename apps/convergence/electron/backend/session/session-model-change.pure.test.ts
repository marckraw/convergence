import { describe, expect, it } from 'vitest'
import {
  MODEL_CHANGED_EVENT_TYPE,
  describeModelChange,
} from './session-model-change.pure'

describe('session-model-change.pure', () => {
  /**
   * The literal is the whole contract across the tree boundary — the renderer
   * matches on it by hand (transcript-entry.presentational.tsx). Pinning it on
   * both sides is what stops a rename here from silently turning every divider
   * back into an ordinary italic note.
   */
  it('pins the wire tag the renderer matches on', () => {
    expect(MODEL_CHANGED_EVENT_TYPE).toBe('session.model-changed')
  })

  it('names both sides of the switch', () => {
    expect(
      describeModelChange(
        { model: 'fable', effort: 'high' },
        { model: 'opus', effort: 'high' },
      ),
    ).toBe(
      'Model changed — fable → opus. Replies above this point came from ' +
        'fable; replies below come from opus.',
    )
  })

  /**
   * The note sits inside the conversation it describes, and the human's own
   * messages are in that conversation. "Everything above this point was written
   * by fable" hands them their own words as the agent's — a rendered sentence
   * making an untrue claim about the transcript it sits in (the MAR-2280
   * family). It may speak for the replies and nothing else.
   */
  it('claims authorship of the replies only, never of what the human wrote', () => {
    const note = describeModelChange(
      { model: 'fable', effort: null },
      { model: 'opus', effort: null },
    )

    expect(note).toContain('Replies above this point came from fable')
    expect(note).not.toMatch(/everything/i)
    expect(note).not.toMatch(/written by/i)
  })

  it('carries the effort along when it moved with the model', () => {
    expect(
      describeModelChange(
        { model: 'fable', effort: 'high' },
        { model: 'opus', effort: 'medium' },
      ),
    ).toContain('fable → opus, effort high → medium.')
  })

  it('says nothing when the model did not change', () => {
    expect(
      describeModelChange(
        { model: 'opus', effort: 'high' },
        { model: 'opus', effort: 'high' },
      ),
    ).toBeNull()
  })

  /**
   * An effort-only change alters how hard the same author thinks, not who the
   * author is, and it is already recorded per turn. A boundary for it would
   * make a session that nudges effort read as one that keeps changing hands.
   */
  it('draws no boundary for an effort-only change', () => {
    expect(
      describeModelChange(
        { model: 'opus', effort: 'high' },
        { model: 'opus', effort: 'max' },
      ),
    ).toBeNull()
  })

  it('names an unset selection as the provider default rather than nothing', () => {
    expect(
      describeModelChange(
        { model: null, effort: null },
        { model: 'opus', effort: 'high' },
      ),
    ).toBe(
      "Model changed — the provider's default → opus, effort default → high. " +
        "Replies above this point came from the provider's default; replies " +
        'below come from opus.',
    )
  })
})
