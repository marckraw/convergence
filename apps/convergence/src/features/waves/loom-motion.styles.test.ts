import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  LOOM_ENTER_CLASS,
  LOOM_ENTER_MS,
  LOOM_SHELL_CLASS,
  LOOM_SLIDE_MS,
} from './wave-panel.styles'

/**
 * Loom's fold names a duration in three currencies (MAR-3312 R1/R3): the
 * shell's `duration-200`, the `--animate-loom-enter` delay that holds the
 * arriving shape back until the width has landed, and the timer in
 * `wave-panel.container.tsx` that takes `slide` off again. A rendered test
 * can read the first and the third; only the stylesheet holds the second,
 * and nothing else in the suite would notice it drifting.
 *
 * It would also not notice the utility VANISHING. `animate-loom-enter` is a
 * theme entry, not a built-in: the obvious reach here was `animate-in
 * fade-in-0`, which is `tailwindcss-animate` -- a transitive dependency of
 * `@ef-global/backpack` that this app's Tailwind v4 never loads, so those
 * class names emit no CSS at all and the fade would have been decoration
 * that every gate passed. Delete the theme entry or the keyframes and this
 * test is the one thing that goes red.
 */
const GLOBAL_CSS = readFileSync(
  resolve(__dirname, '../../app/global.css'),
  'utf8',
)

describe('MAR-3312: the fold`s motion is declared where it is used', () => {
  it('`animate-loom-enter` is a real utility with real keyframes', () => {
    expect(LOOM_ENTER_CLASS).toContain('animate-loom-enter')
    expect(GLOBAL_CSS).toContain('--animate-loom-enter:')
    expect(GLOBAL_CSS).toMatch(/@keyframes\s+loom-enter\s*\{/)
  })

  it('the fade waits exactly as long as the shell takes to travel', () => {
    const declared =
      /--animate-loom-enter:\s*loom-enter\s+(\d+)ms\s+[a-z-]+\s+(\d+)ms\s+both\s*;/.exec(
        GLOBAL_CSS,
      )
    expect(
      declared,
      'the theme entry no longer has the expected shape',
    ).toBeTruthy()
    // The fade's own length, and the delay that is the SHELL's length.
    expect(Number(declared![1])).toBe(LOOM_ENTER_MS)
    expect(Number(declared![2])).toBe(LOOM_SLIDE_MS)
    // ...and the shell really does take that long. Mutation: change
    // `duration-200` to `duration-300` -> red, because the icons would then
    // arrive on a column still shrinking.
    expect(LOOM_SHELL_CLASS).toContain(`duration-${LOOM_SLIDE_MS}`)
  })

  it('reduced motion stays a class on both halves', () => {
    expect(LOOM_SHELL_CLASS).toContain('motion-reduce:transition-none')
    expect(LOOM_ENTER_CLASS).toContain('motion-reduce:animate-none')
  })
})
