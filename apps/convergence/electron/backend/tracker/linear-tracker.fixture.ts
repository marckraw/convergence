/**
 * Recorded Linear shapes (MAR-3084 R1/R2), written from Linear's published
 * schema and its documented error contract -- never a live response. Every id
 * is synthetic; nothing here comes from a real workspace.
 */

export function linearLabel(name: string, parent: string | null) {
  return { name, parent: parent === null ? null : { name: parent } }
}

export function linearIssueNode(input: {
  id: string
  identifier: string
  title?: string
  state?: string
  labels: ReturnType<typeof linearLabel>[]
  branchName?: string
}) {
  return {
    id: input.id,
    identifier: input.identifier,
    title: input.title ?? `Issue ${input.identifier}`,
    url: `https://linear.app/example/issue/${input.identifier.toLowerCase()}`,
    branchName:
      input.branchName ?? `example/${input.identifier.toLowerCase()}-work`,
    updatedAt: '2026-09-17T08:00:00.000Z',
    state: { name: input.state ?? 'Todo' },
    labels: { nodes: input.labels },
  }
}

export function linearIssuesBody(
  nodes: ReturnType<typeof linearIssueNode>[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null } = {
    hasNextPage: false,
    endCursor: null,
  },
) {
  return { data: { issues: { nodes, pageInfo } } }
}

/** The two-issue page R1 reads: one seat by group, one plain look-alike. */
export const RECORDED_TWO_ISSUE_PAGE = linearIssuesBody([
  linearIssueNode({
    id: 'issue-grouped',
    identifier: 'EX-1',
    state: 'In Progress',
    labels: [
      linearLabel('opus', 'horse'),
      linearLabel('loom-p2', 'wave'),
      linearLabel('grounded', null),
    ],
  }),
  linearIssueNode({
    id: 'issue-plain',
    identifier: 'EX-2',
    state: 'Todo',
    labels: [
      linearLabel('horse:opus', null),
      linearLabel('wave:loom-p2', null),
    ],
  }),
])

/** Linear's refusal of a bad key. */
export const RECORDED_UNAUTHORIZED_BODY = {
  errors: [
    {
      message: 'Authentication required, not authenticated',
      extensions: {
        type: 'authentication error',
        code: 'AUTHENTICATION_ERROR',
        userPresentableMessage:
          'You need to authenticate to access this operation.',
      },
    },
  ],
}

/** Linear's documented rate limit: HTTP 400 with `RATELIMITED`. */
export const RECORDED_RATELIMITED_BODY = {
  errors: [
    {
      message: 'Rate limit exceeded',
      extensions: { code: 'RATELIMITED' },
    },
  ],
}

/**
 * A 200 that failed: GraphQL partial success -- a readable page AND errors[].
 * Read as a page, a field that failed would silently be an empty one.
 */
export const RECORDED_200_WITH_ERRORS_BODY = {
  ...RECORDED_TWO_ISSUE_PAGE,
  errors: [
    {
      message: 'Cannot return null for non-nullable field',
      path: ['issues', 'nodes', 1, 'labels'],
      extensions: { code: 'INVALID_INPUT' },
    },
  ],
}

export function recordedReply(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  )
  return {
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    json: async () => body,
  }
}
