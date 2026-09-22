import type { SessionCrew, SessionCrewMember } from '@/entities/session-crew'
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
    verdict: null,
    verdictSettleId: null,
    verdictNote: null,
    blocked: false,
    hostLiveness: {
      executionHost: 'local',
      lastEventAt: null,
      hostReachable: true,
    },
    ...overrides,
  }
}

/** A crew member as the crew store answers with one; fixtures only. */
export function crewMember(
  overrides: Partial<SessionCrewMember> = {},
): SessionCrewMember {
  return {
    sessionId: null,
    batonName: null,
    canvasX: null,
    canvasY: null,
    role: 'horse',
    kind: 'dynamic',
    roleCard: null,
    hostPolicy: null,
    lanePolicy: null,
    lanePath: null,
    wipLimit: 1,
    paused: false,
    providerId: null,
    model: null,
    conversationMissing: false,
    ...overrides,
  }
}

/** A seat with a conversation: `kind` is derived from that, as the read is. */
export function residentSeat(
  batonName: string,
  overrides: Partial<SessionCrewMember> = {},
): SessionCrewMember {
  return crewMember({
    batonName,
    sessionId: `session-${batonName}`,
    kind: 'resident',
    ...overrides,
  })
}

/** A crew bound to a tracker, with the members given. */
export function boundCrewWith(
  id: string,
  name: string,
  members: SessionCrewMember[],
): SessionCrew {
  return {
    id,
    name,
    emoji: null,
    accentColor: null,
    position: 0,
    roundCap: null,
    stallMinutes: null,
    createdAt: '2026-09-17T08:00:00.000Z',
    updatedAt: '2026-09-17T08:00:00.000Z',
    sessionIds: members.flatMap((member) =>
      member.sessionId ? [member.sessionId] : [],
    ),
    members,
    trackerBinding: {
      kind: 'linear',
      autoDispatch: false,
      projectId: `project-${id}`,
      labelPrefix: 'horse:',
      wavePrefix: 'wave:',
      statusMap: {},
    },
  }
}
