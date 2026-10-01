import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { durationsMs, easings } from './tokens'

const css = readFileSync(
  join(__dirname, '../styles/tokens.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

/** The first (full-motion) value of a custom property in tokens.css. */
const token = (name: string): string => {
  const value = css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]
  if (value === undefined) throw new Error(`tokens.css has no --${name}`)
  return value.trim()
}

const milliseconds = (value: string): number =>
  value.endsWith('ms')
    ? Number.parseFloat(value)
    : Number.parseFloat(value) * 1000

/** The CSS easing keywords, as the spec defines them. */
const KEYWORDS: Record<string, number[]> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
}

const bezier = (value: string): number[] =>
  KEYWORDS[value] ??
  (value.match(/^cubic-bezier\((.+)\)$/)?.[1] ?? '').split(',').map(Number)

describe('the motion tokens in code match tokens.css', () => {
  it.each([
    ['exit', 'motion-exit'],
    ['fast', 'motion-fast'],
    ['panel', 'motion-panel'],
    ['slow', 'motion-slow'],
    ['pulse', 'motion-pulse'],
    ['loop', 'motion-loop'],
    ['blink', 'motion-blink'],
    ['wire', 'motion-wire'],
    ['breath', 'motion-breath'],
    ['tooltipDelay', 'motion-tooltip-delay'],
  ] as const)('durationsMs.%s is --%s', (key, name) => {
    expect(durationsMs[key]).toBe(milliseconds(token(name)))
  })

  it.each([
    ['out', 'motion-ease'],
    ['in', 'motion-ease-in'],
    ['move', 'motion-ease-move'],
    ['enter', 'motion-ease-enter'],
    ['exit', 'motion-ease-exit'],
    ['guide', 'motion-ease-guide'],
    ['blink', 'motion-ease-blink'],
  ] as const)('easings.%s is --%s', (key, name) => {
    expect([...easings[key]]).toEqual(bezier(token(name)))
  })

  it('keeps today’s values, so nothing moves differently (MAR-3615)', () => {
    expect(token('motion-exit')).toBe('100ms')
    expect(token('motion-fast')).toBe('150ms')
    expect(token('motion-panel')).toBe('200ms')
    expect(token('motion-slow')).toBe('350ms')
    expect(token('motion-shift')).toBe('8px')
    expect(token('motion-scale-from')).toBe('0.95')
    expect(token('motion-loops')).toBe('infinite')
    // Two different "ease-out"s, kept apart: Tailwind's class and the CSS
    // keyword the popups' shorthands use today.
    expect(token('motion-ease')).toBe('cubic-bezier(0, 0, 0.2, 1)')
    expect(token('motion-ease-enter')).toBe('ease-out')
  })
})

describe('reduced motion in tokens.css', () => {
  const reduced = {
    'the system setting':
      css.match(
        /@media \(prefers-reduced-motion: reduce\) \{\s*:root \{([\s\S]*?)\}/,
      )?.[1] ?? '',
    'data-motion="reduced"':
      css.match(/\[data-motion='reduced'\] \{([\s\S]*?)\}/)?.[1] ?? '',
  }

  it.each(Object.entries(reduced))(
    'stops travel and scaling for %s',
    (_, block) => {
      expect(block).toMatch(/--motion-shift:\s*0px;/)
      expect(block).toMatch(/--motion-scale-from:\s*1;/)
    },
  )

  it.each(Object.entries(reduced))('stands a loop still for %s', (_, block) => {
    expect(block).toMatch(/--motion-loops:\s*0;/)
  })

  it.each(Object.entries(reduced))(
    'keeps every duration and easing for %s, so fades stay',
    (_, block) => {
      expect(block).not.toMatch(
        /--motion-(exit|fast|panel|slow|pulse|loop|blink|wire|breath|tooltip-delay|ease[a-z-]*):/,
      )
    },
  )
})
