import { beforeEach, describe, expect, it } from 'vitest'
import { DRILL_AFTER_MESSAGE, DRILL_BEFORE_MESSAGE } from './context-drill.pure'
import {
  ContextDrillService,
  DRILL_ALREADY_CANCELLING,
  DRILL_ALREADY_RUNNING,
  DRILL_CANCELLED,
  DRILL_CANCELLED_AFTER_COMPACTION,
  DRILL_COMPACTION_UNINTERRUPTIBLE,
  DRILL_NOT_A_MASTERMIND,
  DRILL_NOT_RUNNING,
  DRILL_RESUME_TURN_FAILED,
  DRILL_SEAL_ABSENT,
  DRILL_SEAL_TURN_FAILED,
  DRILL_SET_MASTERMIND_ROLE,
} from './context-drill.service'
import type {
  ContextDrillSessionGateway,
  DrillChange,
  DrillSettleEvent,
} from './context-drill.types'

const SESSION = 'session-1'
const SEALED_REPLY = [
  'I pushed the protocol.',
  'SEALED: #30 abc1234',
  'BATON: marcin',
].join('\n')

interface TurnPlan {
  /** How the turn settles. */
  status?: 'completed' | 'failed'
  /** The answer window's message; omit to fall back to the transcript read. */
  answerWindow?: string | null
  /**
   * When the settle fires: before `sendDrillBeat` has returned its id, after
   * it -- or `never`, the shape a cancel exists for, where the test fires it
   * by hand (or not at all).
   */
  when?: 'during-send' | 'after-send' | 'never'
  /**
   * A settle of the same session naming somebody else's dispatch.
   *
   * `when` matters and is not a detail: fired DURING the send it is read by
   * the buffer that keeps settles arriving before the id is known, and fired
   * AFTER it is read by the live listener. Those are two separate guards, and
   * a decoy that only ever arrives at one of them lets the other be deleted
   * with every test still green.
   */
  decoy?: {
    status?: 'completed' | 'failed'
    answerWindow?: string | null
    when?: 'during-send' | 'after-send'
  }
  /** The send itself fails. */
  throws?: string
}

/**
 * The drill's session seam, faked.
 *
 * It starts no provider and compacts nothing: the whole point of the gateway
 * is that these tests can exercise a routine that spends a real turn and
 * rewrites a real conversation's memory, without doing either.
 */
class FakeSessions implements ContextDrillSessionGateway {
  readonly log: string[] = []
  readonly notes: string[] = []
  mastermind = true
  readiness: { ready: true } | { ready: false; reason: string } = {
    ready: true,
  }
  turns: TurnPlan[] = []
  transcriptMessage: string | null = null
  compactError: string | null = null
  onCompact: (() => void) | null = null
  /** Runs inside `sendDrillBeat`, before any settle of its own can fire. */
  onSend: (() => void) | null = null
  lastDispatchId: string | null = null
  private sessionId = ''
  private readonly listeners = new Set<(event: DrillSettleEvent) => void>()
  private nextDispatch = 0

  /**
   * The roles this seat holds, one per crew (MAR-3287 R1). Null means "follow
   * `mastermind`": a mastermind of one crew, or no seat at all.
   */
  roles: Array<string | null> | null = null

  seatRolesOf(): ReadonlyArray<string | null> {
    return this.roles ?? (this.mastermind ? ['mastermind'] : [])
  }

  describeCompactionReadiness() {
    return this.readiness
  }

  onSessionSettled(listener: (event: DrillSettleEvent) => void): () => void {
    this.listeners.add(listener)
    this.log.push('subscribe')
    return () => {
      this.listeners.delete(listener)
      this.log.push('unsubscribe')
    }
  }

  holdQueue(): void {
    this.log.push('hold')
  }

  releaseQueue(): void {
    this.log.push('release')
  }

  getLastAssistantMessageText(): string | null {
    this.log.push('read-transcript')
    return this.transcriptMessage
  }

