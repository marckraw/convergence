import type { LoomHorseAccessLine } from './loom-horse-access.pure'

export const LOOM_HORSE_ACCESS_TONE: Record<
  LoomHorseAccessLine['tone'],
  string
> = {
  good: 'text-success-ink',
  muted: 'text-muted-foreground',
  warn: 'text-warning-ink',
}
