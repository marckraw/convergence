import { trackerLabelGroupName } from './tracker-binding.pure'
import type { LinearProjectReference } from '../../../src/shared/lib/linear-project-reference.pure'
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
 * The plain labels an issue in the loop can carry (MAR-3190 R1).
 *
 * `dispatch` is here as a NAME today and becomes the binding's own
 * `dispatchLabel` with MAR-2981; when it does, the filter and the parse both
 * read it from the binding and this constant loses that entry. Everything
 * else on the list is the constitution's vocabulary and stays.
 *
 * One list, read twice: the server-side filter is built from it and the parse
 * decides membership from it, so a name added here cannot be filtered out
 * before the parse ever sees it.
 */
export const LOOM_PLAIN_LABELS = [
  'groom-me',
  'groomed',
  'grounded',
  'dispatch',
  'blocked',
] as const

/** The constitution's label for work that waits on a decision (MAR-3138). */
export const BLOCKED_LABEL_NAME = 'blocked'

/**
 * How long a finished issue stays in the read (MAR-3190 R8).
 *
 * An ISO-8601 duration, which Linear's `DateTimeOrDuration` adds to now: the
 * window moves with the clock and no date is ever computed here. Two weeks is
 * how long a Done issue is still worth seeing in *Before*; past it, the issue
 * ages out of the page -- and the diff's terminal guard is what keeps ageing
 * out from rewriting its row.
 */
export const LINEAR_DONE_WINDOW = '-P14D'

/** How many issue ids one bodies read asks for (R4). */
export const LINEAR_BODY_PAGE_SIZE = 50

function plainLabelClauses(): string {
  return LOOM_PLAIN_LABELS.map(
    (name) => `{ name: { eqIgnoreCase: "${name}" } }`,
  ).join('\n        ')
}

/**
 * Issues in one project that the loop has touched (MAR-3190 R1).
 *
 * Membership is ANY Loom label: a child of the seat group, a child of the
 * wave group, or one of the plain names above. Until this slice the filter
 * asked for a seat and the parse dropped everything else, so an issue marked
 * `groom-me` -- work a person has asked for and nobody has picked up -- did
 * not exist for the app at all.
 *
 * The filter only narrows the page and is deliberately WIDER than the rule:
 * `{ name: { eqIgnoreCase: "grounded" } }` also matches a group child called
 * `grounded`, which is not a label fact. The parse below decides again, by
 * structure, and drops it.
 *
 * Schema read against Linear's published SDK schema: `IssueLabelFilter { or:
 * [IssueLabelFilter!], name: StringComparator, parent: IssueLabelFilter }`,
 * `IssueLabelCollectionFilter { some: IssueLabelFilter }`, `StringComparator
 * { eq, eqIgnoreCase }`, `IssueFilter { or: [IssueFilter!], completedAt:
 * NullableDateComparator }`, `NullableDateComparator { gt: DateTimeOrDuration,
 * null: Boolean }`, `Issue { priority: Float! }`.
 */
export const LINEAR_LABELED_ISSUES_QUERY = `query ConvergenceTrackerLabeledIssues($projectId: ID!, $seatGroup: String!, $waveGroup: String!, $after: String) {
  issues(
    first: ${LINEAR_PAGE_SIZE}
    after: $after
    filter: {
      project: { id: { eq: $projectId } }
      labels: { some: { or: [
        { parent: { name: { eq: $seatGroup } } }
        { parent: { name: { eq: $waveGroup } } }
        ${plainLabelClauses()}
      ] } }
      or: [
        { completedAt: { null: true } }
        { completedAt: { gt: "${LINEAR_DONE_WINDOW}" } }
      ]
    }
  ) {
    nodes {
      id
      identifier
      title
      url
      branchName
      updatedAt
      priority
      state { name }
      labels { nodes { name parent { name } } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`

export function linearLabeledIssuesRequest(input: {
  projectId: string
  labelPrefix: string
  wavePrefix: string
  after: string | null
}): { query: string; variables: Record<string, string | null> } {
  return {
    query: LINEAR_LABELED_ISSUES_QUERY,
    variables: {
      projectId: input.projectId,
      seatGroup: trackerLabelGroupName(input.labelPrefix),
      waveGroup: trackerLabelGroupName(input.wavePrefix),
      after: input.after,
    },
  }
}

/**
 * The bodies of named issues, and nothing else (MAR-3190 R4).
 *
 * Its own query because it is asked for a FEW issues on most ticks and none
 * at all on a quiet one: folding `description` into the page query would
 * carry every body on every minute, which is the cost this split exists to
 * refuse.
 */
export const LINEAR_ISSUE_BODIES_QUERY = `query ConvergenceTrackerIssueBodies($ids: [ID!]!) {
  issues(first: ${LINEAR_BODY_PAGE_SIZE}, filter: { id: { in: $ids } }) {
    nodes {
      id
      description
    }
  }
}`

