import { focusRing, type Tone } from '@convergence/ui'

/** The window's last line: a hairline over it, 11 px muted words in it. */
export const barClass =
  'flex h-7 shrink-0 items-center gap-3 border-t border-hairline bg-surface/40 px-3 text-2xs text-ink-muted backdrop-blur-sm'

export const zoneClass = 'flex min-w-0 items-center gap-2'

/** The aggregate counts: a stop for the keyboard, whose focus opens their summary (NAV-26). */
export const aggregateZoneClass = `${zoneClass} rounded-md ${focusRing}`

export const aggregateChipClass =
  'flex items-center gap-1 rounded-md border border-line/50 bg-canvas/40 px-1.5 py-0.5'

/** A project chip and the last-finished badge: Buttons drawn as the bar's small chips. */
export const statusChipButtonClass =
  'h-auto px-1.5 py-0.5 text-2xs font-medium shadow-none'

export const projectChipClass =
  'flex items-center gap-1 rounded-md border border-line-soft bg-canvas/60 px-1.5 py-0.5 text-ink transition-colors hover:bg-highlight'

/** Something waits on you in this project (R1: warning, never red). */
export const projectChipAttentionClass =
  'border-warning-line bg-warning-soft text-warning-ink hover:bg-warning-soft'

export const recencyBadgeClass =
  'ml-auto flex items-center gap-1 rounded-md border border-line/40 bg-canvas/40 px-1.5 py-0.5 text-ink-muted transition-colors hover:bg-highlight'

/**
 * R1's map for what the bar shows: a session that waits on you is warning, one
 * that runs is info, one that finished is success, one that failed is danger.
 */
export const barTone = {
  waiting: 'warning',
  running: 'info',
  completed: 'success',
  failed: 'danger',
} as const satisfies Record<string, Tone>
