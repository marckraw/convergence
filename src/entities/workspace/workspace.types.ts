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

export type ChangedFilesMode = 'working-tree' | 'base-branch' | 'turns'

export type BaseBranchResolutionSource =
  | 'pull-request'
  | 'project-settings'
  | 'remote-default'
  | 'convention'
  | 'current-branch'

export interface ResolvedBaseBranch {
  branchName: string
  comparisonRef: string
  source: BaseBranchResolutionSource
  warning: string | null
}

export interface BaseBranchDiffSummary {
  base: ResolvedBaseBranch
  files: GitStatusEntry[]
}
