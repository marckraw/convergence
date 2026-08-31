import type {
  SpaceAttemptRole,
  SpaceArtifactKind,
  SpaceArtifactStatus,
  SpaceStatus,
} from './space.types'

export const spaceStatusLabels: Record<SpaceStatus, string> = {
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

export const spaceAttemptRoleLabels: Record<SpaceAttemptRole, string> = {
  seed: 'Seed',
  exploration: 'Exploration',
  implementation: 'Implementation',
  review: 'Review',
  hardening: 'Hardening',
  docs: 'Docs',
}

export const spaceAttemptRoleOptions: SpaceAttemptRole[] = [
  'seed',
  'exploration',
  'implementation',
  'review',
  'hardening',
  'docs',
]

export const spaceArtifactKindLabels: Record<SpaceArtifactKind, string> = {
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

export const spaceArtifactKindOptions: SpaceArtifactKind[] = [
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

export const spaceArtifactStatusLabels: Record<SpaceArtifactStatus, string> = {
  planned: 'Planned',
  'in-progress': 'In progress',
  ready: 'Ready',
  merged: 'Merged',
  released: 'Released',
  abandoned: 'Abandoned',
}

export const spaceArtifactStatusOptions: SpaceArtifactStatus[] = [
  'planned',
  'in-progress',
  'ready',
  'merged',
  'released',
  'abandoned',
]
