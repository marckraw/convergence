import { describe, expect, it } from 'vitest'
import {
  pullRequestForIssue,
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
    grounded_at: null,
    seen_at: '2026-09-17T08:00:00.000Z',
    fact_json:
      '{"logicalStatus":"in-progress","branchName":null,"updatedAt":null}',
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
