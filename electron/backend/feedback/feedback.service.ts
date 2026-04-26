import type {
  FeedbackPriority,
  FeedbackSubmissionResult,
  SubmitFeedbackInput,
} from './feedback.types'

type Fetch = typeof fetch

export interface FeedbackServiceDeps {
  now?: () => Date
  idFactory?: () => string
  fetch?: Fetch
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  appVersion?: string
}

const SOURCE_APP = 'convergence'
const DEFAULT_BASE_URL = 'https://convergence-cloud.vercel.app'

export class FeedbackService {
  constructor(private readonly deps: FeedbackServiceDeps = {}) {}

  async submit(input: SubmitFeedbackInput): Promise<FeedbackSubmissionResult> {
    const title = input.title.trim()
    const description = input.description.trim()

    if (!title) {
      throw new Error('Feature request title is required.')
    }

    if (!description) {
      throw new Error('Feature request description is required.')
    }

    if (!isFeedbackPriority(input.priority)) {
      throw new Error('Feature request priority must be low, medium, or high.')
    }

    const env = this.deps.env ?? process.env
    const token = env.INTERNAL_API_TOKEN?.trim()
    if (!token) {
      throw new Error('INTERNAL_API_TOKEN is required to send feedback.')
    }

    const baseUrl = (
      env.CONVERGENCE_CLOUD_BASE_URL?.trim() || DEFAULT_BASE_URL
    ).replace(/\/+$/, '')
    const request = this.deps.fetch ?? fetch
    const response = await request(`${baseUrl}/api/feedback/feature-requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceApp: SOURCE_APP,
        title,
        description,
        priority: input.priority,
        metadata: {
          platform: this.deps.platform ?? process.platform,
          appVersion: this.deps.appVersion ?? null,
          contact: input.contact?.trim() || null,
          context: input.context ?? {},
        },
      }),
    })

    if (!response.ok) {
      throw new Error(
        `Feature request submission failed with HTTP ${response.status}.`,
      )
    }

    return {
      id: this.deps.idFactory?.() ?? crypto.randomUUID(),
      acceptedAt: (this.deps.now?.() ?? new Date()).toISOString(),
    }
  }
}

function isFeedbackPriority(value: unknown): value is FeedbackPriority {
  return value === 'low' || value === 'medium' || value === 'high'
}
