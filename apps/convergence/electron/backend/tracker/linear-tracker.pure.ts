import { trackerLabelGroupName } from './tracker-binding.pure'
import type {
  TrackerIssue,
  TrackerLogicalStatus,
  TrackerRefusal,
} from './tracker.types'

/**
 * The deterministic half of the Linear adapter (MAR-3084 R1, R2): the query
 * text, the response -> `TrackerIssue` parse, and the HTTP reply -> refusal
 * classification. The adapter only moves bytes.
 */

export const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql'
export const LINEAR_PAGE_SIZE = 100
/** A ceiling on pages per read, so a runaway cursor cannot spin a tick. */
export const LINEAR_MAX_PAGES = 20

/**
 * Issues in one project carrying any label whose PARENT is the seat group.
 *
 * Schema read against Linear's published SDK schema: `IssueLabel { name,
 * isGroup: Boolean!, parent: IssueLabel }`, and `IssueLabelCollectionFilter {
 * some: IssueLabelFilter { parent: IssueLabelFilter { name } } }`. The filter
 * only narrows the page; the parse below decides membership again, by parent.
 */
export const LINEAR_LABELED_ISSUES_QUERY = `query ConvergenceTrackerLabeledIssues($projectId: ID!, $seatGroup: String!, $after: String) {
  issues(
    first: ${LINEAR_PAGE_SIZE}
    after: $after
    filter: {
      project: { id: { eq: $projectId } }
      labels: { some: { parent: { name: { eq: $seatGroup } } } }
    }
  ) {
    nodes {
      id
      identifier
      title
      url
      branchName
      updatedAt
      state { name }
      labels { nodes { name parent { name } } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`

export function linearLabeledIssuesRequest(input: {
  projectId: string
  labelPrefix: string
  after: string | null
}): { query: string; variables: Record<string, string | null> } {
  return {
    query: LINEAR_LABELED_ISSUES_QUERY,
    variables: {
      projectId: input.projectId,
      seatGroup: trackerLabelGroupName(input.labelPrefix),
      after: input.after,
    },
  }
}

interface LinearLabelNode {
  name?: unknown
  parent?: { name?: unknown } | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * The child of `groupName` among an issue's labels, read as group/child.
 *
 * Never `name.split(':')`: a plain label somebody named `horse:opus` is not a
 * child of the `horse` group, holds no seat, and must not count.
 */
export function childOfLabelGroup(
  labels: readonly LinearLabelNode[],
  groupName: string,
): string | null {
  for (const label of labels) {
    if (
      isRecord(label.parent) &&
      label.parent.name === groupName &&
      typeof label.name === 'string' &&
      label.name.trim()
    ) {
      return label.name.trim()
    }
  }
  return null
}

export interface LinearIssuesPage {
  issues: TrackerIssue[]
  hasNextPage: boolean
  endCursor: string | null
}

/** Why a 200 body could not be read, or null when it could. */
export type LinearPageRead =
  | { ok: true; page: LinearIssuesPage }
  | { ok: false; refusal: TrackerRefusal }

function badResponse(message: string): { ok: false; refusal: TrackerRefusal } {
  return {
    ok: false,
    refusal: { kind: 'bad-response', message, retryAt: null },
  }
}

/**
 * One page of the response, parsed. An issue without a seat child is dropped
 * here, whatever the server-side filter let through.
 */
export function parseLinearIssuesPage(
  body: unknown,
  input: {
    labelPrefix: string
    wavePrefix: string
    statusMap: Record<string, TrackerLogicalStatus>
  },
): LinearPageRead {
  if (!isRecord(body)) return badResponse('Linear answered with no JSON body.')
  const issues = isRecord(body.data) ? body.data.issues : undefined
  if (!isRecord(issues) || !Array.isArray(issues.nodes)) {
    return badResponse('Linear answered without an issue list.')
  }
  const pageInfo = isRecord(issues.pageInfo) ? issues.pageInfo : {}
  const seatGroup = trackerLabelGroupName(input.labelPrefix)
  const waveGroup = trackerLabelGroupName(input.wavePrefix)

  const parsed: TrackerIssue[] = []
  for (const node of issues.nodes) {
    if (!isRecord(node))
      return badResponse('Linear answered a malformed issue.')
    const { id, identifier, title, url, updatedAt } = node
    if (
      typeof id !== 'string' ||
      typeof identifier !== 'string' ||
      typeof title !== 'string' ||
      typeof url !== 'string' ||
      typeof updatedAt !== 'string'
    ) {
      return badResponse('Linear answered an issue without its identity.')
    }
    const labelNodes =
      isRecord(node.labels) && Array.isArray(node.labels.nodes)
        ? (node.labels.nodes.filter(isRecord) as LinearLabelNode[])
        : []
    const seat = childOfLabelGroup(labelNodes, seatGroup)
    if (seat === null) continue
    const status =
      isRecord(node.state) && typeof node.state.name === 'string'
        ? node.state.name
        : ''
    parsed.push({
      id,
      identifier,
      title,
      url,
      status,
      logicalStatus: input.statusMap[status] ?? 'other',
      seat,
      wave: childOfLabelGroup(labelNodes, waveGroup),
      // No tracker field carries when `grounded` was set: a label has no
      // added-at, and the history query that does is a per-issue read this
      // slice does not spend on every tick. Null, never a guess.
      groundedAt: null,
      branchName: typeof node.branchName === 'string' ? node.branchName : null,
      updatedAt,
    })
  }

  return {
    ok: true,
    page: {
      issues: parsed,
      hasNextPage: pageInfo.hasNextPage === true,
      endCursor:
        typeof pageInfo.endCursor === 'string' ? pageInfo.endCursor : null,
    },
  }
}

function errorCodes(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.errors)) return []
  return body.errors.flatMap((error) =>
    isRecord(error) &&
    isRecord(error.extensions) &&
    typeof error.extensions.code === 'string'
      ? [error.extensions.code]
      : [],
  )
}

