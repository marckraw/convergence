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

/**
 * The no-drag rule is about every tooltip, not one of them (MAR-3311 R2).
 *
 * `TooltipContent` renders into a portal that floats over Loom's title-bar
 * region, where an element without `LOOM_NO_DRAG_STYLE` is draggable chrome:
 * the click lands on the window, not on what is underneath it
 * (MAR-3284's law). A rendered test can only read the one tooltip it opens,
 * so six of the seven contents could lose the style and every suite would
 * stay green -- which is how a per-site obligation quietly becomes a
 * per-site accident.
 *
 * So the pin is count equality, not a named site: every `<TooltipContent`
 * these three files write carries the style, and there is at least one.
 * A new tooltip added without it moves one count and not the other.
 */
const TOOLTIP_CONTENT = /<TooltipContent\b/g

// The opening tag, read to its `>`: `[^>]` crosses newlines, so a tag broken
// over several lines still matches as one.
const TOOLTIP_CONTENT_TAG = /<TooltipContent\b[^>]*>/g

const NO_DRAG = 'style={LOOM_NO_DRAG_STYLE}'

describe('MAR-3311 R2: every Loom tooltip is no-drag, not just the read one', () => {
  it.each(FOLDED_COLUMN)('%s gives every tooltip the no-drag style', (file) => {
    const source = readFileSync(resolve(__dirname, file), 'utf8')
    const written = source.match(TOOLTIP_CONTENT) ?? []
    const noDrag = (source.match(TOOLTIP_CONTENT_TAG) ?? []).filter((tag) =>
      tag.includes(NO_DRAG),
    )
    // Mutation: drop the style from ANY one `TooltipContent` in any of the
    // three files -> red here, and nowhere else.
    expect(written.length).toBeGreaterThan(0)
    expect(noDrag.length).toBe(written.length)
  })
})
