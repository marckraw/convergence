import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { SessionQueuedInputService } from './session-queued-input.service'
import type { QueuedInputPatchEvent } from './session.types'

describe('SessionQueuedInputService', () => {
  let db: Database.Database
  let service: SessionQueuedInputService
  let events: QueuedInputPatchEvent[]

  beforeEach(() => {
    db = getDatabase()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('project-1', 'Project', '/tmp/project')",
    ).run()
    db.prepare(
      `INSERT INTO sessions (
         id,
         context_kind,
         project_id,
         workspace_id,
         provider_id,
         model,
         effort,
         name,
         working_directory
       ) VALUES (?, 'project', 'project-1', null, 'test-provider', 'test-model', null, 'Session', '/tmp/project')`,
    ).run('session-1')

    events = []
    // Monotonic per test, not derived from `events.length`: a test that
    // clears the event log mid-way (to watch one operation in isolation)
    // would otherwise mint an id it has already used.
    let nextId = 1
    service = new SessionQueuedInputService(db, {
      idFactory: () => `queued-${nextId++}`,
      now: () => '2026-04-26T12:00:00.000Z',
    })
    service.setPatchListener((event) => events.push(event))
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  /**
   * A relay opener may wait in the queue through a whole turn (F9). It is a
   * command for the provider, so the bypass has to be stored with it -- a
   * `/clear` that picks up a project-context block on the way out is prose.
   */
  it('stores the injection bypass alongside a queued opener', () => {
    const item = service.enqueue(
      'session-1',
      { text: '/clear', skipContextInjection: true },
      'follow-up',
    )

    expect(item.skipContextInjection).toBe(true)
    expect(service.list('session-1')[0].skipContextInjection).toBe(true)
  })

  it('injects as normal for everything a person queued', () => {
    const item = service.enqueue('session-1', { text: 'carry on' }, 'follow-up')

    expect(item.skipContextInjection).toBe(false)
    expect(service.list('session-1')[0].skipContextInjection).toBe(false)
  })

  /**
   * A muted message may wait here through a whole turn (F10). The mute belongs
   * to what the user wrote, not to whatever the composer shows when the queue
   * finally drains -- the toggle reset the moment they pressed send.
   */
  it('stores the quiet send alongside a queued message', () => {
    const item = service.enqueue(
      'session-1',
      { text: 'quick aside', muteRelays: true },
      'follow-up',
    )

    expect(item.relaysMuted).toBe(true)
    expect(service.nextQueued('session-1')?.relaysMuted).toBe(true)
  })

  it('fires the wires for everything a person queued without muting', () => {
    const item = service.enqueue('session-1', { text: 'carry on' }, 'follow-up')

    expect(item.relaysMuted).toBe(false)
    expect(service.nextQueued('session-1')?.relaysMuted).toBe(false)
  })

  it('enqueues, lists, and emits an add patch event', () => {
    const item = service.enqueue(
      'session-1',
      {
        text: 'run this later',
        attachmentIds: ['attachment-1'],
      },
      'follow-up',
    )

    expect(item).toMatchObject({
      id: 'queued-1',
      sessionId: 'session-1',
      deliveryMode: 'follow-up',
      state: 'queued',
      text: 'run this later',
      attachmentIds: ['attachment-1'],
      skillSelections: [],
      createdAt: '2026-04-26T12:00:00.000Z',
      updatedAt: '2026-04-26T12:00:00.000Z',
    })
    expect(service.list('session-1')).toEqual([item])
    expect(events).toEqual([{ sessionId: 'session-1', op: 'add', item }])
  })

  it('cancels only queued inputs and hides them from the visible list', () => {
    const item = service.enqueue(
      'session-1',
      { text: 'cancel me' },
      'follow-up',
    )

    service.cancel(item.id)

    expect(service.list('session-1')).toEqual([])
    expect(
      db
        .prepare('SELECT state FROM session_queued_inputs WHERE id = ?')
        .get(item.id),
    ).toEqual({ state: 'cancelled' })
    expect(events.at(-1)).toMatchObject({
      sessionId: 'session-1',
      op: 'patch',
      item: { id: item.id, state: 'cancelled' },
    })
  })

  /**
   * R2 (MAR-2971). "Deliver now" on a failed row re-enqueues the work as a
   * fresh waiting row. The failed row is the record of an attempt that did
   * happen and is never rewritten — the new row is a second attempt at the
   * same errand, so it carries the same receipt (`dispatchId`) and the same
   * payload the wire wrote.
   */
  it('redelivers a failed input as a fresh queued row without touching the old one', () => {
    const original = service.enqueue(
      'session-1',
      {
        text: 'RUN100 round 1, lap 1 of 6',
        attachmentIds: ['att-1'],
        skillSelections: [{ name: 'skill-a' } as never],
        providerAccountId: 'acct-7',
        skipContextInjection: true,
        muteRelays: true,
        dispatchId: 'dispatch-9',
      },
      'follow-up',
    )
    service.patch(
      original.id,
      'failed',
      'The turn this input was waiting behind failed.',
    )
    events = []

    const { input: fresh, fromDispatchId } = service.redeliver(original.id)

    expect(fresh.id).not.toBe(original.id)
    expect(fresh).toMatchObject({
      sessionId: 'session-1',
      state: 'queued',
      deliveryMode: 'follow-up',
      text: 'RUN100 round 1, lap 1 of 6',
      attachmentIds: ['att-1'],
      providerAccountId: 'acct-7',
      skipContextInjection: true,
      relaysMuted: true,
      error: null,
    })
    // A NEW receipt, and the old one named as where it came from (lap 2).
    // The same id would name a receipt the engine has already released: the
    // next settle would find no baton and mint a whole new flow run,
    // orphaning the crew's loop mid-round.
    expect(fresh.dispatchId).not.toBe('dispatch-9')
    expect(fresh.dispatchId).toBeTruthy()
    expect(fromDispatchId).toBe('dispatch-9')
    expect(fresh.redeliveredFrom).toBe(original.id)
    expect(fresh.endingToldAt).toBeNull()
    // The failed row is a record, not a draft: it is never rewritten.
    const rows = service.list('session-1')
    expect(rows).toMatchObject([
      {
        id: original.id,
        state: 'failed',
        error: 'The turn this input was waiting behind failed.',
      },
      { id: fresh.id, state: 'queued' },
    ])
    expect(events).toEqual([
      expect.objectContaining({
        op: 'add',
        item: expect.objectContaining({ id: fresh.id }),
      }),
    ])
  })

  /**
   * The clock in this suite is frozen, so every row below shares a
   * `created_at` by construction rather than by luck -- which is exactly the
   * beat the ordering has to survive (MAR-2971 lap 4).
   */
  function drainOrder(sessionId: string): string[] {
    const sent: string[] = []
    for (;;) {
      const next = service.nextQueued(sessionId)
      if (!next) return sent
      sent.push(next.text)
      service.patch(next.id, 'sent')
    }
  }

  it('keeps each opener next to the payload it clears for, across two wires in one beat (MAR-2971 lap 4)', () => {
    // Two wires firing into one busy station enqueue O1,P1,O2,P2 in a single
    // beat. The rule is NOT "openers first": that drains O1,O2,P1,P2 and P2
    // runs with no `/clear` in front of it, having had O2's clear spent on
    // P1. The rule is the order they were queued in, which is design X's
    // order -- each opener is inserted immediately before its own payload.
    service.enqueue('session-1', { text: 'O1', muteRelays: true }, 'follow-up')
    service.enqueue('session-1', { text: 'P1' }, 'follow-up')
    service.enqueue('session-1', { text: 'O2', muteRelays: true }, 'follow-up')
    service.enqueue('session-1', { text: 'P2' }, 'follow-up')

    expect(drainOrder('session-1')).toEqual(['O1', 'P1', 'O2', 'P2'])
  })

  it('sends a redelivered opener before the payload it clears for (MAR-2971 lap 4)', () => {
    // The other input the old proxy got wrong. The opener failed, its
    // payload is still waiting, and Deliver now must put the `/clear` back
    // in FRONT of it -- the errand keeps the place it had.
    const opener = service.enqueue(
      'session-1',
      { text: '/clear', muteRelays: true, dispatchId: 'd-opener' },
      'follow-up',
    )
    service.enqueue('session-1', { text: 'payload' }, 'follow-up')
    service.patch(opener.id, 'failed', 'the provider went away')

    const { input: fresh } = service.redeliver(opener.id)

    expect(fresh.queuePosition).toBe(opener.queuePosition)
    expect(drainOrder('session-1')).toEqual(['/clear', 'payload'])
  })

  it('shows the cards in the order the queue will drain them (MAR-2971 lap 4)', () => {
    // One order for every reader. `list` feeds the cards and `nextQueued`
    // feeds the drain; when they disagreed, Deliver now on an opener left
    // the cards reading payload-then-clear while the queue sent
    // clear-then-payload.
    const opener = service.enqueue(
      'session-1',
      { text: '/clear', muteRelays: true },
      'follow-up',
    )
    service.enqueue('session-1', { text: 'payload' }, 'follow-up')
    service.patch(opener.id, 'failed', 'the provider went away')
    service.redeliver(opener.id)

    const cards = service
      .list('session-1')
      .filter((item) => item.state === 'queued')
      .map((item) => item.text)
    expect(cards).toEqual(drainOrder('session-1'))
    expect(cards).toEqual(['/clear', 'payload'])
  })

  it('keeps a failed row ahead of the re-attempt that shares its place (MAR-2971 lap 5)', () => {
    // The position is the PLACE and equals exist on purpose: a failed row and
    // its re-attempt share one. `rowid` under it is LINEAGE, not a second
    // opinion about place -- the later attempt is the later row. Ordering by
    // position alone leaves SQLite free to emit the pair either way, so the
    // cards could flip across a reload.
    const opener = service.enqueue(
      'session-1',
      { text: 'first attempt', dispatchId: 'd-1' },
      'follow-up',
    )
    service.patch(opener.id, 'failed', 'the provider went away')
    const { input: fresh } = service.redeliver(opener.id)

    expect(fresh.queuePosition).toBe(opener.queuePosition)
    expect(service.list('session-1').map((item) => item.id)).toEqual([
      opener.id,
      fresh.id,
    ])

    // And it must not depend on the query plan. Ordering by position alone
    // happens to come back right today only because a table scan visits rows
    // in rowid order; give the planner an index it prefers and the same SQL
    // returns the pair REVERSED -- the re-attempt ahead of the row it
    // replaced. Measured: with an index on `queue_position DESC`, position-
    // only ordering emits succ,pred. The lineage key is what makes the order
    // a property of the query rather than of the plan.
    db.exec(
      'CREATE INDEX idx_queued_position_desc ON session_queued_inputs(session_id, state, queue_position DESC)',
    )
    expect(service.list('session-1').map((item) => item.id)).toEqual([
      opener.id,
      fresh.id,
    ])
    expect(service.nextQueued('session-1')?.id).toBe(fresh.id)
  })

  it('refuses a second re-attempt at an errand already being carried (MAR-2971 lap 5)', () => {
    // The failed row keeps its card -- it is the record of the first attempt
    // -- so nothing stops the button being pressed twice. Two re-attempts
    // would share one place in line, which is the one case the ordering
    // cannot resolve by itself, and both would be delivered.
    const opener = service.enqueue(
      'session-1',
      { text: 'once', dispatchId: 'd-1' },
      'follow-up',
    )
    service.patch(opener.id, 'failed', 'the provider went away')
    const { input: fresh } = service.redeliver(opener.id)

    // The consequence first, because it is the consequence that matters:
    // one waiting row at this place, not two. Swallowed so the refusal's
    // shape cannot mask the count.
    let refusal: unknown
    try {
      service.redeliver(opener.id)
    } catch (error) {
      refusal = error
    }
    const waiting = service
      .list('session-1')
      .filter((item) => item.state === 'queued')
    expect(waiting.map((item) => item.id)).toEqual([fresh.id])
    // And it said why, rather than failing silently.
    expect(String(refusal)).toContain(`already redelivered as ${fresh.id}`)
  })

  it('stops offering Deliver now on a row something already replaced (MAR-2971 lap 5)', () => {
    // What the card reads. It is a fact about ANOTHER row, so it is answered
    // across every state: a successor that has already been `sent` is gone
    // from this list, and its predecessor is still superseded.
    const opener = service.enqueue(
      'session-1',
      { text: 'once', dispatchId: 'd-1' },
      'follow-up',
    )
    service.patch(opener.id, 'failed', 'the provider went away')
    const { input: fresh } = service.redeliver(opener.id)

    expect(
      service.list('session-1').map((item) => [item.id, item.redeliveredBy]),
    ).toEqual([
      [opener.id, true],
      [fresh.id, false],
    ])

    // The successor goes out; the predecessor is still superseded.
    service.patch(fresh.id, 'sent')
    expect(
      service.list('session-1').map((item) => [item.id, item.redeliveredBy]),
    ).toEqual([[opener.id, true]])
  })

  it('refuses to redeliver an input that did not fail', () => {
    const queued = service.enqueue(
      'session-1',
      { text: 'waiting' },
      'follow-up',
    )
    expect(() => service.redeliver(queued.id)).toThrow(/cannot be redelivered/)
  })

  /**
   * R3 (MAR-2971). The four cards Marcin was left with were `failed` with a
   * DISABLED ✕ — no way to act on them at all. Dismiss has to reach a failed
   * row, or "weird indefinite state" is exactly what it stays.
   */
  it('dismisses a failed input as well as a waiting one', () => {
    const failed = service.enqueue('session-1', { text: 'failed' }, 'follow-up')
    service.patch(
      failed.id,
      'failed',
      'The turn this input was waiting behind failed.',
    )

    const dismissed = service.cancel(failed.id)

    expect(dismissed).toMatchObject({ id: failed.id, state: 'cancelled' })
    expect(service.list('session-1')).toEqual([])
  })

  it('refuses to dismiss an input already on the wire', () => {
    const item = service.enqueue('session-1', { text: 'go' }, 'follow-up')
    service.patch(item.id, 'dispatching')
    expect(() => service.cancel(item.id)).toThrow(/cannot be cancelled/)
  })

  it('returns the oldest queued input', () => {
    service.enqueue('session-1', { text: 'first' }, 'follow-up')
    service.enqueue('session-1', { text: 'second' }, 'follow-up')
    service.patch('queued-1', 'failed', 'already failed')

    expect(service.nextQueued('session-1')).toMatchObject({
      id: 'queued-2',
      text: 'second',
      state: 'queued',
    })
  })

  it('recovers dispatching inputs as failed without emitting runtime patches', () => {
    const item = service.enqueue(
      'session-1',
      { text: 'dispatching' },
      'follow-up',
    )
    service.patch(item.id, 'dispatching')
    events = []

    service.recoverDispatching()

    expect(service.list('session-1')).toMatchObject([
      {
        id: item.id,
        state: 'failed',
        error: 'App restarted before this input was accepted.',
        updatedAt: '2026-04-26T12:00:00.000Z',
      },
    ])
    expect(events).toEqual([])
  })

  /**
   * R1 (MAR-2971). A follow-up that was never attempted does not fail with
   * the turn ahead of it. Four relay terminals were lost this way on
   * 2026-09-11: a Fable's turn was stopped and the queue behind it — rows
   * nothing had tried to deliver — was marked failed, so the loop recovered
   * only because a human re-pasted the text. A queued row fails when ITS OWN
   * delivery fails; until then it waits for the next turn.
   */
  it('leaves a never-attempted input queued when the turn ahead of it ends', () => {
    const queued = service.enqueue('session-1', { text: 'queued' }, 'follow-up')
    const dispatching = service.enqueue(
      'session-1',
      { text: 'dispatching' },
      'follow-up',
    )
    service.patch(dispatching.id, 'dispatching')
    events = []

    const ended = service.failAttemptedForSession(
      'session-1',
      'Provider stopped',
    )

    // The attempted row ends; the one that was only waiting does not.
    expect(ended.map((item) => item.id)).toEqual([dispatching.id])
    expect(service.list('session-1')).toMatchObject([
      { id: queued.id, state: 'queued', error: null },
      { id: dispatching.id, state: 'failed', error: 'Provider stopped' },
    ])
    // Exactly one patch event: a row that did not change is not news.
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual(
      expect.objectContaining({
        op: 'patch',
        item: expect.objectContaining({ id: dispatching.id, state: 'failed' }),
      }),
    )
  })
})
