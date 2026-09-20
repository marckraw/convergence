import {
  DRILL_AFTER_MESSAGE,
  DRILL_BEFORE_MESSAGE,
  readSealDeclaration,
} from './context-drill.pure'
import type {
  ContextDrillSessionGateway,
  DrillBeat,
  DrillChange,
  DrillDescription,
  DrillOutcome,
  DrillSettleEvent,
} from './context-drill.types'

/** The sentences a refusal or a failure is told in, in one place. */
export const DRILL_ALREADY_RUNNING =
  'A drill is already running for this conversation.'
export const DRILL_NOT_A_MASTERMIND =
  "The drill only runs on a crew's mastermind conversation."
export const DRILL_SEAL_TURN_FAILED =
  'The conversation failed while it was sealing.'
export const DRILL_SEAL_ABSENT = 'The agent did not confirm the seal.'
export const DRILL_RESUME_TURN_FAILED =
  'The context was compacted, but the conversation failed while it was waking up.'

/** What the transcript note says. One sentence, one shape (R5). */
export function describeDrillFailure(beat: DrillBeat, reason: string): string {
  return `The drill stopped while ${beat}: ${reason}`
}

/**
 * The context drill: seal, compact, resurrect (MAR-3249, MAR-3255 R4).
 *
 * Three beats that a person used to run by hand -- "you know the drill", then
 * `/compact`, then a paste of the resurrection prompt -- with the queue held
 * shut around all three so a horse's return cannot land in the middle of a
 * conversation whose memory is being rewritten.
 *
 * Nothing here starts by itself. One call runs one routine, and the routine
 * asks the agent's PERMISSION in the middle of it: the reply to beat 1 either
 * declares a seal or it does not, and only a declared seal reaches
 * `compactContext`. That is the whole point of the design -- a seal can fail
 * while the turn that attempted it completes perfectly well, and compacting
 * on the strength of "the turn finished" would burn the memory the drill
 * exists to preserve.
 */
export class ContextDrillService {
  private readonly sessions: ContextDrillSessionGateway
  /**
   * The beat each running routine is on. Doubles as the "is one running"
   * question, so the two answers cannot disagree.
   */
  private readonly beats = new Map<string, DrillBeat>()
  private readonly listeners = new Set<(change: DrillChange) => void>()

  constructor(deps: { sessions: ContextDrillSessionGateway }) {
    this.sessions = deps.sessions
  }

