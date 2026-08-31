import type {
  FeedbackSubmissionResult,
  SubmitFeedbackInput,
} from './feedback.types'

export const feedbackApi = {
  submit: (input: SubmitFeedbackInput): Promise<FeedbackSubmissionResult> =>
    window.electronAPI.feedback.submit(input),
}
