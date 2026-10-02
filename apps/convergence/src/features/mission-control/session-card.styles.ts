import { durationsMs, type Tone, toneInk } from '@convergence/ui'
import {
  ATTENTION_TONE,
  type AttentionState,
  SESSION_STATE_TONE,
  type SessionStatus,
} from '@/entities/session'
import type { SessionCardState } from './session-card-state.pure'

/**
 * One card must read as a different state from its neighbour at a glance,
 * across the room, without reading the words. Attention owns the frame, in
 * R1's tones (MAR-3617): waiting on you is warning whether it is an approval
 * or a question, a failure is danger, a finish is success, and a host the
 * room cannot see is warning too, with its own glyph and words, never red
 * (MAR-3051: the run is not broken, the view of it is). No attention, no
 * tone: the card's own hairline. The session's own map (NAV-1).
 */
export const CARD_ATTENTION_TONE: Record<AttentionState, Tone | undefined> = {
  ...ATTENTION_TONE,
  none: undefined,
}

/**
 * A canvas node's attention wash. The frame is the Card's own `tone` (its
 * edge and its tint, N6), as on a grid card; the node stays opaque over the
 * canvas, so the tint is laid over an opaque colour as an image rather than
 * replacing it.
 *
 * That colour is the canvas, not the node's own surface. A tone's tint over
 * the surface leaves the node's muted words at 4.4:1 in dark (warning: waiting
 * on you, an unreachable host), under the 4.5:1 text needs; over the canvas
 * they clear it in every tone and both themes (pinned in
 * app/theme-contrast.pure.test.ts). An image hides the colour from the
 * accessibility check, so the pin is the test, not the story.
 */
export const CARD_TONE_WASH: Record<Tone, string> = {
  neutral: 'bg-canvas bg-linear-to-b from-neutral-soft to-neutral-soft',
  info: 'bg-canvas bg-linear-to-b from-info-soft to-info-soft',
  success: 'bg-canvas bg-linear-to-b from-success-soft to-success-soft',
  warning: 'bg-canvas bg-linear-to-b from-warning-soft to-warning-soft',
  danger: 'bg-canvas bg-linear-to-b from-danger-soft to-danger-soft',
}

/**
 * Each state the room filters by, in R1's tone: working is info everywhere a
 * session is drawn (Mission Control, Needs you, Loom), never emerald, blue or
 * sky depending on the surface (MC-2); read from the session's own map
 * (NAV-1).
 */
export const SESSION_CARD_STATE_TONE: Record<SessionCardState, Tone> = {
  working: SESSION_STATE_TONE.working,
  'needs-you': SESSION_STATE_TONE.waiting,
  idle: SESSION_STATE_TONE.idle,
  finished: SESSION_STATE_TONE.finished,
  failed: SESSION_STATE_TONE.failed,
  'host-unreachable': SESSION_STATE_TONE.unreachable,
}

/**
 * The dot a card shows when nothing needs you: what the run is doing. A run
 * that completed is at rest here, not a finish to look at: idle.
 */
export const STATUS_DOT_TONE: Record<SessionStatus, Tone> = {
  running: SESSION_STATE_TONE.working,
  idle: SESSION_STATE_TONE.idle,
  answered: SESSION_STATE_TONE.working,
  completed: SESSION_STATE_TONE.idle,
  failed: SESSION_STATE_TONE.failed,
}

/**
 * The card whose Hail is open: the chosen chip's stronger edge (R7, ruling
 * 11), never the focus colour, which marks only focus. An outline, so it is
 * its own property, apart from the attention frame's border and the open
 * card's selected fill, and all three can show on one card. Tailwind v4's
 * `outline-1` carries the outline style as well as the width;
 * `-outline-offset-1` lays it on the card's edge. Its Hail Toggle beside it
 * is pressed, the raised chip.
 */
export const CARD_HAIL_OPEN_CLASS =
  'outline-1 outline-hairline-strong -outline-offset-1'

/** The last line's ink: the run's own words, in its tone when it failed. */
export const ACTIVITY_TEXT_STYLES: Record<SessionStatus, string> = {
  running: 'text-ink',
  idle: 'text-ink-muted',
  answered: 'text-ink-muted',
  completed: 'text-ink-muted',
  failed: toneInk[SESSION_STATE_TONE.failed],
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
