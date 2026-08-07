import { describe, expect, it } from 'vitest'
import { compileAnnotationsIntoPrompt } from './response-annotation-compile.pure'
import type { ResponseAnnotation } from './response-annotation.types'

/**
 * These assertions ARE the specification of what the model sees. They are
 * written as whole-output comparisons on purpose: a partial match would let
 * the format drift a line at a time without anything going red.
 */

const LATEST = 'msg-latest'

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
    createdAt: '2026-08-06T10:00:00.000Z',
    ...overrides,
  }
}

describe('compileAnnotationsIntoPrompt', () => {
  it('quotes the excerpt and puts the response under it', () => {
    const compiled = compileAnnotationsIntoPrompt(
      [
        annotation({
          quotedText: 'The migration runs in a single transaction.',
          body: 'This is the part I disagree with.',
        }),
      ],
      '',
      LATEST,
    )

    expect(compiled).toBe(
      [
        'Responding to specific parts of your message:',
        '',
        '> The migration runs in a single transaction.',
        'This is the part I disagree with.',
      ].join('\n'),
    )
  })

  it('keeps the order it was given rather than sorting by creation time', () => {
    // Reading order is a property of the transcript, which a pure function
    // cannot see. Timestamps here are deliberately reversed: whoever captured
    // these knows the document order, and the compiler must not second-guess it.
    const compiled = compileAnnotationsIntoPrompt(
      [
        annotation({
          id: 'first-in-document',
          quotedText: 'Paragraph one.',
          body: 'Answering the top of the message.',
          createdAt: '2026-08-06T12:00:00.000Z',
        }),
        annotation({
          id: 'second-in-document',
          quotedText: 'Paragraph two.',
          body: 'Answering the bottom of the message.',
          createdAt: '2026-08-06T10:00:00.000Z',
        }),
      ],
      '',
      LATEST,
    )

    expect(compiled).toBe(
      [
        'Responding to specific parts of your message:',
        '',
        '> Paragraph one.',
        'Answering the top of the message.',
        '',
        '> Paragraph two.',
        'Answering the bottom of the message.',
      ].join('\n'),
    )
  })

  it('renders an emoji reaction exactly like a comment', () => {
    // Ruling 2: a reaction is a comment with an emoji body. If this ever needs
    // its own branch, the ruling has been broken somewhere upstream.
    const compiled = compileAnnotationsIntoPrompt(
      [
        annotation({
          quotedText: 'I rewrote the scheduler.',
          body: '👍',
          kind: 'reaction',
        }),
      ],
      '',
      LATEST,
    )

    expect(compiled).toBe(
      [
        'Responding to specific parts of your message:',
        '',
        '> I rewrote the scheduler.',
        '👍',
      ].join('\n'),
    )
  })

  it('says when a quote came from an earlier message', () => {
    // Without the label, a quote from three messages ago reads as a quote from
    // the message the model just wrote.
    const compiled = compileAnnotationsIntoPrompt(
      [
        annotation({ quotedText: 'The newest claim.', body: 'Agreed.' }),
        annotation({
          messageId: 'msg-older',
          quotedText: 'Something said a while back.',
          body: 'Still bothers me.',
        }),
      ],
      '',
      LATEST,
    )

    expect(compiled).toBe(
      [
        'Responding to specific parts of your message:',
        '',
        '> The newest claim.',
        'Agreed.',
        '',
        '(from your earlier message)',
        '> Something said a while back.',
        'Still bothers me.',
      ].join('\n'),
    )
  })

  it('labels nothing when there is no latest message to compare against', () => {
    // Calling everything "earlier" when the answer is unknown would be a claim
    // the caller never made.
    const compiled = compileAnnotationsIntoPrompt(
      [annotation({ messageId: 'msg-whatever', quotedText: 'A line.' })],
      '',
      null,
    )

    expect(compiled).not.toContain('(from your earlier message)')
  })

  it('prefixes every line of a multi-line quote', () => {
    // A bare newline inside a blockquote is a lazy continuation in markdown:
    // the agent's own line breaks would silently collapse.
    const compiled = compileAnnotationsIntoPrompt(
      [
        annotation({
          quotedText: 'First line.\n\nThird line, after a blank one.',
          body: 'All of this.',
        }),
      ],
      '',
      LATEST,
    )

    expect(compiled).toBe(
      [
        'Responding to specific parts of your message:',
        '',
        '> First line.',
        '>',
        '> Third line, after a blank one.',
        'All of this.',
      ].join('\n'),
    )
  })

  it('quotes verbatim apart from outer whitespace', () => {
    const compiled = compileAnnotationsIntoPrompt(
      [
        annotation({
          quotedText: '  spaced   out   words  and  `code`  ',
          body: 'x',
        }),
      ],
      '',
      LATEST,
    )

    expect(compiled).toContain('> spaced   out   words  and  `code`')
  })

  it('appends the composer text after the annotations', () => {
    const compiled = compileAnnotationsIntoPrompt(
      [annotation({ quotedText: 'A claim.', body: 'Why?' })],
      'Also, please rerun the tests.',
      LATEST,
    )

    expect(compiled).toBe(
      [
        'Responding to specific parts of your message:',
        '',
        '> A claim.',
        'Why?',
        '',
        'Also, please rerun the tests.',
      ].join('\n'),
    )
  })

  it('sends a quote with no comment as the quote alone', () => {
    // Selecting something and sending it unremarked is still a message: "this
    // part". Better than swallowing the selection.
    const compiled = compileAnnotationsIntoPrompt(
      [annotation({ quotedText: 'This bit.' })],
      '',
      LATEST,
    )

    expect(compiled).toBe(
      ['Responding to specific parts of your message:', '', '> This bit.'].join(
        '\n',
      ),
    )
  })

  it('returns free text byte-identical when nothing was annotated', () => {
    // Someone who never selected anything must not be able to tell this
    // feature exists — no header, no reflow, not even a trimmed newline.
    const freeText = '  Just a normal message.\n\nWith its own spacing.  '

    expect(compileAnnotationsIntoPrompt([], freeText, LATEST)).toBe(freeText)
    expect(compileAnnotationsIntoPrompt([], '', LATEST)).toBe('')
  })

  it('falls back to the free text when every annotation lost its quote', () => {
    // A comment with nothing to quote is a comment floating free of the thing
    // it answers — the failure this feature exists to end.
    expect(
      compileAnnotationsIntoPrompt(
        [annotation({ quotedText: '   ', body: 'Orphaned.' })],
        'Carry on.',
        LATEST,
      ),
    ).toBe('Carry on.')
  })
})
