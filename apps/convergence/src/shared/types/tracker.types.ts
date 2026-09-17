import type { SessionPullRequest } from './session-pull-request.types'

/**
 * The tracker and work-ledger facts both processes read (MAR-3084). Defined
 * once here; the backend re-exports them so the wire and its reader cannot
 * drift apart.
 */

/** Where an issue sits in the loop, whatever the tracker calls the state. */
export type TrackerLogicalStatus =
  | 'backlog'
  | 'todo'
  | 'in-progress'
  | 'in-review'
  | 'reviewed'
  | 'done'
  | 'other'

export type TrackerKind = 'linear'

/**
 * How a crew is bound to a tracker. Nothing secret: the API key is a
 * Keychain fact filed under the crew id, never a field here (R3).
 */
export interface TrackerBinding {
  kind: TrackerKind
  projectId: string
  /** `horse:` -- names the label GROUP whose child is the seat. */
  labelPrefix: string
  /** `wave:` -- names the label GROUP whose child is the wave. */
  wavePrefix: string
  /** Tracker state name -> logical status. */
  statusMap: Record<string, TrackerLogicalStatus>
}

export interface TrackerIssue {
  id: string
  identifier: string
  title: string
  url: string
  /** The tracker's own state name, verbatim. */
  status: string
  logicalStatus: TrackerLogicalStatus
  /** The child under the seat group (`horse` > `opus` -> `opus`). */
  seat: string | null
  /** The child under the wave group. */
  wave: string | null
  groundedAt: string | null
  branchName: string | null
  updatedAt: string
}

export type TrackerRefusalKind =
  | 'unauthorized'
  | 'rate-limited'
  | 'unreachable'
  | 'bad-response'

export interface TrackerRefusal {
  kind: TrackerRefusalKind
  /** A sentence for a person; never carries the key. */
  message: string
  /** When a rate-limited tracker said it will take requests again. */
  retryAt: string | null
}

export type TrackerProbe =
  | { ok: true; issues: number }
  | { ok: false; refusal: TrackerRefusal }

export interface ListLabeledIssuesInput {
  projectId: string
  labelPrefix: string
  wavePrefix: string
}

/** What the renderer may learn about a crew's key: whether one exists. */
export type TrackerCredentialStatus = 'present' | 'absent'

/** One Test press: the probe and when it ran. */
export interface TrackerProbeReading {
  probe: TrackerProbe
  at: string
}

/** Where an issue is in the loop, as the ledger records it (MAR-3084 R4/R5). */
export type WorkLedgerState =
  | 'assigned'
  | 'working'
  | 'returned'
  | 'reviewed'
  | 'done'
  | 'unassigned'

/** What else the tick saw, kept verbatim for a later reader. */
export interface WorkLedgerFact {
  logicalStatus: TrackerLogicalStatus | null
  branchName: string | null
  updatedAt: string | null
}

/** One observation, as appended. */
export interface WorkLedgerRecord {
  id: string
  crewId: string
  issueId: string
  issueIdentifier: string
  issueTitle: string
  issueUrl: string
  seat: string | null
  wave: string | null
  lap: number
  state: WorkLedgerState
  trackerStatus: string
  groundedAt: string | null
  seenAt: string
  fact: WorkLedgerFact
}

export type NewWorkLedgerRecord = Omit<WorkLedgerRecord, 'id'>

export interface WorkLedgerHostLiveness {
  executionHost: string
  lastEventAt: string | null
  hostReachable: boolean
}

/**
 * A current row plus the facts only the app knows, joined at read time
 * (MAR-3084 R6). Nothing here is written back into the ledger.
 */
export interface WorkLedgerEntry extends WorkLedgerRecord {
  sessionId: string | null
  pr: SessionPullRequest | null
  hostLiveness: WorkLedgerHostLiveness | null
}

export type TrackerHealthState =
  | 'ok'
  | 'unreachable'
  | 'unauthorized'
  | 'rate-limited'
  | 'bad-response'

/** How the crew's tracker last answered (MAR-3084 R7). */
export interface TrackerHealth {
  state: TrackerHealthState
  /** When the current state began. */
  since: string
  lastOkAt: string | null
  /** A rate-limited tracker's resume time; the watcher waits until then. */
  backoffUntil: string | null
}

/** The one shape `workLedger:list` answers and `workLedger:updated` sends. */
export interface WorkLedgerSnapshot {
  crewId: string
  entries: WorkLedgerEntry[]
  trackerHealth: TrackerHealth | null
}
