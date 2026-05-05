import type { ReasoningEffort, SessionSummary } from '@/entities/session'
import type { Workspace } from '@/entities/workspace'
import type {
  PullRequestState,
  WorkspacePullRequest,
} from './pull-request.types'

export interface PullRequestReviewPreview {
  projectId: string
  projectName: string
  repositoryOwner: string
  repositoryName: string
  number: number
  title: string | null
  url: string | null
  state: PullRequestState
  isDraft: boolean
  headBranch: string | null
  baseBranch: string | null
  mergedAt: string | null
  reviewBranchName: string
}

export interface PreparePullRequestReviewSessionInput {
  projectId?: string | null
  reference: string
  providerId: string
  model: string | null
  effort: ReasoningEffort | null
  sessionName?: string
}

export interface PullRequestReviewSessionResult {
  workspace: Workspace
  pullRequest: WorkspacePullRequest
  session: SessionSummary
}
