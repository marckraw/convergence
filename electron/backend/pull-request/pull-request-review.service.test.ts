import { execFile } from 'child_process'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { GitService } from '../git/git.service'
import type { ProjectService } from '../project/project.service'
import type { SessionService } from '../session/session.service'
import type { SessionSummary } from '../session/session.types'
import type { WorkspaceService } from '../workspace/workspace.service'
import type { Workspace } from '../workspace/workspace.types'
import type { PullRequestService } from './pull-request.service'
import type { WorkspacePullRequest } from './pull-request.types'
import { PullRequestReviewService } from './pull-request-review.service'

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

const execFileMock = vi.mocked(execFile)

const pullRequestJson = {
  number: 123,
  title: 'Add review workflow',
  url: 'https://github.com/acme/app/pull/123',
  state: 'OPEN',
  isDraft: false,
  mergedAt: null,
  headRefName: 'feature/review',
  baseRefName: 'main',
}

const workspace: Workspace = {
  id: 'workspace-1',
  projectId: 'project-1',
  branchName: 'convergence/pr-123',
  path: '/repo/.worktrees/pr-123',
  type: 'worktree',
  archivedAt: null,
  worktreeRemovedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const session: SessionSummary = {
  id: 'session-1',
  contextKind: 'project',
  projectId: 'project-1',
  workspaceId: workspace.id,
  providerId: 'codex',
  model: 'gpt-5.2',
  effort: 'medium',
  name: 'Review PR #123',
  status: 'idle',
  attention: 'none',
  activity: null,
  contextWindow: null,
  workingDirectory: workspace.path,
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const cachedPullRequest: WorkspacePullRequest = {
  id: 'pr-cache-1',
  projectId: 'project-1',
  workspaceId: workspace.id,
  provider: 'github',
  lookupStatus: 'found',
  state: 'open',
  repositoryOwner: 'acme',
  repositoryName: 'app',
  number: 123,
  title: 'Add review workflow',
  url: 'https://github.com/acme/app/pull/123',
  isDraft: false,
  headBranch: 'feature/review',
  baseBranch: 'main',
  mergedAt: null,
  lastCheckedAt: '2026-01-01T00:00:00.000Z',
  error: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('PullRequestReviewService', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback?.(null, JSON.stringify(pullRequestJson), '')
      return null as never
    })
  })

  it('previews a pull request without creating a workspace', async () => {
    const deps = makeDeps()
    const service = new PullRequestReviewService(deps)

    await expect(
      service.previewReview({ projectId: 'project-1', reference: '#123' }),
    ).resolves.toMatchObject({
      projectId: 'project-1',
      projectName: 'App',
      repositoryOwner: 'acme',
      repositoryName: 'app',
      number: 123,
      title: 'Add review workflow',
      reviewBranchName: 'convergence/pr-123',
    })

    expect(deps.workspaces.create).not.toHaveBeenCalled()
    expect(deps.sessions.create).not.toHaveBeenCalled()
  })

  it('previews a pull request URL by resolving the matching project', async () => {
    const deps = makeDeps()
    const service = new PullRequestReviewService(deps)

    await expect(
      service.previewReview({
        projectId: 'other-project',
        reference: 'https://github.com/acme/app/pull/123',
      }),
    ).resolves.toMatchObject({
      projectId: 'project-1',
      projectName: 'App',
      repositoryOwner: 'acme',
      repositoryName: 'app',
      number: 123,
    })

    expect(deps.projects.getById).not.toHaveBeenCalled()
    expect(deps.git.getRemoteUrl).toHaveBeenCalledWith('/repo')
  })

  it('creates a review workspace, caches the PR, and starts a session', async () => {
    const deps = makeDeps()
    const service = new PullRequestReviewService(deps)

    await expect(
      service.prepareReviewSession({
        projectId: 'project-1',
        reference: '123',
        providerId: 'codex',
        model: 'gpt-5.2',
        effort: 'medium',
      }),
    ).resolves.toEqual({
      workspace,
      pullRequest: cachedPullRequest,
      session,
    })

    expect(deps.git.fetchPullRequestHead).toHaveBeenCalledWith({
      repoPath: '/repo',
      number: 123,
      localBranch: 'convergence/pr-123',
    })
    expect(deps.workspaces.create).toHaveBeenCalledWith({
      projectId: 'project-1',
      branchName: 'convergence/pr-123',
    })
    expect(deps.pullRequests.upsertForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
      }),
    )
    expect(deps.sessions.start).toHaveBeenCalledWith('session-1', {
      text: expect.stringContaining('Please review Pull Request #123'),
    })
  })

  it('reuses an existing clean review workspace', async () => {
    const deps = makeDeps({ existingWorkspace: workspace })
    const service = new PullRequestReviewService(deps)

    await service.prepareReviewSession({
      projectId: 'project-1',
      reference: '123',
      providerId: 'codex',
      model: 'gpt-5.2',
      effort: 'medium',
    })

    expect(deps.git.fetchPullRequestHead).not.toHaveBeenCalled()
    expect(deps.git.updateWorktreeToPullRequestHead).toHaveBeenCalledWith({
      worktreePath: workspace.path,
      number: 123,
    })
    expect(deps.workspaces.create).not.toHaveBeenCalled()
  })

  it('blocks dirty existing review workspaces', async () => {
    const deps = makeDeps({ existingWorkspace: workspace, dirty: true })
    const service = new PullRequestReviewService(deps)

    await expect(
      service.prepareReviewSession({
        projectId: 'project-1',
        reference: '123',
        providerId: 'codex',
        model: 'gpt-5.2',
        effort: 'medium',
      }),
    ).rejects.toThrow('existing review Workspace has local changes')
  })

  it('requires a configured project for pull request URLs', async () => {
    const deps = makeDeps({ remoteUrlByPath: { '/repo': null } })
    const service = new PullRequestReviewService(deps)

    await expect(
      service.previewReview({
        reference: 'https://github.com/acme/app/pull/123',
      }),
    ).rejects.toThrow('No Convergence Project is configured for acme/app')
  })

  it('blocks ambiguous pull request URL project matches', async () => {
    const deps = makeDeps({
      projects: [
        makeProject({ id: 'project-1', name: 'App', repositoryPath: '/repo' }),
        makeProject({
          id: 'project-2',
          name: 'App Copy',
          repositoryPath: '/repo-copy',
        }),
      ],
      remoteUrlByPath: {
        '/repo': 'https://github.com/acme/app.git',
        '/repo-copy': 'git@github.com:acme/app.git',
      },
    })
    const service = new PullRequestReviewService(deps)

    await expect(
      service.previewReview({
        reference: 'https://github.com/acme/app/pull/123',
      }),
    ).rejects.toThrow('Multiple Convergence Projects use acme/app')
  })
})

