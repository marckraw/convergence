import type { SessionPullRequest } from '../../../src/shared/types/session-pull-request.types'

/**
 * Which part of a candidate reading this build could not use (MAR-2991).
 *
 * The parser refuses a reading that is missing any of its parts, and callers
 * that have to tell a person why must name the same part the parser stopped at
 * rather than re-deriving it -- one rule in one place. `'json'` is the reading
 * that was never an object to begin with.
 */
export type SessionPullRequestPart =
  | 'json'
  | 'number'
  | 'url'
  | 'state'
  | 'headBranch'
  | 'checkedAt'
  | 'source'

type SessionPullRequestRead =
  | { fact: SessionPullRequest; unreadable: null }
  | { fact: null; unreadable: SessionPullRequestPart }

/**
 * The whole rule, in order, so the first part that fails is the one reported.
 */
const parts: {
  name: SessionPullRequestPart
  reads: (value: Record<string, unknown>) => boolean
}[] = [
  {
    name: 'number',
    reads: (value) =>
      Number.isInteger(value.number) && (value.number as number) >= 1,
  },
  {
    name: 'url',
    reads: (value) => !!value.url && typeof value.url === 'string',
  },
  {
    name: 'state',
    reads: (value) =>
      ['open', 'merged', 'closed', 'draft'].includes(value.state as string),
  },
  {
    name: 'headBranch',
    reads: (value) => typeof value.headBranch === 'string',
  },
  { name: 'checkedAt', reads: (value) => typeof value.checkedAt === 'string' },
  {
    name: 'source',
    reads: (value) => ['gh', 'daemon'].includes(value.source as string),
  },
]

/** Reads a stored or freshly built fact, and names what stopped it if it does not. */
export function readSessionPullRequest(
  raw: string | null | undefined,
): SessionPullRequestRead {
  if (!raw) return { fact: null, unreadable: 'json' }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { fact: null, unreadable: 'json' }
  }
  if (!value || typeof value !== 'object')
    return { fact: null, unreadable: 'json' }
  const fields = value as Record<string, unknown>
  const missing = parts.find((part) => !part.reads(fields))
  if (missing) return { fact: null, unreadable: missing.name }
  return { fact: fields as unknown as SessionPullRequest, unreadable: null }
}

export function parseSessionPullRequest(
  raw: string | null | undefined,
): SessionPullRequest | null {
  return readSessionPullRequest(raw).fact
}
