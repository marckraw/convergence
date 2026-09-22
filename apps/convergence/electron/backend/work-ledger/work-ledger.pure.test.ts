import { describe, expect, it } from 'vitest'
import {
  pullRequestForIssue,
  resolveEntryPullRequest,
  workLedgerEntryFromJoinedRow,
  workLedgerRecordFromRow,
  type WorkLedgerJoinedRow,
} from './work-ledger.pure'

const PR = {
  number: 7,
  url: 'https://github.com/example/repo/pull/7',
  state: 'open',
  headBranch: 'agent/MAR-3008-tray-key',
  checkedAt: '2026-09-17T08:00:00.000Z',
  source: 'gh',
}

function joined(
  overrides: Partial<WorkLedgerJoinedRow> = {},
): WorkLedgerJoinedRow {
  return {
    id: 'row-1',
    crew_id: 'crew-1',
    issue_id: 'issue-1',
    issue_identifier: 'MAR-3008',
    issue_title: 'Tray key',
    issue_url: 'https://linear.app/example/issue/mar-3008',
    seat: 'opus',
    wave: null,
    lap: 1,
    state: 'working',
    tracker_status: 'In Progress',
    blocked: 0,
    grounded_at: null,
    seen_at: '2026-09-17T08:00:00.000Z',
    fact_json:
      '{"logicalStatus":"in-progress","branchName":null,"updatedAt":null}',
    verdict: null,
    verdict_settle_id: null,
    verdict_note: null,
    member_session_id: 's1',
    session_exists: 1,
    pull_request_json: JSON.stringify(PR),
    execution_host: 'local',
    execution_host_last_event_at: null,
    attention: 'none',
    ...overrides,
  }
}

describe('MAR-3084 R6: the PR belongs to the issue its branch names', () => {
  it('matches the identifier case-insensitively, and nothing else', () => {
    expect(pullRequestForIssue(JSON.stringify(PR), 'mar-3008')).toMatchObject({
      number: 7,
    })
    expect(pullRequestForIssue(JSON.stringify(PR), 'MAR-3070')).toBeNull()
    expect(pullRequestForIssue('not json', 'MAR-3008')).toBeNull()
    expect(pullRequestForIssue(null, 'MAR-3008')).toBeNull()
  })

  it('a member whose conversation is gone joins no session and no facts', () => {
    expect(
      workLedgerEntryFromJoinedRow(joined({ session_exists: 0 })),
    ).toMatchObject({ sessionId: null, pr: null, hostLiveness: null })
  })

  it('an unreachable host reads as hostReachable: false', () => {
    expect(
      workLedgerEntryFromJoinedRow(joined({ attention: 'host-unreachable' }))
        .hostLiveness,
    ).toEqual({
      executionHost: 'local',
      lastEventAt: null,
      hostReachable: false,
    })
  })
})

describe('reading a ledger row', () => {
  it('reads an unknown state and an unreadable fact without throwing', () => {
    expect(
      workLedgerRecordFromRow(joined({ state: 'teleported', fact_json: '{' })),
    ).toMatchObject({
      state: 'unassigned',
      fact: { logicalStatus: null, branchName: null, updatedAt: null },
    })
  })
})

describe('MAR-3190 lap 2, G: an unreadable fact reads like a readable one', () => {
  it('the catch path gives the same defaults as the success path', () => {
    const broken = workLedgerRecordFromRow(joined({ fact_json: '{' })).fact
    const empty = workLedgerRecordFromRow(joined({ fact_json: '{}' })).fact
    // Mutation: the old catch (three keys, no `labels`) -> `labels` is
    // undefined here and every reader of the list has to guard it, red.
    expect(broken).toEqual(empty)
    expect(broken.labels).toEqual([])
    expect(broken.groomed).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(broken, 'summary')).toBe(false)
  })
})

describe('MAR-3190: a row written before the widened read still reads', () => {
  it('defaults every new fact, and leaves `summary` ABSENT', () => {
    const record = workLedgerRecordFromRow(
      joined({
        fact_json: JSON.stringify({
          logicalStatus: 'in-progress',
          branchName: 'agent/ex-1',
          updatedAt: '2026-09-17T08:00:00.000Z',
        }),
      }),
    )
    // Mutation: drop the defaults -> `fact.labels` is undefined and every
    // reader of the list has to guard it.
    expect(record.fact).toMatchObject({
      groomMe: false,
      groomed: false,
      grounded: false,
      dispatch: false,
      priority: null,
      labels: [],
      // MAR-3304 R2: absent is not a value. A row written before that slice
      // knows of no link, which is not the same as `undefined` travelling
      // on to a reader that has to guard it.
      pullRequests: [],
    })
    // The one key that must NOT be defaulted (R4): its absence is how the
    // watcher knows this row has never had a body read for it.
    // Mutation: `summary: value?.summary ?? null` -> true here, and no tick
    // ever fetches a body for a row written before this slice.
    expect(Object.prototype.hasOwnProperty.call(record.fact, 'summary')).toBe(
      false,
    )
  })

  it('a row written after it keeps its summary, null and all', () => {
    const record = workLedgerRecordFromRow(
      joined({
        fact_json: JSON.stringify({
          logicalStatus: 'in-progress',
          summary: null,
          labels: ['groom-me'],
          priority: 0,
        }),
      }),
    )
    expect(Object.prototype.hasOwnProperty.call(record.fact, 'summary')).toBe(
      true,
    )
    expect(record.fact.summary).toBeNull()
    expect(record.fact.labels).toEqual(['groom-me'])
    // Zero is Linear's own word, not "no priority" (R3).
    // Mutation: `value?.priority ?? null` losing 0 to a falsy check -> red.
    expect(record.fact.priority).toBe(0)
  })
})

