/**
 * Recorded Linear shapes (MAR-3084 R1/R2), written from Linear's published
 * schema and its documented error contract -- never a live response. Every id
 * is synthetic; nothing here comes from a real workspace.
 */

import type { TrackerIssue } from './tracker.types'

/**
 * A `TrackerIssue` as the port answers with one, for tests.
 *
 * One builder rather than a literal per suite (MAR-3190): the shape grows
 * every time the read model widens, and a literal per suite means the next
 * field is added in six places or -- worse -- defaulted differently in each.
 */
export function trackerIssue(
  overrides: Partial<TrackerIssue> & Pick<TrackerIssue, 'id'>,
): TrackerIssue {
  return {
    identifier: 'EX-1',
    title: 'The work',
    url: 'https://linear.app/example/issue/ex-1',
    status: 'In Progress',
    logicalStatus: 'in-progress',
    seat: 'opus',
    wave: null,
    blocked: false,
    groomMe: false,
    groomed: false,
    grounded: false,
    dispatch: false,
    priority: null,
    labels: [],
    summary: null,
    groundedAt: null,
    branchName: null,
    updatedAt: '2026-09-17T08:00:00.000Z',
    ...overrides,
  }
}

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
  updatedAt?: string
  priority?: unknown
}) {
  return {
    id: input.id,
    identifier: input.identifier,
    title: input.title ?? `Issue ${input.identifier}`,
    url: `https://linear.app/example/issue/${input.identifier.toLowerCase()}`,
    branchName:
      input.branchName ?? `example/${input.identifier.toLowerCase()}-work`,
    updatedAt: input.updatedAt ?? '2026-09-17T08:00:00.000Z',
    // Linear answers `priority: Float!`, so it is always on the node; the
    // pages that leave it out are the ones R3 reads as null.
    ...('priority' in input ? { priority: input.priority } : {}),
    state: { name: input.state ?? 'Todo' },
    labels: { nodes: input.labels },
  }
}

/** One issue body reply node, as `LINEAR_ISSUE_BODIES_QUERY` asks for it. */
export function linearIssueBodiesBody(
  nodes: { id: string; description?: string | null }[],
) {
  return {
    data: {
      issues: {
        nodes: nodes.map((node) => ({
          id: node.id,
          description: node.description ?? null,
        })),
      },
    },
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
 * ids and a synthetic workspace, as everything here is -- and the ids are
 * UUIDs, as Linear's are, so a resolved id re-reads as an id (lap 2, D).
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
  linearProjectNode({
    id: '4f6d2a1e-8b3c-4d5e-9f01-2a3b4c5d6e7f',
    name: 'convergence',
  }),
])

/** Two projects a person's NAME can reach: the question only they can settle. */
export const RECORDED_TWO_PROJECT_BODY = linearProjectsBody([
  linearProjectNode({
    id: '4f6d2a1e-8b3c-4d5e-9f01-2a3b4c5d6e7f',
    name: 'convergence',
  }),
  linearProjectNode({
    id: '7c1b9e04-2f5a-4c8d-b3e6-1d0a9f8e7c6b',
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

/**
 * The page R1 reads membership from (MAR-3190): one issue per way IN, and one
 * that only looks like it belongs.
 *
 * Recorded against the widened filter, which asks for any Loom label — so a
 * `groom-me` issue with no seat is exactly what Linear now returns, and the
 * parse has to keep it.
 */
export const RECORDED_LOOM_MEMBERSHIP_PAGE = linearIssuesBody([
  linearIssueNode({
    id: 'issue-seat',
    identifier: 'EX-20',
    state: 'In Progress',
    labels: [linearLabel('opus-mac', 'horse')],
    priority: 2,
  }),
  linearIssueNode({
    id: 'issue-wave',
    identifier: 'EX-21',
    labels: [linearLabel('loom-view', 'wave')],
  }),
  linearIssueNode({
    id: 'issue-groom-me',
    identifier: 'EX-22',
    state: 'Backlog',
    labels: [linearLabel('groom-me', null)],
  }),
  linearIssueNode({
    id: 'issue-groomed-grounded',
    identifier: 'EX-23',
    state: 'Todo',
    labels: [linearLabel('groomed', null), linearLabel('Grounded', null)],
    priority: 0,
  }),
  // A plain label somebody named like a group child: no seat, no wave, no
  // plain Loom name — it was never in the loop.
  linearIssueNode({
    id: 'issue-look-alike',
    identifier: 'EX-24',
    labels: [linearLabel('horse:opus-mac', null)],
  }),
  // A wave that happens to be called `blocked`: in the loop as a WAVE, and
  // not blocked — the distinction MAR-3138 drew, now load-bearing twice.
  linearIssueNode({
    id: 'issue-wave-blocked',
    identifier: 'EX-25',
    labels: [linearLabel('blocked', 'wave')],
  }),
])

/** The priorities R3 reads, including the ones that are not numbers. */
export const RECORDED_PRIORITY_PAGE = linearIssuesBody([
  linearIssueNode({
    id: 'issue-urgent',
    identifier: 'EX-30',
    labels: [linearLabel('opus-mac', 'horse')],
    priority: 1,
  }),
  linearIssueNode({
    id: 'issue-none',
    identifier: 'EX-31',
    labels: [linearLabel('opus-mac', 'horse')],
    priority: 0,
  }),
  linearIssueNode({
    id: 'issue-missing',
    identifier: 'EX-32',
    labels: [linearLabel('opus-mac', 'horse')],
  }),
  linearIssueNode({
    id: 'issue-not-a-number',
    identifier: 'EX-33',
    labels: [linearLabel('opus-mac', 'horse')],
    priority: 'high',
  }),
  linearIssueNode({
    id: 'issue-fractional',
    identifier: 'EX-34',
    labels: [linearLabel('opus-mac', 'horse')],
    priority: 1.5,
  }),
])

/**
 * Real grounding sections, copied from the tracker (MAR-3190 lap 2, A).
 *
 * Not invented from a sentence about the format -- the lap-1 reader was
 * written to a description of these and matched none of them. The long
 * `checked:` lists are cut where noted; every other character, including the
 * backticks, the `·` separators and the missing "at" after `re-grounded`, is
 * as the issue carries it.
 */
export const RECORDED_GROUNDING_RE_GROUNDED = `## Grounded at

\`convergence 3c65015b · 2026-09-18 · checked: the Claude connector service — listConnectors :125, authorizeConnector :189 (reads: sed) …\`

\`re-grounded 3e691917 · 2026-09-18 after lap 1's STOP · checked: the territory is byte-identical between 3c65015b and 3e691917 (reads: git diff --stat) …\``

/** MAR-3189's section: one line, no re-ground. */
export const RECORDED_GROUNDING_SINGLE = `## Grounded at

\`convergence 96c38902 · 2026-09-18 · checked: the feature's files and exports (reads: ls, index.ts:1–2) …\``

/** The skill's own worked example, which IS written inline. */
export const RECORDED_GROUNDING_INLINE =
  'Grounded at convergence a3236635 · 2026-09-16 · checked: the mount and its props (reads: sed) …'

/** An inline first grounding and a later re-ground: the later one wins. */
export const RECORDED_GROUNDING_MIXED = `**Groomed and grounded 2026-09-12 by Fable on master** \`a3236635\`.

Grounded at convergence a3236635 · 2026-09-12 · checked: the mount (reads: sed).

\`re-grounded 3e691917 · 2026-09-18 after lap 1's STOP · checked: nothing moved.\``