export function linearIssueBodiesRequest(ids: readonly string[]): {
  query: string
  variables: Record<string, unknown>
} {
  return { query: LINEAR_ISSUE_BODIES_QUERY, variables: { ids: [...ids] } }
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

/**
 * Whether the issue carries a PLAIN label of this name (MAR-3138 R1):
 * case-insensitive and trimmed, with no parent group.
 *
 * The mirror image of `childOfLabelGroup`: there a name without a parent
 * means nothing, here a name WITH one does. `blocked` under the `wave` group
 * is a wave somebody named blocked; it holds no decision and must not count.
 */
export function hasPlainLabel(
  labels: readonly LinearLabelNode[],
  name: string,
): boolean {
  const wanted = name.trim().toLowerCase()
  return labels.some(
    (label) =>
      (label.parent === null || label.parent === undefined) &&
      typeof label.name === 'string' &&
      label.name.trim().toLowerCase() === wanted,
  )
}

/**
 * How many projects a name lookup asks for (MAR-3156 R2).
 *
 * More than one, because the answer "several projects answer to that name" is
 * the one this feature must be able to give: asking for one and taking it
 * would bind the wrong project silently.
 */
export const LINEAR_PROJECT_MATCH_LIMIT = 5

/**
 * One project, by the three fields a person needs to recognise it.
 *
 * Schema read against Linear's published SDK schema
 * (`linear/linear` → `packages/sdk/src/schema.graphql`), the same way the
 * issue query above was, and confirmed against the live workspace:
 *
 * - `Query.projects(filter: ProjectFilter, first: Int): ProjectConnection`
 * - `type Project { id: ID!, name: String!, slugId: String!, url: String! }`
 * - `input ProjectFilter { id: EntityIdentifierIDComparator, name:
 *   StringComparator, slugId: StringComparator, … }`
 * - `EntityIdentifierIDComparator.eq: ID`, `StringComparator.eq` and
 *   `StringComparator.eqIgnoreCase`
 *
 * The live half: the trailing hex of a project URL (`…/project/convergence-
 * f66c7ae332ee`) IS that project's `slugId` — asked of the workspace, not
 * inferred from the shape.
 *
 * One query text for all three ways in: the filter is the variable, so the
 * lookup by id, by the URL's slug id and by name are one read with three
 * shapes rather than three queries to keep in step.
 */
export const LINEAR_PROJECT_LOOKUP_QUERY = `query ConvergenceTrackerProject($filter: ProjectFilter!) {
  projects(first: ${LINEAR_PROJECT_MATCH_LIMIT}, filter: $filter) {
    nodes {
      id
      name
      url
    }
  }
}`

export function linearProjectLookupRequest(reference: LinearProjectReference): {
  query: string
  variables: Record<string, unknown>
} {
  const filter =
    reference.kind === 'id'
      ? { id: { eq: reference.value } }
      : reference.kind === 'slugId'
        ? { slugId: { eq: reference.value } }
        : // A name is what a person calls the project, so it is matched the
          // way a person means it (R2).
          { name: { eqIgnoreCase: reference.value } }
  return { query: LINEAR_PROJECT_LOOKUP_QUERY, variables: { filter } }
}

/** One project as the lookup reads it. */
export interface LinearProject {
  id: string
  name: string
  url: string
}

export type LinearProjectsRead =
  | { ok: true; projects: LinearProject[] }
  | { ok: false; refusal: TrackerRefusal }

/** The projects in a lookup reply, or why the body could not be read. */
export function parseLinearProjectsReply(body: unknown): LinearProjectsRead {
  if (!isRecord(body)) return badResponse('Linear answered with no JSON body.')
  const projects = isRecord(body.data) ? body.data.projects : undefined
  if (!isRecord(projects) || !Array.isArray(projects.nodes)) {
    return badResponse('Linear answered without a project list.')
  }
  const parsed: LinearProject[] = []
  for (const node of projects.nodes) {
    if (!isRecord(node))
      return badResponse('Linear answered a malformed project.')
    const { id, name, url } = node
    if (
      typeof id !== 'string' ||
      typeof name !== 'string' ||
      typeof url !== 'string'
    ) {
      return badResponse('Linear answered a project without its identity.')
    }
    parsed.push({ id, name, url })
  }
  return { ok: true, projects: parsed }
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
 * Whether this issue is in the loop (MAR-3190 R1), decided by structure.
 *
 * The same rule the server-side filter asks for, applied again -- because the
 * filter is a superset (it cannot tell a plain `grounded` from a group child
 * of that name) and because a page must mean the same thing whoever narrowed
 * it. One derivation, two places that need it.
 */
export function inTheLoop(
  labels: readonly LinearLabelNode[],
  groups: { seatGroup: string; waveGroup: string },
): boolean {
  return (
    childOfLabelGroup(labels, groups.seatGroup) !== null ||
    childOfLabelGroup(labels, groups.waveGroup) !== null ||
    LOOM_PLAIN_LABELS.some((name) => hasPlainLabel(labels, name))
  )
}

/**
 * Linear's priority as an integer, or null (MAR-3190 R3).
 *
 * `Issue.priority` is a `Float!` carrying 0-4, where 0 is Linear's own word
 * "none". Null only when the tracker answered with something that is not one
 * of those -- never `?? 0`, which would tell a reader "the person chose no
 * priority" about a field nobody answered.
 */
export function readIssuePriority(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

/**
 * Every label as a person reads it (MAR-3190): a plain label as written, a
 * group child as `group › child`. Display only -- no fact is read from here.
 */
export function readIssueLabels(labels: readonly LinearLabelNode[]): string[] {
  const names: string[] = []
  for (const label of labels) {
    if (typeof label.name !== 'string' || !label.name.trim()) continue
    const parent =
      isRecord(label.parent) && typeof label.parent.name === 'string'
        ? label.parent.name.trim()
        : null
    names.push(parent ? `${parent} › ${label.name.trim()}` : label.name.trim())
  }
  return names
}

/**
 * One page of the response, parsed. An issue carrying no Loom label at all is
 * dropped here, whatever the server-side filter let through (R1).
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
    if (!inTheLoop(labelNodes, { seatGroup, waveGroup })) continue
    const seat = childOfLabelGroup(labelNodes, seatGroup)
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
      blocked: hasPlainLabel(labelNodes, BLOCKED_LABEL_NAME),
      groomMe: hasPlainLabel(labelNodes, 'groom-me'),
      groomed: hasPlainLabel(labelNodes, 'groomed'),
      grounded: hasPlainLabel(labelNodes, 'grounded'),
      dispatch: hasPlainLabel(labelNodes, 'dispatch'),
      priority: readIssuePriority(node.priority),
      labels: readIssueLabels(labelNodes),
      // Both come from the issue's BODY, which this query does not carry
      // (R4): `applyIssueBodies` fills them in, from a fresh read for the
      // issues that changed and from the ledger's own last row for the rest.
      summary: null,
      groundedAt: null,
      branchName: typeof node.branchName === 'string' ? node.branchName : null,
      updatedAt,
    })
  }

  const hasNextPage = pageInfo.hasNextPage === true
  const endCursor =
    typeof pageInfo.endCursor === 'string' && pageInfo.endCursor
      ? pageInfo.endCursor
      : null
  // A complete read is the only licence to unassign (lap 2, A): a page that
  // says there is more but gives no way to ask for it would otherwise end the
  // walk and read as the whole project, and every issue on the unread pages
  // would get a permanent `unassigned` row.
  if (hasNextPage && endCursor === null) {
    return badResponse('Linear said there is another page but gave no cursor.')
  }

  return {
    ok: true,
    page: { issues: parsed, hasNextPage, endCursor },
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

/** The bodies of a bodies read, by issue id, or why the body was unreadable. */
export type LinearIssueBodiesRead =
  | { ok: true; bodies: Map<string, string | null> }
  | { ok: false; refusal: TrackerRefusal }

/** One bodies reply: `{ data: { issues: { nodes: [{ id, description }] } } }`. */
export function parseLinearIssueBodiesReply(
  body: unknown,
): LinearIssueBodiesRead {
  if (!isRecord(body)) return badResponse('Linear answered with no JSON body.')
  const issues = isRecord(body.data) ? body.data.issues : undefined
  if (!isRecord(issues) || !Array.isArray(issues.nodes)) {
    return badResponse('Linear answered without an issue list.')
  }
  const bodies = new Map<string, string | null>()
  for (const node of issues.nodes) {
    if (!isRecord(node) || typeof node.id !== 'string') {
      return badResponse('Linear answered a malformed issue body.')
    }
    bodies.set(
      node.id,
      typeof node.description === 'string' ? node.description : null,
    )
  }
  return { ok: true, bodies }
}

/**
 * Every `Grounded at … · YYYY-MM-DD` (or `re-grounded …`) in a body.
 *
 * Loose about what sits between the words and the date -- a commit sha, a
 * backtick, a bold marker -- and strict about the date itself, because that
 * is the fact. The `·` is the constitution's own separator.
 */
const GROUNDED_AT_PATTERN =
  /(?:re-)?grounded\s+at\b[^\n]*?·[^\n]*?(\d{4}-\d{2}-\d{2})/gi

/** Whether a `YYYY-MM-DD` names a day that exists. */
function isCalendarDate(value: string): boolean {
  const at = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === value
}

/**
 * When the issue was last grounded, from its own body (MAR-3190 R5).
 *
 * The LATEST date, not the first: a re-grounded issue keeps its original line
 * and adds another, and the question a reader asks -- "is this grounding still
 * fresh?" -- is about the most recent one. Lexicographic comparison is exact
 * here because the format is fixed-width ISO.
 *
 * A date that names no day (`2026-13-45`) is not a grounding; it is a typo,
 * and reading it as one would put a future-dated freshness on the row.
 */
export function readGroundedAt(body: string | null): string | null {
  if (!body) return null
  let latest: string | null = null
  for (const match of body.matchAll(GROUNDED_AT_PATTERN)) {
    const date = match[1]
    if (!date || !isCalendarDate(date)) continue
    if (latest === null || date > latest) latest = date
  }
  return latest
}

/** The longest a summary may be before it is cut on a word boundary. */
export const ISSUE_SUMMARY_MAX = 280

/** Markdown reduced to the words a person would read out loud. */
function plainText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Paragraphs of a markdown body, in order, blank-line separated. */
function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
}

/** Cut at the last whole word that fits, with the ellipsis inside the bound. */
function cutOnAWord(text: string): string {
  const room = text.slice(0, ISSUE_SUMMARY_MAX - 1)
  const lastSpace = room.lastIndexOf(' ')
  return `${(lastSpace > 0 ? room.slice(0, lastSpace) : room).trimEnd()}…`
}

/**
 * The issue's promise in a sentence (MAR-3190 R6).
 *
 * `## What` first, because a groomed body opens with a preamble -- who
 * groomed it, against which commit, which rules bind the lap -- and none of
 * that is what the issue is FOR. Only when there is no such heading does the
 * first paragraph stand in.
 */
export function readIssueSummary(body: string | null): string | null {
  if (!body) return null
  const blocks = paragraphs(body)
  const whatIndex = blocks.findIndex((block) =>
    /^#{1,6}\s+what\s*$/i.test(block.split('\n')[0]?.trim() ?? ''),
  )
  const candidates = whatIndex === -1 ? blocks : blocks.slice(whatIndex + 1)
  for (const block of candidates) {
    // A heading is a signpost, never the promise itself.
    if (/^#{1,6}\s/.test(block)) continue
    const text = plainText(block)
    if (!text) continue
    return text.length <= ISSUE_SUMMARY_MAX ? text : cutOnAWord(text)
  }
  return null
}

/** What a row already knows about an issue's body. */
export interface IssueBodyMemory {
  issueId: string
  updatedAt: string | null
  summary: string | null
  groundedAt: string | null
  /** Whether a body has ever been read for this row (the `summary` KEY). */
  read: boolean
}

/**
 * Which issues need their body read this tick (MAR-3190 R4).
 *
 * New issues, issues the tracker says have changed, and rows written before
 * this slice -- which have never had a body read and cannot say so any other
 * way. Everything else already carries a summary and a grounding date that
 * cannot have moved without `updatedAt` moving with them.
 *
 * This is the whole reason the minute tick stays one request: a project with
 * two hundred issues in the loop and nothing happening asks for no bodies at
 * all.
 */
export function issuesNeedingBody(
  memory: readonly IssueBodyMemory[],
  issues: readonly TrackerIssue[],
): string[] {
  const known = new Map(memory.map((row) => [row.issueId, row]))
  return issues
    .filter((issue) => {
      const row = known.get(issue.id)
      if (!row || !row.read) return true
      return row.updatedAt !== issue.updatedAt
    })
    .map((issue) => issue.id)
}

/**
 * The page with every issue's summary and grounding date on it (R4).
 *
 * A body that was read this tick is parsed; one that was not is carried from
 * the row the ledger already holds. An issue whose body was ASKED for and not
 * answered reads as a body that says nothing -- the read succeeded, Linear
 * simply had no description for it.
 */
export function applyIssueBodies(
  issues: readonly TrackerIssue[],
  bodies: ReadonlyMap<string, string | null>,
  memory: readonly IssueBodyMemory[],
  asked: readonly string[] = [...bodies.keys()],
): TrackerIssue[] {
  const known = new Map(memory.map((row) => [row.issueId, row]))
  const askedFor = new Set(asked)
  return issues.map((issue) => {
    if (askedFor.has(issue.id)) {
      const body = bodies.get(issue.id) ?? null
      return {
        ...issue,
        summary: readIssueSummary(body),
        groundedAt: readGroundedAt(body),
      }
    }
    const row = known.get(issue.id)
    return {
      ...issue,
      summary: row?.summary ?? null,
      groundedAt: row?.groundedAt ?? null,
    }
  })
}
