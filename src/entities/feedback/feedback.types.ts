export type FeedbackKind = 'bug' | 'idea' | 'ui' | 'other'

export interface FeedbackContext {
  activeProjectId?: string | null
  activeProjectName?: string | null
  activeSessionId?: string | null
  appUrl?: string | null
}

export interface SubmitFeedbackInput {
  kind: FeedbackKind
  message: string
  contact?: string | null
  context?: FeedbackContext
}

export interface FeedbackSubmissionResult {
  id: string
  acceptedAt: string
}
