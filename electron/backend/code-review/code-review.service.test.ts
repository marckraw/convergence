import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BaseBranchDiffSummary } from '../git/changed-files.types'
import type {
  ProjectPullRequest,
  WorkspacePullRequest,
} from '../pull-request/pull-request.types'
import type { Project } from '../project/project.types'
import type { SessionSummary } from '../session/session.types'
import type { Workspace } from '../workspace/workspace.types'
import { CodeReviewService } from './code-review.service'
import type { CodeReviewSummary, CodeReviewTarget } from './code-review.types'

const target: CodeReviewTarget = {
  id: 'session:session-1',
  projectId: 'project-1',
  projectName: 'Project',
  sessionId: 'session-1',
  repositoryPath: '/repo',
  workspaceId: 'workspace-1',
  sessionName: 'Implement feature',
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
    workingTreeFileCount: 1,
    workingTreeStatusCounts: { M: 1 },
    error: null,
  },
}

describe('CodeReviewService', () => {
  let git: {
    getStatus: ReturnType<
      typeof vi.fn<(repoPath: string) => Promise<CodeReviewSummary['files']>>
    >
    getDiff: ReturnType<
      typeof vi.fn<(repoPath: string, filePath?: string) => Promise<string>>
    >
    getCurrentBranch: ReturnType<
      typeof vi.fn<(repoPath: string) => Promise<string>>
    >
    getWorkingTreeVersionToken: ReturnType<
      typeof vi.fn<(repoPath: string) => Promise<string>>
    >
    getPullRequestStatus: ReturnType<
      typeof vi.fn<
        (input: {
          repoPath: string
          number: number
          baseBranch: string
        }) => Promise<{
          comparisonRef: string
          comparisonPoint: string
          headRef: string
          versionToken: string
          files: CodeReviewSummary['files']
        }>
      >
    >
    getPullRequestDiff: ReturnType<
      typeof vi.fn<
        (input: {
          repoPath: string
          number: number
          baseBranch: string
          comparisonPoint?: string | null
          filePath?: string
        }) => Promise<string>
      >
    >
  }
  let changedFiles: {
    getBaseBranchStatus: ReturnType<
      typeof vi.fn<(sessionId: string) => Promise<BaseBranchDiffSummary>>
    >
    getBaseBranchDiff: ReturnType<
      typeof vi.fn<
        (input: {
          sessionId: string
          filePath: string
          comparisonPoint?: string | null
        }) => Promise<string>
      >
    >
  }
  let projects: {
    getById: ReturnType<typeof vi.fn<(id: string) => Project | null>>
  }
  let workspaces: {
    getByProjectId: ReturnType<typeof vi.fn<(projectId: string) => Workspace[]>>
  }
  let sessions: {
    getSummariesByProjectId: ReturnType<
      typeof vi.fn<(projectId: string) => SessionSummary[]>
    >
  }
  let pullRequests: {
    listByProjectId: ReturnType<
      typeof vi.fn<(projectId: string) => WorkspacePullRequest[]>
    >
    listOpenByProjectId: ReturnType<
      typeof vi.fn<(projectId: string) => Promise<ProjectPullRequest[]>>
    >
  }
  let service: CodeReviewService

  beforeEach(() => {
    git = {
      getCurrentBranch: vi.fn().mockResolvedValue('main'),
      getWorkingTreeVersionToken: vi.fn().mockResolvedValue('wt-1'),
      getStatus: vi.fn().mockResolvedValue([{ status: 'M', file: 'app.ts' }]),
      getDiff: vi.fn().mockResolvedValue('working tree diff'),
      getPullRequestStatus: vi.fn().mockResolvedValue({
        comparisonRef: 'origin/main',
        comparisonPoint: 'merge-base-pr-42',
        headRef: 'refs/convergence/pull-requests/42/head',
        versionToken: 'pr-42-token',
        files: [{ status: 'M', file: 'remote.ts' }],
      }),
      getPullRequestDiff: vi.fn().mockResolvedValue('pull request diff'),
    }
    changedFiles = {
      getBaseBranchStatus: vi.fn().mockResolvedValue({
        base: {
          branchName: 'main',
          comparisonRef: 'origin/main',
          source: 'remote-default',
          warning: null,
        },
        comparisonPoint: 'merge-base-1',
        files: [{ status: 'A', file: 'feature.ts' }],
      }),
      getBaseBranchDiff: vi.fn().mockResolvedValue('base branch diff'),
    }
    projects = {
      getById: vi.fn<(id: string) => Project | null>().mockReturnValue({
        id: 'project-1',
        name: 'Project',
        repositoryPath: '/repo',
        settings: {} as Project['settings'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    }
    workspaces = {
      getByProjectId: vi
        .fn<(projectId: string) => Workspace[]>()
        .mockReturnValue([
          {
            id: 'workspace-1',
            projectId: 'project-1',
            branchName: 'feature',
            path: '/worktree',
            type: 'worktree',
            archivedAt: null,
            worktreeRemovedAt: null,
            createdAt: '2026-01-03T00:00:00.000Z',
          },
        ]),
    }
    sessions = {
      getSummariesByProjectId: vi
        .fn<(projectId: string) => SessionSummary[]>()
        .mockReturnValue([
          {
            id: 'session-1',
            contextKind: 'project',
            projectId: 'project-1',
            workspaceId: 'workspace-1',
            providerId: 'codex',
            model: null,
            effort: null,
            name: 'Implement feature',
            status: 'idle',
            attention: 'none',
            activity: null,
            contextWindow: null,
            workingDirectory: '/worktree',
            archivedAt: null,
            parentSessionId: null,
            forkStrategy: null,
            primarySurface: 'conversation',
            continuationToken: null,
            lastSequence: 0,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-04T00:00:00.000Z',
          },
        ]),
    }
    pullRequests = {
      listByProjectId: vi
        .fn<(projectId: string) => WorkspacePullRequest[]>()
        .mockReturnValue([
          {
            id: 'pr-1',
            projectId: 'project-1',
            workspaceId: 'workspace-1',
            provider: 'github',
            lookupStatus: 'found',
            number: 42,
            title: 'Feature',
            repositoryOwner: 'acme',
            repositoryName: 'project',
            url: 'https://github.com/acme/project/pull/42',
            isDraft: false,
            headBranch: 'feature',
            baseBranch: 'main',
            mergedAt: null,
            lastCheckedAt: '2026-01-05T00:00:00.000Z',
            error: null,
            state: 'open',
            createdAt: '2026-01-05T00:00:00.000Z',
            updatedAt: '2026-01-05T00:00:00.000Z',
          },
        ]),
      listOpenByProjectId: vi
        .fn<(projectId: string) => Promise<ProjectPullRequest[]>>()
        .mockResolvedValue([
          {
            projectId: 'project-1',
            provider: 'github',
            state: 'open',
            repositoryOwner: 'acme',
            repositoryName: 'project',
            number: 43,
            title: 'Remote Feature',
            url: 'https://github.com/acme/project/pull/43',
            isDraft: false,
            headBranch: 'remote-feature',
            baseBranch: 'main',
            changedFileCount: 3,
            updatedAt: '2026-01-06T00:00:00.000Z',
          },
        ]),
    }
    service = new CodeReviewService({
      git,
      changedFiles,
      projects,
      workspaces,
      sessions,
      pullRequests,
    })
  })

  it('discovers project, workspace, session, cached pull request, and remote pull request targets', async () => {
    const targets = await service.listTargets({
      projectId: 'project-1',
      sessionId: 'session-1',
    })

    expect(targets.map((entry) => entry.source)).toEqual([
      'session',
      'pull-request',
      'project-repository',
      'workspace',
      'pull-request',
    ])
    expect(targets[0]).toMatchObject({
      id: 'session:session-1',
      sessionName: 'Implement feature',
      status: {
        workingTreeFileCount: 1,
        workingTreeStatusCounts: { M: 1 },
      },
    })
    expect(
      targets.find((entry) => entry.pullRequestNumber === 42),
    ).toMatchObject({
      pullRequestLabel: '#42 Feature · open',
      sessionId: 'session-1',
    })
    expect(
      targets.find((entry) => entry.pullRequestNumber === 43),
    ).toMatchObject({
      id: 'pull-request:github:acme/project#43',
      pullRequestLabel: '#43 Remote Feature · open',
      sessionId: null,
      repositoryPath: '/repo',
      status: { workingTreeFileCount: 3 },
    })
  })

  it('deduplicates remote pull requests that already have cached workspaces', async () => {
    pullRequests.listOpenByProjectId.mockResolvedValue([
      {
        projectId: 'project-1',
        provider: 'github',
        state: 'open',
        repositoryOwner: 'acme',
        repositoryName: 'project',
        number: 42,
        title: 'Feature',
        url: 'https://github.com/acme/project/pull/42',
        isDraft: false,
        headBranch: 'feature',
        baseBranch: 'main',
        changedFileCount: 2,
        updatedAt: '2026-01-06T00:00:00.000Z',
      },
    ])

    const targets = await service.listTargets({ projectId: 'project-1' })

    expect(
      targets.filter((entry) => entry.pullRequestNumber === 42),
    ).toHaveLength(1)
  })

  it('loads working tree summary through GitService', async () => {
    await expect(
      service.getSummary({ target, mode: 'working-tree' }),
    ).resolves.toEqual({
      base: null,
      cacheIdentity: {
        comparisonRef: null,
        comparisonPoint: null,
        workingTreeVersionToken: 'wt-1',
      },
      files: [{ status: 'M', file: 'app.ts' }],
    })

    expect(git.getStatus).toHaveBeenCalledWith('/repo')
    expect(git.getWorkingTreeVersionToken).toHaveBeenCalledWith('/repo')
    expect(changedFiles.getBaseBranchStatus).not.toHaveBeenCalled()
  })

  it('loads base branch summary through ChangedFilesService', async () => {
    await expect(
      service.getSummary({ target, mode: 'base-branch' }),
    ).resolves.toMatchObject({
      base: { branchName: 'main' },
      cacheIdentity: {
        comparisonRef: 'origin/main',
        comparisonPoint: 'merge-base-1',
        workingTreeVersionToken: 'wt-1',
      },
      files: [{ status: 'A', file: 'feature.ts' }],
    })

    expect(changedFiles.getBaseBranchStatus).toHaveBeenCalledWith('session-1')
    expect(git.getStatus).not.toHaveBeenCalled()
    expect(git.getWorkingTreeVersionToken).toHaveBeenCalledWith('/repo')
  })

  it('loads file patches from the active mode source', async () => {
    await expect(
      service.getFilePatch({
        target,
        mode: 'working-tree',
        filePath: 'app.ts',
        cacheIdentity: {
          comparisonRef: null,
          comparisonPoint: null,
          workingTreeVersionToken: 'wt-1',
        },
      }),
    ).resolves.toBe('working tree diff')
    await expect(
      service.getFilePatch({
        target,
        mode: 'base-branch',
        filePath: 'feature.ts',
        cacheIdentity: {
          comparisonRef: 'origin/main',
          comparisonPoint: 'merge-base-1',
          workingTreeVersionToken: 'wt-1',
        },
      }),
    ).resolves.toBe('base branch diff')

    expect(git.getDiff).toHaveBeenCalledWith('/repo', 'app.ts')
    expect(changedFiles.getBaseBranchDiff).toHaveBeenCalledWith({
      sessionId: 'session-1',
      filePath: 'feature.ts',
      comparisonPoint: 'merge-base-1',
    })
  })

  it('loads summaries and file patches for remote pull request targets', async () => {
    const pullRequestTarget: CodeReviewTarget = {
      ...target,
      id: 'pull-request:github:acme/project#42',
      repositoryPath: '/repo',
      workspaceId: null,
      sessionId: null,
      sessionName: null,
      branchName: 'feature',
      pullRequestNumber: 42,
      pullRequestLabel: '#42 Feature · open',
      pullRequestUrl: 'https://github.com/acme/project/pull/42',
      pullRequestBaseBranch: 'main',
      pullRequestHeadBranch: 'feature',
      source: 'pull-request',
    }

    await expect(
      service.getSummary({ target: pullRequestTarget, mode: 'working-tree' }),
    ).resolves.toEqual({
      base: {
        branchName: 'main',
        comparisonRef: 'origin/main',
        source: 'pull-request',
        warning: null,
      },
      cacheIdentity: {
        comparisonRef: 'origin/main',
        comparisonPoint: 'merge-base-pr-42',
        workingTreeVersionToken: 'pr-42-token',
      },
      files: [{ status: 'M', file: 'remote.ts' }],
    })

    await expect(
      service.getFilePatch({
        target: pullRequestTarget,
        mode: 'working-tree',
        filePath: 'remote.ts',
        cacheIdentity: {
          comparisonRef: 'origin/main',
          comparisonPoint: 'merge-base-pr-42',
          workingTreeVersionToken: 'pr-42-token',
        },
      }),
    ).resolves.toBe('pull request diff')

    expect(git.getPullRequestStatus).toHaveBeenCalledWith({
      repoPath: '/repo',
      number: 42,
      baseBranch: 'main',
    })
    expect(git.getPullRequestDiff).toHaveBeenCalledWith({
      repoPath: '/repo',
      number: 42,
      baseBranch: 'main',
      comparisonPoint: 'merge-base-pr-42',
      filePath: 'remote.ts',
    })
  })
})
