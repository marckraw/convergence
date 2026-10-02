import { SESSION_STATE_TONE } from '@/entities/session'
import { type Tone, toneInk } from '@convergence/ui'
import type { FoldCardState } from './needs-you-fold.pure'

/**
 * A card's state as one of R1's tones, read from the session's own map
 * (NAV-1, `SESSION_STATE_TONE`), so a session wears the same colour here as
 * in Mission Control, on Loom and in the sidebar's rows: waiting on you is
 * warning, failed is danger, working is info, finished is success, and a host
 * the app can't reach is warning too (MC-1). Unknown and idle say nothing:
 * neutral.
 */
export const cardStateToneName: Readonly<Record<FoldCardState, Tone>> = {
  waiting: SESSION_STATE_TONE.waiting,
  failed: SESSION_STATE_TONE.failed,
  working: SESSION_STATE_TONE.working,
  finished: SESSION_STATE_TONE.finished,
  unreachable: SESSION_STATE_TONE.unreachable,
  unknown: SESSION_STATE_TONE.idle,
  idle: SESSION_STATE_TONE.idle,
}

/**
 * The one place a card's state becomes a colour (MAR-3366 R6): its tone's
 * ink. The card's status icon and the folded section's glyph strip both read
 * it, so a retuned colour changes both at once.
 */
export const cardStateTone: Readonly<Record<FoldCardState, string>> = {
  waiting: toneInk[cardStateToneName.waiting],
  failed: toneInk[cardStateToneName.failed],
  working: toneInk[cardStateToneName.working],
  finished: toneInk[cardStateToneName.finished],
  unreachable: toneInk[cardStateToneName.unreachable],
  unknown: toneInk[cardStateToneName.unknown],
  idle: toneInk[cardStateToneName.idle],
}

/**
 * The tones that name a state, one key each (unreachable shares waiting's
 * warning); the neutral fallback is not one of them.
 */
export const cardStateToneKeys = [
  'waiting',
  'failed',
  'working',
  'finished',
] as const satisfies readonly FoldCardState[]
