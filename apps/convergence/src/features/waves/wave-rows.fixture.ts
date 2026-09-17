import type { WorkLedgerEntry } from '@/entities/work-ledger'

/** A ledger row as P2a's `workLedger:list` answers it; fixtures only. */
export function ledgerEntry(
  overrides: Partial<WorkLedgerEntry> &
    Pick<WorkLedgerEntry, 'issueIdentifier'>,
): WorkLedgerEntry {
  return {
    id: `row-${overrides.issueIdentifier}`,
    crewId: 'crew-1',
    issueId: `issue-${overrides.issueIdentifier}`,
    issueTitle: `Work ${overrides.issueIdentifier}`,
    issueUrl: `https://linear.app/example/issue/${overrides.issueIdentifier.toLowerCase()}`,
    seat: 'opus',
    wave: 'loom-p2',
    lap: 1,
    state: 'working',
    trackerStatus: 'In Progress',
    groundedAt: null,
    seenAt: '2026-09-17T12:00:00.000Z',
    fact: { logicalStatus: 'in-progress', branchName: null, updatedAt: null },
    sessionId: 'session-opus',
    pr: null,
    hostLiveness: {
      executionHost: 'local',
      lastEventAt: null,
      hostReachable: true,
    },
    ...overrides,
  }
}
