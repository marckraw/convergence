import type { SessionCrew } from '../crew/crew.types'
import type { WorkLedgerService } from '../work-ledger/work-ledger.service'
import type {
  TrackerHealth,
  WorkLedgerSnapshot,
} from '../work-ledger/work-ledger.types'
import {
  diffTrackerSnapshot,
  isTrackerTickDue,
  TRACKER_WATCH_INTERVAL_MS,
  trackerHealthAfter,
  trackerHealthChanged,
} from './tracker-watcher.pure'
import { applyIssueBodies, issuesNeedingBody } from './linear-tracker.pure'
import {
  DEFAULT_TRACKER_LABEL_PREFIX,
  DEFAULT_TRACKER_STATUS_MAP,
  DEFAULT_TRACKER_WAVE_PREFIX,
} from './tracker-binding.pure'
import {
  TrackerRefusalError,
  type TrackerAdapter,
  type TrackerBinding,
  type TrackerProbe,
  type TrackerProjectResolution,
} from './tracker.types'

/** One issue of one crew, as the body-read memory keys it. */
function bodyKey(crewId: string, issueId: string): string {
  return `${crewId}:${issueId}`
}

/**
 * The later of two ISO timestamps, either of which may be missing.
 *
 * String comparison is exact for the shape Linear sends (`Z`-suffixed
 * ISO-8601, fixed width); anything unparseable loses to the other rather
 * than winning by accident.
 */
function laterUpdatedAt(
  fromRow: string | null,
  fromMemory: string | null,
): string | null {
  if (fromRow === null) return fromMemory
  if (fromMemory === null) return fromRow
  return fromMemory > fromRow ? fromMemory : fromRow
}

/**
 * The binding an adapter is built with when the crew has none yet
 * (MAR-3156 R3): a project lookup reads no field of it. Named so the empty
 * project id below is read as "not bound yet" rather than as a value.
 */
const LOOKUP_ONLY_BINDING: TrackerBinding = {
  kind: 'linear',
  projectId: '',
  labelPrefix: DEFAULT_TRACKER_LABEL_PREFIX,
  wavePrefix: DEFAULT_TRACKER_WAVE_PREFIX,
  statusMap: { ...DEFAULT_TRACKER_STATUS_MAP },
}

export interface TrackerWatcherDeps {
  crews: { list(): SessionCrew[] }
  ledger: Pick<WorkLedgerService, 'append' | 'currentView' | 'list'>
  resolveKey: (crewId: string) => Promise<string | null>
  createAdapter: (input: {
    apiKey: string
    binding: TrackerBinding
  }) => TrackerAdapter
  broadcast: (snapshot: WorkLedgerSnapshot) => void
  now?: () => Date
  log?: (message: string, error?: unknown) => void
}

/**
 * Whether two project ids are the same id, with the equality the far side
 * used to answer (lap 3, A).
 *
 * The form binds a typed UUID verbatim and the reference parser accepts one
 * in upper case, while Linear answers with its own lower-case form. A strict
 * `===` would call such a project invisible on its first quiet tick while it
 * lists issues perfectly well. Comparing without case is safe either way: if
 * Linear itself were case-sensitive, the lookup would already have answered
 * `not-found` and the tick would refuse regardless.
 */
function sameProjectId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/**
 * Throws the refusal an empty page really means, or returns when the project
 * is there UNDER THE BOUND ID and the page is simply quiet (MAR-3169 R1).
 *
 * Thrown into the tick's own `catch`, so the new state rides the one refusal
 * path every other outage already takes: no ledger row is appended, the
 * health is named with an age, and the rows on screen stay where they were.
 */
async function verifyProjectVisible(
  adapter: TrackerAdapter,
  binding: TrackerBinding,
): Promise<void> {
  const resolution = await adapter.resolveProject(binding.projectId)
  // A refusal on the question is the tracker's answer for the whole tick,
  // exactly as if the list itself had been refused.
  if (resolution.kind === 'refused') {
    throw new TrackerRefusalError(resolution.refusal)
  }
  // Only an answer that carries the BOUND ID is believed (lap 2, A; lap 3,
  // B). The tick still asks the free-text door, and that door re-reads its
  // argument: a binding stored before MAR-3156 -- a pasted URL, a typed name,
  // which the list then filters as `project.id eq <that string>` and answers
  // empty -- could come back `resolved` BY NAME, and the tick would believe
  // the empty page while the Test on the same crew says the project is not
  // visible. So a different id, several projects, or none all mean the bound
  // string is not a project this key can see.
  if (
    resolution.kind === 'resolved' &&
    sameProjectId(resolution.project.id, binding.projectId)
  ) {
    return
  }
  throw new TrackerRefusalError({
    kind: 'project-not-visible',
    message: 'The key cannot see the bound project.',
    retryAt: null,
  })
}