  async compactContext(): Promise<unknown> {
    this.log.push('compact')
    this.onCompact?.()
    if (this.compactError) throw new Error(this.compactError)
    return {}
  }

  addContextDrillNote(_sessionId: string, text: string): void {
    this.log.push('note')
    this.notes.push(text)
  }

  /**
   * The settle of a dispatch this fake already handed out, fired by hand.
   *
   * What a reply arriving after the routine stopped waiting looks like from
   * the outside: the provider does not know about cancels.
   */
  settleLatest(
    plan: {
      status?: 'completed' | 'failed'
      answerWindow?: string | null
    } = {},
  ): void {
    const dispatchId = this.lastDispatchId
    if (!dispatchId) throw new Error('nothing has been sent yet')
    this.fire([dispatchId], plan)
  }

  private fire(
    dispatchIds: string[],
    settle: { status?: 'completed' | 'failed'; answerWindow?: string | null },
  ): void {
    for (const listener of [...this.listeners]) {
      listener({
        sessionId: this.sessionId,
        status: settle.status ?? 'completed',
        dispatchIds,
        ...(settle.answerWindow !== undefined
          ? { answerWindow: { message: settle.answerWindow } }
          : {}),
      })
    }
  }

  async sendDrillBeat(sessionId: string, text: string): Promise<string> {
    this.log.push(
      `send:${text === DRILL_BEFORE_MESSAGE ? 'before' : text === DRILL_AFTER_MESSAGE ? 'after' : 'unknown'}`,
    )
    this.sessionId = sessionId
    const plan = this.turns.shift() ?? {}
    if (plan.throws) throw new Error(plan.throws)
    const dispatchId = `dispatch-${(this.nextDispatch += 1)}`
    this.lastDispatchId = dispatchId
    this.onSend?.()

    if (plan.decoy) {
      const decoy = plan.decoy
      if (decoy.when === 'after-send')
        setTimeout(() => this.fire(['someone-elses-dispatch'], decoy), 0)
      else this.fire(['someone-elses-dispatch'], decoy)
    }
    if (plan.when === 'during-send') this.fire([dispatchId], plan)
    else if (plan.when !== 'never')
      setTimeout(() => this.fire([dispatchId], plan), 0)
    return dispatchId
  }
}

let sessions: FakeSessions
let drill: ContextDrillService
let changes: DrillChange[]

beforeEach(() => {
  sessions = new FakeSessions()
  drill = new ContextDrillService({ sessions })
  changes = []
  drill.onDrillChanged((change) => changes.push(change))
})

/** Only the acts, so the order assertion reads like the routine's sentence. */
function acts(): string[] {
  return sessions.log.filter((entry) =>
    ['hold', 'send:before', 'compact', 'send:after', 'release'].includes(entry),
  )
}

function sealedThenWoken(): void {
  sessions.turns = [{ answerWindow: SEALED_REPLY }, { answerWindow: 'Awake.' }]
}

/**
 * A deadline of the test's own, so a routine that waits forever fails HERE
 * with a sentence rather than at the suite's global timeout (R4, M10).
 */
async function withDeadline<T>(work: Promise<T>): Promise<T | 'timed out'> {
  return Promise.race([
    work,
    new Promise<'timed out'>((resolve) =>
      setTimeout(() => resolve('timed out'), 250),
    ),
  ])
}

