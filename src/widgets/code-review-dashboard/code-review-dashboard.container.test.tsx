import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CodeReviewTarget } from '@/entities/code-review'

const loadTargets = vi.fn()
const setSelectedTarget = vi.fn()
const closeReview = vi.fn()

const target: CodeReviewTarget = {
  id: 'session:session-1',
  projectId: 'project-1',
  projectName: 'Project',
  repositoryPath: '/repo',
  workspaceId: 'workspace-1',
  sessionId: 'session-1',
  sessionName: 'Feature session',
  branchName: 'feature',
  pullRequestId: null,
  pullRequestNumber: null,
  pullRequestLabel: null,
  pullRequestUrl: null,
  pullRequestBaseBranch: null,
  pullRequestHeadBranch: null,
  source: 'session',
  updatedAt: '2026-01-02T00:00:00.000Z',
  status: {
    workingTreeFileCount: 2,
    workingTreeStatusCounts: { M: 2 },
    error: null,
  },
}

let codeReviewState: Record<string, unknown>

vi.mock('@/entities/code-review', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/code-review')>()
  return {
    ...actual,
    useCodeReviewStore: (selector: (state: unknown) => unknown) =>
      selector(codeReviewState),
  }
})

vi.mock('@/entities/project', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      activeProject: {
        id: 'project-1',
        name: 'Project',
        repositoryPath: '/repo',
      },
    }),
}))

vi.mock('@/entities/session', () => ({
  useSessionStore: (selector: (state: unknown) => unknown) =>
    selector({ activeSessionId: 'session-1' }),
}))

import { CodeReviewDashboard } from './code-review-dashboard.container'

describe('CodeReviewDashboard', () => {
  beforeEach(() => {
    loadTargets.mockReset().mockResolvedValue([target])
    setSelectedTarget.mockReset()
    closeReview.mockReset()
    codeReviewState = {
      targets: [target],
      selectedTarget: target,
      selectedMode: 'working-tree',
      selectedFile: 'src/app.ts',
      targetsLoading: false,
      error: null,
      loadTargets,
      setSelectedTarget,
      closeReview,
    }
  })

  it('renders review targets and refreshes for the active project/session', () => {
    render(<CodeReviewDashboard />)

    expect(loadTargets).toHaveBeenCalledWith({
      projectId: 'project-1',
      sessionId: 'session-1',
    })
    expect(screen.getAllByText('Feature session')).not.toHaveLength(0)
    expect(screen.getByText('2 changed')).toBeInTheDocument()
    expect(screen.getByText('/repo')).toBeInTheDocument()
  })

  it('selects a target from the dashboard rail', () => {
    render(<CodeReviewDashboard />)

    fireEvent.click(screen.getByRole('button', { name: /Feature session/i }))

    expect(setSelectedTarget).toHaveBeenCalledWith(target)
  })
})
