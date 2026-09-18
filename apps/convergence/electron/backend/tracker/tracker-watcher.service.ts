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
 * Throws the refusal an empty page really means, or returns when the project
 * is there and the page is simply quiet (MAR-3169 R1).
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
  if (resolution.kind === 'not-found') {
    throw new TrackerRefusalError({
      kind: 'project-not-visible',
      message: 'The key cannot see the bound project.',
      retryAt: null,
    })
  }
  // A refusal on the question is the tracker's answer for the whole tick,
  // exactly as if the list itself had been refused.
  if (resolution.kind === 'refused') {
    throw new TrackerRefusalError(resolution.refusal)
  }
  // `resolved` -- and `ambiguous`, which an id cannot produce: the project is
  // there, so the empty page is the truth and the tick goes on as before.
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
      // quiet one -- and believed, it drifted every riding row to
      // `unassigned` once a minute, forever. Only the empty page pays for the
      // question (R2): a page with issues in it has already proved the
      // project is there.
      if (issues.length === 0) await verifyProjectVisible(adapter, binding)
      const now = this.now()
      const rows = diffTrackerSnapshot({
        crewId,
        current: this.deps.ledger.currentView(crewId),
        issues,
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
