export type PullRequestProvider = 'github' | 'unknown'

export type PullRequestLookupStatus =
  | 'found'
  | 'not-found'
  | 'unsupported-remote'
  | 'gh-unavailable'
  | 'gh-auth-required'
  | 'error'

export type PullRequestState =
  | 'none'
  | 'open'
  | 'draft'
  | 'closed'
  | 'merged'
  | 'unknown'

export interface WorkspacePullRequest {
  id: string
  projectId: string
  workspaceId: string
  provider: PullRequestProvider
  lookupStatus: PullRequestLookupStatus
  state: PullRequestState
  repositoryOwner: string | null
  repositoryName: string | null
  number: number | null
  title: string | null
  url: string | null
  isDraft: boolean
  headBranch: string | null
  baseBranch: string | null
  mergedAt: string | null
  lastCheckedAt: string
  error: string | null
  createdAt: string
  updatedAt: string
}
