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
  /**
   * The issue carries the constitution's plain `blocked` label (MAR-3138):
   * it waits on a decision, the world or another issue. A PLAIN label, never
   * a group child -- `wave > blocked` is a wave named blocked, not this.
   */
  blocked: boolean
  groundedAt: string | null
  branchName: string | null
  updatedAt: string
}

export type TrackerRefusalKind =
  | 'unauthorized'
  | 'rate-limited'
  | 'unreachable'
  | 'bad-response'
  /**
   * The key answers, but no project with the bound id is visible to it
   * (MAR-3169): access lost, the project deleted or archived, or a binding
   * pasted to the wrong id. Its own kind because the page it produces is
   * EMPTY rather than refused -- read as ground truth, it looked like a calm
   * day and drifted every riding row to `unassigned`.
   */
  | 'project-not-visible'

export interface TrackerRefusal {
  kind: TrackerRefusalKind
  /** A sentence for a person; never carries the key. */
  message: string
  /** When a rate-limited tracker said it will take requests again. */
  retryAt: string | null
}

export type TrackerProbe =
  | {
      ok: true
      /** How many issues carry a seat label -- what the read counted. */
      issues: number
      /**
       * The bound project's name, or null when no project answers to the
       * stored id (MAR-3156 R4). Null is not "none found": it is the one
       * answer a count must never be given for, because `0 issues` reads the
       * same as a quiet project.
       */
      projectName: string | null
    }
  | { ok: false; refusal: TrackerRefusal }

/** One project the app can offer or bind to (MAR-3156). */
export interface TrackerProjectMatch {
  id: string
  name: string
  url: string
}

/**
 * What came back from looking a project up by URL, name or id (MAR-3156 R2).
 *
 * `ambiguous` is a first-class answer rather than a refusal: several projects
 * answering to one name is not an error, it is a question only the person can
 * settle, so the candidates travel with it.
 */
export type TrackerProjectResolution =
  | { kind: 'resolved'; project: TrackerProjectMatch }
  | { kind: 'ambiguous'; candidates: TrackerProjectMatch[] }
  | { kind: 'not-found' }
  | { kind: 'refused'; refusal: TrackerRefusal }

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
  /** A mastermind's STOP: the lap is parked until somebody re-grooms it. */
  | 'stopped'

/** What a mastermind ruled at a settle (MAR-3085). */
export type WorkLedgerVerdict = 'pass' | 'return' | 'stop'

/** What else the tick saw, kept verbatim for a later reader. */
export interface WorkLedgerFact {
  logicalStatus: TrackerLogicalStatus | null
  branchName: string | null
  updatedAt: string | null
  /** The lap the ledger held when a verdict row was written (MAR-3085 R3). */
  ledgerLapBefore?: number | null
  /** The verdict's lap was not the ledger's lap + 1; the ruling still wins. */
  lapDisagreed?: boolean
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
  /**
   * The ruling this row records, or null for a row the tracker watcher wrote
   * (MAR-3085 R3). A verdict row is a fact the app wrote AHEAD of the
   * tracker, which is why the watcher holds off it (R4).
   */
  verdict: WorkLedgerVerdict | null
  /** The settle the ruling was read from. */
  verdictSettleId: string | null
  /** A STOP carries the mastermind's reply; capped where it is written. */
  verdictNote: string | null
  /**
   * The tracker said this issue is blocked (MAR-3138) -- a fact of the row,
   * carried forward the way every other tracker fact is, so the panel can ask
   * a person to decide whatever state the issue is in.
   */
  blocked: boolean
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
  /** The bound project is not visible to the key (MAR-3169). */
  | 'project-not-visible'

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
