import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Markdown } from '@/shared/ui/markdown.container'
import { compileAnnotationsIntoPrompt } from './response-annotation-compile.pure'
import type { ResponseAnnotation } from './response-annotation.types'

/**
 * The doctrine, rendered (MAR-2280).
 *
 * The whole-output tests beside this file pin every character of the compiled
 * prompt — and still let a bug ship, because a string that reads correctly can
 * render as something else entirely. Markdown's lazy continuation absorbs a
 * plain line directly under a blockquote *into* that blockquote, so Marcin's
 * own words came out looking like part of what the agent said.
 *
 * These tests close that class: they put the compiled text through the same
 * component the transcript uses and ask the DOM where the words actually
 * landed. Anything asserting the format's *meaning* rather than its bytes
 * belongs here.
 */

const LATEST = 'msg-latest'
const QUOTE = 'The migration runs in a single transaction.'
const RESPONSE = 'This is the part that worries me.'

function annotation(
  overrides: Partial<ResponseAnnotation> & { quotedText: string },
): ResponseAnnotation {
  return {
    id: 'ann-1',
    messageId: LATEST,
    prefix: '',
    suffix: '',
    body: '',
    kind: 'comment',
    state: 'pending',
    createdAt: '2026-08-07T10:00:00.000Z',
    ...overrides,
  }
}

/** Where a phrase ended up: inside the quote, or standing on its own. */
function isInsideBlockquote(container: HTMLElement, text: string): boolean {
  const match = Array.from(container.querySelectorAll('*')).find(
    (element) =>
      element.textContent?.includes(text) && element.children.length === 0,
  )
  if (!match) {
    throw new Error(`"${text}" was not rendered at all.`)
  }
  return match.closest('blockquote') !== null
}

describe('the compiled prompt, rendered', () => {
  it('keeps the human response outside the quote', () => {
    // The field bug, in one assertion: a markdown-literate model reading this
    // sees the human's words as part of its own quoted sentence.
    const { container } = render(
      <Markdown
        content={compileAnnotationsIntoPrompt(
          [annotation({ quotedText: QUOTE, body: RESPONSE })],
          '',
          LATEST,
        )}
      />,
    )

    expect(isInsideBlockquote(container, QUOTE)).toBe(true)
    expect(isInsideBlockquote(container, RESPONSE)).toBe(false)
  })

  it('keeps an emoji reaction outside the quote too', () => {
    // A reaction is a comment with an emoji body, so it must not render as a
    // 👍 the agent apparently typed itself.
    const { container } = render(
      <Markdown
        content={compileAnnotationsIntoPrompt(
          [annotation({ quotedText: QUOTE, body: '👍', kind: 'reaction' })],
          '',
          LATEST,
        )}
      />,
    )

    expect(isInsideBlockquote(container, '👍')).toBe(false)
  })

  it('keeps every line of a multi-line quote inside the quote', () => {
    const { container } = render(
      <Markdown
        content={compileAnnotationsIntoPrompt(
          [
            annotation({
              quotedText: 'First line.\n\nThird line, after a blank one.',
              body: RESPONSE,
            }),
          ],
          '',
          LATEST,
        )}
      />,
    )

    expect(isInsideBlockquote(container, 'First line.')).toBe(true)
    expect(
      isInsideBlockquote(container, 'Third line, after a blank one.'),
    ).toBe(true)
    expect(isInsideBlockquote(container, RESPONSE)).toBe(false)
  })

  it('keeps the earlier-message label outside the quote, and its own response too', () => {
    const { container } = render(
      <Markdown
        content={compileAnnotationsIntoPrompt(
          [
            annotation({
              messageId: 'msg-older',
              quotedText: QUOTE,
              body: RESPONSE,
            }),
          ],
          '',
          LATEST,
        )}
      />,
    )

    expect(isInsideBlockquote(container, '(from your earlier message)')).toBe(
      false,
    )
    expect(isInsideBlockquote(container, QUOTE)).toBe(true)
    expect(isInsideBlockquote(container, RESPONSE)).toBe(false)
  })

  it('keeps the composer text outside every quote', () => {
    const freeText = 'Otherwise it looks good.'
    const { container } = render(
      <Markdown
        content={compileAnnotationsIntoPrompt(
          [annotation({ quotedText: QUOTE, body: RESPONSE })],
          freeText,
          LATEST,
        )}
      />,
    )

    expect(isInsideBlockquote(container, freeText)).toBe(false)
  })
})
