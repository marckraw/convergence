import type { GuidedReviewBackend } from '@/entities/app-settings'

export function getGuidedReviewRemoteBaseUrlError(
  backend: GuidedReviewBackend,
  value: string,
): string | null {
  if (backend === 'local') return null

  const trimmed = value.trim()
  if (!trimmed) return 'Remote daemon base URL is required.'

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return null
    }
  } catch {
    return 'Remote daemon base URL must be a valid HTTP(S) URL.'
  }

  return 'Remote daemon base URL must be a valid HTTP(S) URL.'
}
