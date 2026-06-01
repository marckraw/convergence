import type { ChangedFilesService } from '../git/changed-files.service'
import type { GitService } from '../git/git.service'
import type { ProjectService } from '../project/project.service'
import type { PullRequestService } from '../pull-request/pull-request.service'
import type {
  ProjectPullRequest,
  WorkspacePullRequest,
} from '../pull-request/pull-request.types'
import type { SessionService } from '../session/session.service'
import type { WorkspaceService } from '../workspace/workspace.service'
import type {
  CodeReviewListTargetsRequest,
  CodeReviewFilePatchRequest,
  CodeReviewSummary,
  CodeReviewSummaryRequest,
  CodeReviewTarget,
  CodeReviewTargetStatus,
} from './code-review.types'
import { formatPullRequestLabel, prioritizeTargets } from './code-review.pure'

interface CodeReviewServiceDeps {
  git: Pick<
    GitService,
    | 'getCurrentBranch'
    | 'getStatus'
    | 'getDiff'
    | 'getWorkingTreeVersionToken'
    | 'getPullRequestStatus'
    | 'getPullRequestDiff'
  >
  changedFiles: Pick<
    ChangedFilesService,
    'getBaseBranchStatus' | 'getBaseBranchDiff'
  >
  projects: Pick<ProjectService, 'getById'>
  workspaces: Pick<WorkspaceService, 'getByProjectId'>
  sessions: Pick<SessionService, 'getSummariesByProjectId'>
  pullRequests: Pick<
    PullRequestService,
    'listByProjectId' | 'listOpenByProjectId'
  >
}

type CodeReviewTargetDraft = Omit<CodeReviewTarget, 'status'> & {
  status?: CodeReviewTargetStatus
}

export class CodeReviewService {
  constructor(private deps: CodeReviewServiceDeps) {}

