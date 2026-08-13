import type { AttentionState, SessionStatus } from '@/entities/session'

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

export const STATUS_DOT_STYLES: Record<SessionStatus, string> = {
  running: 'bg-emerald-500',
  idle: 'bg-muted-foreground/40',
  completed: 'bg-muted-foreground/40',
  failed: 'bg-red-500',
}
