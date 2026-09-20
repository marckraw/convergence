import { beforeEach, describe, expect, it } from 'vitest'
import { DRILL_AFTER_MESSAGE, DRILL_BEFORE_MESSAGE } from './context-drill.pure'
import {
  ContextDrillService,
  DRILL_ALREADY_RUNNING,
  DRILL_NOT_A_MASTERMIND,
  DRILL_RESUME_TURN_FAILED,
  DRILL_SEAL_ABSENT,
  DRILL_SEAL_TURN_FAILED,
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
  /** Whether the settle fires before `sendDrillBeat` has returned its id. */
  when?: 'during-send' | 'after-send'
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
  private readonly listeners = new Set<(event: DrillSettleEvent) => void>()
  private nextDispatch = 0

  isMastermindSeat(): boolean {
    return this.mastermind
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

  async sendDrillBeat(sessionId: string, text: string): Promise<string> {
    this.log.push(
      `send:${text === DRILL_BEFORE_MESSAGE ? 'before' : text === DRILL_AFTER_MESSAGE ? 'after' : 'unknown'}`,
    )
    const plan = this.turns.shift() ?? {}
    if (plan.throws) throw new Error(plan.throws)
    const dispatchId = `dispatch-${(this.nextDispatch += 1)}`

    const fire = (dispatchIds: string[], settle: TurnPlan) => {
      for (const listener of [...this.listeners]) {
        listener({
          sessionId,
          status: settle.status ?? 'completed',
          dispatchIds,
          ...(settle.answerWindow !== undefined
            ? { answerWindow: { message: settle.answerWindow } }
            : {}),
        })
      }
    }

    if (plan.decoy) {
      const decoy = plan.decoy
      if (decoy.when === 'after-send')
        setTimeout(() => fire(['someone-elses-dispatch'], decoy), 0)
      else fire(['someone-elses-dispatch'], decoy)
    }
    if (plan.when === 'during-send') fire([dispatchId], plan)
    else setTimeout(() => fire([dispatchId], plan), 0)
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

describe('what the surface is told (R6)', () => {
  it('does not offer the drill on a seat that is not a mastermind', () => {
    sessions.mastermind = false
    expect(drill.describe(SESSION)).toEqual({
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
    expect(drill.describe(SESSION)).toEqual({
      offered: false,
      reason: 'Wait for the pending send before compacting context',
      beat: null,
    })
  })

  it('offers the drill on a ready mastermind conversation', () => {
    expect(drill.describe(SESSION)).toEqual({
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
      offered: true,
      reason: null,
      beat: 'compacting',
    })
    expect(drill.describe(SESSION).beat).toBeNull()
  })
})
