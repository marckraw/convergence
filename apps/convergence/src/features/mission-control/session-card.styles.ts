import type { AttentionState, SessionStatus } from '@/entities/session'
import type { SessionCardState } from './session-card-state.pure'

/**
 * One card must read as a different state from its neighbour at a glance,
 * across the room, without reading the words. Attention owns the frame.
 */
export const CARD_ATTENTION_STYLES: Record<AttentionState, string> = {
  'needs-approval': 'border-warning/60 bg-warning/[0.04]',
  'needs-input': 'border-blue-500/60 bg-blue-500/[0.04]',
  failed: 'border-red-500/50 bg-red-500/[0.04]',
  finished: 'border-emerald-500/50 bg-emerald-500/[0.04]',
  none: 'border-white/10',
}

export const ACTIVITY_TEXT_STYLES: Record<SessionStatus, string> = {
  running: 'text-foreground',
  idle: 'text-muted-foreground',
  completed: 'text-muted-foreground',
  failed: 'text-red-600 dark:text-red-400',
}

/** A selected state chip wears the same colour its cards wear in the room. */
export const STATE_CHIP_STYLES: Record<SessionCardState, string> = {
  working: 'border-emerald-500/60 bg-emerald-500/10 text-foreground',
  'needs-you': 'border-blue-500/60 bg-blue-500/10 text-foreground',
  idle: 'border-white/25 bg-white/10 text-foreground',
  finished: 'border-emerald-500/50 bg-emerald-500/[0.07] text-foreground',
  failed: 'border-red-500/60 bg-red-500/10 text-foreground',
}

export const STATUS_DOT_STYLES: Record<SessionStatus, string> = {
  running: 'bg-emerald-500',
  idle: 'bg-muted-foreground/40',
  completed: 'bg-muted-foreground/40',
  failed: 'bg-red-500',
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
  /** One full inhale-and-exhale. A glare, not an alarm. */
  periodMs: 2800,
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
   * room's working hue — the same emerald `STATUS_DOT_STYLES.running` wears.
   */
  neutralColor: 'var(--color-emerald-500)',
} as const
