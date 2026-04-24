import type { InitiativeAttemptRole } from './initiative.types'

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
