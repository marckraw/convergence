import type { SessionSummary } from '@/entities/session'

export const cardContext = {
  projectName: 'Convergence',
  endpoints: [{ id: 'lm', label: 'little-monster' }],
  now: Date.parse('2026-09-12T12:05:00Z'),
}
export function cardSession(
  overrides: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    id: 'horse',
    contextKind: 'project',
    projectId: 'project',
    workspaceId: null,
    providerId: 'codex',
    model: 'gpt-6',
    effort: 'high',
    name: 'Horse',
    status: 'idle',
    attention: 'none',
    activity: null,
    contextWindow: null,
    workingDirectory: '/repo',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation',
    continuationToken: null,
    lastSequence: 0,
    createdAt: '2026-09-12T12:00:00Z',
    updatedAt: '2026-09-12T12:00:00Z',
    executionHost: 'local',
    originKind: 'resident',
    pinnedAt: null,
    ...overrides,
  }
}
const pr = {
  number: 42,
  state: 'open',
  url: 'https://github.com/acme/app/pull/42',
  headBranch: 'horse',
  checkedAt: '2026-09-12T12:00:00Z',
  source: 'gh',
} as const
export const cardFixtures = {
  working: cardSession({ id: 'working', status: 'running' }),
  pinned: cardSession({ id: 'pinned', pinnedAt: '2026-09-12T12:01:00Z' }),
  open: cardSession({ id: 'open', originKind: 'spawn', pullRequest: pr }),
  waiting: cardSession({ id: 'waiting', attention: 'needs-input' }),
  remote: cardSession({
    id: 'remote',
    executionHost: 'lm',
    workAddress: {
      mode: 'repository',
      repository: 'https://github.com/acme/app',
      branchName: 'horse',
      label: 'acme/app',
    },
  }),
  noPr: cardSession({ id: 'no-pr', attention: 'finished' }),
  merged: cardSession({
    id: 'merged',
    originKind: 'spawn',
    pullRequest: { ...pr, state: 'merged' },
  }),
  unknown: cardSession({ id: 'unknown', originKind: null }),
}
