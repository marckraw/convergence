import { describe, expect, it } from 'vitest'
import {
  childOfLabelGroup,
  classifyLinearReply,
  LINEAR_LABELED_ISSUES_QUERY,
  linearLabeledIssuesRequest,
  linearRetryAt,
  parseLinearIssuesPage,
} from './linear-tracker.pure'
import { DEFAULT_TRACKER_STATUS_MAP } from './tracker-binding.pure'
import {
  linearIssueNode,
  linearIssuesBody,
  linearLabel,
  RECORDED_200_WITH_ERRORS_BODY,
  RECORDED_RATELIMITED_BODY,
  RECORDED_TWO_ISSUE_PAGE,
  RECORDED_UNAUTHORIZED_BODY,
  recordedReply,
} from './linear-tracker.fixture'

const READ = {
  labelPrefix: 'horse:',
  wavePrefix: 'wave:',
  statusMap: { ...DEFAULT_TRACKER_STATUS_MAP },
}

describe('MAR-3084 R1: the seat is a label child, read as group/child', () => {
  it('counts the issue labeled in the group and not the plain `horse:opus` look-alike', () => {
    const read = parseLinearIssuesPage(RECORDED_TWO_ISSUE_PAGE, READ)

    // Mutation: read the seat by `name.split(':')` -> the plain label becomes
    // a seat, EX-2 is listed and this assertion is red.
    expect(read).toEqual({
      ok: true,
      page: {
        hasNextPage: false,
        endCursor: null,
        issues: [
          {
            id: 'issue-grouped',
            identifier: 'EX-1',
            title: 'Issue EX-1',
            url: 'https://linear.app/example/issue/ex-1',
            status: 'In Progress',
            logicalStatus: 'in-progress',
            seat: 'opus',
            wave: 'loom-p2',
            groundedAt: null,
            branchName: 'example/ex-1-work',
            updatedAt: '2026-09-17T08:00:00.000Z',
          },
        ],
      },
    })
  })

  it.each([
    ['a group child', [linearLabel('opus', 'horse')], 'opus'],
    ['a plain colon label', [linearLabel('horse:opus', null)], null],
    ['a child of another group', [linearLabel('opus', 'seat')], null],
    ['no labels', [], null],
  ])('%s -> %s', (_case, labels, seat) => {
    expect(childOfLabelGroup(labels, 'horse')).toBe(seat)
  })

  it('maps a state the binding does not name to `other`, and a custom map by name', () => {
    const body = linearIssuesBody([
      linearIssueNode({
        id: 'a',
        identifier: 'EX-3',
        state: 'Canceled',
        labels: [linearLabel('opus', 'horse')],
      }),
      linearIssueNode({
        id: 'b',
        identifier: 'EX-4',
        state: 'Shipping',
        labels: [linearLabel('grok', 'horse')],
      }),
    ])
    const read = parseLinearIssuesPage(body, {
      ...READ,
      statusMap: { ...READ.statusMap, Shipping: 'done' },
    })
    expect(
      read.ok && read.page.issues.map((issue) => issue.logicalStatus),
    ).toEqual(['other', 'done'])
  })

  it('reads a custom prefix as its group name', () => {
    const body = linearIssuesBody([
      linearIssueNode({
        id: 'a',
        identifier: 'EX-5',
        labels: [linearLabel('opus', 'seat')],
      }),
    ])
    const read = parseLinearIssuesPage(body, { ...READ, labelPrefix: 'seat:' })
    expect(read.ok && read.page.issues.map((issue) => issue.seat)).toEqual([
      'opus',
    ])
  })

  it('lap 2, A: a page that says there is more but gives no cursor is bad-response, never the last page', () => {
    for (const endCursor of [null, '', 42]) {
      const body = {
        data: {
          issues: {
            nodes: RECORDED_TWO_ISSUE_PAGE.data.issues.nodes,
            pageInfo: { hasNextPage: true, endCursor },
          },
        },
      }
      // Mutation: read it as the last page -> `ok: true`, red.
      expect(parseLinearIssuesPage(body, READ)).toMatchObject({
        ok: false,
        refusal: { kind: 'bad-response' },
      })
    }
  })

  it('refuses a body without an issue list as bad-response', () => {
    expect(parseLinearIssuesPage({ data: {} }, READ)).toMatchObject({
      ok: false,
      refusal: { kind: 'bad-response' },
    })
  })

  it('asks for the project and the seat group by parent name, read-only', () => {
    expect(
      linearLabeledIssuesRequest({
        projectId: 'project-1',
        labelPrefix: 'horse:',
        after: null,
      }).variables,
    ).toEqual({ projectId: 'project-1', seatGroup: 'horse', after: null })
    expect(LINEAR_LABELED_ISSUES_QUERY).toMatch(/^query /)
    expect(LINEAR_LABELED_ISSUES_QUERY).toContain(
      'labels: { some: { parent: { name: { eq: $seatGroup } } } }',
    )
  })
})

