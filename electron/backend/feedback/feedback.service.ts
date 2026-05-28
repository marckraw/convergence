import type {
  FeedbackSubmissionResult,
  SubmitFeedbackInput,
} from './feedback.types'
import { DEFAULT_BASE_URL, SOURCE_APP } from './feedback.constants'
import { isFeedbackPriority, readErrorDetail } from './feedback.pure'

type Fetch = typeof fetch

export interface FeedbackServiceDeps {
  now?: () => Date
  idFactory?: () => string
  fetch?: Fetch
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  appVersion?: string
}

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
    const token = env.FEEDBACK_TOKEN?.trim()
    if (!token) {
      throw new Error('FEEDBACK_TOKEN is required to send feedback.')
    }

    const baseUrl = (
      env.CONVERGENCE_CLOUD_BASE_URL?.trim() || DEFAULT_BASE_URL
    ).replace(/\/+$/, '')
    const request = this.deps.fetch ?? fetch
    const metadata: Record<string, string> = {
      platform: this.deps.platform ?? process.platform,
    }
    const appVersion = this.deps.appVersion?.trim()
    if (appVersion) {
      metadata.appVersion = appVersion
    }
    const contact = input.contact?.trim()
    if (contact) {
      metadata.contact = contact
    }
    if (input.context) {
      for (const [key, value] of Object.entries(input.context)) {
        if (typeof value === 'string' && value.trim()) {
          metadata[`context.${key}`] = value
        }
      }
    }
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
        metadata,
      }),
    })

    if (!response.ok) {
      const detail = await readErrorDetail(response)
      console.error(
        `[feedback] submission failed: HTTP ${response.status} ${response.statusText}`,
        detail.raw,
      )
      const suffix = detail.message || response.statusText
      throw new Error(
        `Feature request submission failed with HTTP ${response.status}${
          suffix ? `: ${suffix}` : '.'
        }`,
      )
    }

    return {
      id: this.deps.idFactory?.() ?? crypto.randomUUID(),
      acceptedAt: (this.deps.now?.() ?? new Date()).toISOString(),
    }
  }
}
