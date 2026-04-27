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

function isFeedbackPriority(value: unknown): value is FeedbackPriority {
  return value === 'low' || value === 'medium' || value === 'high'
}

const MAX_DETAIL_LENGTH = 500

interface ErrorDetail {
  message: string
  raw: string
}

async function readErrorDetail(response: Response): Promise<ErrorDetail> {
  let body: string
  try {
    body = await response.text()
  } catch {
    return { message: '', raw: '' }
  }

  const trimmed = body.trim()
  if (!trimmed) {
    return { message: '', raw: '' }
  }

  let detail: string | null = null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      const candidate = record.error ?? record.message ?? record.detail
      if (typeof candidate === 'string' && candidate.trim()) {
        detail = candidate.trim()
      } else if (Array.isArray(record.errors)) {
        const messages = record.errors
          .map((entry) => {
            if (typeof entry === 'string') return entry
            if (entry && typeof entry === 'object' && 'message' in entry) {
              const message = (entry as { message?: unknown }).message
              if (typeof message === 'string') return message
            }
            return null
          })
          .filter((value): value is string => Boolean(value && value.trim()))
        if (messages.length > 0) {
          detail = messages.join('; ')
        }
      }
      if (!detail) {
        const compact = JSON.stringify(parsed)
        detail = compact === '{}' ? '' : compact
      }
    } else if (typeof parsed === 'string' && parsed.trim()) {
      detail = parsed.trim()
    } else {
      detail = trimmed
    }
  } catch {
    detail = trimmed
  }

  if (!detail) {
    return { message: '', raw: trimmed }
  }

  if (detail.length > MAX_DETAIL_LENGTH) {
    detail = `${detail.slice(0, MAX_DETAIL_LENGTH)}…`
  }
  return { message: detail, raw: trimmed }
}
