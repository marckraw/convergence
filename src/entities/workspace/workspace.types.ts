export interface Workspace {
  id: string
  projectId: string
  branchName: string
  path: string
  type: 'worktree'
  createdAt: string
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