function makeDeps(input?: {
  existingWorkspace?: Workspace | null
  dirty?: boolean
  projects?: ReturnType<typeof makeProject>[]
  remoteUrlByPath?: Record<string, string | null>
}): {
  projects: ProjectService
  workspaces: WorkspaceService
  git: GitService
  pullRequests: PullRequestService
  sessions: SessionService
} {
  const projects = input?.projects ?? [
    makeProject({ id: 'project-1', name: 'App', repositoryPath: '/repo' }),
  ]
  const projectsById = new Map(projects.map((project) => [project.id, project]))
  const remoteUrlByPath = input?.remoteUrlByPath ?? {
    '/repo': 'https://github.com/acme/app.git',
  }

  return {
    projects: {
      getById: vi.fn((id: string) => projectsById.get(id) ?? null),
      getAll: vi.fn(() => projects),
    } as unknown as ProjectService,
    workspaces: {
      getByProjectIdAndBranch: vi
        .fn()
        .mockReturnValue(input?.existingWorkspace ?? null),
      create: vi.fn().mockResolvedValue(workspace),
    } as unknown as WorkspaceService,
    git: {
      getRemoteUrl: vi.fn((path: string) =>
        Promise.resolve(remoteUrlByPath[path] ?? null),
      ),
      fetchPullRequestHead: vi.fn().mockResolvedValue(undefined),
      updateWorktreeToPullRequestHead: vi.fn().mockResolvedValue(undefined),
      getStatus: vi
        .fn()
        .mockResolvedValue(input?.dirty ? [{ status: 'M', file: 'x.ts' }] : []),
    } as unknown as GitService,
    pullRequests: {
      upsertForWorkspace: vi.fn().mockReturnValue(cachedPullRequest),
    } as unknown as PullRequestService,
    sessions: {
      create: vi.fn().mockReturnValue(session),
      start: vi.fn().mockResolvedValue(undefined),
      getSummaryById: vi.fn().mockReturnValue(session),
    } as unknown as SessionService,
  }
}

function makeProject(input: {
  id: string
  name: string
  repositoryPath: string
}) {
  return {
    id: input.id,
    name: input.name,
    repositoryPath: input.repositoryPath,
    settings: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
