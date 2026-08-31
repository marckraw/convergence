import type { CSSProperties } from 'react'
import type { SessionCrew } from '@/entities/session-crew'
import { CARD_BREATHE } from './session-card.styles'

/**
 * The custom properties a breathing card carries, or nothing when the card is
 * not working.
 *
 * The colour is data — a crew's accent is a runtime string that no build step
 * can see — so it travels as an inline custom property rather than as a
 * class name assembled at render time, which Tailwind would never emit. The
 * knobs ride along from `CARD_BREATHE` so the stylesheet holds the shape of
 * the animation and this slice holds its feel.
 */
export function buildCardBreatheStyle(
  running: boolean,
  crews: readonly SessionCrew[],
): CSSProperties | undefined {
  if (!running) return undefined

  // The first crew that actually carries an accent decides the colour: a
  // session can be held by several crews, and a crew is allowed to have no
  // colour at all. A card cannot glare in a colour it does not have.
  const accent = crews.find((crew) => crew.accentColor)?.accentColor

  return {
    '--breathe-color': accent ?? CARD_BREATHE.neutralColor,
    '--breathe-period': `${CARD_BREATHE.periodMs}ms`,
    '--breathe-min': `${CARD_BREATHE.minOpacity}`,
    '--breathe-max': `${CARD_BREATHE.maxOpacity}`,
    '--breathe-blur': `${CARD_BREATHE.blurPx}px`,
    '--breathe-spread': `${CARD_BREATHE.spreadPx}px`,
  } as CSSProperties
}
