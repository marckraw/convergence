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
  autoDispatch: boolean
  kind: TrackerKind
  projectId: string
  /** `horse:` -- names the label GROUP whose child is the seat. */
  labelPrefix: string
  /** `wave:` -- names the label GROUP whose child is the wave. */
  wavePrefix: string
  /** Tracker state name -> logical status. */
  statusMap: Record<string, TrackerLogicalStatus>
}

/**
 * A pull request the TRACKER links to an issue (MAR-3304 R1).
 *
 * What the tracker's own integration filed on the issue, and nothing more: a
 * number, the URL it links to, and whatever title that integration wrote. No
 * state and no timestamp -- both are facts of a READ, and nothing here has
 * opened the pull request.
 */
export interface TrackerIssuePullRequest {
  url: string
  number: number
  /** The link's own title, or null when the tracker gave none. */
  title: string | null
}

/**
 * The tracker's link as a reader receives it (MAR-3304 R3).
 *
 * TAGGED, and deliberately not a `SessionPullRequest` with an invented
 * `state` and `checkedAt`: a reader that cannot tell the two apart would put
 * a state on screen that nobody looked up. The tag is what makes the lie
 * unavailable rather than merely discouraged.
 */
export interface TrackerPullRequest extends TrackerIssuePullRequest {
  source: 'tracker'
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
  /**
   * The plain labels the loop runs on (MAR-3190 R2), each read the way
   * `blocked` is: a parentless label of that name, case-insensitively. A
   * `grounded` under some group is that group's child, not this fact.
   */
  groomMe: boolean
  groomed: boolean
  grounded: boolean
  dispatch: boolean
  /**
   * Linear's own priority (0 = its word "none", 1 urgent … 4 low), or null
   * when the tracker did not answer with one. Never a default: "no priority"
   * and "priority none" are different things, and the dispatch order
   * (MAR-2981) reads them differently.
   */
  priority: number | null
  /**
   * Every label as a person would read it: a plain label as written, a group
   * child as `group › child`. For display only -- every fact above is read
   * from the structure, never from this list.
   */
  labels: string[]
  /**
   * The pull requests the tracker links to this issue (MAR-3304 R1), in the
   * order it gives them. Empty when it links none -- never null: "the
   * tracker linked nothing" is an answer, and this read always has one.
   */
  pullRequests: TrackerIssuePullRequest[]
  /**
   * The issue's promise in a sentence, from its body (R6). Null until the
   * body has been read, and null for an issue whose body says nothing.
   */
  summary: string | null
  /**
   * When the issue was last grounded, `YYYY-MM-DD`, read from the body's own
   * `Grounded at … · <date>` line (R5) -- the only place that fact exists.
   */
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

/**
 * One open issue of the bound project that is NOT in the loop (MAR-3236): it
 * carries no Loom label, so the labeled read never kept it. Light by
 * construction -- no body is read for it, so it has no summary and no
 * grounding date, and it never becomes a ledger row.
 */
export interface TrackerOutsideIssue {
  id: string
  identifier: string
  title: string
  url: string
  /** The tracker's own state name, verbatim. */
  status: string
  /** Linear's 0-4, or null when the tracker did not answer with one. */
  priority: number | null
  /** Every label as a person reads it (`group › child` for a group child). */
  labels: string[]
  updatedAt: string
}

/** The label group names the outside read needs to decide membership. */
export interface ListOutsideIssuesInput {
  projectId: string
  seatGroup: string
  waveGroup: string
}

/** What one outside read answered: a bounded list, and whether it was cut. */
export interface TrackerOutsidePage {
  issues: TrackerOutsideIssue[]
  /** True when the tracker had a further page the bound did not read. */
  more: boolean
}

/**
 * A crew's last outside read (MAR-3236), held in memory by the watcher and
 * answered by `tracker:outside` / pushed on `tracker:outsideUpdated`.
 * `readAt` null means it has never been read in this process's life.
 */
export interface TrackerOutsideSnapshot {
  crewId: string
  issues: TrackerOutsideIssue[]
  more: boolean
  readAt: string | null
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
  /** The plain label facts (MAR-3190 R2); absent on rows older than R2. */
  groomMe?: boolean
  groomed?: boolean
  grounded?: boolean
  dispatch?: boolean
  /** Linear's priority, or null (MAR-3190 R3). */
  priority?: number | null
  /** Every label as a person reads it (MAR-3190). */
  labels?: string[]
  /**
   * The pull requests the tracker links to the issue (MAR-3304 R2).
   *
   * Absent on every row written before this slice, which is not the same as
   * "the tracker links none" -- so the key is optional and `readFact`
   * answers absent with `[]` rather than letting `undefined` travel.
   */
  pullRequests?: TrackerIssuePullRequest[]
  /**
   * The issue's promise (MAR-3190 R6) -- and the row's own answer to "has a
   * body ever been read for this issue?".
   *
   * The KEY's presence is the flag, which is why `readFact` leaves it absent
   * rather than defaulting it to null like everything else here: a row
   * written before this slice has no summary and no way to know it is
   * missing one, and `issuesNeedingBody` (R4) has to be able to tell that
   * row from one whose body genuinely says nothing.
   */
  summary?: string | null
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
  /**
   * The pull request this issue has, best reading first (MAR-3304 R3): the
   * seat conversation's own read when it is about THIS issue, otherwise the
   * link the tracker carries -- which outlives the conversation.
   */
  pr: SessionPullRequest | TrackerPullRequest | null
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

export type SeatAvailability =
  | 'failed'
  | 'idle'
  | 'turn'
  | 'compacting'
  | 'drill'
  | 'waiting-on-you'
  | 'unknown'
export type DispatchLane = 'clean' | 'dirty' | 'unpushed' | 'unknown' | 'unset'
export type DispatchWord =
  | { kind: 'needs-labels'; missing: string[] }
  | { kind: 'blocked' }
  | { kind: 'later-lap'; lap: number }
  | { kind: 'seat-not-in-crew' }
  | { kind: 'seat-no-conversation' }
  | { kind: 'no-mastermind' }
  | { kind: 'no-wire' }
  | { kind: 'seat-paused' }
  | { kind: 'seat-failed' }
  | { kind: 'sent'; at: string }
  | { kind: 'send-failed'; reason: string }
  | {
      kind: 'seat-busy'
      why: Exclude<SeatAvailability, 'idle' | 'unknown' | 'failed'>
    }
  | { kind: 'seat-holds'; identifier: string }
  | { kind: 'lane'; state: Exclude<DispatchLane, 'clean'>; path: string | null }
  | { kind: 'queued-behind'; identifier: string }
  | { kind: 'would-start'; wire: { id: string; opener: string | null } }

export interface AutoDispatchRecord {
  issueId: string
  lap: number
  sentAt: string
  error: string | null
}

export interface DispatchPlan {
  autoDispatch?: boolean
  plannedAt: string
  words: Record<string, DispatchWord>
  order: Record<string, string[]>
  warnings: string[]
}

/** The one shape `workLedger:list` answers and `workLedger:updated` sends. */
export interface WorkLedgerSnapshot {
  dispatchPlan: DispatchPlan | null
  crewId: string
  entries: WorkLedgerEntry[]
  trackerHealth: TrackerHealth | null
}

/**
 * What pressing Refresh did (MAR-3227 R6).
 *
 * - `reading`: a read was asked for and will happen now (or right after the
 *   read already in flight).
 * - `just-read`: the tracker was read under the floor ago; nothing was asked
 *   for, and `refreshableAt` says when a press would read.
 * - `backing-off`: this crew's tracker is being left alone (a rate limit);
 *   nothing was asked for.
 */
export interface TrackerRefreshReply {
  outcome: 'reading' | 'just-read' | 'backing-off'
  refreshableAt: string | null
}

/**
 * One successful read of one crew's tracker (MAR-3227 R6), pushed on
 * `tracker:read` after EVERY such read.
 *
 * Separate from `workLedger:updated` on purpose: that channel carries news
 * only (MAR-3084 lap 2, F), and most reads have none. Without this the
 * panel's "read N s ago" would count from the last read that happened to
 * change something, and say minutes while the tracker was read seconds ago.
 */
export interface TrackerReadEvent {
  crewId: string
  lastOkAt: string
  /** When the floor lets the next read happen. */
  refreshableAt: string
}