describe('the drill runs the three beats in order (MAR-3255 R4)', () => {
  it('holds, seals, compacts, wakes and releases', async () => {
    sealedThenWoken()
    await expect(drill.run(SESSION)).resolves.toEqual({ ok: true })
    expect(acts()).toEqual([
      'hold',
      'send:before',
      'compact',
      'send:after',
      'release',
    ])
    expect(sessions.notes).toEqual([])
    expect(changes).toEqual([
      { sessionId: SESSION, beat: 'sealing' },
      { sessionId: SESSION, beat: 'compacting' },
      { sessionId: SESSION, beat: 'resuming' },
      { sessionId: SESSION, beat: null },
    ])
  })

  it('subscribes to the settle before it sends', async () => {
    sealedThenWoken()
    await drill.run(SESSION)
    // Not a stylistic preference: the settle can arrive before the send has
    // returned the id it is recognised by, and a listener attached afterwards
    // would miss it (see the during-send test below).
    expect(sessions.log.indexOf('subscribe')).toBeLessThan(
      sessions.log.indexOf('send:before'),
    )
    expect(sessions.log.filter((entry) => entry === 'subscribe')).toHaveLength(
      2,
    )
    expect(
      sessions.log.filter((entry) => entry === 'unsubscribe'),
    ).toHaveLength(2)
  })

  it('hears a settle that fires during the send', async () => {
    sessions.turns = [
      { answerWindow: SEALED_REPLY, when: 'during-send' },
      { answerWindow: 'Awake.', when: 'during-send' },
    ]
    await expect(withDeadline(drill.run(SESSION))).resolves.toEqual({
      ok: true,
    })
  })

  it.each(['during-send', 'after-send'] as const)(
    'ignores a settle that names another dispatch (%s)',
    async (when) => {
      // The decoy carries a SEAL. A routine that took any settle of this
      // session would read it, compact, and never learn that the turn it
      // actually asked has refused.
      //
      // Both arrival times, because the id is checked in two places -- the
      // buffer and the live listener -- and each one is the only thing
      // standing between an unrelated reply and a compaction.
      sessions.turns = [
        {
          answerWindow: 'NOT SEALED: the vessel would not commit',
          when: 'after-send',
          decoy: { answerWindow: SEALED_REPLY, when },
        },
      ]
      await expect(withDeadline(drill.run(SESSION))).resolves.toEqual({
        ok: false,
        beat: 'sealing',
        reason: 'the vessel would not commit',
      })
      expect(acts()).toEqual(['hold', 'send:before', 'release'])
    },
  )

  it('reads the transcript when the settle carries no answer window', async () => {
    sessions.turns = [{}, {}]
    sessions.transcriptMessage = SEALED_REPLY
    await expect(drill.run(SESSION)).resolves.toEqual({ ok: true })
    expect(sessions.log).toContain('read-transcript')
  })

  it('treats an empty answer window as an empty reply, not as a missing one', async () => {
    // The engine's own read: a present window with a null message IS the
    // answer. Falling back to the transcript here would read the PREVIOUS
    // reply -- and the previous reply is exactly where a stale `SEALED:` line
    // lives.
    sessions.turns = [{ answerWindow: null }]
    sessions.transcriptMessage = SEALED_REPLY
    await expect(drill.run(SESSION)).resolves.toEqual({
      ok: false,
      beat: 'sealing',
      reason: DRILL_SEAL_ABSENT,
    })
    expect(sessions.log).not.toContain('compact')
  })
})

describe('the seal is a fence, not a formality (R4, step 3)', () => {
  it('does not compact when the agent says NOT SEALED', async () => {
    sessions.turns = [{ answerWindow: 'NOT SEALED: the push was rejected' }]
    await expect(drill.run(SESSION)).resolves.toEqual({
      ok: false,
      beat: 'sealing',
      reason: 'the push was rejected',
    })
    expect(sessions.log).not.toContain('compact')
    expect(acts()).toEqual(['hold', 'send:before', 'release'])
  })

  it('does not compact when the seal line is absent', async () => {
    sessions.turns = [{ answerWindow: 'All done, nothing to report.' }]
    await expect(drill.run(SESSION)).resolves.toEqual({
      ok: false,
      beat: 'sealing',
      reason: DRILL_SEAL_ABSENT,
    })
    expect(sessions.log).not.toContain('compact')
  })

  it('does not compact when the sealing turn fails', async () => {
    sessions.turns = [{ status: 'failed', answerWindow: SEALED_REPLY }]
    await expect(drill.run(SESSION)).resolves.toEqual({
      ok: false,
      beat: 'sealing',
      reason: DRILL_SEAL_TURN_FAILED,
    })
    expect(sessions.log).not.toContain('compact')
  })
})

