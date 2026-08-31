import type { UpdatesService } from './updates.service'
import type { UpdatePrefs } from './updates.types'

export const STARTUP_DELAY_MS = 10_000
export const INTERVAL_MS = 4 * 60 * 60 * 1000

export interface UpdatesSchedulerDeps {
  service: UpdatesService
  getPrefs: () => UpdatePrefs
}

type TimerHandle = ReturnType<typeof setTimeout>

export class UpdatesScheduler {
  private startupHandle: TimerHandle | null = null
  private intervalHandle: TimerHandle | null = null
  private running = false

  constructor(private readonly deps: UpdatesSchedulerDeps) {}

  start(): void {
    if (this.running) return
    this.running = true
    if (!this.deps.getPrefs().backgroundCheckEnabled) return
    this.scheduleStartupTick()
  }

  stop(): void {
    this.running = false
    this.clearTimers()
  }

  onPrefsChanged(prefs: UpdatePrefs): void {
    if (!this.running) return
    if (prefs.backgroundCheckEnabled) {
      if (!this.startupHandle && !this.intervalHandle) {
        this.scheduleStartupTick()
      }
    } else {
      this.clearTimers()
    }
  }

  private scheduleStartupTick(): void {
    this.clearTimers()
    this.startupHandle = setTimeout(() => {
      this.startupHandle = null
      this.tick()
      this.scheduleInterval()
    }, STARTUP_DELAY_MS)
  }

  private scheduleInterval(): void {
    this.intervalHandle = setInterval(() => this.tick(), INTERVAL_MS)
  }

  private tick(): void {
    if (!this.running) return
    if (!this.deps.getPrefs().backgroundCheckEnabled) {
      this.clearTimers()
      return
    }
    const phase = this.deps.service.getStatus().phase
    if (
      phase === 'checking' ||
      phase === 'downloading' ||
      phase === 'downloaded'
    ) {
      return
    }
    this.deps.service.check('background')
  }

  private clearTimers(): void {
    if (this.startupHandle !== null) {
      clearTimeout(this.startupHandle)
      this.startupHandle = null
    }
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
  }
}
