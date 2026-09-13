import { describe, expect, it } from 'vitest'
import {
  formatAnnotationCount,
  moveAlongStrip,
  toPillBody,
  toPillQuote,
} from './annotation-strip.pure'

/**
 * The compact pill's words (MAR-3004). A pill has to be recognisable at a
 * glance and never grow a row: the quote's first few words, then the first
 * few of the response. The full text still travels on send — this is only how
 * it waits.
 */
describe('toPillQuote', () => {
  it('keeps a short quote whole', () => {
    expect(toPillQuote('The migration')).toBe('The migration')
  })

  it('cuts a long quote to its first five words', () => {
    expect(
      toPillQuote('I rewrote the scheduler so retries back off exponentially.'),
    ).toBe('I rewrote the scheduler so…')
  })

  it('reads a multi-line quote as one line', () => {
    expect(toPillQuote('Line one\nline two')).toBe('Line one line two')
    expect(toPillQuote('A\r\nB')).toBe('A B')
  })
})

describe('toPillBody', () => {
  it('keeps a reaction exactly as written', () => {
    expect(toPillBody('👍')).toBe('👍')
  })

  it('cuts a long comment to its first four words', () => {
    expect(toPillBody('What happens if it times out halfway through?')).toBe(
      'What happens if it…',
    )
  })
})

describe('formatAnnotationCount', () => {
  it('is honest about one', () => {
    expect(formatAnnotationCount(1)).toBe('1 annotation')
  })

  it('pluralises everything else', () => {
    expect(formatAnnotationCount(14)).toBe('14 annotations')
  })
})

describe('moveAlongStrip', () => {
  it('moves one pill along with the arrow keys, stopping at the ends', () => {
    expect(moveAlongStrip(0, 'ArrowRight', 14)).toBe(1)
    expect(moveAlongStrip(5, 'ArrowLeft', 14)).toBe(4)
    expect(moveAlongStrip(13, 'ArrowRight', 14)).toBe(13)
    expect(moveAlongStrip(0, 'ArrowLeft', 14)).toBe(0)
  })

  it('jumps to the ends with Home and End', () => {
    expect(moveAlongStrip(7, 'Home', 14)).toBe(0)
    expect(moveAlongStrip(7, 'End', 14)).toBe(13)
  })

  it('does not claim keys that are not navigation', () => {
    expect(moveAlongStrip(3, 'Enter', 14)).toBeNull()
    expect(moveAlongStrip(3, 'a', 14)).toBeNull()
  })
})
