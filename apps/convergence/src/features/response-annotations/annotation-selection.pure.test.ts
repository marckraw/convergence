import { describe, expect, it } from 'vitest'
import {
  buildAnnotationAnchor,
  toChipExcerpt,
} from './annotation-selection.pure'

const MESSAGE =
  'I rewrote the scheduler so retries back off exponentially. The migration runs in a single transaction, which is the risky part.'

describe('buildAnnotationAnchor', () => {
  it('keeps the quote and the text around it', () => {
    const anchor = buildAnnotationAnchor({
      messageText: MESSAGE,
      selectedText: 'runs in a single transaction',
    })

    expect(anchor?.quotedText).toBe('runs in a single transaction')
    expect(anchor?.prefix).toContain('The migration ')
    expect(anchor?.suffix).toContain(', which is the risky part.')
  })

  it('trims the selection without touching what is inside it', () => {
    const anchor = buildAnnotationAnchor({
      messageText: MESSAGE,
      selectedText: '  retries back off  ',
    })

    expect(anchor?.quotedText).toBe('retries back off')
  })

  it('has no context to give at the very start of a message', () => {
    const anchor = buildAnnotationAnchor({
      messageText: MESSAGE,
      selectedText: 'I rewrote',
    })

    expect(anchor?.prefix).toBe('')
    expect(anchor?.suffix).toBeTruthy()
  })

  it('still returns the quote when the selection crossed rendering boundaries', () => {
    // Selecting across a code block or a list can produce text the rendered
    // message does not contain verbatim. The quote is the payload; only the
    // highlight needs the context, so this ships rather than refuses.
    const anchor = buildAnnotationAnchor({
      messageText: MESSAGE,
      selectedText: 'scheduler exponentially migration',
    })

    expect(anchor).toEqual({
      quotedText: 'scheduler exponentially migration',
      prefix: '',
      suffix: '',
    })
  })

  it('refuses a selection with nothing in it', () => {
    // A whitespace selection is a click, not an intention.
    expect(
      buildAnnotationAnchor({ messageText: MESSAGE, selectedText: '   \n ' }),
    ).toBeNull()
    expect(
      buildAnnotationAnchor({ messageText: MESSAGE, selectedText: '' }),
    ).toBeNull()
  })
})

describe('toChipExcerpt', () => {
  it('flattens a multi-line quote onto one line', () => {
    expect(toChipExcerpt('first line\n\n   second line')).toBe(
      'first line second line',
    )
  })

  it('ellipsises a quote too long for a chip', () => {
    const excerpt = toChipExcerpt(MESSAGE)

    expect(excerpt.endsWith('…')).toBe(true)
    expect(excerpt.length).toBeLessThanOrEqual(81)
  })

  it('leaves a short quote exactly as it reads', () => {
    expect(toChipExcerpt('the risky part')).toBe('the risky part')
  })
})