  async listTargets(
    input: CodeReviewListTargetsRequest,
  ): Promise<CodeReviewTarget[]> {
    const project = this.deps.projects.getById(input.projectId)
    if (!project) {
      throw new Error(`Project not found: ${input.projectId}`)
    }

    const [branchName, workspaces, sessions, pullRequests, openPullRequests] =
      await Promise.all([
        this.resolveCurrentBranch(project.repositoryPath),
        Promise.resolve(this.deps.workspaces.getByProjectId(project.id)),
        Promise.resolve(this.deps.sessions.getSummariesByProjectId(project.id)),
        Promise.resolve(this.deps.pullRequests.listByProjectId(project.id)),
        this.deps.pullRequests.listOpenByProjectId(project.id),
      ])

    const workspaceById = new Map(
      workspaces.map((workspace) => [workspace.id, workspace]),
    )
    const sessionsByWorkspaceId = new Map<string, typeof sessions>()
    for (const session of sessions) {
      if (!session.workspaceId) continue
      const existing = sessionsByWorkspaceId.get(session.workspaceId) ?? []
      existing.push(session)
      sessionsByWorkspaceId.set(session.workspaceId, existing)
    }

    const targets: CodeReviewTargetDraft[] = [
      {
        id: `project-repository:${project.id}`,
        projectId: project.id,
        projectName: project.name,
        repositoryPath: project.repositoryPath,
        workspaceId: null,
        sessionId: null,
        sessionName: null,
        branchName,
        pullRequestId: null,
        pullRequestNumber: null,
        pullRequestLabel: null,
        pullRequestUrl: null,
        pullRequestBaseBranch: null,
        pullRequestHeadBranch: null,
        source: 'project-repository',
        updatedAt: project.updatedAt,
      },
    ]

    for (const workspace of workspaces) {
      if (workspace.archivedAt || workspace.worktreeRemovedAt) continue
      targets.push({
        id: `workspace:${workspace.id}`,
        projectId: project.id,
        projectName: project.name,
        repositoryPath: workspace.path,
        workspaceId: workspace.id,
        sessionId: null,
        sessionName: null,
        branchName: workspace.branchName,
        pullRequestId: null,
        pullRequestNumber: null,
        pullRequestLabel: null,
        pullRequestUrl: null,
        pullRequestBaseBranch: null,
        pullRequestHeadBranch: null,
        source: 'workspace',
        updatedAt: workspace.createdAt,
      })
    }

    for (const session of sessions) {
      if (session.archivedAt || session.contextKind !== 'project') continue
      const workspace = session.workspaceId
        ? (workspaceById.get(session.workspaceId) ?? null)
        : null
      if (workspace?.worktreeRemovedAt) continue
      targets.push({
        id: `session:${session.id}`,
        projectId: project.id,
        projectName: project.name,
        repositoryPath: workspace?.path ?? session.workingDirectory,
        workspaceId: session.workspaceId,
        sessionId: session.id,
        sessionName: session.name,
        branchName: workspace?.branchName ?? null,
        pullRequestId: null,
        pullRequestNumber: null,
        pullRequestLabel: null,
        pullRequestUrl: null,
        pullRequestBaseBranch: null,
        pullRequestHeadBranch: null,
        source: 'session',
        updatedAt: session.updatedAt,
      })
    }

    const cachedPullRequestKeys = new Set<string>()
    for (const pullRequest of pullRequests) {
      const workspace = workspaceById.get(pullRequest.workspaceId)
      if (!workspace || workspace.archivedAt || workspace.worktreeRemovedAt) {
        continue
      }
      const pullRequestKey = buildPullRequestKey(pullRequest)
      if (pullRequestKey) cachedPullRequestKeys.add(pullRequestKey)
      const workspaceSessions = sessionsByWorkspaceId.get(workspace.id) ?? []
      const linkedSession = workspaceSessions.find(
        (session) => !session.archivedAt,
      )
      targets.push({
        id: `pull-request:${pullRequest.id}`,
        projectId: project.id,
        projectName: project.name,
        repositoryPath: workspace.path,
        workspaceId: workspace.id,
        sessionId: linkedSession?.id ?? null,
        sessionName: linkedSession?.name ?? null,
        branchName: workspace.branchName,
        pullRequestId: pullRequest.id,
        pullRequestNumber: pullRequest.number,
        pullRequestLabel: formatPullRequestLabel(pullRequest),
        pullRequestUrl: pullRequest.url,
        pullRequestBaseBranch: pullRequest.baseBranch,
        pullRequestHeadBranch: pullRequest.headBranch,
        source: 'pull-request',
        updatedAt: pullRequest.updatedAt,
      })
    }

    for (const pullRequest of openPullRequests) {
      const pullRequestKey = buildPullRequestKey(pullRequest)
      if (cachedPullRequestKeys.has(pullRequestKey)) continue

      targets.push({
        id: `pull-request:github:${pullRequest.repositoryOwner}/${pullRequest.repositoryName}#${pullRequest.number}`,
        projectId: project.id,
        projectName: project.name,
        repositoryPath: project.repositoryPath,
        workspaceId: null,
        sessionId: null,
        sessionName: null,
        branchName: pullRequest.headBranch,
        pullRequestId: null,
        pullRequestNumber: pullRequest.number,
        pullRequestLabel: formatPullRequestLabel(pullRequest),
        pullRequestUrl: pullRequest.url,
        pullRequestBaseBranch: pullRequest.baseBranch,
        pullRequestHeadBranch: pullRequest.headBranch,
        source: 'pull-request',
        updatedAt: pullRequest.updatedAt,
        status: {
          workingTreeFileCount: pullRequest.changedFileCount ?? 0,
          workingTreeStatusCounts: {},
          error: null,
        },
      })
    }

    const rankedTargets = prioritizeTargets(targets, input.sessionId ?? null)
    return Promise.all(
      rankedTargets.map(async (target) => ({
        ...target,
        status:
          target.status ?? (await this.getTargetStatus(target.repositoryPath)),
      })),
    )
  }