function hasErrors(body: unknown): boolean {
  return isRecord(body) && Array.isArray(body.errors) && body.errors.length > 0
}

/**
 * When a rate-limited reply says requests resume.
 *
 * Two spellings, both honoured: `Retry-After` in seconds (a 429), and Linear's
 * documented `X-RateLimit-Requests-Reset`, an epoch in milliseconds, which it
 * sends with a 400 whose `errors[].extensions.code` is `RATELIMITED`.
 */
export function linearRetryAt(
  headers: { get(name: string): string | null },
  now: Date,
): string | null {
  const retryAfter = headers.get('retry-after')
  if (retryAfter !== null && /^\d+$/.test(retryAfter.trim())) {
    return new Date(now.getTime() + Number(retryAfter) * 1000).toISOString()
  }
  const reset = headers.get('x-ratelimit-requests-reset')
  if (reset !== null && /^\d+$/.test(reset.trim())) {
    const at = Number(reset)
    if (at > now.getTime()) return new Date(at).toISOString()
  }
  return null
}

/**
 * A reply that is not a readable page, as a typed refusal -- or null when the
 * body should be parsed. A 200 carrying `errors[]` is a refusal, never a
 * success: Linear answers 200 to a partially failed query.
 */
export function classifyLinearReply(input: {
  status: number
  headers: { get(name: string): string | null }
  body: unknown
  now: Date
}): TrackerRefusal | null {
  const codes = errorCodes(input.body)
  if (input.status === 429 || codes.includes('RATELIMITED')) {
    return {
      kind: 'rate-limited',
      message: 'Linear is rate limiting this key.',
      retryAt: linearRetryAt(input.headers, input.now),
    }
  }
  if (
    input.status === 401 ||
    input.status === 403 ||
    codes.includes('AUTHENTICATION_ERROR')
  ) {
    return {
      kind: 'unauthorized',
      message: 'Linear refused the API key.',
      retryAt: null,
    }
  }
  if (input.status >= 500) {
    return {
      kind: 'unreachable',
      message: `Linear answered ${input.status}.`,
      retryAt: null,
    }
  }
  if (input.status !== 200) {
    return {
      kind: 'bad-response',
      message: `Linear answered ${input.status}.`,
      retryAt: null,
    }
  }
  if (hasErrors(input.body)) {
    return {
      kind: 'bad-response',
      message: 'Linear answered with errors.',
      retryAt: null,
    }
  }
  return null
}
