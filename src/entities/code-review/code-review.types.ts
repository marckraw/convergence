export type CodeReviewMode = 'working-tree' | 'base-branch'
export type CodeReviewPanelMode = CodeReviewMode | 'turns'
export type CodeReviewView = 'guide' | 'diff'

export type CodeReviewBaseBranchResolutionSource =
  | 'pull-request'
  | 'project-settings'
  | 'remote-default'
  | 'convention'
  | 'current-branch'

export interface CodeReviewBaseBranch {
  branchName: string
  comparisonRef: string
  source: CodeReviewBaseBranchResolutionSource
  warning: string | null
}

export interface CodeReviewFileEntry {
  status: string
  file: string
}

export type CodeReviewTargetSource =
  | 'session'
  | 'workspace'
  | 'project-repository'
  | 'pull-request'

export interface CodeReviewTargetStatus {
  workingTreeFileCount: number
  workingTreeStatusCounts: Record<string, number>
  error: string | null
}

export interface CodeReviewTarget {
  id: string
  projectId: string
  projectName: string
  repositoryPath: string
  workspaceId: string | null
  sessionId: string | null
  sessionName: string | null
  branchName: string | null
  pullRequestId: string | null
  pullRequestNumber: number | null
  pullRequestLabel: string | null
  pullRequestUrl: string | null
  pullRequestBaseBranch: string | null
  pullRequestHeadBranch: string | null
  source: CodeReviewTargetSource
  updatedAt: string | null
  status: CodeReviewTargetStatus
}

export interface CodeReviewListTargetsRequest {
  projectId: string
  sessionId?: string | null
}

export interface CodeReviewSummaryRequest {
  target: CodeReviewTarget
  mode: CodeReviewMode
}

export interface CodeReviewCacheIdentity {
  comparisonRef: string | null
  comparisonPoint: string | null
  workingTreeVersionToken: string
}

export interface CodeReviewFilePatchRequest extends CodeReviewSummaryRequest {
  filePath: string
  cacheIdentity: CodeReviewCacheIdentity
}

export interface CodeReviewSummary {
  base: CodeReviewBaseBranch | null
  cacheIdentity: CodeReviewCacheIdentity
  files: CodeReviewFileEntry[]
}
