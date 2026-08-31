import type { WorkspacePullRequest } from './pull-request.types'

export const pullRequestApi = {
  getByWorkspaceId: (
    workspaceId: string,
  ): Promise<WorkspacePullRequest | null> =>
    window.electronAPI.pullRequest.getByWorkspaceId(workspaceId),

  listByProjectId: (projectId: string): Promise<WorkspacePullRequest[]> =>
    window.electronAPI.pullRequest.listByProjectId(projectId),

  refreshForSession: (
    sessionId: string,
  ): Promise<WorkspacePullRequest | null> =>
    window.electronAPI.pullRequest.refreshForSession(sessionId),
}
