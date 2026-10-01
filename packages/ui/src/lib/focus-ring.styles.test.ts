import { describe, expect, it } from 'vitest'
import { cn } from './cn.pure'
import {
  focusRing,
  focusRingField,
  focusRingInset,
  focusRingWithin,
} from './focus-ring.styles'

describe('the focus rings', () => {
  it.each([
    ['focusRing', focusRing, 'focus-visible:', 'outline-offset-0'],
    [
      'focusRingInset',
      focusRingInset,
      'focus-visible:',
      'outline-offset-[calc(var(--focus-width,1px)*-1)]',
    ],
    ['focusRingField', focusRingField, 'focus-visible:', '-outline-offset-1'],
    [
      'focusRingWithin',
      focusRingWithin,
      'has-focus-visible:',
      'outline-offset-0',
    ],
  ])(
    '%s draws a solid ring-colored line only on keyboard focus',
    (_, ring, when, offset) => {
      const classes = ring.split(' ')
      // A width without a style draws nothing after outline-none (Tailwind 4,
      // MAR-3588): name both.
      expect(classes).toEqual(
        expect.arrayContaining([
          `${when}outline-solid`,
          `${when}outline-[length:var(--focus-width,1px)]`,
          `${when}outline-ring`,
          `${when}${offset}`,
        ]),
      )
      // Nothing outside the variant draws a ring at rest.
      expect(classes.filter((name) => name.startsWith('outline-'))).toEqual(
        when === 'focus-visible:' ? ['outline-none'] : [],
      )
    },
  )

  it('survives cn: nothing in a ring cancels another part of it', () => {
    for (const ring of [
      focusRing,
      focusRingInset,
      focusRingField,
      focusRingWithin,
    ]) {
      expect(cn(ring)).toBe(ring)
    }
  })
})
