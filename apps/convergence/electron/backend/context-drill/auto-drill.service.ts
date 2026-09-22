import { readContextAlert } from '../../../src/shared/lib/context-alert.pure'
import type { ContextAlertSettings } from '../../../src/shared/lib/context-alert-settings.pure'
import type { SessionContextWindow } from '../provider/provider.types'
import type { ContextDrillService } from './context-drill.service'
import type { DrillChange, DrillSettleEvent } from './context-drill.types'

interface AutoDrillGateway {
  onBeforeQueueDrain(guard: (sessionId: string) => boolean): () => void
  onSessionSettled(listener: (event: DrillSettleEvent) => void): () => void
  read(
    sessionId: string,
  ): { contextWindow: SessionContextWindow | null; attention: string } | null
  enabled(sessionId: string): boolean
  parallelWork(sessionId: string): { running: number; unknown: number }
  alert(): ContextAlertSettings
  holdQueue(sessionId: string): void
  releaseQueue(sessionId: string): void
  note(sessionId: string, text: string): void
  changed(change: DrillChange): void
}

interface AutoRunState {
  running: boolean
  lastAutoLeftOver: boolean
  awaitingAfter: boolean
  before: number
}

/** Turn-boundary coordinator: takes the hold synchronously, delegates the unchanged drill. */
export class AutoDrillService {
  private readonly states = new Map<string, AutoRunState>()
  private readonly unsubscribe: Array<() => void>

  constructor(
    private readonly sessions: AutoDrillGateway,
    private readonly drill: Pick<
      ContextDrillService,
      'run' | 'describe' | 'onDrillChanged'
    >,
  ) {
    this.unsubscribe = [
      sessions.onBeforeQueueDrain((id) => this.beforeDrain(id)),
      sessions.onSessionSettled((event) => this.readAfter(event.sessionId)),
      drill.onDrillChanged((change) => {
        // A beat not started by us is a button run. A restart also forgets this map.
        if (change.beat !== null && !this.states.get(change.sessionId)?.running)
          this.states.delete(change.sessionId)
      }),
    ]
  }

  dispose(): void {
    this.unsubscribe.forEach((unsubscribe) => unsubscribe())
  }

  private readAfter(id: string): boolean {
    const state = this.states.get(id)
    if (!state?.awaitingAfter) return false
    const context = this.sessions.read(id)?.contextWindow
    if (!context || context.availability === 'unavailable') return true
    state.awaitingAfter = false
    state.lastAutoLeftOver = readContextAlert(
      context,
      this.sessions.alert(),
    ).over
    this.sessions.note(
      id,
      `Context compacted automatically at ${state.before}% → ${context.usedPercentage}%`,
    )
    return true
  }

  private beforeDrain(id: string): boolean {
    // Read the after-figure at the next boundary, before its drain changes the row.
    // That turn only measures: two automatic runs always have a real turn between them.
    if (this.readAfter(id)) return false
    const state = this.states.get(id)
    if (state?.running || state?.lastAutoLeftOver) return false
    const session = this.sessions.read(id)
    if (
      !session ||
      !this.sessions.enabled(id) ||
      !readContextAlert(session.contextWindow, this.sessions.alert()).over
    )
      return false
    if (
      session.attention === 'needs-input' ||
      session.attention === 'needs-approval'
    )
      return false
    const work = this.sessions.parallelWork(id)
    if (work.running > 0 || work.unknown > 0) return false
    if (this.drill.describe(id).beat !== null) return false
    const context = session.contextWindow
    if (!context || context.availability === 'unavailable') return false
    const run: AutoRunState = {
      running: true,
      lastAutoLeftOver: false,
      awaitingAfter: false,
      before: context.usedPercentage,
    }
    this.states.set(id, run)
    this.sessions.holdQueue(id)
    setImmediate(() => {
      void this.run(id, run)
    })
    return true
  }

  private async run(id: string, state: AutoRunState): Promise<void> {
    let outcome
    try {
      outcome = await this.drill.run(id)
    } catch (error) {
      outcome = {
        ok: false as const,
        beat: 'sealing' as const,
        reason: error instanceof Error ? error.message : String(error),
      }
    } finally {
      // Also releases a pre-hold if run refused before entering its own finally.
      if (this.drill.describe(id).beat === null) this.sessions.releaseQueue(id)
    }
    state.running = false
    state.awaitingAfter = outcome.ok
    // A failure stays silent until a button run or restart; never retry it.
    state.lastAutoLeftOver = !outcome.ok
    this.sessions.changed({
      sessionId: id,
      beat: null,
      automatic: { outcome, before: state.before },
    })
  }
}
