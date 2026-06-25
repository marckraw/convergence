import { deriveLiveness } from '../provider/liveness.pure'
import { SESSION_LIVENESS_TICK_MS } from './session.constants'
import type { SessionSummary } from './session.types'

export type SessionLivenessNoteKind = 'quiet' | 'silent'

interface LivenessState {
  lastEventAt: number
  warned: { quiet: boolean; silent: boolean }
}

interface SessionLivenessServiceDeps {
  isOpen: () => boolean
  getSummary: (sessionId: string) => Pick<SessionSummary, 'status'> | null
  emitNote: (sessionId: string, kind: SessionLivenessNoteKind) => void
  now?: () => number
}

export class SessionLivenessService {
  private readonly state = new Map<string, LivenessState>()
  private readonly now: () => number
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly deps: SessionLivenessServiceDeps) {
    this.now = deps.now ?? (() => Date.now())
  }

  bump(sessionId: string): void {
    const now = this.now()
    const existing = this.state.get(sessionId)
    if (existing) {
      existing.lastEventAt = now
      existing.warned.quiet = false
      existing.warned.silent = false
    } else {
      this.state.set(sessionId, {
        lastEventAt: now,
        warned: { quiet: false, silent: false },
      })
    }
    this.ensureTimer()
  }

  clear(sessionId: string): void {
    this.state.delete(sessionId)
    if (this.state.size === 0) {
      this.stopTimer()
    }
  }

  /** @internal exposed through SessionService for tests. */
  triggerTickForTest(): void {
    this.tick()
  }

  private ensureTimer(): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => {
      this.tick()
    }, SESSION_LIVENESS_TICK_MS)
    if (typeof this.timer.unref === 'function') {
      this.timer.unref()
    }
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private tick(): void {
    if (!this.deps.isOpen()) {
      this.state.clear()
      this.stopTimer()
      return
    }
    if (this.state.size === 0) {
      this.stopTimer()
      return
    }

    const now = this.now()
    for (const [sessionId, state] of this.state) {
      const summary = this.deps.getSummary(sessionId)
      if (!summary || summary.status !== 'running') {
        this.state.delete(sessionId)
        continue
      }

      const signal = deriveLiveness({
        lastEventAt: state.lastEventAt,
        now,
      })
      if (signal.kind === 'silent' && !state.warned.silent) {
        state.warned.silent = true
        this.deps.emitNote(sessionId, 'silent')
      } else if (signal.kind === 'quiet' && !state.warned.quiet) {
        state.warned.quiet = true
        this.deps.emitNote(sessionId, 'quiet')
      }
    }

    if (this.state.size === 0) {
      this.stopTimer()
    }
  }
}