export interface TrackerWatcherHandle {
  stop: () => void
}

/**
 * The label watcher (MAR-3084 R5, R7): reads each bound crew's tracker and
 * appends what changed to the work ledger. Never writes to the tracker.
 *
 * A house-rules timer, as `startRelayStallClock`: an immediate first tick then
 * one per interval, unreferenced so it never holds the app open, and a throw
 * inside a tick is logged and never takes the interval with it. A refusal
 * changes the crew's health and nothing else -- the ledger keeps its rows.
 */
export class TrackerWatcherService {
  private readonly health = new Map<string, TrackerHealth>()
  private ticking = false

  constructor(private readonly deps: TrackerWatcherDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date()
  }

  private log(message: string, error?: unknown): void {
    if (this.deps.log) this.deps.log(message, error)
    else console.error(`[tracker] ${message}`, error ?? '')
  }

  trackerHealth(crewId: string): TrackerHealth | null {
    return this.health.get(crewId) ?? null
  }

  snapshot(crewId: string): WorkLedgerSnapshot {
    return {
      crewId,
      entries: this.deps.ledger.list(crewId),
      trackerHealth: this.trackerHealth(crewId),
    }
  }

  /**
   * The binding form's Test (R9): one read with the stored key, as a typed
   * probe. An unbound crew or a missing key is a refusal, never a throw.
   */
  async probe(crewId: string): Promise<TrackerProbe> {
    const binding =
      this.deps.crews.list().find((crew) => crew.id === crewId)
        ?.trackerBinding ?? null
    if (!binding) {
      return {
        ok: false,
        refusal: {
          kind: 'bad-response',
          message: 'This crew is not bound to a tracker.',
          retryAt: null,
        },
      }
    }
    const apiKey = await this.deps.resolveKey(crewId)
    if (!apiKey) {
      return {
        ok: false,
        refusal: {
          kind: 'unauthorized',
          message: 'No API key is stored for this crew.',
          retryAt: null,
        },
      }
    }
    return this.deps.createAdapter({ apiKey, binding }).probe()
  }

  /**
   * The binding form's project lookup (MAR-3156 R3/R5): the same shape as
   * `probe` above -- the key comes from the Keychain by crew id, never from
   * the renderer, and a missing key is a typed refusal rather than a throw.
   *
   * Unlike `probe` this runs BEFORE a binding exists: it is how the id gets
   * found. So it asks the crew for a binding only to reuse its prefixes, and
   * falls back to the defaults when there is none -- the lookup reads no
   * binding field, and the adapter is built with one only because that is how
   * an adapter is built.
   */
  async resolveProject(
    crewId: string,
    reference: string,
  ): Promise<TrackerProjectResolution> {
    const apiKey = await this.deps.resolveKey(crewId)
    if (!apiKey) {
      return {
        kind: 'refused',
        refusal: {
          kind: 'unauthorized',
          message: 'No API key is stored for this crew.',
          retryAt: null,
        },
      }
    }
    const binding =
      this.deps.crews.list().find((crew) => crew.id === crewId)
        ?.trackerBinding ?? LOOKUP_ONLY_BINDING
    return this.deps
      .createAdapter({ apiKey, binding })
      .resolveProject(reference)
  }

  start(intervalMs: number = TRACKER_WATCH_INTERVAL_MS): TrackerWatcherHandle {
    const fire = () => {
      void this.tick().catch((error) => this.log('Tick failed', error))
    }
    fire()
    const timer = setInterval(fire, intervalMs)
    timer.unref?.()
    return { stop: () => clearInterval(timer) }
  }

  /**
   * What `updatedAt` each issue's body was last READ at, for this process's
   * life (lap 2, B).
   *
   * In memory and not in the ledger, because it is not an observation of the
   * issue -- it is this watcher's own note about a request it made. Lost on
   * restart, which costs one extra body read per issue, once; kept forever, a
   * comment on an issue would cost one every minute until somebody edited the
   * issue in a way the ledger records.
   */
  private readonly lastBodyRead = new Map<string, string>()