describe('MAR-3084 R2: a reply is a page or a typed refusal', () => {
  const now = new Date('2026-09-17T08:00:00.000Z')

  it.each([
    ['401', 401, RECORDED_UNAUTHORIZED_BODY, {}, 'unauthorized', null],
    [
      '200 carrying AUTHENTICATION_ERROR',
      200,
      RECORDED_UNAUTHORIZED_BODY,
      {},
      'unauthorized',
      null,
    ],
    [
      '429 with Retry-After',
      429,
      {},
      { 'Retry-After': '30' },
      'rate-limited',
      '2026-09-17T08:00:30.000Z',
    ],
    [
      "Linear's documented 400 RATELIMITED with the reset epoch",
      400,
      RECORDED_RATELIMITED_BODY,
      { 'X-RateLimit-Requests-Reset': String(now.getTime() + 90_000) },
      'rate-limited',
      '2026-09-17T08:01:30.000Z',
    ],
    [
      '200 carrying errors[]',
      200,
      RECORDED_200_WITH_ERRORS_BODY,
      {},
      'bad-response',
      null,
    ],
    ['502', 502, null, {}, 'unreachable', null],
  ])('%s', (_case, status, body, headers, kind, retryAt) => {
    const reply = recordedReply(status, body, headers)
    expect(
      classifyLinearReply({ status, headers: reply.headers, body, now }),
    ).toMatchObject({ kind, retryAt })
  })

  it('a clean 200 is not a refusal', () => {
    const reply = recordedReply(200, RECORDED_TWO_ISSUE_PAGE)
    expect(
      classifyLinearReply({
        status: 200,
        headers: reply.headers,
        body: RECORDED_TWO_ISSUE_PAGE,
        now,
      }),
    ).toBeNull()
  })
})

describe('MAR-3084 lap 2, D: when a rate-limited reply says requests resume', () => {
  // Fable's integration tests: `linearRetryAt` had no direct test, and the
  // watcher's default backoff depends on its `null`.
  const NOW = new Date('2026-09-17T08:00:00.000Z')
  const headers = (values: Record<string, string>) => ({
    get: (name: string) => values[name] ?? null,
  })

  it('answers null when the reply carries no reset at all', () => {
    expect(linearRetryAt(headers({}), NOW)).toBeNull()
  })

  it('reads Retry-After as seconds from now', () => {
    expect(linearRetryAt(headers({ 'retry-after': '30' }), NOW)).toBe(
      '2026-09-17T08:00:30.000Z',
    )
  })

  it('reads a future X-RateLimit-Requests-Reset as an epoch in milliseconds', () => {
    const at = NOW.getTime() + 90_000
    expect(
      linearRetryAt(headers({ 'x-ratelimit-requests-reset': String(at) }), NOW),
    ).toBe('2026-09-17T08:01:30.000Z')
  })

  it('drops a reset that is already past, so the default backoff applies', () => {
    // Mutation: trust a past reset -> a time before now, and the next tick
    // polls straight through the limit.
    const past = NOW.getTime() - 60_000
    expect(
      linearRetryAt(
        headers({ 'x-ratelimit-requests-reset': String(past) }),
        NOW,
      ),
    ).toBeNull()
  })

  it('ignores a Retry-After that is not a number of seconds', () => {
    expect(
      linearRetryAt(
        headers({ 'retry-after': 'Wed, 17 Sep 2026 09:00:00 GMT' }),
        NOW,
      ),
    ).toBeNull()
  })
})
