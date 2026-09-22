import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * One tooltip for the whole app, in Loom's folded column (MAR-3311 R3).
 *
 * A hover hint is the shared `Tooltip`; the native attribute is for a clamped
 * text's full value and nothing else. The two are not interchangeable: the OS
 * hint waits about a second, ignores the app's theme, and cannot be styled,
 * so a column wearing both whispers twice and disagrees with itself once the
 * count moves.
 *
 * The hovers themselves are pinned in `wave-panel.render.test.tsx`
 * (MAR-3311 R1/R2). This file pins the absence, which no hover can: a hint
 * added back beside a working tooltip breaks nothing a rendered test reads,
 * and would come back one control at a time.
 *
 * The row's own hint (`wave-row.presentational.tsx`) is deliberately NOT in
 * this set -- it is a clamped issue title's full value, the one use that
 * keeps the attribute.
 */
const FOLDED_COLUMN = [
  'loom-strip.presentational.tsx',
  'loom-compact.presentational.tsx',
  'loom-expanded.presentational.tsx',
] as const

const NATIVE_HINT = /\btitle=/

describe('MAR-3311 R3: the folded column cannot grow an OS hint again', () => {
  it.each(FOLDED_COLUMN)('%s hands no hint to the OS', (file) => {
    const source = readFileSync(resolve(__dirname, file), 'utf8')
    // Mutation: add a native hint to any of the three -> red.
    expect(source).not.toMatch(NATIVE_HINT)
  })
})

/**
 * The provider those tooltips hang from (MAR-3311 R1).
 *
 * Radix throws "`Tooltip` must be used within `TooltipProvider`" with no
 * provider above it, so removing the root one does not degrade Loom -- it
 * takes the panel out with an exception. Nothing else would catch that: the
 * suites that mount Loom alone bring their own provider
 * (`loom-tooltip.fixture.tsx`), which is exactly why the real one has to be
 * pinned where it actually lives. One provider, so one delay and one look for
 * the whole app -- Loom deliberately does not mount its own.
 */
describe('MAR-3311 R1: the app mounts the one provider, above the shell', () => {
  it('App.container wraps AppShell in a TooltipProvider', () => {
    const source = readFileSync(
      resolve(__dirname, '../../app/App.container.tsx'),
      'utf8',
    )
    // Read as two facts, not one line: the provider is mounted, and the
    // shell it has to cover comes after it. Anchoring on the two being
    // adjacent would go red the day something legitimately sits between
    // them, which is not the question this asks.
    // Mutation: drop the provider, or move it below AppShell -> red.
    const provider = source.indexOf('<TooltipProvider')
    const shell = source.indexOf('<AppShell')
    expect(provider).toBeGreaterThan(-1)
    expect(shell).toBeGreaterThan(provider)
  })
})
