import { focusRing, type Tone } from '@convergence/ui'
import { SESSION_STATE_TONE } from '@/entities/session'

/** The window's last line: a hairline over it, 11 px muted words in it. */
export const barClass =
  'flex h-7 shrink-0 items-center gap-3 border-t border-hairline bg-surface/40 px-3 text-2xs text-ink-muted backdrop-blur-sm'

export const zoneClass = 'flex min-w-0 items-center gap-2'

/** The aggregate counts: a stop for the keyboard, whose focus opens their summary (NAV-26). */
export const aggregateZoneClass = `${zoneClass} rounded-md ${focusRing}`

export const aggregateChipClass =
  'flex items-center gap-1 rounded-md border border-line/50 bg-canvas/40 px-1.5 py-0.5'

/**
 * The last-finished badge, at the bar's end. It and the project chips are
 * StatusPillButtons, a state you press, in the bar's 11 px (NAV's N3: never
 * a Button resized into a chip by a constant).
 */
export const recencyBadgeClass = 'ml-auto'

/** A project's name in its chip, cut short on its own so the counts after it stay. */
export const chipNameClass = 'inline-block max-w-32 truncate align-bottom'

/** The finished session's name in the badge, cut short on its own before its project. */
export const recencyNameClass = 'inline-block max-w-28 truncate align-bottom'

/**
 * R1's map for what the bar shows, read from the session's own (NAV-1): a
 * session that waits on you is warning, one that runs is info, one that
 * finished is success, one that failed is danger.
 */
export const barTone = {
  waiting: SESSION_STATE_TONE.waiting,
  running: SESSION_STATE_TONE.working,
  completed: SESSION_STATE_TONE.finished,
  failed: SESSION_STATE_TONE.failed,
} as const satisfies Record<string, Tone>
