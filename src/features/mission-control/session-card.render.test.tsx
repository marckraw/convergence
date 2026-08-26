import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { SessionSummary } from '@/entities/session'
import type { SessionCrew } from '@/entities/session-crew'
import type { SessionCard } from './mission-control.types'
import { SessionCardView } from './session-card.presentational'
import { CARD_BREATHE } from './session-card.styles'

/**
 * The working card, rendered.
 *
 * A card that is working glares in its crew's colour, so the room says who is
 * busy from across it. The colour is runtime data, so it can only arrive as an
 * inline custom property -- a class name assembled at render time is a class
 * the build never emits. These tests ask the DOM what the card actually
 * carries.
 *
 * The last two groups read `global.css` instead of the DOM on purpose: the
 * breath is a stylesheet animation and `prefers-reduced-motion` is a media
 * query, and jsdom evaluates neither. The stylesheet is where that promise is
 * kept, so the stylesheet is where it is checked.
 */

function crew(id: string, accentColor: string | null): SessionCrew {
  return {
    id,
    name: id,
    emoji: null,
    accentColor,
    position: 0,
    createdAt: '2026-08-25T10:00:00.000Z',
    updatedAt: '2026-08-25T10:00:00.000Z',
    sessionIds: [],
  }
}

function makeCard(
  status: SessionSummary['status'],
  crews: SessionCrew[] = [],
): SessionCard {
  return {
    session: {
      id: 'session-1',
      name: 'Breathing session',
      status,
      attention: 'none',
      activity: null,
      model: null,
      updatedAt: '2026-08-25T10:00:00.000Z',
    } as SessionSummary,
    projectName: 'Convergence',
    providerLabel: 'Claude Code',
    activityLabel: status === 'running' ? 'working' : 'idle',
    crews,
    searchText: 'breathing session',
  }
}

function renderCard(card: SessionCard): HTMLElement {
  const { container } = render(
    <SessionCardView
      card={card}
      hailOpen={false}
      onOpen={() => {}}
      onHail={() => {}}
    />,
  )
  const root = container.querySelector<HTMLElement>('[data-session-card]')
  if (!root) throw new Error('the card did not render at all.')
  return root
}

describe('a working session card breathes', () => {
  it('glows in its crew colour while running', () => {
    const root = renderCard(makeCard('running', [crew('ops', '#ff8800')]))

    expect(root.dataset.breathing).toBe('true')
    expect(root.style.getPropertyValue('--breathe-color')).toBe('#ff8800')
  })

  it('glows in the neutral working hue when no crew holds it', () => {
    const root = renderCard(makeCard('running'))

    expect(root.dataset.breathing).toBe('true')
    expect(root.style.getPropertyValue('--breathe-color')).toBe(
      CARD_BREATHE.neutralColor,
    )
  })

  it('does not glow at all when the session is not working', () => {
    const root = renderCard(makeCard('idle', [crew('ops', '#ff8800')]))

    expect(root.dataset.breathing).toBeUndefined()
    expect(root.style.getPropertyValue('--breathe-color')).toBe('')
  })
})

const GLOW_SELECTOR = "[data-breathing='true']::after"
const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)'

// Resolved from the repo root: vitest runs from there, and under jsdom
// `import.meta.url` is not a file URL.
const GLOBAL_CSS = readFileSync(resolve('src/app/global.css'), 'utf8')

/** Every balanced `{ ... }` body opened by this exact selector. */
function bodiesFor(css: string, selector: string): string[] {
  const bodies: string[] = []
  let from = 0

  for (;;) {
    const at = css.indexOf(selector, from)
    if (at < 0) return bodies

    const open = css.indexOf('{', at + selector.length)
    // Only a body opened directly by this selector counts; anything else is a
    // later mention of the same text.
    if (open < 0 || css.slice(at + selector.length, open).trim() !== '') {
      from = at + selector.length
      continue
    }

    let depth = 0
    let end = open
    while (end < css.length) {
      if (css[end] === '{') depth += 1
      if (css[end] === '}') {
        depth -= 1
        if (depth === 0) break
      }
      end += 1
    }

    bodies.push(css.slice(open + 1, end))
    from = end
  }
}

const BREATHE_KEYFRAMES = '@keyframes session-card-breathe'

