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
export const DRILL_NOT_RUNNING = 'No drill is running for this conversation.'
export const DRILL_COMPACTION_UNINTERRUPTIBLE =
  'Compaction cannot be interrupted; it finishes on its own.'
export const DRILL_ALREADY_CANCELLING = 'The drill is already stopping.'
export const DRILL_CANCELLED = 'The drill was cancelled.'
export const DRILL_CANCELLED_AFTER_COMPACTION =
  'The context was compacted; the drill was cancelled before the conversation confirmed it woke up.'

/** What a cancelled run is told, which depends on what it had already done. */
function cancelReason(beat: DrillBeat): string {
  return beat === 'resuming'
    ? DRILL_CANCELLED_AFTER_COMPACTION
    : DRILL_CANCELLED
}

/**
 * The end of a wait nobody was ever going to end (MAR-3255 R8).
 *
 * Carries the beat it interrupted, read at the moment the person asked
 * rather than at the moment the routine notices, because those are the same
 * beat and saying so here is what keeps them the same.
 */
class DrillCancelled extends Error {
  constructor(readonly beat: DrillBeat) {
    super(cancelReason(beat))
    this.name = 'DrillCancelled'
  }
}

/** Resolves a settle wait with "stop waiting" rather than with a settle. */
const CANCELLED = Symbol('drill-cancelled')

/** One running routine, and everything that can end it. */
interface DrillRun {
  beat: DrillBeat
  /**
   * The beat a cancel arrived on, or null. Set once: a routine that is
   * already stopping cannot be stopped again, and the second caller is owed
   * that answer rather than a silent success.
   */
  cancelledAt: DrillBeat | null
  /**
   * Ends the wait currently in progress, when there is one. Null in the gaps
   * between beats and for the whole of `compacting`, which is why a cancel
   * also leaves `cancelledAt` behind: the checkpoints read it.
   */
  abandonWait: (() => void) | null
}

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
   * The routine running on each session. Doubles as the "is one running"
   * question, so the two answers cannot disagree.
   */
  private readonly runs = new Map<string, DrillRun>()
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
    const beat = this.runs.get(sessionId)?.beat ?? null
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
    if (this.runs.has(sessionId))
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
      // A cancel is not an error the routine survived -- it is how the person
      // ended it -- but it arrives on the same path, because ending a wait by
      // throwing is what guarantees no line below the wait can run.
      outcome =
        error instanceof DrillCancelled
          ? { ok: false, beat: error.beat, reason: error.message }
          : {
              // A gateway threw where the routine did not expect one. It is
              // still a failure of the beat that was running, told in the
              // same shape.
              ok: false,
              beat: this.beatOf(sessionId),
              reason: messageOf(error),
            }
    } finally {
      // Every exit, including a throw from any gateway call and including a
      // cancel. A routine that ended without releasing is a conversation
      // nobody can send to again until the app restarts.
      this.sessions.releaseQueue(sessionId)
      this.runs.delete(sessionId)
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

  /**
   * The way out (MAR-3255 R8).
   *
   * The routine waits for a settle, and there are shapes where no settle is
   * coming: a turn parked on a question nobody answers, a provider that
   * stopped talking, a Stop that left no terminal status behind. Without
   * this, every one of them holds the conversation's queue shut until the
   * app restarts -- in the one feature built for the nights nobody is
   * watching.
   *
   * It ends the ROUTINE, not the turn. Stopping a provider mid-sentence is
   * the person's own Stop button and has its own consequences; what this
   * does is stop waiting, release the queue and say so. The turn it leaves
   * behind finishes on its own, and `releaseQueue` already declines to drain
   * into a running one.
   *
   * `compacting` is refused, and that refusal is the honest one: nothing
   * here can abort a provider's compaction, so a cancel that claimed to
   * would release the queue INTO a context being rewritten -- the exact
   * accident the hold exists to prevent.
   */
  cancel(sessionId: string): { ok: true } | { ok: false; reason: string } {
    const run = this.runs.get(sessionId)
    if (!run) return { ok: false, reason: DRILL_NOT_RUNNING }
    if (run.beat === 'compacting')
      return { ok: false, reason: DRILL_COMPACTION_UNINTERRUPTIBLE }
    if (run.cancelledAt) return { ok: false, reason: DRILL_ALREADY_CANCELLING }

    run.cancelledAt = run.beat
    // Both halves, and they cover different moments rather than each other:
    // the mark is what the checkpoints between beats read, and this ends a
    // wait already in progress -- which is where a cancel almost always
    // lands, and where nothing else would ever look at the mark again.
    run.abandonWait?.()
    return { ok: true }
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

    // The last line before the irreversible one. A cancel that landed in the
    // gap -- after the settle resolved the wait, before this beat began --
    // found no wait to end, and this is where it is read.
    this.throwIfCancelled(sessionId)

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
      // A cancel is not a failure of the send, and it already carries the
      // sentence this beat owes (which says the context was compacted, for
      // the same reason the one below does).
      if (error instanceof DrillCancelled) throw error
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
    let settle!: (event: DrillSettleEvent | typeof CANCELLED) => void
    const early: DrillSettleEvent[] = []
    const settled = new Promise<DrillSettleEvent | typeof CANCELLED>(
      (resolve) => {
        settle = resolve
      },
    )

    const unsubscribe = this.sessions.onSessionSettled((event) => {
      if (event.sessionId !== sessionId) return
      if (dispatchId === null) {
        early.push(event)
        return
      }
      if (!event.dispatchIds.includes(dispatchId)) return
      settle(event)
    })

    const run = this.runs.get(sessionId)
    // Armed BEFORE the send, like the subscription and for the mirror-image
    // reason: a cancel can land while `sendDrillBeat` is still awaiting the
    // provider, and a hook installed afterwards would miss it and wait on.
    if (run) run.abandonWait = () => settle(CANCELLED)

    try {
      dispatchId = await this.sessions.sendDrillBeat(sessionId, text)
      const id = dispatchId
      for (const event of early) {
        if (event.dispatchIds.includes(id)) settle(event)
      }
      const event = await settled
      // A promise resolves once, so this is also what makes a settle arriving
      // AFTER a cancel inert: it finds the wait already ended, and the beat
      // below it -- the compaction -- is never reached by a reply nobody is
      // listening for any more.
      if (event === CANCELLED) throw this.cancellation(sessionId)
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
      const current = this.runs.get(sessionId)
      if (current) current.abandonWait = null
    }
  }

  /** The cancel a wait was ended by, told in that beat's words. */
  private cancellation(sessionId: string): DrillCancelled {
    const run = this.runs.get(sessionId)
    return new DrillCancelled(run?.cancelledAt ?? this.beatOf(sessionId))
  }

  private throwIfCancelled(sessionId: string): void {
    const run = this.runs.get(sessionId)
    if (run?.cancelledAt) throw new DrillCancelled(run.cancelledAt)
  }

  private enter(sessionId: string, beat: DrillBeat): void {
    const run = this.runs.get(sessionId)
    if (run) run.beat = beat
    else
      this.runs.set(sessionId, { beat, cancelledAt: null, abandonWait: null })
    this.emit({ sessionId, beat })
  }

  private beatOf(sessionId: string): DrillBeat {
    return this.runs.get(sessionId)?.beat ?? 'sealing'
  }

  private emit(change: DrillChange): void {
    for (const listener of this.listeners) listener(change)
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
