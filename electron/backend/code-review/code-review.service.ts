import type { ChangedFilesService } from '../git/changed-files.service'
import type { GitService } from '../git/git.service'
import type { ProjectService } from '../project/project.service'
import type { PullRequestService } from '../pull-request/pull-request.service'
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

interface CodeReviewServiceDeps {
  git: Pick<GitService, 'getCurrentBranch' | 'getStatus' | 'getDiff'>
  changedFiles: Pick<
    ChangedFilesService,
    'getBaseBranchStatus' | 'getBaseBranchDiff'
  >
  projects: Pick<ProjectService, 'getById'>
  workspaces: Pick<WorkspaceService, 'getByProjectId'>
  sessions: Pick<SessionService, 'getSummariesByProjectId'>
  pullRequests: Pick<PullRequestService, 'listByProjectId'>
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

    const [branchName, workspaces, sessions, pullRequests] = await Promise.all([
      this.resolveCurrentBranch(project.repositoryPath),
      Promise.resolve(this.deps.workspaces.getByProjectId(project.id)),
      Promise.resolve(this.deps.sessions.getSummariesByProjectId(project.id)),
      Promise.resolve(this.deps.pullRequests.listByProjectId(project.id)),
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

    const targets: Array<Omit<CodeReviewTarget, 'status'>> = [
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
        pullRequestLabel: null,
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
        pullRequestLabel: null,
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
        pullRequestLabel: null,
        source: 'session',
        updatedAt: session.updatedAt,
      })
    }

    for (const pullRequest of pullRequests) {
      const workspace = workspaceById.get(pullRequest.workspaceId)
      if (!workspace || workspace.archivedAt || workspace.worktreeRemovedAt) {
        continue
      }
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
        pullRequestLabel: formatPullRequestLabel(pullRequest),
        source: 'pull-request',
        updatedAt: pullRequest.updatedAt,
      })
    }

    const rankedTargets = prioritizeTargets(targets, input.sessionId ?? null)
    return Promise.all(
      rankedTargets.map(async (target) => ({
        ...target,
        status: await this.getTargetStatus(target.repositoryPath),
      })),
    )
  }

  async getSummary(
    input: CodeReviewSummaryRequest,
  ): Promise<CodeReviewSummary> {
    if (input.mode === 'base-branch') {
      if (!input.target.sessionId) {
        throw new Error('Base branch review requires a session-backed target')
      }
      return this.deps.changedFiles.getBaseBranchStatus(input.target.sessionId)
    }

    const files = await this.deps.git.getStatus(input.target.repositoryPath)
    return {
      base: null,
      files,
    }
  }

  async getFilePatch(input: CodeReviewFilePatchRequest): Promise<string> {
    if (input.mode === 'base-branch') {
      if (!input.target.sessionId) {
        throw new Error('Base branch review requires a session-backed target')
      }
      return this.deps.changedFiles.getBaseBranchDiff({
        sessionId: input.target.sessionId,
        filePath: input.filePath,
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

function prioritizeTargets<T extends Pick<CodeReviewTarget, 'sessionId'>>(
  targets: T[],
  sessionId: string | null,
): T[] {
  if (!sessionId) return targets
  return [...targets].sort((a, b) => {
    const aFocused = a.sessionId === sessionId
    const bFocused = b.sessionId === sessionId
    if (aFocused === bFocused) return 0
    return aFocused ? -1 : 1
  })
}

function formatPullRequestLabel(input: {
  number: number | null
  title: string | null
  state: string
}): string {
  const prefix = input.number ? `#${input.number}` : 'Pull Request'
  const title = input.title ? ` ${input.title}` : ''
  return `${prefix}${title} · ${input.state}`
}
