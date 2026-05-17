import type {
  CodeReviewFilePatchRequest,
  CodeReviewListTargetsRequest,
  CodeReviewSummary,
  CodeReviewSummaryRequest,
  CodeReviewTarget,
} from './code-review.types'

export const codeReviewApi = {
  listTargets: (
    input: CodeReviewListTargetsRequest,
  ): Promise<CodeReviewTarget[]> =>
    window.electronAPI.codeReview.listTargets(input),

  getSummary: (input: CodeReviewSummaryRequest): Promise<CodeReviewSummary> =>
    window.electronAPI.codeReview.getSummary(input),

  getFilePatch: (input: CodeReviewFilePatchRequest): Promise<string> =>
    window.electronAPI.codeReview.getFilePatch(input),
}
