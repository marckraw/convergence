import type {
  FeedbackSubmissionResult,
  SubmitFeedbackInput,
} from './feedback.types'

export interface FeedbackServiceDeps {
  now?: () => Date
  idFactory?: () => string
}

export class FeedbackService {
  constructor(private readonly deps: FeedbackServiceDeps = {}) {}

  async submit(input: SubmitFeedbackInput): Promise<FeedbackSubmissionResult> {
    const message = input.message.trim()
    if (!message) {
      throw new Error('Feedback message is required.')
    }

    return {
      id: this.deps.idFactory?.() ?? crypto.randomUUID(),
      acceptedAt: (this.deps.now?.() ?? new Date()).toISOString(),
    }
  }
}
