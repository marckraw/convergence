import type {
  InitiativeAttemptRole,
  InitiativeStatus,
} from './initiative.types'

export const initiativeStatusLabels: Record<InitiativeStatus, string> = {
  exploring: 'Exploring',
  planned: 'Planned',
  implementing: 'Implementing',
  reviewing: 'Reviewing',
  'ready-to-merge': 'Ready to merge',
  merged: 'Merged',
  released: 'Released',
  parked: 'Parked',
  discarded: 'Discarded',
}

export const initiativeAttemptRoleLabels: Record<
  InitiativeAttemptRole,
  string
> = {
  seed: 'Seed',
  exploration: 'Exploration',
  implementation: 'Implementation',
  review: 'Review',
  hardening: 'Hardening',
  docs: 'Docs',
}

export const initiativeAttemptRoleOptions: InitiativeAttemptRole[] = [
  'seed',
  'exploration',
  'implementation',
  'review',
  'hardening',
  'docs',
]
