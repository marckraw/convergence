import type {
  ChangedFileEntry,
  ResolvedBaseBranch,
} from '../git/changed-files.types'

export type CodeReviewMode = 'working-tree' | 'base-branch'

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
  pullRequestLabel: string | null
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

export interface CodeReviewFilePatchRequest extends CodeReviewSummaryRequest {
  filePath: string
}

export interface CodeReviewSummary {
  base: ResolvedBaseBranch | null
  files: ChangedFileEntry[]
}
