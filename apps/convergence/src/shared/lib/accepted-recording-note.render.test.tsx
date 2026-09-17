import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Markdown } from '@/shared/ui/markdown.container'
import {
  buildRecordingFailedNoteText,
  type RecordingFailedNoteInput,
} from './accepted-recording-note.pure'

/**
 * The recording-failure note, rendered (the MAR-2280 law, MAR-3023 R4).
 *
 * The backend writes this text into the transcript as the honest outcome of a
 * lost recording of an accepted turn: which turn, what was lost, and that the
 * provider's transcript — not the local record — is the source of truth. A
 * string that reads correctly can render as something else once markdown has
 * its way with it, and the note is the one artifact the user reads when the
 * local transcript is known-incomplete, so its meaning is judged here, against
 * the same component the transcript uses.
 */

/** The element that actually holds a phrase, so we can ask what encloses it. */
function leafHolding(container: HTMLElement, text: string): Element {
  const match = Array.from(container.querySelectorAll('*')).find(
    (element) =>
      element.textContent?.includes(text) && element.children.length === 0,
  )
  if (!match) throw new Error(`"${text}" was not rendered at all.`)
  return match
}

function renderNote(input: RecordingFailedNoteInput) {
  return render(<Markdown content={buildRecordingFailedNoteText(input)} />)
}

describe('buildRecordingFailedNoteText rendered', () => {
  it('names the turn, the lost write, and the source of truth — each still its own sentence', () => {
    const container = renderNote({
      turnId: 'turn-fixture-3057',
      label: 'the conversation item',
    }).container

    const turn = leafHolding(container, 'turn-fixture-3057')
    expect(turn.textContent).toContain('turn-fixture-3057')
    // The turn id must not be glued onto a neighbouring word by markdown
    // (closing punctuation is fine; an absorbed character is not).
    expect(turn.textContent).not.toMatch(/turn-fixture-3057\w/)

    const lost = leafHolding(container, 'the conversation item')
    expect(lost.textContent).toContain(
      'could not save the conversation item to the local conversation record',
    )
    const truth = leafHolding(
      container,
      'The provider\u2019s own transcript is the source of truth',
    )
    expect(truth.textContent).toContain('source of truth')
    const noResend = leafHolding(container, 'do not resend it')
    expect(noResend.textContent).toContain(
      'The message was sent; do not resend it',
    )
  })

  it('stays honest without a known turn id: the loss is named, the id is not invented', () => {
    const container = renderNote({
      turnId: null,
      label: 'the turn publication',
    }).container

    expect(container.textContent).toContain('the turn publication')
    expect(container.textContent).toContain('do not resend it')
    // No invented turn id: the parenthetical only exists when the turn is known.
    expect(container.textContent).not.toContain('(turn ')
  })
})
