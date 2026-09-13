import { describe, expect, it } from 'vitest'
import {
  formatAnnotationCount,
  moveAlongStrip,
  neighbourAfterRemoval,
  resolveTabStop,
  stripNavigationTarget,
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

  it('keeps a quote of exactly five words whole, with no ellipsis', () => {
    expect(toPillQuote('The migration runs in transactions')).toBe(
      'The migration runs in transactions',
    )
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

  it('shows nothing for an empty or whitespace-only body, not an ellipsis', () => {
    expect(toPillBody('')).toBe('')
    expect(toPillBody(' \n\t ')).toBe('')
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

describe('stripNavigationTarget', () => {
  const plain = {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    fromTextField: false,
  }

  it('walks the row for a plain arrow press on a pill', () => {
    expect(stripNavigationTarget(3, { ...plain, key: 'ArrowRight' }, 14)).toBe(
      4,
    )
    expect(stripNavigationTarget(3, { ...plain, key: 'End' }, 14)).toBe(13)
  })

  it('leaves every key to a text field, where arrows move the caret', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      expect(
        stripNavigationTarget(3, { ...plain, key, fromTextField: true }, 14),
      ).toBeNull()
    }
  })

  it('leaves a modified arrow alone, whatever the modifier', () => {
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      expect(
        stripNavigationTarget(
          3,
          { ...plain, key: 'ArrowLeft', [modifier]: true },
          14,
        ),
      ).toBeNull()
    }
  })
})

describe('resolveTabStop', () => {
  const ids = ['a', 'b', 'c']

  it('is the first pill when nothing has been focused or opened', () => {
    expect(resolveTabStop(ids, null, null)).toBe('a')
  })

  it('follows the pill the arrows left focus on', () => {
    expect(resolveTabStop(ids, null, 'c')).toBe('c')
  })

  it('is the open item whenever one is open', () => {
    expect(resolveTabStop(ids, 'b', 'c')).toBe('b')
  })

  it('falls back to the first pill when the remembered one is gone', () => {
    expect(resolveTabStop(ids, 'gone', 'also-gone')).toBe('a')
    expect(resolveTabStop([], null, null)).toBeNull()
  })
})

describe('neighbourAfterRemoval', () => {
  it('is the pill after the removed one', () => {
    expect(neighbourAfterRemoval(['a', 'b', 'c'], 'b')).toBe('c')
  })

  it('is the pill before when the last one goes', () => {
    expect(neighbourAfterRemoval(['a', 'b', 'c'], 'c')).toBe('b')
  })

  it('is nowhere when the only one goes, or the id is not in the row', () => {
    expect(neighbourAfterRemoval(['a'], 'a')).toBeNull()
    expect(neighbourAfterRemoval(['a', 'b'], 'x')).toBeNull()
  })
})
