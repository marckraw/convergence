import type { SessionPullRequestReading } from '@/shared/types/session-pull-request.types'
import type { WorkspacePullRequest } from './pull-request.types'

export const pullRequestApi = {
  getByWorkspaceId: (
    workspaceId: string,
  ): Promise<WorkspacePullRequest | null> =>
    window.electronAPI.pullRequest.getByWorkspaceId(workspaceId),

  listByProjectId: (projectId: string): Promise<WorkspacePullRequest[]> =>
    window.electronAPI.pullRequest.listByProjectId(projectId),

  getForSession: (sessionId: string): Promise<SessionPullRequestReading> =>
    window.electronAPI.pullRequest.getForSession(sessionId),

  refreshForSession: (sessionId: string): Promise<SessionPullRequestReading> =>
    window.electronAPI.pullRequest.refreshForSession(sessionId),
}
