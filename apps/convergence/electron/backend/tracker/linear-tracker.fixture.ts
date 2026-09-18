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

/**
 * The three shapes R1 reads `blocked` from (MAR-3138): the plain label, a
 * group child that merely shares its name, and an issue without it.
 */
export const RECORDED_BLOCKED_LABEL_PAGE = linearIssuesBody([
  linearIssueNode({
    id: 'issue-blocked',
    identifier: 'EX-10',
    labels: [linearLabel('opus', 'horse'), linearLabel('Blocked', null)],
  }),
  linearIssueNode({
    id: 'issue-blocked-wave',
    identifier: 'EX-11',
    labels: [linearLabel('opus', 'horse'), linearLabel('blocked', 'wave')],
  }),
  linearIssueNode({
    id: 'issue-unblocked',
    identifier: 'EX-12',
    labels: [linearLabel('opus', 'horse'), linearLabel('grounded', null)],
  }),
])

/**
 * A projects lookup reply (MAR-3156), in the shape
 * `{ data: { projects: { nodes: [...] } } }` the query asks for. Synthetic
 * ids and a synthetic workspace, as everything here is.
 */
export function linearProjectNode(input: {
  id: string
  name: string
  slug?: string
}) {
  return {
    id: input.id,
    name: input.name,
    url: `https://linear.app/example/project/${input.slug ?? input.name.toLowerCase()}-${input.id}`,
  }
}

export function linearProjectsBody(
  nodes: ReturnType<typeof linearProjectNode>[],
) {
  return { data: { projects: { nodes } } }
}

/** The one project a right reference reaches. */
export const RECORDED_ONE_PROJECT_BODY = linearProjectsBody([
  linearProjectNode({ id: '0a1b2c3d4e5f', name: 'convergence' }),
])

/** Two projects a person's NAME can reach: the question only they can settle. */
export const RECORDED_TWO_PROJECT_BODY = linearProjectsBody([
  linearProjectNode({ id: '0a1b2c3d4e5f', name: 'convergence' }),
  linearProjectNode({
    id: 'aabbccddeeff',
    name: 'Convergence',
    slug: 'convergence-old',
  }),
])

/** Nothing answers: an empty node list, never an error. */
export const RECORDED_NO_PROJECT_BODY = linearProjectsBody([])

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