  async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      for (const crew of this.deps.crews.list()) {
        if (!crew.trackerBinding) continue
        try {
          await this.watchCrew(crew.id, crew.trackerBinding)
        } catch (error) {
          this.log(`Could not read the tracker for crew ${crew.id}`, error)
        }
      }
    } finally {
      this.ticking = false
    }
  }

  private async watchCrew(
    crewId: string,
    binding: TrackerBinding,
  ): Promise<void> {
    if (
      !isTrackerTickDue({ health: this.trackerHealth(crewId), now: this.now() })
    )
      return
    const apiKey = await this.deps.resolveKey(crewId)
    if (!apiKey) return

    const adapter = this.deps.createAdapter({ apiKey, binding })
    const previous = this.trackerHealth(crewId)
    let appended = 0
    let next: TrackerHealth
    try {
      const issues = await adapter.listLabeledIssues({
        projectId: binding.projectId,
        labelPrefix: binding.labelPrefix,
        wavePrefix: binding.wavePrefix,
      })
      // An empty page is verified before it is believed (MAR-3169 R1). A
      // project the key cannot see answers with no issues, exactly like a
      // quiet one -- and believed, every riding row was written `unassigned`
      // on the first such tick: it left the wave, and nothing brought it
      // back, while the header said "Quiet project".
      //
      // The cost, as far as this code can measure it (lap 2, B): one extra
      // request per tick per bound crew, and only on a tick whose page came
      // back empty -- so two requests a minute for a quiet project instead of
      // one, and none extra for a project with labeled issues in it (R2).
      if (issues.length === 0) await verifyProjectVisible(adapter, binding)
      const current = this.deps.ledger.currentView(crewId)
      // The bodies, and only for issues that moved (MAR-3190 R4). Asked
      // BEFORE the diff and inside the same try, so a refused bodies read is
      // a refused tick: half a page carrying summaries and half carrying
      // nulls would be written as rows saying those summaries were deleted.
      //
      // The memory is the LATER of two `updatedAt`s (lap 2, B): the row's,
      // and this process's own record of what it last read a body at. They
      // differ for a change the ledger does not record -- a typo fix, a
      // comment -- which moves `updatedAt` without moving anything
      // `sameObservation` compares, so no row is written and the row's
      // `updatedAt` stays behind forever. Read from the row alone, that
      // issue's body would be fetched again every single minute.
      const memory = current.map((row) => ({
        issueId: row.issueId,
        updatedAt: laterUpdatedAt(
          row.fact.updatedAt,
          this.lastBodyRead.get(bodyKey(crewId, row.issueId)) ?? null,
        ),
        summary: row.fact.summary ?? null,
        groundedAt: row.groundedAt,
        read: 'summary' in row.fact,
      }))
      const wanted = issuesNeedingBody(memory, issues)
      const bodies =
        wanted.length > 0
          ? await adapter.readIssueBodies(wanted)
          : new Map<string, string | null>()
      const now = this.now()
      // Only after the read succeeded: a refused read remembers nothing, so
      // the next tick asks again.
      const askedFor = new Set(wanted)
      for (const issue of issues) {
        if (askedFor.has(issue.id)) {
          this.lastBodyRead.set(bodyKey(crewId, issue.id), issue.updatedAt)
        }
      }
      const rows = diffTrackerSnapshot({
        crewId,
        current,
        issues: applyIssueBodies({
          issues,
          bodies,
          memory,
          asked: wanted,
          today: now.toISOString().slice(0, 10),
        }),
        seenAt: now.toISOString(),
      })
      this.deps.ledger.append(rows)
      appended = rows.length
      next = trackerHealthAfter({ previous, outcome: { ok: true }, now })
    } catch (error) {
      if (!(error instanceof TrackerRefusalError)) throw error
      next = trackerHealthAfter({
        previous,
        outcome: { ok: false, refusal: error.refusal },
        now: this.now(),
      })
    }
    this.health.set(crewId, next)
    // Only news goes to the windows (lap 2, F): rows appended, or a health
    // that changed state or backoff. `workLedger:list` always answers fresh.
    if (appended > 0 || trackerHealthChanged(previous, next)) {
      this.deps.broadcast(this.snapshot(crewId))
    }
  }
}
