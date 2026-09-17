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
  TrackerRefusalError,
  type TrackerAdapter,
  type TrackerBinding,
  type TrackerProbe,
} from './tracker.types'

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
