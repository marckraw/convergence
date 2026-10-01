import { durationsMs, type Tone } from '@convergence/ui'
import type { AttentionState, SessionStatus } from '@/entities/session'
import type { SessionCardState } from './session-card-state.pure'

/**
 * One card must read as a different state from its neighbour at a glance,
 * across the room, without reading the words. Attention owns the frame, in
 * R1's tones (MAR-3617): waiting on you is warning whether it is an approval
 * or a question, a failure is danger, a finish is success, and a host the
 * room cannot see is warning too, with its own glyph and words, never red
 * (MAR-3051: the run is not broken, the view of it is). No attention, no
 * tone: the card's own hairline.
 */
export const CARD_ATTENTION_TONE: Record<AttentionState, Tone | undefined> = {
  'needs-approval': 'warning',
  'needs-input': 'warning',
  failed: 'danger',
  finished: 'success',
  'host-unreachable': 'warning',
  none: undefined,
}

/**
 * A grid card's attention frame: the tone's edge and its tint. Written after
 * the open mark, so the tint wins over the open card's selected fill.
 */
export const CARD_TONE_FRAME: Record<Tone, string> = {
  neutral: 'border-neutral-line bg-neutral-soft',
  info: 'border-info-line bg-info-soft',
  success: 'border-success-line bg-success-soft',
  warning: 'border-warning-line bg-warning-soft',
  danger: 'border-danger-line bg-danger-soft',
}

/**
 * A canvas node's attention frame. The node stays opaque over the canvas, so
 * the tint is laid over its surface as an image rather than replacing it.
 */
export const CARD_TONE_WASH: Record<Tone, string> = {
  neutral:
    'border-neutral-line bg-linear-to-b from-neutral-soft to-neutral-soft',
  info: 'border-info-line bg-linear-to-b from-info-soft to-info-soft',
  success:
    'border-success-line bg-linear-to-b from-success-soft to-success-soft',
  warning:
    'border-warning-line bg-linear-to-b from-warning-soft to-warning-soft',
  danger: 'border-danger-line bg-linear-to-b from-danger-soft to-danger-soft',
}

/**
 * Each state the room filters by, in R1's tone: working is info everywhere a
 * session is drawn (Mission Control, Needs you, Loom), never emerald, blue or
 * sky depending on the surface (MC-2).
 */
export const SESSION_CARD_STATE_TONE: Record<SessionCardState, Tone> = {
  working: 'info',
  'needs-you': 'warning',
  idle: 'neutral',
  finished: 'success',
  failed: 'danger',
  'host-unreachable': 'warning',
}

/** The dot a card shows when nothing needs you: what the run is doing. */
export const STATUS_DOT_TONE: Record<SessionStatus, Tone> = {
  running: 'info',
  idle: 'neutral',
  answered: 'info',
  completed: 'neutral',
  failed: 'danger',
}

/**
 * The card of the conversation open in the main view (MAR-3321). A bright ring
 * standing 2px off the card, so it reads outside every attention frame rather
 * than fighting it, plus the selected fill (R7). The fill is a background, so
 * it yields to an attention tint: the card places this before the attention
 * tone and the frame's colour wins wherever attention has one.
 */
export const CARD_OPEN_CLASS =
  'ring-2 ring-ink/70 ring-offset-2 ring-offset-canvas bg-fill-selected'

/**
 * The card whose Hail is open. An outline, not a ring, so it is a different
 * property from the open mark and both can show on one card. Tailwind v4's
 * `outline-1` carries the outline style as well as the width; `-outline-offset-1`
 * pulls it a pixel inside the edge.
 */
export const CARD_HAIL_OPEN_CLASS = 'outline-1 outline-focus -outline-offset-1'

/** The last line's ink: the run's own words, in its tone when it failed. */
export const ACTIVITY_TEXT_STYLES: Record<SessionStatus, string> = {
  running: 'text-ink',
  idle: 'text-ink-muted',
  answered: 'text-ink-muted',
  completed: 'text-ink-muted',
  failed: 'text-danger-ink',
}

/**
 * The breathing glow's tuning knobs — every one of them, in this one object.
 *
 * A working card glares in its crew's colour so the room says who is busy from
 * across it. Tuning that feel ("slower", "subtler") is a one-line change here
 * and nowhere else: the values travel to the stylesheet as custom properties
 * set on the card, and `src/app/global.css` only reads them.
 */
export const CARD_BREATHE = {
  /** One full inhale-and-exhale (--motion-breath). A glare, not an alarm. */
  periodMs: durationsMs.breath,
  /** Glow strength at the bottom of the breath. */
  minOpacity: 0.18,
  /** Glow strength at the top of the breath — and the still value when motion is off. */
  maxOpacity: 0.6,
  /** How softly the glare bleeds past the card's edge. */
  blurPx: 14,
  /** How far the glare sits out from the edge before the blur starts. */
  spreadPx: 1,
  /**
   * A crewless session still has to say it is working, so it breathes in the
   * working tone's solid (R1: working is info), the colour its running dot
   * wears.
   */
  neutralColor: 'var(--info-solid)',
} as const