describe('the queue is released on every exit (R4, step 6)', () => {
  it('releases when compaction throws', async () => {
    sessions.turns = [{ answerWindow: SEALED_REPLY }]
    sessions.compactError =
      'Context can only be compacted while the session is idle'
    await expect(drill.run(SESSION)).resolves.toEqual({
      ok: false,
      beat: 'compacting',
      reason: 'Context can only be compacted while the session is idle',
    })
    expect(acts()).toEqual(['hold', 'send:before', 'compact', 'release'])
  })

  it('releases when the waking send throws', async () => {
    sessions.turns = [
      { answerWindow: SEALED_REPLY },
      { throws: 'Session not found: session-1' },
    ]
    const outcome = await drill.run(SESSION)
    expect(outcome).toMatchObject({ ok: false, beat: 'resuming' })
    expect((outcome as { reason: string }).reason).toContain(
      'The context was compacted',
    )
    expect(acts()).toEqual([
      'hold',
      'send:before',
      'compact',
      'send:after',
      'release',
    ])
  })

  it('releases when the waking turn fails, and says the context was compacted', async () => {
    sessions.turns = [
      { answerWindow: SEALED_REPLY },
      { status: 'failed', answerWindow: null },
    ]
    await expect(drill.run(SESSION)).resolves.toEqual({
      ok: false,
      beat: 'resuming',
      reason: DRILL_RESUME_TURN_FAILED,
    })
    expect(DRILL_RESUME_TURN_FAILED).toContain('was compacted')
    expect(acts().at(-1)).toBe('release')
  })

  it('releases when the sealing send throws', async () => {
    sessions.turns = [{ throws: 'the provider is gone' }]
    await expect(drill.run(SESSION)).resolves.toEqual({
      ok: false,
      beat: 'sealing',
      reason: 'the provider is gone',
    })
    expect(acts()).toEqual(['hold', 'send:before', 'release'])
  })
})

describe('what refuses to start (R4, step 1)', () => {
  it('refuses a conversation that is not a mastermind seat', async () => {
    sessions.mastermind = false
    await expect(drill.run(SESSION)).resolves.toEqual({
      ok: false,
      beat: 'sealing',
      reason: DRILL_NOT_A_MASTERMIND,
    })
    expect(sessions.log).toEqual([])
    expect(sessions.notes).toEqual([])
    expect(changes).toEqual([])
  })

  it('refuses a conversation that could not be compacted anyway', async () => {
    // Before beat 1, so a seal is never spent on a conversation the
    // compaction door would have turned away.
    sessions.readiness = {
      ready: false,
      reason: 'Context can only be compacted while the session is idle',
    }
    await expect(drill.run(SESSION)).resolves.toEqual({
      ok: false,
      beat: 'sealing',
      reason: 'Context can only be compacted while the session is idle',
    })
    expect(sessions.log).toEqual([])
    expect(sessions.notes).toEqual([])
  })

  it('refuses a second run while one is running', async () => {
    sessions.turns = [
      { answerWindow: SEALED_REPLY },
      { answerWindow: 'Awake.' },
    ]
    let second: Awaited<ReturnType<ContextDrillService['run']>> | null = null
    sessions.onCompact = () => {
      void drill.run(SESSION).then((outcome) => {
        second = outcome
      })
    }
    await expect(drill.run(SESSION)).resolves.toEqual({ ok: true })
    await Promise.resolve()
    expect(second).toEqual({
      ok: false,
      beat: 'sealing',
      reason: DRILL_ALREADY_RUNNING,
    })
    // One routine ran: one hold, one compaction, one release.
    expect(acts()).toEqual([
      'hold',
      'send:before',
      'compact',
      'send:after',
      'release',
    ])
  })
})