/** The `stop { ... }` steps of a `@keyframes` body, in source order. */
function keyframeSteps(
  body: string,
): { stops: string[]; declarations: string }[] {
  const steps: { stops: string[]; declarations: string }[] = []
  let from = 0

  for (;;) {
    const open = body.indexOf('{', from)
    const close = open < 0 ? -1 : body.indexOf('}', open)
    if (close < 0) return steps

    steps.push({
      stops: body
        .slice(from, open)
        .split(',')
        .map((stop) => stop.trim())
        .filter(Boolean),
      declarations: body.slice(open + 1, close),
    })
    from = close + 1
  }
}

/**
 * The `opacity` declaration of a declaration block, anchored to a declaration
 * boundary: the start of the block, or a `;`.
 *
 * An unanchored `opacity:` matches `--opacity:` just as happily, so renaming a
 * declaration to a custom property would stop painting while this test stayed
 * green.
 */
const OPACITY_DECLARATION = /(?:^|;)\s*opacity:\s*([^;]+)/

/** The opacity a block declares, or `undefined` if it declares none. */
function declaredOpacity(declarations: string): string | undefined {
  return OPACITY_DECLARATION.exec(declarations)?.[1].trim()
}

/** Every stop of a `@keyframes` body mapped to the opacity its step declares. */
function opacityByStop(body: string): Map<string, string> {
  const opacities = new Map<string, string>()

  for (const step of keyframeSteps(body)) {
    const opacity = declaredOpacity(step.declarations)
    if (!opacity) continue
    for (const stop of step.stops) opacities.set(stop, opacity)
  }

  return opacities
}

describe('the breath actually moves', () => {
  it('travels from the min knob at both ends to the max knob at the midpoint', () => {
    const blocks = bodiesFor(GLOBAL_CSS, BREATHE_KEYFRAMES)

    expect(blocks).toHaveLength(1)
    const opacity = opacityByStop(blocks[0])

    // Asserting the keyframes merely exist proves nothing: flatten the
    // midpoint to `--breathe-min` and the glow holds perfectly still while
    // every other test here stays green. The shape is the feature.
    expect(opacity.get('0%')).toBe('var(--breathe-min)')
    expect(opacity.get('100%')).toBe('var(--breathe-min)')
    expect(opacity.get('50%')).toBe('var(--breathe-max)')
    expect(opacity.get('50%')).not.toBe(opacity.get('0%'))
  })

  it('is handed two knobs that span a real range of opacity', () => {
    // The keyframes can name two different properties and still stand
    // perfectly still if both knobs are tuned to the same number -- and two
    // different numbers are not enough either, because CSS clamps opacity into
    // [0, 1], so a 1 -> 2 breath renders as 1 -> 1. The knobs have to travel
    // inside the range the browser will actually paint.
    expect(CARD_BREATHE.minOpacity).toBeGreaterThanOrEqual(0)
    expect(CARD_BREATHE.minOpacity).toBeLessThan(CARD_BREATHE.maxOpacity)
    expect(CARD_BREATHE.maxOpacity).toBeLessThanOrEqual(1)
  })
})

describe('the breathing glow under prefers-reduced-motion', () => {
  it('renders the glare without the breath', () => {
    const reducedBlocks = bodiesFor(GLOBAL_CSS, REDUCED_MOTION).flatMap(
      (block) => bodiesFor(block, GLOW_SELECTOR),
    )

    expect(reducedBlocks).toHaveLength(1)
    expect(reducedBlocks[0]).toMatch(/animation:\s*none/)
    // The information survives; only the motion goes. A reduced-motion block
    // that also killed the shadow would delete the fact the card is working.
    expect(reducedBlocks[0]).not.toMatch(/box-shadow/)
  })

  it('leaves a glow behind for that block to hold still', () => {
    // The base rule is the one outside any reduced-motion block, found by
    // removing those blocks rather than by trusting the order of the file.
    const outsideMedia = bodiesFor(GLOBAL_CSS, REDUCED_MOTION).reduce(
      (css, block) => css.replace(block, ''),
      GLOBAL_CSS,
    )
    const bases = bodiesFor(outsideMedia, GLOW_SELECTOR)

    expect(bases).toHaveLength(1)
    const [base] = bases

    expect(base).toMatch(/box-shadow:[^;]*var\(--breathe-color\)/)
    expect(base).toMatch(/animation:\s*session-card-breathe/)
    // The still card sits at the top of the breath rather than at an opacity
    // the animation would otherwise have moved it off.
    expect(declaredOpacity(base)).toBe('var(--breathe-max)')
  })
})
