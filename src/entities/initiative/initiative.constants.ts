import type {
  InitiativeAttemptRole,
  InitiativeOutputKind,
  InitiativeOutputStatus,
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

export const initiativeOutputKindLabels: Record<InitiativeOutputKind, string> =
  {
    'pull-request': 'Pull request',
    branch: 'Branch',
    'commit-range': 'Commit range',
    release: 'Release',
    spec: 'Spec',
    documentation: 'Documentation',
    'migration-note': 'Migration note',
    'external-issue': 'External issue',
    other: 'Other',
  }

export const initiativeOutputKindOptions: InitiativeOutputKind[] = [
  'pull-request',
  'branch',
  'commit-range',
  'release',
  'spec',
  'documentation',
  'migration-note',
  'external-issue',
  'other',
]

export const initiativeOutputStatusLabels: Record<
  InitiativeOutputStatus,
  string
> = {
  planned: 'Planned',
  'in-progress': 'In progress',
  ready: 'Ready',
  merged: 'Merged',
  released: 'Released',
  abandoned: 'Abandoned',
}

export const initiativeOutputStatusOptions: InitiativeOutputStatus[] = [
  'planned',
  'in-progress',
  'ready',
  'merged',
  'released',
  'abandoned',
]
