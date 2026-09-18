import { describe, expect, it } from 'vitest'
import {
  applyIssueBodies,
  BLOCKED_LABEL_NAME,
  childOfLabelGroup,
  classifyLinearReply,
  hasPlainLabel,
  inTheLoop,
  issuesNeedingBody,
  LINEAR_BODY_PAGE_SIZE,
  LINEAR_DONE_WINDOW,
  LINEAR_ISSUE_BODIES_QUERY,
  LINEAR_LABELED_ISSUES_QUERY,
  linearIssueBodiesRequest,
  linearLabeledIssuesRequest,
  linearRetryAt,
  LOOM_PLAIN_LABELS,
  parseLinearIssueBodiesReply,
  parseLinearIssuesPage,
  readGroundedAt,
  readIssueLabels,
  readIssuePriority,
  readIssueSummary,
} from './linear-tracker.pure'
import { DEFAULT_TRACKER_STATUS_MAP } from './tracker-binding.pure'
import {
  linearIssueBodiesBody,
  linearIssueNode,
  linearIssuesBody,
  linearLabel,
  trackerIssue,
  RECORDED_200_WITH_ERRORS_BODY,
  RECORDED_BLOCKED_LABEL_PAGE,
  RECORDED_GROUNDING_INLINE,
  RECORDED_GROUNDING_MIXED,
  RECORDED_GROUNDING_RE_GROUNDED,
  RECORDED_GROUNDING_SINGLE,
  RECORDED_LOOM_MEMBERSHIP_PAGE,
  RECORDED_PRIORITY_PAGE,
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

describe('MAR-3138 R1: `blocked` is a plain label, read as a fact', () => {
  it('reads it off the recorded page: plain counts, a group child of the same name does not', () => {
    const read = parseLinearIssuesPage(RECORDED_BLOCKED_LABEL_PAGE, READ)

    // Mutation: match any label whose name contains "blocked" whatever its
    // parent -> EX-11 reads `true`, red.
    expect(
      read.ok &&
        read.page.issues.map((issue) => [issue.identifier, issue.blocked]),
    ).toEqual([
      ['EX-10', true],
      ['EX-11', false],
      ['EX-12', false],
    ])
    // The same label under the wave group is exactly that: a wave.
    expect(read.ok && read.page.issues[1]!.wave).toBe('blocked')
  })

  it.each([
    ['a plain label', [linearLabel('blocked', null)], true],
    ['cased and padded', [linearLabel('  BLoCKeD ', null)], true],
    ['a child of the wave group', [linearLabel('blocked', 'wave')], false],
    ['a child of any group', [linearLabel('blocked', 'horse')], false],
    ['a plain look-alike', [linearLabel('unblocked', null)], false],
    ['another plain label', [linearLabel('grounded', null)], false],
    ['no labels', [], false],
  ])('%s -> %s', (_case, labels, blocked) => {
    expect(hasPlainLabel(labels, BLOCKED_LABEL_NAME)).toBe(blocked)
  })
})

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
            blocked: false,
            // The widened read (MAR-3190): the same issue, now carrying the
            // facts the sheets need. EX-2 is still absent, which is what this
            // case has always been about.
            groomMe: false,
            groomed: false,
            grounded: true,
            dispatch: false,
            priority: null,
            labels: ['grounded', 'horse › opus', 'wave › loom-p2'],
            summary: null,
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

  it('MAR-3190 R1: asks for BOTH groups and every plain Loom label, read-only', () => {
    expect(
      linearLabeledIssuesRequest({
        projectId: 'project-1',
        labelPrefix: 'horse:',
        wavePrefix: 'wave:',
        after: null,
      }).variables,
      // Mutation: drop `waveGroup` from the variables -> the wave clause in
      // the query has nothing to compare and Linear refuses the whole read.
    ).toEqual({
      projectId: 'project-1',
      seatGroup: 'horse',
      waveGroup: 'wave',
      after: null,
    })
    expect(LINEAR_LABELED_ISSUES_QUERY).toMatch(/^query /)
    expect(LINEAR_LABELED_ISSUES_QUERY).toContain(
      '{ parent: { name: { eq: $seatGroup } } }',
    )
    expect(LINEAR_LABELED_ISSUES_QUERY).toContain(
      '{ parent: { name: { eq: $waveGroup } } }',
    )
    // Asserted against the CONSTANT, not a written-out list: a name added to
    // `LOOM_PLAIN_LABELS` that the filter never asks for would leave the
    // parse waiting for issues the server already dropped.
    // Mutation: build the clauses from a literal array -> red the day the
    // two lists disagree.
    for (const name of LOOM_PLAIN_LABELS) {
      expect(LINEAR_LABELED_ISSUES_QUERY).toContain(
        `{ name: { eqIgnoreCase: "${name}" } }`,
      )
    }
    // R8's window, exactly as the schema spells it.
    // Mutation: a computed ISO date instead of the duration -> red, and the
    // window would freeze at the moment the app started.
    expect(LINEAR_LABELED_ISSUES_QUERY).toContain(
      '{ completedAt: { null: true } }',
    )
    expect(LINEAR_LABELED_ISSUES_QUERY).toContain(
      `{ completedAt: { gt: "${LINEAR_DONE_WINDOW}" } }`,
    )
    expect(LINEAR_DONE_WINDOW).toBe('-P14D')
    // R3: the page carries the priority it reads.
    expect(LINEAR_LABELED_ISSUES_QUERY).toContain('priority')
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

describe('MAR-3190 R1: membership is any Loom label, decided twice by one rule', () => {
  const read = (body: unknown) => {
    const page = parseLinearIssuesPage(body, READ)
    if (!page.ok) throw new Error('expected a page')
    return page.page.issues
  }

  it('keeps every way into the loop and drops the look-alike', () => {
    const issues = read(RECORDED_LOOM_MEMBERSHIP_PAGE)
    // Mutation: keep `if (seat === null) continue` -> EX-21..EX-23 and EX-25
    // vanish, and Plan has nothing to show for the second slice running.
    expect(issues.map((issue) => issue.identifier)).toEqual([
      'EX-20',
      'EX-21',
      'EX-22',
      'EX-23',
      'EX-25',
    ])
    const byId = new Map(issues.map((issue) => [issue.id, issue]))
    expect(byId.get('issue-seat')?.seat).toBe('opus-mac')
    expect(byId.get('issue-wave')?.seat).toBeNull()
    expect(byId.get('issue-wave')?.wave).toBe('loom-view')
    expect(byId.get('issue-groom-me')?.groomMe).toBe(true)
    expect(byId.get('issue-groomed-grounded')?.groomed).toBe(true)
    expect(byId.get('issue-groomed-grounded')?.grounded).toBe(true)
    // A wave called `blocked` is in the loop as a wave and is NOT blocked --
    // the distinction MAR-3138 drew, now load-bearing for membership too.
    // Mutation: decide membership from label NAMES -> EX-24 comes back.
    expect(byId.get('issue-wave-blocked')?.wave).toBe('blocked')
    expect(byId.get('issue-wave-blocked')?.blocked).toBe(false)
  })

  it('the parse and the filter ask the same question', () => {
    const groups = { seatGroup: 'horse', waveGroup: 'wave' }
    expect(inTheLoop([linearLabel('opus-mac', 'horse')], groups)).toBe(true)
    expect(inTheLoop([linearLabel('loom-view', 'wave')], groups)).toBe(true)
    for (const name of LOOM_PLAIN_LABELS) {
      expect(inTheLoop([linearLabel(name, null)], groups)).toBe(true)
    }
    // Mutation: `hasPlainLabel` reading a group child as plain -> true here.
    expect(inTheLoop([linearLabel('grounded', 'wave')], groups)).toBe(true)
    expect(inTheLoop([linearLabel('horse:opus-mac', null)], groups)).toBe(false)
    expect(inTheLoop([], groups)).toBe(false)
  })
})

describe('MAR-3190 R2: a label fact is a plain, parentless label', () => {
  it.each([
    ['plain, as written', [linearLabel('grounded', null)], true],
    ['plain, capitalised', [linearLabel('Grounded', null)], true],
    ['plain, padded', [linearLabel('  grounded  ', null)], true],
    ['under a group', [linearLabel('grounded', 'wave')], false],
    ['a longer name containing it', [linearLabel('regrounded', null)], false],
    ['absent', [linearLabel('groomed', null)], false],
  ])('%s -> %s', (_case, labels, expected) => {
    // Mutation: `labels.some(l => l.name.includes('grounded'))` -> the group
    // child and `regrounded` both read true, red twice.
    expect(hasPlainLabel(labels, 'grounded')).toBe(expected)
  })
})

describe('MAR-3190 R3: priority is Linear’s number or null, never a default', () => {
  it.each([
    ['urgent', 1, 1],
    ['Linear’s own "none"', 0, 0],
    ['low', 4, 4],
    ['missing', undefined, null],
    ['not a number', 'high', null],
    ['fractional', 1.5, null],
    ['not finite', Number.NaN, null],
    ['below Linear’s range', -1, null],
    ['above Linear’s range', 5, null],
    ['far above', 7, null],
  ])('%s -> %s', (_case, value, expected) => {
    // Mutation: `?? 0` -> "missing" reads as the person choosing none, red.
    expect(readIssuePriority(value)).toBe(expected)
  })

  it('through the page, by issue', () => {
    const page = parseLinearIssuesPage(RECORDED_PRIORITY_PAGE, READ)
    if (!page.ok) throw new Error('expected a page')
    expect(
      page.page.issues.map((issue) => [issue.identifier, issue.priority]),
    ).toEqual([
      ['EX-30', 1],
      ['EX-31', 0],
      ['EX-32', null],
      ['EX-33', null],
      ['EX-34', null],
    ])
  })
})

describe('MAR-3190: the label list is for display, never for facts', () => {
  it('a plain label as written, a group child as group › child, sorted', () => {
    expect(
      readIssueLabels([
        linearLabel('opus-mac', 'horse'),
        linearLabel('groom-me', null),
        linearLabel('  ', null),
      ]),
    ).toEqual(['groom-me', 'horse › opus-mac'])
  })

  it('lap 2, F: the same set in any order reads the same list', () => {
    // `labels { nodes }` carries no `orderBy`, and `sameLabels` compares by
    // position: an order the server changed would append a row per
    // multi-label issue per minute with nothing about the issue moving.
    // Mutation: drop the sort -> the two lists differ, red.
    const one = readIssueLabels([
      linearLabel('groomed', null),
      linearLabel('opus-mac', 'horse'),
      linearLabel('grounded', null),
    ])
    const other = readIssueLabels([
      linearLabel('opus-mac', 'horse'),
      linearLabel('grounded', null),
      linearLabel('groomed', null),
    ])
    expect(one).toEqual(other)
  })
})

describe('MAR-3190 R5 + lap 2, A: the grounding date is read from the record', () => {
  const TODAY = '2026-09-19'

  it('the shapes a real groomed body has', () => {
    // Every one of these returned NULL in lap 1, because the reader was
    // written to a sentence about the format instead of to the format.
    // Mutation: require the word `at` on the date's line -> the heading and
    // re-grounded shapes go null again, red three times.
    expect(readGroundedAt(RECORDED_GROUNDING_RE_GROUNDED, TODAY)).toBe(
      '2026-09-18',
    )
    expect(readGroundedAt(RECORDED_GROUNDING_SINGLE, TODAY)).toBe('2026-09-18')
    expect(readGroundedAt(RECORDED_GROUNDING_INLINE, TODAY)).toBe('2026-09-16')
  })

  it('a re-ground is the fresher fact, wherever it sits', () => {
    // The dangerous case: lap 1 would have reported the OLDER date here --
    // stale grounding presented as current. Mutation: first match -> red.
    expect(readGroundedAt(RECORDED_GROUNDING_MIXED, TODAY)).toBe('2026-09-18')
  })

  it.each([
    [
      'a heading section',
      '## Grounded at\n\n`x · 2026-09-14 · checked: y`',
      '2026-09-14',
    ],
    [
      'the section ends at the next heading',
      '## Grounded at\n\n`x · 2026-09-14`\n\n## Terminal\n\n`y · 2026-09-20`',
      '2026-09-14',
    ],
    [
      'a re-grounded line alone',
      '`re-grounded abc · 2026-09-17 after a STOP`',
      '2026-09-17',
    ],
    [
      'inline, capitalised differently',
      'GROUNDED AT x · 2026-01-02',
      '2026-01-02',
    ],
    // The preamble every groomed body opens with: prose about the grooming,
    // no "at", and no `·` before the date. Mutation: match the bare word
    // `grounded` -> this reads 2026-09-18 and every issue looks grounded.
    [
      'the groomed-and-grounded preamble is not a grounding',
      '**Groomed and grounded 2026-09-18 by Fable on master** `96c38902`.',
      null,
    ],
    ['a day that does not exist', 'Grounded at x · 2026-13-45', null],
    ['a date with no separator before it', 'Grounded at x 2026-09-14', null],
    ['no grounding at all', '## What\n\nSome work.', null],
    ['an empty body', '', null],
    ['no body', null, null],
  ])('%s -> %s', (_case, body, expected) => {
    expect(readGroundedAt(body, TODAY)).toBe(expected)
  })

  it('a date in the future is a typo, never a grounding', () => {
    // Mutation: drop the `today` guard -> 2099 wins every comparison and the
    // issue reads as freshly grounded forever, red.
    expect(
      readGroundedAt(
        '## Grounded at\n\n`x · 2026-09-14 · checked: y`\n\n`re-grounded z · 2099-01-01`',
        TODAY,
      ),
    ).toBe('2026-09-14')
  })
})

describe('MAR-3190 R6: the summary is the promise, short', () => {
  it('the `## What` sentence wins over a groomed body’s preamble', () => {
    const body = [
      '**Groomed and grounded 2026-09-18 by Fable on master** `96c38902`.',
      '## Why',
      'Because the sheets need facts.',
      '## What',
      'An issue is **in the loop** when it carries any `Loom` label.',
      '## Territory',
      '* a file',
    ].join('\n\n')
    // Mutation: always the first paragraph -> the preamble about who groomed
    // it, which says nothing about what the issue is for, red.
    expect(readIssueSummary(body)).toBe(
      'An issue is in the loop when it carries any Loom label.',
    )
  })

  it.each([
    [
      'the What sentence in the heading’s own block',
      '## What\nThe promise.',
      'The promise.',
    ],
    [
      'a bullet first under What',
      '## What\n\n- The promise, as a list item.\n- And more.',
      'The promise, as a list item. And more.',
    ],
    [
      'a numbered first item',
      '## What\n\n1. The numbered promise.',
      'The numbered promise.',
    ],
    [
      '`## What` last, with nothing after it',
      'The opening paragraph.\n\n## What',
      'The opening paragraph.',
    ],
    ['no `## What`', 'Just the one sentence.', 'Just the one sentence.'],
    ['a leading heading', '# Title\n\nThe body.', 'The body.'],
    [
      'a link',
      'See [the spec](https://example.com) first.',
      'See the spec first.',
    ],
    ['broken whitespace', 'One\n  two   three', 'One two three'],
    ['an empty body', '', null],
    ['headings only', '# A\n\n## B', null],
    ['no body', null, null],
  ])('%s', (_case, body, expected) => {
    expect(readIssueSummary(body)).toBe(expected)
  })

  it('cuts long prose on a word boundary, ellipsis inside the bound', () => {
    const long = `${'word '.repeat(100)}end`
    const summary = readIssueSummary(long)
    expect(summary).not.toBeNull()
    // Mutation: slice at the bound without looking for a space -> the last
    // word is cut in half, red.
    expect(summary!.length).toBeLessThanOrEqual(280)
    expect(summary!.endsWith('…')).toBe(true)
    expect(summary!.slice(0, -1).trim().endsWith('word')).toBe(true)
  })
})

describe('MAR-3190 R4: bodies are read only for issues that changed', () => {
  const memory = (
    overrides: Partial<Parameters<typeof issuesNeedingBody>[0][number]> & {
      issueId: string
    },
  ) => ({
    updatedAt: '2026-09-17T08:00:00.000Z',
    summary: 'The work',
    groundedAt: '2026-09-17',
    read: true,
    ...overrides,
  })

  it('new issues, moved issues, and rows from before this slice', () => {
    const issues = [
      trackerIssue({ id: 'known-still' }),
      trackerIssue({
        id: 'known-moved',
        updatedAt: '2026-09-18T09:00:00.000Z',
      }),
      trackerIssue({ id: 'brand-new' }),
      trackerIssue({ id: 'known-unread' }),
    ]
    const rows = [
      memory({ issueId: 'known-still' }),
      memory({ issueId: 'known-moved' }),
      // A row written before bodies were ever read: no summary KEY, so it
      // cannot say it is missing one any other way.
      memory({ issueId: 'known-unread', read: false, summary: null }),
    ]
    // Mutation: ask for every id -> 'known-still' joins the list, red.
    expect(issuesNeedingBody(rows, issues)).toEqual([
      'known-moved',
      'brand-new',
      'known-unread',
    ])
    // Mutation: drop the `read` half -> 'known-unread' never gets a body and
    // stays summary-less forever, red.
    expect(issuesNeedingBody(rows, [issues[0]!])).toEqual([])
  })

  it('carries what it did not ask for, parses what it did', () => {
    const issues = [
      trackerIssue({ id: 'asked' }),
      trackerIssue({ id: 'carried' }),
      trackerIssue({ id: 'asked-empty' }),
    ]
    const bodies = new Map<string, string | null>([
      ['asked', '## What\n\nRead the bodies.\n\nGrounded at x · 2026-09-18'],
      ['asked-empty', null],
    ])
    const applied = applyIssueBodies({
      issues,
      bodies,
      memory: [
        memory({
          issueId: 'carried',
          summary: 'What the row already knew',
          groundedAt: '2026-09-11',
        }),
      ],
      asked: ['asked', 'asked-empty'],
      today: '2026-09-19',
    })
    expect(applied[0]).toMatchObject({
      summary: 'Read the bodies.',
      groundedAt: '2026-09-18',
    })
    // Mutation: read every issue from the bodies map -> 'carried' loses the
    // summary the ledger holds, and the diff writes that loss as a row.
    expect(applied[1]).toMatchObject({
      summary: 'What the row already knew',
      groundedAt: '2026-09-11',
    })
    // Asked for and not answered is a body that says nothing, not a carry.
    expect(applied[2]).toMatchObject({ summary: null, groundedAt: null })
  })

  it('the bodies query names the ids and asks for nothing else', () => {
    expect(LINEAR_ISSUE_BODIES_QUERY).toMatch(/^query /)
    expect(LINEAR_ISSUE_BODIES_QUERY).toContain('filter: { id: { in: $ids } }')
    expect(LINEAR_ISSUE_BODIES_QUERY).toContain('description')
    // The page query must NOT carry descriptions: that is the whole split.
    // Mutation: add `description` to the page query -> red, and every body
    // travels on every minute tick.
    expect(LINEAR_LABELED_ISSUES_QUERY).not.toContain('description')
    expect(linearIssueBodiesRequest(['a', 'b']).variables).toEqual({
      ids: ['a', 'b'],
    })
    expect(LINEAR_BODY_PAGE_SIZE).toBe(50)
  })

  it('reads a bodies reply, and refuses one it cannot read', () => {
    const read = parseLinearIssueBodiesReply(
      linearIssueBodiesBody([
        { id: 'a', description: 'The body' },
        { id: 'b' },
      ]),
    )
    expect(read.ok).toBe(true)
    if (read.ok) {
      expect(read.bodies.get('a')).toBe('The body')
      expect(read.bodies.get('b')).toBeNull()
    }
    expect(parseLinearIssueBodiesReply({ data: {} })).toMatchObject({
      ok: false,
      refusal: { kind: 'bad-response' },
    })
    expect(
      parseLinearIssueBodiesReply({ data: { issues: { nodes: [{}] } } }),
    ).toMatchObject({ ok: false, refusal: { kind: 'bad-response' } })
  })
})
