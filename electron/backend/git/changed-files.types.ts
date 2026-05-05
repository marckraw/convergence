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

export interface ChangedFileEntry {
  status: string
  file: string
}

export interface BaseBranchDiffSummary {
  base: ResolvedBaseBranch
  files: ChangedFileEntry[]
}

export interface BaseBranchDiffRequest {
  sessionId: string
  filePath: string
}
