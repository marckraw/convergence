import type {
  PreparePullRequestReviewSessionInput,
  PullRequestReviewPreview,
  PullRequestReviewSessionResult,
} from './pull-request-review.types'

export const pullRequestReviewApi = {
  previewReview: (input: {
    projectId?: string | null
    reference: string
  }): Promise<PullRequestReviewPreview> =>
    window.electronAPI.pullRequest.previewReview(input),

  prepareReviewSession: (
    input: PreparePullRequestReviewSessionInput,
  ): Promise<PullRequestReviewSessionResult> =>
    window.electronAPI.pullRequest.prepareReviewSession(input),
}