describe('MAR-3304 R3: one resolution, with the conversation first', () => {
  const session = {
    number: 769,
    url: 'https://github.com/marckraw/convergence/pull/769',
    state: 'merged' as const,
    headBranch: 'agent/mar-3274-pending-transcript-patches',
    checkedAt: '2026-09-17T08:00:00.000Z',
    source: 'gh' as const,
    title: 'fix(loom): pending transcript patches',
    reviewDecision: 'APPROVED' as const,
  }
  const link769 = {
    url: 'https://github.com/marckraw/convergence/pull/769',
    number: 769,
    title: 'fix(loom): pending transcript patches',
  }

  it('(a) the same PR in both hands: the conversation’s richer reading', () => {
    expect(resolveEntryPullRequest({ session, linked: [link769] })).toEqual(
      session,
    )
  })

  it('(b) the seat has moved on: the tracker’s link', () => {
    // The seat's conversation now reads the PR of its NEXT issue.
    expect(
      resolveEntryPullRequest({
        session: { ...session, number: 777, headBranch: 'agent/mar-2981' },
        linked: [link769],
      }),
    ).toEqual({
      source: 'tracker',
      number: 769,
      url: link769.url,
      title: link769.title,
    })
  })

  it('(c) no conversation reading at all: the tracker’s link', () => {
    expect(
      resolveEntryPullRequest({ session: null, linked: [link769] }),
    ).toMatchObject({ source: 'tracker', number: 769 })
  })

  it('(d) neither: null', () => {
    expect(resolveEntryPullRequest({ session: null, linked: [] })).toBeNull()
    // A fact written before this slice has no key at all, and the resolver
    // is where that is answered -- once, for every caller.
    expect(
      resolveEntryPullRequest({ session: null, linked: undefined }),
    ).toBeNull()
    expect(resolveEntryPullRequest({ session, linked: undefined })).toEqual(
      session,
    )
  })

  it('(e) a PR opened a minute ago, before the tracker knows: the reading', () => {
    expect(resolveEntryPullRequest({ session, linked: [] })).toEqual(session)
  })

  it('the FIRST link wins when the tracker carries several', () => {
    expect(
      resolveEntryPullRequest({
        session: null,
        linked: [
          link769,
          { url: 'https://github.com/o/r/pull/900', number: 900, title: null },
        ],
      }),
    ).toMatchObject({ number: 769 })
  })

  it('reaches the entry, and a pre-slice row still shows the reading', () => {
    // Through `workLedgerEntryFromJoinedRow`, which is what `list()` maps
    // with: a stored fact with no `pullRequests` key at all.
    expect(workLedgerEntryFromJoinedRow(joined()).pr).toMatchObject({
      number: 7,
      state: 'open',
    })
    expect(
      workLedgerEntryFromJoinedRow(
        joined({
          pull_request_json: null,
          fact_json: JSON.stringify({
            logicalStatus: 'done',
            pullRequests: [link769],
          }),
        }),
      ).pr,
    ).toMatchObject({ source: 'tracker', number: 769 })
  })
})

describe('MAR-3084 lap 2, B: the identifier matches as a token', () => {
  it.each([
    ['MAR-300', 'agent/mar-3008-tray-key', false],
    ['MAR-30', 'agent/mar-3008-tray-key', false],
    ['MAR-3008', 'agent/mar-3008-tray-key', true],
    ['mar-3008', 'feature/MAR-3008', true],
    ['MAR-3008', 'agent/XMAR-3008-tray', false],
    ['MAR-3008', 'agent/mar-30080-other', false],
    ['MAR-3008', 'mar-3008', true],
    ['MAR-3008', 'fix-mar-3008b', true],
  ])('%s in %s -> %s', (identifier, headBranch, carries) => {
    // Mutation: a bare case-insensitive `includes` -> MAR-300 / MAR-30 /
    // XMAR-3008 / mar-30080 carry the PR, red.
    expect(
      pullRequestForIssue(JSON.stringify({ ...PR, headBranch }), identifier) !==
        null,
    ).toBe(carries)
  })
})