  async getSummary(
    input: CodeReviewSummaryRequest,
  ): Promise<CodeReviewSummary> {
    if (isRemotePullRequestTarget(input.target)) {
      const summary = await this.deps.git.getPullRequestStatus({
        repoPath: input.target.repositoryPath,
        number: input.target.pullRequestNumber,
        baseBranch: input.target.pullRequestBaseBranch,
      })
      return {
        base: {
          branchName: input.target.pullRequestBaseBranch,
          comparisonRef: summary.comparisonRef,
          source: 'pull-request',
          warning: null,
        },
        cacheIdentity: {
          comparisonRef: summary.comparisonRef,
          comparisonPoint: summary.comparisonPoint,
          workingTreeVersionToken: summary.versionToken,
        },
        files: summary.files,
      }
    }

    if (input.mode === 'base-branch') {
      if (!input.target.sessionId) {
        throw new Error('Base branch review requires a session-backed target')
      }
      const [summary, workingTreeVersionToken] = await Promise.all([
        this.deps.changedFiles.getBaseBranchStatus(input.target.sessionId),
        this.deps.git.getWorkingTreeVersionToken(input.target.repositoryPath),
      ])
      return {
        base: summary.base,
        cacheIdentity: {
          comparisonRef: summary.base.comparisonRef,
          comparisonPoint: summary.comparisonPoint,
          workingTreeVersionToken,
        },
        files: summary.files,
      }
    }

    const [files, workingTreeVersionToken] = await Promise.all([
      this.deps.git.getStatus(input.target.repositoryPath),
      this.deps.git.getWorkingTreeVersionToken(input.target.repositoryPath),
    ])
    return {
      base: null,
      cacheIdentity: {
        comparisonRef: null,
        comparisonPoint: null,
        workingTreeVersionToken,
      },
      files,
    }
  }

  async getFilePatch(input: CodeReviewFilePatchRequest): Promise<string> {
    if (isRemotePullRequestTarget(input.target)) {
      return this.deps.git.getPullRequestDiff({
        repoPath: input.target.repositoryPath,
        number: input.target.pullRequestNumber,
        baseBranch: input.target.pullRequestBaseBranch,
        comparisonPoint: input.cacheIdentity.comparisonPoint,
        filePath: input.filePath,
      })
    }

    if (input.mode === 'base-branch') {
      if (!input.target.sessionId) {
        throw new Error('Base branch review requires a session-backed target')
      }
      return this.deps.changedFiles.getBaseBranchDiff({
        sessionId: input.target.sessionId,
        filePath: input.filePath,
        comparisonPoint: input.cacheIdentity.comparisonPoint,
      })
    }

    return this.deps.git.getDiff(input.target.repositoryPath, input.filePath)
  }

  private async resolveCurrentBranch(
    repositoryPath: string,
  ): Promise<string | null> {
    try {
      return await this.deps.git.getCurrentBranch(repositoryPath)
    } catch {
      return null
    }
  }

  private async getTargetStatus(
    repositoryPath: string,
  ): Promise<CodeReviewTargetStatus> {
    try {
      const files = await this.deps.git.getStatus(repositoryPath)
      return {
        workingTreeFileCount: files.length,
        workingTreeStatusCounts: files.reduce<Record<string, number>>(
          (counts, file) => {
            counts[file.status] = (counts[file.status] ?? 0) + 1
            return counts
          },
          {},
        ),
        error: null,
      }
    } catch (err) {
      return {
        workingTreeFileCount: 0,
        workingTreeStatusCounts: {},
        error:
          err instanceof Error ? err.message : 'Failed to inspect working tree',
      }
    }
  }
}

function buildPullRequestKey(
  pullRequest: Pick<
    WorkspacePullRequest | ProjectPullRequest,
    'repositoryOwner' | 'repositoryName' | 'number'
  >,
): string {
  return [
    pullRequest.repositoryOwner?.toLowerCase() ?? '',
    pullRequest.repositoryName?.toLowerCase() ?? '',
    pullRequest.number ?? '',
  ].join('#')
}

function isRemotePullRequestTarget(
  target: CodeReviewTarget,
): target is CodeReviewTarget & {
  pullRequestNumber: number
  pullRequestBaseBranch: string
} {
  return (
    target.source === 'pull-request' &&
    !target.workspaceId &&
    typeof target.pullRequestNumber === 'number' &&
    typeof target.pullRequestBaseBranch === 'string' &&
    target.pullRequestBaseBranch.trim().length > 0
  )
}
