import type { WorkspacePullRequest } from './pull-request.types'

export const pullRequestApi = {
  getByWorkspaceId: (
    workspaceId: string,
  ): Promise<WorkspacePullRequest | null> =>
    window.electronAPI.pullRequest.getByWorkspaceId(workspaceId),

  refreshForSession: (
    sessionId: string,
  ): Promise<WorkspacePullRequest | null> =>
    window.electronAPI.pullRequest.refreshForSession(sessionId),
}
