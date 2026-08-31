import { describe, expect, it } from 'vitest'
import type { SessionCrew } from '@/entities/session-crew'
import { buildCardBreatheStyle } from './session-card-breathe.pure'
import { CARD_BREATHE, STATUS_DOT_STYLES } from './session-card.styles'

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

/** Custom properties are not typed on CSSProperties; read them as a bag. */
function vars(style: ReturnType<typeof buildCardBreatheStyle>) {
  return style as Record<string, string> | undefined
}

describe('the breathing glow a working card carries', () => {
  it('breathes in the crew colour of a running card', () => {
    const style = vars(buildCardBreatheStyle(true, [crew('ops', '#ff8800')]))

    expect(style?.['--breathe-color']).toBe('#ff8800')
  })

  it('falls back to the neutral working hue for a running crewless card', () => {
    // Ruled: a card cannot breathe in a colour it does not have, and a working
    // session with no crew still has to say it is working.
    const style = vars(buildCardBreatheStyle(true, []))

    expect(style?.['--breathe-color']).toBe(CARD_BREATHE.neutralColor)
  })

  it('takes the first crew that actually carries a colour', () => {
    // A crew is allowed to have no accent. Reading `crews[0].accentColor`
    // blindly would drop a coloured crew's card to the neutral hue.
    const style = vars(
      buildCardBreatheStyle(true, [
        crew('plain', null),
        crew('ops', '#22aaff'),
      ]),
    )

    expect(style?.['--breathe-color']).toBe('#22aaff')
  })

  it('uses the neutral hue when every crew holding the card is colourless', () => {
    const style = vars(buildCardBreatheStyle(true, [crew('plain', null)]))

    expect(style?.['--breathe-color']).toBe(CARD_BREATHE.neutralColor)
  })

  it('carries nothing at all when the card is not working', () => {
    expect(
      buildCardBreatheStyle(false, [crew('ops', '#ff8800')]),
    ).toBeUndefined()
  })

  it('hands every tuning knob to the stylesheet with its unit', () => {
    // The knobs are the point: one edit in CARD_BREATHE has to reach the DOM,
    // so the properties are pinned to the constants rather than to literals.
    const style = vars(buildCardBreatheStyle(true, []))

    expect(style?.['--breathe-period']).toBe(`${CARD_BREATHE.periodMs}ms`)
    expect(style?.['--breathe-min']).toBe(`${CARD_BREATHE.minOpacity}`)
    expect(style?.['--breathe-max']).toBe(`${CARD_BREATHE.maxOpacity}`)
    expect(style?.['--breathe-blur']).toBe(`${CARD_BREATHE.blurPx}px`)
    expect(style?.['--breathe-spread']).toBe(`${CARD_BREATHE.spreadPx}px`)
  })

  it('names a neutral hue the room actually defines', () => {
    // Tailwind only emits `--color-emerald-500` because some class in the
    // source asks for that shade -- the running status dot is the one that
    // does. Change that dot's colour and the crewless glow would silently
    // resolve to nothing, so the two are pinned to each other here.
    expect(STATUS_DOT_STYLES.running).toContain('emerald-500')
    expect(CARD_BREATHE.neutralColor).toBe('var(--color-emerald-500)')
  })
})