describe('the drill is loud (R5)', () => {
  it.each([
    [
      'sealing',
      () => {
        sessions.turns = [{ answerWindow: 'NOT SEALED: the push was rejected' }]
      },
      'The drill stopped while sealing: the push was rejected',
    ],
    [
      'compacting',
      () => {
        sessions.turns = [{ answerWindow: SEALED_REPLY }]
        sessions.compactError =
          'Context cannot be compacted without continuation state'
      },
      'The drill stopped while compacting: Context cannot be compacted without continuation state',
    ],
    [
      'resuming',
      () => {
        sessions.turns = [
          { answerWindow: SEALED_REPLY },
          { status: 'failed', answerWindow: null },
        ]
      },
      `The drill stopped while resuming: ${DRILL_RESUME_TURN_FAILED}`,
    ],
  ])('writes one note when it stops while %s', async (_beat, arrange, note) => {
    arrange()
    await drill.run(SESSION)
    expect(sessions.notes).toEqual([note])
  })

  it('writes no note when the drill finishes', async () => {
    sealedThenWoken()
    await drill.run(SESSION)
    expect(sessions.notes).toEqual([])
  })

  it('tells listeners why the last one stopped', async () => {
    sessions.turns = [{ answerWindow: 'NOT SEALED: no network' }]
    await drill.run(SESSION)
    expect(changes.at(-1)).toEqual({
      sessionId: SESSION,
      beat: null,
      reason: 'no network',
    })
  })
})

/**
 * The way out (MAR-3255 R8).
 *
 * TWO mechanisms stand between a cancel and a compaction, and they cover
 * different moments rather than each other -- so each one gets the input
 * where it is the only thing standing:
 *
 *  - ending the WAIT, which is the only exit when no settle is ever coming
 *    ('ends a wait nothing else was ever going to end': delete it and the
 *    run never resolves);
 *  - the MARK read at the checkpoint, which is the only exit when the cancel
 *    lands in the gap after a settle has already resolved the wait ('a
 *    cancel that lands in the gap...': delete it and the compaction runs).
 *
 * A late reply after a cancel is refused by whichever of the two is still
 * standing, which is why that test is listed here as the belt-and-braces one
 * rather than as either half's proof.
 */
