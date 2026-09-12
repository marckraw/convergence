/** Verified by GitHub CLI; daemon URLs only request another lookup. */
export interface SessionPullRequest {
  number: number
  url: string
  state: 'open' | 'merged' | 'closed' | 'draft'
  headBranch: string
  checkedAt: string
  source: 'gh' | 'daemon'
}

export interface SessionPullRequestReading {
  pullRequest: SessionPullRequest | null
  branchName: string | null
  message: string | null
}
