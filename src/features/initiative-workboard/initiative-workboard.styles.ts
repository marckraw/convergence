import type {
  InitiativeAttention,
  InitiativeStatus,
} from '@/entities/initiative'
export { initiativeStatusLabels } from '@/entities/initiative'

export const initiativeStatusOptions: InitiativeStatus[] = [
  'exploring',
  'planned',
  'implementing',
  'reviewing',
  'ready-to-merge',
  'merged',
  'released',
  'parked',
  'discarded',
]

export const initiativeAttentionOptions: InitiativeAttention[] = [
  'none',
  'needs-you',
  'needs-decision',
  'blocked',
  'stale',
]

export const initiativeStatusClassNames: Record<InitiativeStatus, string> = {
  exploring:
    'border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200',
  planned: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-200',
  implementing:
    'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
  reviewing:
    'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-200',
  'ready-to-merge':
    'border-lime-500/25 bg-lime-500/10 text-lime-700 dark:text-lime-200',
  merged: 'border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-200',
  released:
    'border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200',
  parked: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
  discarded:
    'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-200',
}

export const initiativeAttentionLabels: Record<InitiativeAttention, string> = {
  none: 'No attention',
  'needs-you': 'Needs you',
  'needs-decision': 'Needs decision',
  blocked: 'Blocked',
  stale: 'Stale',
}

export const initiativeAttentionClassNames: Record<
  InitiativeAttention,
  string
> = {
  none: 'border-border/60 bg-background/40 text-muted-foreground',
  'needs-you':
    'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-200',
  'needs-decision':
    'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-200',
  blocked: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-200',
  stale: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
}