describe('the way out (R8)', () => {
  /** The wait is under way: the send has left and nothing is coming. */
  async function waitingOnASettle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  it('ends a wait nothing else was ever going to end', async () => {
    sessions.turns = [{ when: 'never' }]
    const run = withDeadline(drill.run(SESSION))
    await waitingOnASettle()

    expect(drill.cancel(SESSION)).toEqual({ ok: true })

    // The deadline is the point: without a way to end the wait this run
    // never resolves at all, and 'timed out' is what that reads as here
    // rather than a suite-level timeout with no sentence.
    await expect(run).resolves.toEqual({
      ok: false,
      beat: 'sealing',
      reason: DRILL_CANCELLED,
    })
    expect(acts()).toEqual(['hold', 'send:before', 'release'])
    expect(sessions.notes).toEqual([
      `The drill stopped while sealing: ${DRILL_CANCELLED}`,
    ])
    expect(changes.at(-1)).toEqual({
      sessionId: SESSION,
      beat: null,
      reason: DRILL_CANCELLED,
    })
  })

  it('never compacts, even when a SEALED reply arrives after the cancel', async () => {
    sessions.turns = [{ when: 'never' }]
    const run = withDeadline(drill.run(SESSION))
    await waitingOnASettle()
    expect(drill.cancel(SESSION)).toEqual({ ok: true })

    // The provider knows nothing about cancels: the turn finishes and
    // announces a perfectly good seal. Nobody is listening for it any more,
    // and the beat it would have authorised is never reached.
    sessions.settleLatest({ answerWindow: SEALED_REPLY })

    await expect(run).resolves.toEqual({
      ok: false,
      beat: 'sealing',
      reason: DRILL_CANCELLED,
    })
    expect(sessions.log).not.toContain('compact')
  })

  it('stops a cancel that lands in the gap between the settle and the compaction', async () => {
    // The wait has already ended, so ending it again does nothing: the mark
    // the cancel leaves behind is the whole mechanism here, and the
    // checkpoint above the compaction is where it is read.
    sessions.turns = [{ when: 'never' }]
    const run = withDeadline(drill.run(SESSION))
    await waitingOnASettle()

    sessions.settleLatest({ answerWindow: SEALED_REPLY })
    // Same tick as the settle, so the routine is still suspended on the
    // await it just resolved.
    expect(drill.cancel(SESSION)).toEqual({ ok: true })

    await expect(run).resolves.toEqual({
      ok: false,
      beat: 'sealing',
      reason: DRILL_CANCELLED,
    })
    expect(acts()).toEqual(['hold', 'send:before', 'release'])
    expect(sessions.log).not.toContain('compact')
  })

  it('refuses a cancel while it is compacting, and the routine goes on', async () => {
    sealedThenWoken()
    let refusal: ReturnType<ContextDrillService['cancel']> | null = null
    sessions.onCompact = () => {
      refusal = drill.cancel(SESSION)
    }

    await expect(withDeadline(drill.run(SESSION))).resolves.toEqual({
      ok: true,
    })
    // Nothing can abort a provider's compaction, so a cancel that claimed to
    // would release the queue INTO a context being rewritten.
    expect(refusal).toEqual({
      ok: false,
      reason: DRILL_COMPACTION_UNINTERRUPTIBLE,
    })
    expect(acts()).toEqual([
      'hold',
      'send:before',
      'compact',
      'send:after',
      'release',
    ])
    expect(sessions.notes).toEqual([])
  })

  it('says the context was compacted when the cancel lands while it wakes', async () => {
    sessions.turns = [{ answerWindow: SEALED_REPLY }, { when: 'never' }]
    const run = withDeadline(drill.run(SESSION))
    await waitingOnASettle()
    await waitingOnASettle()
    expect(sessions.log).toContain('send:after')

    expect(drill.cancel(SESSION)).toEqual({ ok: true })

    // The conversation the person comes back to has already lost its old
    // memory. A sentence that read like "nothing happened" would send them
    // looking for it.
    await expect(run).resolves.toEqual({
      ok: false,
      beat: 'resuming',
      reason: DRILL_CANCELLED_AFTER_COMPACTION,
    })
    expect(DRILL_CANCELLED_AFTER_COMPACTION).toContain('was compacted')
    expect(acts()).toEqual([
      'hold',
      'send:before',
      'compact',
      'send:after',
      'release',
    ])
    expect(sessions.notes).toEqual([
      `The drill stopped while resuming: ${DRILL_CANCELLED_AFTER_COMPACTION}`,
    ])
  })

  it('refuses a cancel when no routine is running', () => {
    expect(drill.cancel(SESSION)).toEqual({
      ok: false,
      reason: DRILL_NOT_RUNNING,
    })
    expect(sessions.log).toEqual([])
    expect(sessions.notes).toEqual([])
  })

  it('refuses a second cancel', async () => {
    sessions.turns = [{ when: 'never' }]
    const run = withDeadline(drill.run(SESSION))
    await waitingOnASettle()

    expect(drill.cancel(SESSION)).toEqual({ ok: true })
    expect(drill.cancel(SESSION)).toEqual({
      ok: false,
      reason: DRILL_ALREADY_CANCELLING,
    })

    await run
    // And once it is over, the answer is the other one again.
    expect(drill.cancel(SESSION)).toEqual({
      ok: false,
      reason: DRILL_NOT_RUNNING,
    })
  })

  it('ends a cancel that lands while the beat is still being sent', async () => {
    // The hook is armed before the send for the same reason the settle
    // subscription is: `sendDrillBeat` can be awaiting a provider for a long
    // time, and a cancel in that window must not be the one that is missed.
    sessions.turns = [{ when: 'never' }]
    sessions.onSend = () => {
      expect(drill.cancel(SESSION)).toEqual({ ok: true })
    }
    await expect(withDeadline(drill.run(SESSION))).resolves.toEqual({
      ok: false,
      beat: 'sealing',
      reason: DRILL_CANCELLED,
    })
    expect(sessions.log).not.toContain('compact')
    expect(acts()).toEqual(['hold', 'send:before', 'release'])
  })
})

