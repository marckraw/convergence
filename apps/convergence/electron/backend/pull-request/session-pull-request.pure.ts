import type { SessionPullRequest } from '../../../src/shared/types/session-pull-request.types'

export function parseSessionPullRequest(
  raw: string | null | undefined,
): SessionPullRequest | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    if (
      !value ||
      !Number.isInteger(value.number) ||
      value.number < 1 ||
      typeof value.url !== 'string' ||
      !['open', 'merged', 'closed', 'draft'].includes(value.state) ||
      typeof value.headBranch !== 'string' ||
      typeof value.checkedAt !== 'string' ||
      !['gh', 'daemon'].includes(value.source)
    )
      return null
    return value
  } catch {
    return null
  }
}
