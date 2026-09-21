import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import { ProjectSummary } from './project-summary.presentational'

const session = {
  id: 's-1',
  contextKind: 'project',
  projectId: 'p',
  workspaceId: null,
  providerId: 'codex',
  model: null,
  effort: null,
  name: 'Mastermind',
  status: 'completed',
  attention: 'finished',
  activity: 'compacting',
  contextWindow: null,
  workingDirectory: '/tmp',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} satisfies SessionSummary

it('MAR-3288 R5 names a compacting row in the shared words — mutation drop the predicate turns red', () => {
  render(
    <ProjectSummary
      project={{
        projectId: 'p',
        projectName: 'Convergence',
        running: [session],
        needsAttention: [],
        providerIds: ['codex'],
      }}
      providerLabel={() => 'Codex'}
    />,
  )
  expect(screen.getByTestId('global-status-activity-s-1')).toHaveTextContent(
    '· Compacting context…',
  )
  expect(screen.queryByText(/Finished/)).toBeNull()
})
