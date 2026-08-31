export interface Workspace {
  id: string
  projectId: string
  branchName: string
  path: string
  type: 'worktree'
  archivedAt: string | null
  worktreeRemovedAt: string | null
  createdAt: string
}

export interface ArchiveWorkspaceInput {
  id: string
  removeWorktree?: boolean
}

export interface BranchOutputFacts {
  branchName: string
  upstreamBranch: string | null
  remoteUrl: string | null
}

export interface GitStatusEntry {
  status: string
  file: string
}
