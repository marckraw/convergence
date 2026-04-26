export type FeedbackPriority = 'low' | 'medium' | 'high'

export interface FeedbackContext {
  activeProjectId?: string | null
  activeProjectName?: string | null
  activeSessionId?: string | null
  appUrl?: string | null
}

export interface SubmitFeedbackInput {
  title: string
  description: string
  priority: FeedbackPriority
  contact?: string | null
  context?: FeedbackContext
}

export interface FeedbackSubmissionResult {
  id: string
  acceptedAt: string
}