describe('what the surface is told (R6)', () => {
  it('does not offer the drill on a seat that is not a mastermind', () => {
    sessions.mastermind = false
    expect(drill.describe(SESSION)).toEqual({
      seat: 'none',
      eligible: false,
      offered: false,
      reason: DRILL_NOT_A_MASTERMIND,
      beat: null,
    })
  })

  it('does not offer the drill on a conversation that cannot compact', () => {
    sessions.readiness = {
      ready: false,
      reason: 'Wait for the pending send before compacting context',
    }
    // Eligible and not offered: the seat is right, the moment is not. The
    // control stays on screen and says why (MAR-3256 R1).
    expect(drill.describe(SESSION)).toEqual({
      seat: 'mastermind',
      eligible: true,
      offered: false,
      reason: 'Wait for the pending send before compacting context',
      beat: null,
    })
  })

  it('offers the drill on a ready mastermind conversation', () => {
    expect(drill.describe(SESSION)).toEqual({
      seat: 'mastermind',
      eligible: true,
      offered: true,
      reason: null,
      beat: null,
    })
  })

  it('names the beat while a routine is running', async () => {
    sessions.turns = [
      { answerWindow: SEALED_REPLY },
      { answerWindow: 'Awake.' },
    ]
    let duringCompaction: ReturnType<ContextDrillService['describe']> | null =
      null
    sessions.onCompact = () => {
      duringCompaction = drill.describe(SESSION)
    }
    await drill.run(SESSION)
    expect(duringCompaction).toEqual({
      seat: 'mastermind',
      eligible: true,
      offered: true,
      reason: null,
      beat: 'compacting',
    })
    expect(drill.describe(SESSION).beat).toBeNull()
  })
})

describe('which seat this is (MAR-3287 R1, R2)', () => {
  it('a conversation in no crew is no seat, told as before', () => {
    sessions.roles = []
    expect(drill.describe(SESSION)).toMatchObject({
      seat: 'none',
      eligible: false,
      offered: false,
      reason: DRILL_NOT_A_MASTERMIND,
    })
  })

  it('a seat with another role is told where to set the role', () => {
    sessions.roles = ['horse']
    expect(drill.describe(SESSION)).toEqual({
      seat: 'other-role',
      eligible: false,
      offered: false,
      reason: DRILL_SET_MASTERMIND_ROLE,
      beat: null,
    })
  })

  it('a seat whose role was never chosen is still a seat', () => {
    sessions.roles = [null]
    expect(drill.describe(SESSION)).toMatchObject({
      seat: 'other-role',
      eligible: false,
      reason: DRILL_SET_MASTERMIND_ROLE,
    })
  })

  it('the mastermind of a crew is the mastermind seat', () => {
    sessions.roles = ['mastermind']
    expect(drill.describe(SESSION)).toMatchObject({
      seat: 'mastermind',
      eligible: true,
      offered: true,
    })
  })

  it('a horse in one crew and the mastermind of another is a mastermind', () => {
    sessions.roles = ['horse', 'mastermind']
    expect(drill.describe(SESSION)).toMatchObject({
      seat: 'mastermind',
      eligible: true,
    })
  })

  it('no role in one crew and a horse in another is another role', () => {
    sessions.roles = [null, 'horse']
    expect(drill.describe(SESSION)).toMatchObject({
      seat: 'other-role',
      eligible: false,
      reason: DRILL_SET_MASTERMIND_ROLE,
    })
  })

  it('says the role sentence word for word', () => {
    expect(DRILL_SET_MASTERMIND_ROLE).toBe(
      "The drill runs on a crew's mastermind seat. Set this seat's role to Mastermind in the crew's settings (Mission Control).",
    )
  })

  it('refuses to run on another role exactly as before (R5)', async () => {
    sessions.roles = [null]
    await expect(drill.run(SESSION)).resolves.toEqual({
      ok: false,
      beat: 'sealing',
      reason: DRILL_NOT_A_MASTERMIND,
    })
    expect(sessions.log).not.toContain('hold')
  })
})