  onDrillChanged(listener: (change: DrillChange) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  describe(sessionId: string): DrillDescription {
    const beat = this.beats.get(sessionId) ?? null
    if (!this.sessions.isMastermindSeat(sessionId))
      return { offered: false, reason: DRILL_NOT_A_MASTERMIND, beat }
    const readiness = this.sessions.describeCompactionReadiness(sessionId)
    if (!readiness.ready)
      return { offered: false, reason: readiness.reason, beat }
    return { offered: true, reason: null, beat }
  }

  /**
   * Runs the whole routine once, and answers with how it ended.
   *
   * The three refusals at the top take nothing and change nothing -- no hold,
   * no send, no note -- because a drill that cannot start has not started,
   * and the caller is told so in the same breath it asked.
   */
  async run(sessionId: string): Promise<DrillOutcome> {
    if (this.beats.has(sessionId))
      return { ok: false, beat: 'sealing', reason: DRILL_ALREADY_RUNNING }
    if (!this.sessions.isMastermindSeat(sessionId))
      return { ok: false, beat: 'sealing', reason: DRILL_NOT_A_MASTERMIND }
    // Asked BEFORE beat 1, so a seal is never spent on a conversation that
    // could not have been compacted anyway (R3). The agent's sealing work is
    // real work -- it writes a protocol and pushes it -- and asking for it and
    // then refusing to compact is the one failure that wastes somebody's turn
    // for nothing.
    const readiness = this.sessions.describeCompactionReadiness(sessionId)
    if (!readiness.ready)
      return { ok: false, beat: 'sealing', reason: readiness.reason }

    this.enter(sessionId, 'sealing')
    let outcome: DrillOutcome
    try {
      outcome = await this.runBeats(sessionId)
    } catch (error) {
      // A gateway threw where the routine did not expect one. It is still a
      // failure of the beat that was running, told in the same shape.
      outcome = {
        ok: false,
        beat: this.beatOf(sessionId),
        reason: messageOf(error),
      }
    } finally {
      // Every exit, including a throw from any gateway call. A routine that
      // ended without releasing is a conversation nobody can send to again
      // until the app restarts.
      this.sessions.releaseQueue(sessionId)
      this.beats.delete(sessionId)
    }
    // After the release, and in ONE place: every failure writes exactly one
    // note and every run emits exactly one ending, whichever beat stopped it.
    if (!outcome.ok) {
      this.sessions.addContextDrillNote(
        sessionId,
        describeDrillFailure(outcome.beat, outcome.reason),
      )
    }
    this.emit({
      sessionId,
      beat: null,
      ...(outcome.ok ? {} : { reason: outcome.reason }),
    })
    return outcome
  }

  private async runBeats(sessionId: string): Promise<DrillOutcome> {
    this.sessions.holdQueue(sessionId)

    const sealing = await this.sendAndAwaitSettle(
      sessionId,
      DRILL_BEFORE_MESSAGE,
    )
    if (sealing.status === 'failed')
      return { ok: false, beat: 'sealing', reason: DRILL_SEAL_TURN_FAILED }

    const declaration = readSealDeclaration(sealing.message)
    // The fence. `compactContext` is not reachable from here by any path that
    // did not read a `SEALED:` line: a refusal names the agent's own reason,
    // and an ABSENT declaration is a refusal too, because a fence denies what
    // it cannot read.
    if (declaration.kind === 'not-sealed')
      return {
        ok: false,
        beat: 'sealing',
        reason: declaration.reason || DRILL_SEAL_ABSENT,
      }
    if (declaration.kind === 'absent')
      return { ok: false, beat: 'sealing', reason: DRILL_SEAL_ABSENT }

    this.enter(sessionId, 'compacting')
    try {
      await this.sessions.compactContext(sessionId)
    } catch (error) {
      return { ok: false, beat: 'compacting', reason: messageOf(error) }
    }

    this.enter(sessionId, 'resuming')
    let resuming
    try {
      resuming = await this.sendAndAwaitSettle(sessionId, DRILL_AFTER_MESSAGE)
    } catch (error) {
      // The context WAS compacted, and the sentence has to say so: the
      // conversation the user comes back to has already lost its old memory,
      // and a failure that read like "nothing happened" would send them
      // looking for it.
      return {
        ok: false,
        beat: 'resuming',
        reason: `The context was compacted, but waking the conversation failed: ${messageOf(error)}`,
      }
    }
    if (resuming.status === 'failed')
      return { ok: false, beat: 'resuming', reason: DRILL_RESUME_TURN_FAILED }

    return { ok: true }
  }

  /**
   * Sends one beat and waits for the settle of THAT dispatch.
   *
   * Two properties, and the routine is unsafe without either.
   *
   * SUBSCRIBED FIRST. The settle can arrive before `sendDrillBeat` has even
   * returned the id it is going to be recognised by -- a provider that
   * answers instantly, a fake that answers synchronously -- so the listener
   * goes on before the send and the settles that arrive in that window are
   * kept and re-read the moment the id is known. Subscribing afterwards is a
   * routine that waits forever for something that already happened.
   *
   * MATCHED BY ID. A settle of this session that names another dispatch is
   * somebody else's turn -- a row that drained just before the hold, a
   * remote reattach -- and reading its reply for a seal declaration would let
   * an unrelated message authorise the compaction.
   */
  private async sendAndAwaitSettle(
    sessionId: string,
    text: string,
  ): Promise<{ status: 'completed' | 'failed'; message: string | null }> {
    let dispatchId: string | null = null
    // Definitely assigned: a promise executor runs synchronously, so `settle`
    // is set before this function's next statement.
    let settle!: (event: DrillSettleEvent) => void
    const early: DrillSettleEvent[] = []
    const settled = new Promise<DrillSettleEvent>((resolve) => {
      settle = resolve
    })

    const unsubscribe = this.sessions.onSessionSettled((event) => {
      if (event.sessionId !== sessionId) return
      if (dispatchId === null) {
        early.push(event)
        return
      }
      if (!event.dispatchIds.includes(dispatchId)) return
      settle(event)
    })

    try {
      dispatchId = await this.sessions.sendDrillBeat(sessionId, text)
      const id = dispatchId
      for (const event of early) {
        if (event.dispatchIds.includes(id)) settle(event)
      }
      const event = await settled
      return {
        status: event.status,
        // The relay engine's own read (`relay.engine.ts:396`): a present
        // answer window IS the answer, and a window whose message is null is
        // a reply with nothing in it -- not a reason to go looking in the
        // transcript for an older one.
        message: event.answerWindow
          ? event.answerWindow.message
          : this.sessions.getLastAssistantMessageText(sessionId),
      }
    } finally {
      unsubscribe()
    }
  }

  private enter(sessionId: string, beat: DrillBeat): void {
    this.beats.set(sessionId, beat)
    this.emit({ sessionId, beat })
  }

  private beatOf(sessionId: string): DrillBeat {
    return this.beats.get(sessionId) ?? 'sealing'
  }

  private emit(change: DrillChange): void {
    for (const listener of this.listeners) listener(change)
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
