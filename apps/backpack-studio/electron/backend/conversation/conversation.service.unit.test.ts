// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createStubDaemon,
  deferred,
  envelope,
  waitUntil,
  type StubDaemon,
} from '@convergence/execution-host-client'
import type {
  ExecutionConversationItem,
  ExecutionHostEventEnvelope,
} from '@mrck-labs/execution-host-protocol'
import { DaemonClient } from '../daemon/daemon-client'
import { JsonFileConversationStore } from '../record/conversation-store'
import type { ConversationSnapshot } from '../../../src/shared/api/studio-api.types'
import type { ConversationStore } from '../record/conversation-store.types'
import { ConversationService } from './conversation.service'

/**
 * The walking skeleton's composition test (MAR-2770).
 *
 * It drives the real service, over the real client, over the real store, against
 * the package's stub daemon speaking the real wire protocol. Nothing between
 * the composer and the file on disk is doubled, so this is the only place that
 * proves the seam the promise is actually made of: type a sentence, an agent
 * answers, and the conversation is still there after a restart.
 *
 * "After a restart" is exercised literally — a second `ConversationService`
 * over a second store, pointed at the same directory, with no memory of the
 * first.
 */

const appendGate = vi.hoisted(() => ({
  held: null as Promise<void> | null,
  entered: false,
}))
vi.mock('node:fs/promises', async (original) => {
  const real = await original<typeof import('node:fs/promises')>()
  return {
    ...real,
    appendFile: async (...args: Parameters<typeof real.appendFile>) => {
      if (appendGate.held && String(args[1]).includes('"fact":"refused"')) {
        appendGate.entered = true
        await appendGate.held
      }
      return real.appendFile(...args)
    },
  }
})

const CONVERSATION_ID = 'c-1'

let root: string
let daemon: StubDaemon
let published: ConversationSnapshot[]

const item = (
  over: Partial<ExecutionConversationItem> & { id: string },
): ExecutionConversationItem =>
  ({
    kind: 'message',
    actor: 'assistant',
    text: '',
    state: 'streaming',
    createdAt: '2026-09-02T09:00:01.000Z',
    updatedAt: '2026-09-02T09:00:01.000Z',
    providerMeta: {
      providerId: 'claude',
      providerItemId: null,
      providerEventType: null,
    },
    ...over,
  }) as ExecutionConversationItem

const add = (
  seq: number,
  value: ExecutionConversationItem,
): ExecutionHostEventEnvelope =>
  envelope(
    seq,
    { kind: 'delta', delta: { kind: 'conversation.item.add', item: value } },
    CONVERSATION_ID,
  )

const patch = (
  seq: number,
  itemId: string,
  text: string,
): ExecutionHostEventEnvelope =>
  envelope(
    seq,
    {
      kind: 'delta',
      delta: {
        kind: 'conversation.item.patch',
        itemId,
        patch: { text, state: 'complete' },
      },
    },
    CONVERSATION_ID,
  )

const status = (
  seq: number,
  value: 'running' | 'completed' | 'failed',
): ExecutionHostEventEnvelope =>
  envelope(seq, { kind: 'status', status: value }, CONVERSATION_ID)

function buildService(
  over: { store?: ConversationStore; fetchFn?: typeof fetch } = {},
) {
  const store = over.store ?? new JsonFileConversationStore(root)
  const client = new DaemonClient({
    baseUrl: 'https://daemon.test',
    token: 'tok-secret',
    fetchFn: over.fetchFn ?? daemon.fetchFn,
    wait: () => Promise.resolve(),
    maxStreamAttempts: 2,
  })
  const service = new ConversationService({
    store,
    client,
    providerId: 'claude',
    workingDirectory: '/srv/projects/studio',
    onSnapshot: (snapshot) => published.push(snapshot),
    now: () => '2026-09-02T09:00:00.000Z',
    newId: () => CONVERSATION_ID,
  })
  return { service, store, client }
}

const latest = (id: string): ConversationSnapshot | undefined =>
  [...published].reverse().find((snapshot) => snapshot.id === id)

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'studio-service-'))
  daemon = createStubDaemon()
  published = []
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('the walking skeleton, end to end', () => {
  it('starts a conversation, streams an answer, and replays it after a restart', async () => {
    const { service } = buildService()
    const outcome = await service.start('make me a landing page. please')
    expect(outcome).toEqual({
      kind: 'started',
      conversationId: CONVERSATION_ID,
    })

    // The start reached the daemon as the protocol's own start request.
    expect(daemon.startRequests).toHaveLength(1)
    expect(daemon.startRequests[0]).toMatchObject({
      providerId: 'claude',
      config: {
        sessionId: CONVERSATION_ID,
        workingDirectory: '/srv/projects/studio',
        initialMessage: 'make me a landing page. please',
      },
    })

    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the event stream to open',
    )

    daemon.emit(status(1, 'running'))
    daemon.emit(
      add(
        2,
        item({
          id: 'u-1',
          actor: 'user',
          text: 'make me a landing page. please',
          state: 'complete',
        }),
      ),
    )
    daemon.emit(add(3, item({ id: 'a-1', text: 'On it' })))
    daemon.emit(patch(4, 'a-1', 'On it — here is your page.'))
    daemon.emit(status(5, 'completed'))

    await waitUntil(
      () => latest(CONVERSATION_ID)?.status === 'idle',
      'the conversation to settle',
    )

    const live = latest(CONVERSATION_ID)
    expect(live?.title).toBe('make me a landing page.')
    expect(live?.items.map((row) => [row.label, row.text])).toEqual([
      ['You', 'make me a landing page. please'],
      ['Assistant', 'On it — here is your page.'],
    ])
    expect(live?.streamError).toBeNull()
    expect(live?.orphanPatches).toBe(0)
    expect(live?.unreadableTailLines).toBe(0)

    await service.dispose()

    // The restart: a new store and a new service over the same directory, with
    // no memory of the first.
    published = []
    const restarted = buildService({
      store: new JsonFileConversationStore(root),
    })
    await restarted.service.hydrate()

    expect(restarted.service.list()).toEqual([
      {
        id: CONVERSATION_ID,
        title: 'make me a landing page.',
        createdAt: '2026-09-02T09:00:00.000Z',
        // The fixture's clock is frozen, and the last thing in the log is the
        // `completed` status event — which is now dated by the line that
        // recorded it rather than by whatever last carried a time (L7).
        updatedAt: '2026-09-02T09:00:00.000Z',
        status: 'idle',
      },
    ])
    expect(restarted.service.snapshot(CONVERSATION_ID)).toEqual(live)
    await restarted.service.dispose()
  })

  /**
   * The other half of law 5: a conversation still running when the window
   * closed is re-attached rather than replayed, and it resumes from the
   * sequence the record already holds.
   *
   * Mutation: pass `0` instead of `live.fold.lastSeq` to `followSession` in
   * `follow` and the `Last-Event-ID` assertion goes red — the daemon would
   * re-send the whole conversation.
   */
  it('re-attaches a still-running conversation from where the record ends', async () => {
    const { service } = buildService()
    await service.start('keep going')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the first stream to open',
    )
    daemon.emit(status(1, 'running'))
    daemon.emit(add(2, item({ id: 'a-1', text: 'working' })))
    await waitUntil(
      () => (latest(CONVERSATION_ID)?.items.length ?? 0) === 1,
      'the first answer to land',
    )
    await service.dispose()

    const openedBefore = daemon.eventStreamLastEventIds.length
    published = []
    const restarted = buildService({
      store: new JsonFileConversationStore(root),
    })
    await restarted.service.hydrate()

    expect(restarted.service.snapshot(CONVERSATION_ID)?.status).toBe('running')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > openedBefore,
      'the stream to be re-opened',
    )
    expect(daemon.eventStreamLastEventIds.at(-1)).toBe('2')

    daemon.emit(patch(3, 'a-1', 'done while you were away'))
    daemon.emit(status(4, 'completed'))
    await waitUntil(
      () => latest(CONVERSATION_ID)?.status === 'idle',
      'the resumed conversation to settle',
    )
    expect(latest(CONVERSATION_ID)?.items[0].text).toBe(
      'done while you were away',
    )
    await restarted.service.dispose()
  })

  /**
   * A start the daemon refuses leaves a conversation in the list that says why,
   * rather than a silence.
   *
   * Mutation: swallow the error in `start` and return `{ kind: 'started' }` and
   * both halves go red.
   */
  it('keeps a refused conversation, and says what the daemon said', async () => {
    daemon.setStartStatus(400)
    const { service } = buildService()
    const outcome = await service.start('hello')

    expect(outcome.kind).toBe('refused')
    expect(outcome.kind === 'refused' && outcome.reason).toBe('start rejected')
    const snapshot = latest(CONVERSATION_ID)
    expect(snapshot?.status).toBe('failed')
    expect(snapshot?.streamError).toBe('start rejected')
    expect(service.list()).toHaveLength(1)
    await service.dispose()
  })

  /**
   * The turn is on disk BEFORE the daemon is asked to take it, and the proof is
   * read at the moment of asking rather than after the fact: the window this
   * closes is the one where the process dies between the two, and no test can
   * observe that window from the outside afterwards.
   *
   * Without it, a restart in that window comes back to a conversation folding
   * `idle` while a live session runs on the VPS with nobody following it — the
   * turn a person typed, gone from view (M7).
   *
   * Mutation: move `recordLocal(live, 'sent')` below the `startSession` call
   * and the log is empty when the start arrives -> red.
   */
  it('records the turn before it asks the daemon to take it', async () => {
    let logWhenAsked: string | null = null
    const { service } = buildService({
      fetchFn: (async (
        input: Parameters<typeof fetch>[0],
        init?: RequestInit,
      ) => {
        if (
          String(input).endsWith('/v0/execution/sessions') &&
          init?.method === 'POST'
        ) {
          logWhenAsked = await readFile(
            join(root, CONVERSATION_ID, 'events.jsonl'),
            'utf-8',
          ).catch(() => null)
        }
        return daemon.fetchFn(input, init)
      }) as typeof fetch,
    })

    await service.start('hello')
    expect(logWhenAsked).toContain('"fact":"sent"')
    await service.dispose()
  })

  /**
   * The record is written before the start is posted, so a session the daemon
   * accepted always has a name this app can re-attach to. Proved by the
   * refusal: even then, the file is on disk.
   *
   * Mutation: move `store.create` after the start call and this goes red.
   */
  it('writes the record before it asks the daemon for anything', async () => {
    daemon.setStartStatus(500)
    const { service } = buildService()
    await service.start('hello')
    const written = JSON.parse(
      await readFile(join(root, CONVERSATION_ID, 'conversation.json'), 'utf-8'),
    ) as { id: string }
    expect(written.id).toBe(CONVERSATION_ID)
    await service.dispose()
  })

  /**
   * Studio does not queue input yet, and the honest answer to a person typing
   * into a working conversation is to say so — not to send a command whose
   * result no surface can show.
   *
   * Mutation: drop the `status === 'running'` guard from `send` and this goes
   * red on both halves — a command reaches the daemon and the outcome is
   * `sent`.
   */
  it('refuses a follow-up while the Entity is working, and sends nothing', async () => {
    const { service } = buildService()
    await service.start('first')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )
    daemon.emit(status(1, 'running'))
    await waitUntil(
      () => latest(CONVERSATION_ID)?.status === 'running',
      'the conversation to be running',
    )

    expect(await service.send(CONVERSATION_ID, 'and blue')).toEqual({
      kind: 'busy',
    })
    expect(daemon.commandRequests).toEqual([])
    await service.dispose()
  })

  it('sends a follow-up into an idle conversation, addressed to it', async () => {
    const { service } = buildService()
    await service.start('first')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )
    daemon.emit(status(1, 'completed'))
    await waitUntil(
      () => latest(CONVERSATION_ID)?.status === 'idle',
      'the conversation to settle',
    )

    expect(await service.send(CONVERSATION_ID, 'and make it blue')).toEqual({
      kind: 'sent',
    })
    expect(daemon.commandRequests).toEqual([
      {
        sessionId: CONVERSATION_ID,
        envelope: {
          protocolVersion: 1,
          sessionId: CONVERSATION_ID,
          command: { kind: 'send-message', text: 'and make it blue' },
        },
      },
    ])
    expect(latest(CONVERSATION_ID)?.status).toBe('running')
    await service.dispose()
  })

  /**
   * A stream that cannot be re-established is not a conversation that
   * finished, and the dot alone cannot say which happened.
   *
   * Mutation: swallow the rejection in `follow`'s catch and `streamError` stays
   * null -> red.
   */
  it('says so when the stream cannot be re-established', async () => {
    daemon.setEventsStatus(500)
    const { service } = buildService()
    await service.start('hello')
    await waitUntil(
      () => latest(CONVERSATION_ID)?.streamError !== null,
      'the stream failure to surface',
    )
    expect(latest(CONVERSATION_ID)?.streamError).toContain('stream')
    await service.dispose()
  })

  /**
   * A frame that is not this session's never reaches this session's log.
   *
   * Mutation: drop the session check in `readEnvelopeFrame` and the foreign
   * item lands in the transcript -> red.
   */
  it('never writes a frame belonging to another session', async () => {
    const { service } = buildService()
    await service.start('hello')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )
    daemon.emit(
      envelope(
        1,
        {
          kind: 'delta',
          delta: {
            kind: 'conversation.item.add',
            item: item({ id: 'x-1', text: 'someone else' }),
          },
        },
        'another-session',
      ),
    )
    await waitUntil(
      () => latest(CONVERSATION_ID)?.streamError !== null,
      'the dropped frame to surface',
    )
    expect(latest(CONVERSATION_ID)?.items).toEqual([])
    expect(latest(CONVERSATION_ID)?.streamError).toContain('another-session')
    await service.dispose()
  })

  /**
   * Disk first. A snapshot that has run ahead of the log is a transcript the
   * next launch cannot reproduce, so a failed append must leave the fold
   * exactly where it was — and say what happened.
   *
   * Mutation: move `applyEnvelope` above the append (or drop the `return` in
   * the catch) and the transcript grows a row that is on no disk anywhere ->
   * red on both halves.
   */
  it('does not move the transcript when the record cannot be written', async () => {
    const { service } = buildService({
      store: storeThatRefusesWireEntries(),
    })
    await service.start('hello')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )
    daemon.emit(add(1, item({ id: 'a-1', text: 'hi', state: 'complete' })))
    await waitUntil(
      () => latest(CONVERSATION_ID)?.streamError !== null,
      'the write failure to surface',
    )

    expect(latest(CONVERSATION_ID)?.items).toEqual([])
    expect(latest(CONVERSATION_ID)?.streamError).toContain(
      'could not be written',
    )
    await service.dispose()
  })

  /**
   * The other half of "disk first", and the one a swallowed failure hides: an
   * envelope that reached no disk must not be SKIPPED. The reader's high-water
   * mark used to advance over it while the append was quietly dropped, leaving
   * a hole in the log that no resume ever asks for again.
   *
   * Mutation: `return` instead of `throw` in `record`'s catch and the stream
   * carries on past the refused envelope — the next `Last-Event-ID` is the one
   * that was never written -> red.
   */
  it('re-requests an envelope the record refused, rather than skipping it', async () => {
    const { service } = buildService({
      store: storeThatRefusesWireEntries(),
    })
    await service.start('hello')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )
    const openedBefore = daemon.eventStreamLastEventIds.length

    daemon.emit(add(1, item({ id: 'a-1', text: 'hi', state: 'complete' })))
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > openedBefore,
      'the stream to be re-opened after the refused write',
    )

    // Re-opened from BEFORE the envelope that never landed: a resume from '1'
    // would mean the log had a hole in it that nothing would ever fill.
    expect(daemon.eventStreamLastEventIds.at(-1)).toBeNull()
    await service.dispose()
  })

  /**
   * The pairing the two findings need together: a refused append ends the
   * stream (M2), and the reconnect that follows must SPEND the budget (M1).
   *
   * An attempt counts as having worked when an envelope was kept, not when one
   * arrived — so a disk that keeps refusing exhausts the budget and the
   * conversation says so, instead of reconnecting against a healthy daemon
   * forever at one second apart.
   *
   * Mutation: count the envelope before `onEnvelope` rather than after
   * (`envelopes += 1` above the await) and the budget resets on every refused
   * write — the conversation never reaches `failed`, and this waits out its
   * deadline -> red.
   *
   * Mutation: report the exhaustion in the follow's catch as
   * `describeDaemonFailure(error)` and the last word a person is left with is
   * "the stream dropped", which buries the disk that caused it -> red on the
   * sentence.
   */
  it('gives up on a record that keeps refusing, and names the disk', async () => {
    const { service } = buildService({
      store: storeThatRefusesWireEntries(),
    })
    await service.start('hello')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )
    daemon.emit(add(1, item({ id: 'a-1', text: 'hi', state: 'complete' })))

    await waitUntil(
      () => latest(CONVERSATION_ID)?.status === 'failed',
      'the refused writes to end the conversation',
    )
    expect(latest(CONVERSATION_ID)?.streamError).toContain(
      'could not be written',
    )
    // maxStreamAttempts is 2 here: the budget is spent, not renewed.
    expect(daemon.eventStreamLastEventIds.length).toBeLessThanOrEqual(3)
    await service.dispose()
  })

  /**
   * M1: the busy answer has to be decided and taken in ONE turn.
   *
   * The guard used to read the fold and then await the write that moves it, so
   * a second send arriving inside that await read the same idle fold and was
   * let through as well: two commands at the daemon for one turn, and two
   * `sent` lines in a log that is supposed to be the truth. One window is
   * covered by the renderer's own flag, and IPC broadcasts to as many windows
   * as are open.
   *
   * Mutation: guard on `live.fold.status === 'running'` alone (drop the
   * in-flight flag) and both sends go through -> red on all three halves.
   */
  it('lets one of two simultaneous sends through, and calls the other busy', async () => {
    const { service } = buildService()
    await service.start('first')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )
    daemon.emit(status(1, 'completed'))
    await waitUntil(
      () => latest(CONVERSATION_ID)?.status === 'idle',
      'the conversation to settle',
    )

    const outcomes = await Promise.all([
      service.send(CONVERSATION_ID, 'and blue'),
      service.send(CONVERSATION_ID, 'and green'),
    ])

    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual([
      'busy',
      'sent',
    ])
    expect(daemon.commandRequests).toHaveLength(1)
    // Two `sent` lines in the whole log: the start's own, and this one turn.
    const log = await readFile(
      join(root, CONVERSATION_ID, 'events.jsonl'),
      'utf-8',
    )
    expect(
      log.split('\n').filter((row) => row.includes('"fact":"sent"')),
    ).toHaveLength(2)
    await service.dispose()
  })

  /**
   * L1: the record's own write is the one disk failure `start` did not catch.
   * It sat outside every `try`, so a disk that refused it left the window with
   * an unhandled rejection and no sentence at all — the exact class the IPC
   * door was hardened against in round 2.
   *
   * Mutation: drop the `try`/`catch` around `store.create` and `start` rejects
   * -> red.
   */
  it('says why when the record itself will not be written', async () => {
    const { service } = buildService({ store: storeThatRefusesCreate() })
    const outcome = await service.start('hello')

    expect(outcome.kind).toBe('refused')
    expect(outcome.kind === 'refused' && outcome.reason).toContain(
      'could not be written',
    )
    // Nothing was asked of the daemon: a session it accepted would have no
    // record here to re-attach to.
    expect(daemon.startRequests).toEqual([])
    expect(latest(CONVERSATION_ID)?.streamError).toContain(
      'could not be written',
    )
    await service.dispose()
  })

  /**
   * L2: the count of unreadable lines is taken once, at hydrate, and the FIRST
   * append of the process heals the log it describes. Left alone, the window
   * warned for the rest of the session about bytes that are no longer on disk.
   *
   * Mutation: drop `live.unreadableTailLines = 0` from `appendAndFold` and the
   * warning outlives the tear -> red.
   */
  it('stops warning about lines the first append healed away', async () => {
    const { store } = buildService()
    await store.create({
      id: CONVERSATION_ID,
      title: 'earlier',
      createdAt: '2026-09-02T09:00:00.000Z',
      providerId: 'claude',
    })
    await writeFile(
      join(root, CONVERSATION_ID, 'events.jsonl'),
      `${JSON.stringify(status(1, 'completed'))}\n{"at":"2026-09-02T09`,
      'utf-8',
    )

    published = []
    const restarted = buildService({
      store: new JsonFileConversationStore(root),
    })
    await restarted.service.hydrate()
    expect(
      restarted.service.snapshot(CONVERSATION_ID)?.unreadableTailLines,
    ).toBe(1)

    expect(await restarted.service.send(CONVERSATION_ID, 'again')).toEqual({
      kind: 'sent',
    })
    expect(
      restarted.service.snapshot(CONVERSATION_ID)?.unreadableTailLines,
    ).toBe(0)
    await restarted.service.dispose()
  })

  // R6 L2 mutation: remove disposing from send's follow guard -> a second stream opens.
  it('does not open a follow when a send reply arrives after disposal', async () => {
    const held = deferred()
    let commandEntered = false
    const { service } = buildService({
      fetchFn: (async (input, init) => {
        if (String(input).includes('/commands')) {
          commandEntered = true
          await held.promise
        }
        return daemon.fetchFn(input, init)
      }) as typeof fetch,
    })
    await service.start('hello')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length === 1,
      'first stream',
    )
    daemon.emit(status(1, 'completed'))
    await waitUntil(
      () => service.snapshot(CONVERSATION_ID)?.status === 'idle',
      'idle',
    )
    const sending = service.send(CONVERSATION_ID, 'again')
    await waitUntil(() => commandEntered, 'held command')
    await service.dispose()
    held.release()
    await sending
    expect(daemon.eventStreamLastEventIds).toHaveLength(1)
    await service.dispose()
  })

  // R6 L3 mutation: omit the create retry -> the send leaves an orphan log.
  it.each([false, true])(
    'retries a refused record create before any append (still refusing: %s)',
    async (stillRefusing) => {
      const real = new JsonFileConversationStore(root)
      let creates = 0
      let appends = 0
      const store: ConversationStore = {
        list: () => real.list(),
        drain: () => real.drain(),
        read: (id) => real.read(id),
        readLog: (id) => real.readLog(id),
        create: (value) => {
          creates++
          return creates === 1 || stillRefusing
            ? Promise.reject(new Error('disk full'))
            : real.create(value)
        },
        appendEntry: (...args) => {
          appends++
          return real.appendEntry(...args)
        },
      }
      const { service } = buildService({
        store,
        fetchFn: (async (input, init) => {
          if (String(input).includes('/commands'))
            return new Response('{}', { status: 404 })
          return daemon.fetchFn(input, init)
        }) as typeof fetch,
      })
      await service.start('hello')
      const result = await service.send(CONVERSATION_ID, 'retry')
      expect(creates).toBe(2)
      expect(result.kind).toBe(stillRefusing ? 'refused' : 'sent')
      expect(appends).toBe(stillRefusing ? 0 : 2)
      expect((await real.list()).length).toBe(stillRefusing ? 0 : 1)
      expect(daemon.startRequests.length).toBe(stillRefusing ? 0 : 1)
      await service.dispose()
    },
  )

  // R6 M1 mutations: remove the 409 fallback at initial start or retry start.
  it.each(['initial', 'retry'])(
    'follows a session reported as existing at %s start',
    async (door) => {
      const { service } = buildService({
        fetchFn: (async (input, init) => {
          if (door === 'retry' && String(input).includes('/commands')) {
            const prior = daemon.commandRequests.length
            const response = await daemon.fetchFn(input, init)
            if (prior === 0) return new Response('{}', { status: 404 })
            return response
          }
          return daemon.fetchFn(input, init)
        }) as typeof fetch,
      })
      daemon.setStartStatus(door === 'initial' ? 409 : 400)
      const initial = await service.start('hello')
      if (door === 'retry') {
        daemon.setStartStatus(409)
        expect(await service.send(CONVERSATION_ID, 'retry')).toEqual({
          kind: 'sent',
        })
      } else expect(initial.kind).toBe('started')
      await waitUntil(
        () => daemon.eventStreamLastEventIds.length > 0,
        'follow after conflict',
      )
      expect(daemon.commandRequests).toHaveLength(door === 'initial' ? 1 : 2)
      await service.dispose()
    },
  )

  // R6 M1 mutation: restore neverBegan routing from lastFact -> this lost-reply retry fails.
  it('asks the daemon after a lost start reply and follows the existing first turn', async () => {
    let lost = false
    const { service } = buildService({
      fetchFn: (async (input, init) => {
        const response = await daemon.fetchFn(input, init)
        if (String(input).endsWith('/sessions') && !lost) {
          lost = true
          daemon.setStartStatus(409)
          throw new Error('response lost')
        }
        return response
      }) as typeof fetch,
    })
    expect((await service.start('first turn')).kind).toBe('refused')
    daemon.emit(
      add(
        1,
        item({ id: 'first-answer', text: 'first answer', state: 'complete' }),
      ),
    )
    expect(await service.send(CONVERSATION_ID, 'next turn')).toEqual({
      kind: 'sent',
    })
    await waitUntil(
      () => service.snapshot(CONVERSATION_ID)?.items.length === 1,
      'first turn replay',
    )
    expect(daemon.commandRequests).toHaveLength(1)
    expect(service.snapshot(CONVERSATION_ID)?.items[0].text).toBe(
      'first answer',
    )
    await service.dispose()
  })

  // R6 M1 mutation: omit 404 -> start fallback; a true refusal cannot recover.
  it('starts the session on the next sentence when the first start was refused', async () => {
    daemon.setStartStatus(400)
    const { service } = buildService()
    await service.start('hello')
    await service.dispose()

    published = []
    daemon.setStartStatus(201)
    const restarted = buildService({
      store: new JsonFileConversationStore(root),
      fetchFn: (async (input, init) => {
        const response = await daemon.fetchFn(input, init)
        return String(input).includes('/commands')
          ? new Response('{}', { status: 404 })
          : response
      }) as typeof fetch,
    })
    await restarted.service.hydrate()
    expect(restarted.service.snapshot(CONVERSATION_ID)?.status).toBe('failed')

    expect(await restarted.service.send(CONVERSATION_ID, 'try again')).toEqual({
      kind: 'sent',
    })
    expect(daemon.startRequests).toHaveLength(2)
    expect(daemon.startRequests[1]).toMatchObject({
      config: {
        sessionId: CONVERSATION_ID,
        initialMessage: 'try again',
      },
    })
    expect(daemon.commandRequests).toHaveLength(1)
    await restarted.service.dispose()
  })

  /**
   * The other half of the same door: a stream this app gave up rebuilding
   * folds to the SAME `failed` status, but the daemon did create that session.
   * Starting it a second time is answered with a 409, and the turn would be
   * lost.
   *
   * Mutation: always post a start instead of asking with a command -> red.
   */
  it('continues a session whose stream was abandoned, rather than restarting it', async () => {
    daemon.setEventsStatus(500)
    const { service } = buildService()
    await service.start('hello')
    await waitUntil(
      () => latest(CONVERSATION_ID)?.status === 'failed',
      'the stream to be given up on',
    )
    daemon.setEventsStatus(200)

    expect(await service.send(CONVERSATION_ID, 'still there?')).toEqual({
      kind: 'sent',
    })
    expect(daemon.startRequests).toHaveLength(1)
    expect(daemon.commandRequests).toHaveLength(1)
    await service.dispose()
  })

  /**
   * The token is the one value that must never leave the main process. It is
   * carried in an Authorization header and nowhere else: not in a snapshot, not
   * in a summary, not in the file on disk.
   *
   * Mutation: put the token on the snapshot (or into the record) and this goes
   * red.
   */
  it('keeps the token out of everything it hands to the window or the disk', async () => {
    const { service } = buildService()
    await service.start('hello')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )
    daemon.emit(add(1, item({ id: 'a-1', text: 'hi', state: 'complete' })))
    await waitUntil(
      () => (latest(CONVERSATION_ID)?.items.length ?? 0) === 1,
      'an answer to land',
    )
    await service.dispose()

    expect(JSON.stringify(published)).not.toContain('tok-secret')
    expect(JSON.stringify(service.list())).not.toContain('tok-secret')
    expect(
      await readFile(join(root, CONVERSATION_ID, 'conversation.json'), 'utf-8'),
    ).not.toContain('tok-secret')
    expect(
      await readFile(join(root, CONVERSATION_ID, 'events.jsonl'), 'utf-8'),
    ).not.toContain('tok-secret')
  })
})

/**
 * H2: the status a person sees has to survive the restart that rebuilds it.
 *
 * Every one of these drives a REAL restart — a second service over a second
 * store on the same directory, with no memory of the first — because the whole
 * defect was a status that existed only in the memory of the process that saw
 * it happen.
 */
describe('what a restart makes of a conversation', () => {
  const restart = async (): Promise<ConversationSnapshot | null> => {
    published = []
    const restarted = buildService({
      store: new JsonFileConversationStore(root),
    })
    await restarted.service.hydrate()
    const snapshot = restarted.service.snapshot(CONVERSATION_ID)
    await restarted.service.dispose()
    return snapshot
  }

  /**
   * The zombie itself, end to end. Before the fix this came back Working, with
   * the composer locked against a session the daemon had refused to start —
   * forever, because the reason had never been written down.
   *
   * Mutation: drop the `recordLocal(live, 'refused')` call from `start`'s catch
   * and the restart reads Working -> red on both halves.
   */
  it('shows a refused start as failed, and lets you type again', async () => {
    daemon.setStartStatus(400)
    const { service } = buildService()
    await service.start('hello')
    await service.dispose()

    const snapshot = await restart()
    expect(snapshot?.status).toBe('failed')
  })

  /**
   * M7: a restart between the send and the first daemon event must not lose
   * the turn from view. The `sent` fact is written BEFORE the daemon is asked,
   * so the conversation comes back working and re-attaches.
   *
   * Mutation: record `sent` after `startSession` returns and a restart in that
   * window comes back idle, with a live session on the VPS that nothing is
   * following -> red on both halves.
   */
  it('comes back working, and re-attached, when it died mid-turn', async () => {
    const { service } = buildService()
    await service.start('hello')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )
    await service.dispose()
    const openedBefore = daemon.eventStreamLastEventIds.length

    published = []
    const restarted = buildService({
      store: new JsonFileConversationStore(root),
    })
    await restarted.service.hydrate()
    expect(restarted.service.snapshot(CONVERSATION_ID)?.status).toBe('running')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > openedBefore,
      'the stream to be re-opened',
    )
    await restarted.service.dispose()
  })

  /**
   * A daemon that goes away takes the stream with it, and the attempt budget
   * eventually runs out. What the conversation must NOT do is stay Working
   * across every launch that follows.
   *
   * Mutation: drop the `recordExhaustion` call from `follow`'s catch and the
   * restart reads Working with a locked composer -> red.
   */
  it('shows an abandoned stream as failed after a restart', async () => {
    daemon.setEventsStatus(500)
    const { service } = buildService()
    await service.start('hello')
    await waitUntil(
      () => latest(CONVERSATION_ID)?.status === 'failed',
      'the stream to be given up on',
    )
    await service.dispose()

    const snapshot = await restart()
    expect(snapshot?.status).toBe('failed')
  })

  /**
   * The two zombies already on Marcin's machine: logs written before local
   * facts existed, holding nothing at all. They must come back sendable rather
   * than Working — and a log of bare legacy envelopes must still read.
   *
   * Mutation: seed `emptyFold` with `running` and the empty conversation is a
   * zombie again -> red.
   */
  it('reads a log written by the previous build without inventing work', async () => {
    const { store } = buildService()
    await store.create({
      id: CONVERSATION_ID,
      title: 'asdasd',
      createdAt: '2026-09-02T09:00:00.000Z',
      providerId: 'claude',
    })
    await writeFile(
      join(root, CONVERSATION_ID, 'events.jsonl'),
      `${JSON.stringify(status(1, 'running'))}\n`,
      'utf-8',
    )

    published = []
    const restarted = buildService({
      store: new JsonFileConversationStore(root),
    })
    await restarted.service.hydrate()
    // The legacy line read: a bare envelope, folded exactly as it always was.
    expect(restarted.service.snapshot(CONVERSATION_ID)?.status).toBe('running')
    await restarted.service.dispose()

    // And with nothing in the log at all — the refused-start zombie's shape —
    // the conversation is sendable rather than eternally Working.
    await writeFile(join(root, CONVERSATION_ID, 'events.jsonl'), '', 'utf-8')
    expect((await restart())?.status).toBe('idle')
  })
})

describe('the follow', () => {
  /**
   * A gap that HEALED must not keep saying so (MAR-2779 round 2).
   *
   * The gap reaches the conversation as a dropped frame, and a dropped frame is
   * a hole in the transcript, so it becomes the conversation's error. But this
   * particular hole is the one the resume fills: the reconnect asks from the
   * last contiguous sequence and the daemon replays what was lost. Nothing
   * cleared it, so a record that ends up complete — 1, 2, 3, 4, in order — sat
   * under "gap: expected 3, got 4; reconnecting from 2" until the person typed
   * their next message. The recovery worked and the app said it had not.
   *
   * The error is shown while it is true: the assertion is that it WAS
   * published, and that the last word is `null`.
   *
   * Mutation: keep the error (drop the clear in `record`) and this is red on
   * the settled snapshot.
   */
  it('clears a gap error once the resume has filled the hole', async () => {
    const { service } = buildService()
    await service.start('hello')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )
    daemon.emit(status(1, 'running'))
    daemon.emit(add(2, item({ id: 'a-1', text: 'On it' })))
    // The daemon holds 3; the wire loses it.
    daemon.loseFrame(patch(3, 'a-1', 'On it — here is your page.'))
    daemon.emit(status(4, 'completed'))

    await waitUntil(
      () => latest(CONVERSATION_ID)?.status === 'idle',
      'the conversation to settle',
    )
    // It was said, while it was true.
    expect(
      published.some((snapshot) =>
        snapshot.streamError?.startsWith('gap: expected 3'),
      ),
    ).toBe(true)
    // And it is not said any more: the record is whole.
    expect(latest(CONVERSATION_ID)?.streamError).toBeNull()
    expect(latest(CONVERSATION_ID)?.items.map((row) => row.text)).toEqual([
      'On it — here is your page.',
    ])
    expect(daemon.eventStreamLastEventIds).toEqual([null, '2'])

    await service.dispose()
  }, 5_000)

  /**
   * The loss that does NOT heal keeps its sentence.
   *
   * An unreadable frame is gone for good — no resume asks for it again — so the
   * envelopes that follow are not evidence that it arrived. Only a gap is
   * cleared by what comes next, and telling the two apart is the whole reason
   * the client says which kind of loss it had.
   *
   * Mutation: clear the error on any accepted envelope and this is red.
   */
  it('keeps an unreadable frame on the conversation, envelopes or not', async () => {
    const { service } = buildService()
    await service.start('hello')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )
    daemon.emit(status(1, 'running'))
    daemon.emitRaw('{ not an envelope')
    daemon.emit(add(2, item({ id: 'a-1', text: 'On it', state: 'complete' })))
    daemon.emit(status(3, 'completed'))

    await waitUntil(
      () => latest(CONVERSATION_ID)?.status === 'idle',
      'the conversation to settle',
    )
    // The sentence itself, not merely a non-null one: `not.toBeNull()` passes
    // on any error at all, including one about a frame that is not this loss.
    expect(latest(CONVERSATION_ID)?.streamError).toMatch(/cannot read/)
    // One stream throughout: an unreadable frame is not a reason to re-dial.
    expect(daemon.eventStreamLastEventIds).toEqual([null])

    await service.dispose()
  }, 5_000)

  /**
   * The two losses in one stream: the healed gap must not take the permanent
   * one down with it (MAR-2779 round 3).
   *
   * A gap clears `streamError` when the replay lands, and that clear was
   * unconditional -- so an unreadable frame from EARLIER in the same stream was
   * erased by a hole that healed after it. The conversation settled with no
   * error at all, while a frame it never read is missing from the record for
   * good. The one loss nothing undoes was the one thing the app stopped saying.
   *
   * Mutation: null the error on the heal (`live.streamError = null`) instead of
   * restoring the permanent loss and this is red on the settled snapshot.
   */
  it('gives the permanent loss back when a later gap heals', async () => {
    const { service } = buildService()
    await service.start('hello')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )
    daemon.emit(status(1, 'running'))
    // Gone for good: nothing will re-send this frame.
    daemon.emitRaw('{ not an envelope')
    daemon.emit(add(2, item({ id: 'a-1', text: 'On it' })))
    // And a hole that WILL heal, on top of it.
    daemon.loseFrame(patch(3, 'a-1', 'On it — here is your page.'))
    daemon.emit(status(4, 'completed'))

    await waitUntil(
      () => latest(CONVERSATION_ID)?.status === 'idle',
      'the conversation to settle',
    )
    // The gap said its piece while it was true...
    expect(
      published.some((snapshot) =>
        snapshot.streamError?.startsWith('gap: expected 3'),
      ),
    ).toBe(true)
    // ...and the loss that outlives it is the last word.
    expect(latest(CONVERSATION_ID)?.streamError).toMatch(/cannot read/)
    // The record itself came back whole: this is a sentence about the frame
    // nobody could read, not about the one the resume replayed.
    expect(latest(CONVERSATION_ID)?.items.map((row) => row.text)).toEqual([
      'On it — here is your page.',
    ])
    expect(daemon.eventStreamLastEventIds).toEqual([null, '2'])

    await service.dispose()
  }, 5_000)

  /**
   * The order the two losses arrive in does not change which one survives.
   *
   * Gap, healed; then the unreadable frame; then a second gap on top of it.
   * While the second hole is open the conversation says so -- that is the true
   * thing at that moment -- and when the replay lands it goes back to the loss
   * that never healed rather than to silence.
   *
   * The first heal is asserted on its own: it clears to NULL, because nothing
   * permanent had been lost yet. Without that half, restoring a stale sentence
   * for every heal would pass.
   *
   * Mutation: restore unconditionally (drop the clear on the send, or hold the
   * gap sentence in `permanentLoss` too) and the first heal is red.
   */
  it('shows the open gap while it is open and the permanent loss after', async () => {
    const { service } = buildService()
    await service.start('hello')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )
    daemon.emit(status(1, 'running'))
    daemon.loseFrame(add(2, item({ id: 'a-1', text: 'On it' })))
    daemon.emit(patch(3, 'a-1', 'On it — here is your page.'))

    await waitUntil(
      () => daemon.eventStreamLastEventIds.length === 2,
      'the resume to re-open the stream',
    )
    await waitUntil(
      () => latest(CONVERSATION_ID)?.streamError === null,
      'the first healed gap to clear outright',
    )

    daemon.emitRaw('{ not an envelope')
    await waitUntil(
      () =>
        (latest(CONVERSATION_ID)?.streamError ?? '').includes('cannot read'),
      'the unreadable frame to be reported',
    )

    daemon.loseFrame(add(4, item({ id: 'a-2', text: 'and one more thing' })))
    daemon.emit(status(5, 'completed'))

    await waitUntil(
      () => latest(CONVERSATION_ID)?.status === 'idle',
      'the conversation to settle',
    )
    // Said while it was true, on top of a permanent loss already held.
    expect(
      published.some((snapshot) =>
        snapshot.streamError?.startsWith('gap: expected 4'),
      ),
    ).toBe(true)
    expect(latest(CONVERSATION_ID)?.streamError).toMatch(/cannot read/)
    expect(latest(CONVERSATION_ID)?.items.map((row) => row.text)).toEqual([
      'On it — here is your page.',
      'and one more thing',
    ])

    await service.dispose()
  }, 5_000)

  /**
   * A budget that runs out with a hole still open says which hole
   * (MAR-2779 round 3).
   *
   * This daemon's own log skips 2, so the resume it is asked for is one it
   * cannot answer: every re-open reads the same gap and delivers nothing, the
   * budget is spent, and the conversation is left with the client's generic
   * sentence -- true of every exhausted stream, and silent about the frame that
   * is actually missing.
   *
   * Mutation: report `describeDaemonFailure(error)` alone and this is red on
   * the suffix.
   */
  it('names the hole it gave up on when the stream budget runs out', async () => {
    const { service } = buildService()
    await service.start('hello')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )
    daemon.emit(status(1, 'running'))
    // No `loseFrame`: as far as this daemon is concerned, 2 never existed, so
    // the resume replays the same hole for as long as it is asked to.
    daemon.emit(status(3, 'completed'))

    await waitUntil(
      () => latest(CONVERSATION_ID)?.status === 'failed',
      'the reconnect budget to run out',
    )
    expect(latest(CONVERSATION_ID)?.streamError).toBe(
      'Conversation stream dropped and could not be re-established: expected 2, got 3.',
    )
    // maxStreamAttempts is 2 here: the budget is spent, not renewed.
    expect(daemon.eventStreamLastEventIds).toEqual([null, '1'])

    await service.dispose()
  }, 5_000)

  /**
   * A hole belongs to the stream that fell into it, and to no later one.
   *
   * The suffix above is read off the gap the conversation is still holding, so
   * the holding has to end when the reconnecting does — otherwise the next
   * stream to give up, for reasons of its own, inherits a hole from a stream
   * that ended minutes ago and blames it for something it had nothing to do
   * with.
   *
   * Mutation: drop BOTH resets — the send's and the exhaustion's — and this is
   * red on the borrowed suffix. Either one alone closes this path, which is
   * what "reset wherever `streamError` is assigned by anything but a gap" is
   * for: the belt and the braces are both cheap and the sentence is the
   * product.
   */
  it('does not blame a later failure on an older hole', async () => {
    const { service } = buildService()
    await service.start('hello')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )
    daemon.emit(status(1, 'running'))
    daemon.emit(status(3, 'completed'))
    await waitUntil(
      () => latest(CONVERSATION_ID)?.status === 'failed',
      'the reconnect budget to run out on the hole',
    )

    // The next turn's stream fails for a reason of its own.
    daemon.setEventsStatus(500)
    expect(await service.send(CONVERSATION_ID, 'again')).toEqual({
      kind: 'sent',
    })
    await waitUntil(
      () =>
        (latest(CONVERSATION_ID)?.streamError ?? '').includes('unavailable'),
      'the second stream to give up too',
    )
    expect(latest(CONVERSATION_ID)?.streamError).not.toContain('expected 2')

    await service.dispose()
  }, 5_000)

  /**
   * L2: a conversation that has stopped running has nothing left to stream, and
   * the follow was never ended — every conversation held one idle SSE open
   * against the daemon for the app's whole lifetime.
   *
   * The proof is the SECOND stream's resume point. An envelope emitted while
   * the conversation is idle reaches a closed stream and stays on the daemon;
   * the next turn re-opens from `1` and is replayed it. A follow still open
   * would have swallowed it live, and the re-open would carry `2`.
   *
   * Mutation: drop the `stopFollowing` call from `record` and the stream stays
   * open, so the re-open resumes from `2` -> red.
   *
   * NOT pinned here: `stopFollowing`'s eager `live.abort = null`. The follow's
   * own `finally` clears it a turn later, and every caller in this app is more
   * than a turn away, so removing it leaves this suite green. It stays as a
   * narrowing of that window, not as a claim.
   */
  it('ends when the conversation settles, and re-attaches for the next turn', async () => {
    const { service } = buildService()
    await service.start('hello')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )
    daemon.emit(status(1, 'completed'))
    await waitUntil(
      () => latest(CONVERSATION_ID)?.status === 'idle',
      'the conversation to settle',
    )

    // Emitted into a stream that should no longer be there.
    daemon.emit(
      add(2, item({ id: 'a-1', text: 'after the end', state: 'complete' })),
    )
    expect(await service.send(CONVERSATION_ID, 'again')).toEqual({
      kind: 'sent',
    })
    await waitUntil(
      () => (latest(CONVERSATION_ID)?.items.length ?? 0) === 1,
      'the follow-up stream to replay what the closed one never took',
    )

    expect(daemon.eventStreamLastEventIds).toEqual([null, '1'])
    await service.dispose()
  })

  /**
   * The awkward corner of ending a follow from inside it: one read can carry a
   * whole conversation. After a torn log the resume asks from an earlier
   * sequence and the daemon replays several turns COALESCED, so the
   * `completed` that ends the follow can sit in the middle of the batch and the
   * frames after it are already decoded and still coming.
   *
   * The settled fold is the only honest reading, and it is only settled once
   * the stream has drained. A conversation left `running` with nothing
   * streaming it is the same zombie in a different costume.
   *
   * Mutation: drop the re-follow from the follow's `finally` and the second
   * stream never opens -> red.
   */
  it('re-attaches when a coalesced batch ends past the status that stopped it', async () => {
    const { service } = buildService()
    await service.start('hello')
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 0,
      'the stream to open',
    )

    daemon.emitBatch([
      status(1, 'completed'),
      add(2, item({ id: 'a-1', text: 'and then more', state: 'complete' })),
      status(3, 'running'),
    ])

    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 1,
      'the stream to be re-opened for the turn the batch ended in',
    )
    expect(latest(CONVERSATION_ID)?.status).toBe('running')
    expect(daemon.eventStreamLastEventIds.at(-1)).toBe('3')
    await service.dispose()
  })

  /**
   * L3: one line per sequence, however many follows are open.
   *
   * Two follows over one conversation are reachable, and this drives the real
   * path: the envelope that settles a conversation clears its controller
   * eagerly while the batch it arrived in is still being drained one disk write
   * at a time, and a follow-up landing in that turn opens a SECOND stream from
   * a mark the first has not caught up to. The daemon replays the overlap to
   * both.
   *
   * The fold ignores anything at or below its mark, so the transcript looked
   * right — and the log, which is the thing a restart actually reads, carried
   * the line twice.
   *
   * Mutation: accept every entry under the store lock instead of checking
   * the fold's current sequence -> two lines for sequence 2, red.
   */
  it('writes one line per sequence when two follows overlap', async () => {
    const heldAppend = deferred()
    let eventRequests = 0
    let holdingSecondEnvelope = false

    const real = new JsonFileConversationStore(root)
    const store: ConversationStore = {
      list: () => real.list(),
      drain: () => real.drain(),
      read: (id) => real.read(id),
      create: (value) => real.create(value),
      readLog: (id) => real.readLog(id),
      appendEntry: async (id, entry, commit) => {
        // The first follow is held INSIDE the batch, one envelope in: the fold
        // is at sequence 1 and the settling envelope has already cleared the
        // controller. That is the window a follow-up opens a second stream in.
        if (
          entry.kind === 'wire' &&
          entry.envelope.seq === 2 &&
          !holdingSecondEnvelope
        ) {
          holdingSecondEnvelope = true
          await heldAppend.promise
        }
        await real.appendEntry(id, entry, commit)
      },
    }

    const { service } = buildService({
      store,
      fetchFn: (async (
        input: Parameters<typeof fetch>[0],
        init?: RequestInit,
      ) => {
        if (String(input).includes('/events')) {
          eventRequests += 1
          // No gate on the second follow: it replays while the first append
          // is still pending, so the acceptance check must run under the lock.
        }
        return daemon.fetchFn(input, init)
      }) as typeof fetch,
    })

    await service.start('hello')
    await waitUntil(() => eventRequests > 0, 'the first stream to open')

    daemon.emitBatch([
      status(1, 'completed'),
      add(2, item({ id: 'a-1', text: 'and then more', state: 'complete' })),
    ])
    await waitUntil(
      () => holdingSecondEnvelope,
      'the first follow to reach the second envelope of the batch',
    )

    expect(await service.send(CONVERSATION_ID, 'again')).toEqual({
      kind: 'sent',
    })

    await waitUntil(
      () => (latest(CONVERSATION_ID)?.items.length ?? 0) === 1,
      'the second follow to land the replay before the held append resumes',
    )
    heldAppend.release()
    await waitUntil(
      () => daemon.eventStreamLastEventIds.length > 1,
      'the second stream to open',
    )
    expect(daemon.eventStreamLastEventIds.at(-1)).toBe('1')

    // A sentinel behind the replay: once sequence 3 has landed, the replayed
    // sequence 2 has been through `record` and made up its mind.
    daemon.emit(status(3, 'completed'))
    await waitUntil(
      () => latest(CONVERSATION_ID)?.status === 'idle',
      'the second stream to reach the end of its replay',
    )

    const log = await readFile(
      join(root, CONVERSATION_ID, 'events.jsonl'),
      'utf-8',
    )
    expect(
      log.split('\n').filter((row) => row.includes('"seq":2')),
    ).toHaveLength(1)
    await service.dispose()
  })
})

/**
 * A store that refuses the wire's own envelopes, and then relents.
 *
 * The record and the local facts still land, so the conversation exists and can
 * say what went wrong — it is the append of the wire's events that fails, which
 * is the disk failure the stream has to survive.
 *
 * `refusals` is finite ON PURPOSE. A store that refused forever would let a
 * client whose reconnect budget never runs out spin in a tight loop, and a
 * canary that proves a defect by hanging the suite proves it in the wrong
 * colour. Relenting bounds the broken version so it FAILS an assertion instead.
 */
function storeThatRefusesWireEntries(refusals = 10): ConversationStore {
  const real = new JsonFileConversationStore(root)
  let refused = 0
  return {
    list: () => real.list(),
    drain: () => real.drain(),
    read: (id) => real.read(id),
    create: (value) => real.create(value),
    readLog: (id) => real.readLog(id),
    appendEntry: (id, entry, commit) => {
      if (entry.kind !== 'wire' || refused >= refusals) {
        return real.appendEntry(id, entry, commit)
      }
      refused += 1
      return Promise.reject(new Error('disk is full'))
    },
  }
}

/**
 * A store whose record file cannot be written at all.
 *
 * The log still works, so the conversation can still say what went wrong —
 * which is the point of the finding: the failure has a sentence rather than a
 * rejection nobody catches.
 */
function storeThatRefusesCreate(): ConversationStore {
  const real = new JsonFileConversationStore(root)
  return {
    list: () => real.list(),
    drain: () => real.drain(),
    read: (id) => real.read(id),
    create: () => Promise.reject(new Error('disk is full')),
    readLog: (id) => real.readLog(id),
    appendEntry: (id, entry, commit) => real.appendEntry(id, entry, commit),
  }
}

it.each([401, 500])(
  'refuses command HTTP %s without starting — mutation: widen 404 fallback',
  async (code) => {
    let refuse = false
    const { service } = buildService({
      fetchFn: async (input, init) => {
        if (refuse && String(input).includes('/commands'))
          return new Response(
            JSON.stringify({ error: `Command refused ${code}` }),
            { status: code },
          )
        return daemon.fetchFn(input, init)
      },
    })
    await service.start('first')
    daemon.emit(status(1, 'completed'))
    await waitUntil(
      () => service.snapshot(CONVERSATION_ID)?.status === 'idle',
      'settled',
    )
    refuse = true
    expect(await service.send(CONVERSATION_ID, 'next')).toEqual({
      kind: 'refused',
      reason: `Command refused ${code}`,
    })
    expect(daemon.startRequests).toHaveLength(1)
    await service.dispose()
  },
)

it.each([401, 403, 404])(
  'unlocks after stream HTTP %s with the daemon sentence — mutation: omit stream exhaustion',
  async (code) => {
    const { service } = buildService({
      fetchFn: async (input, init) =>
        String(input).includes('/events')
          ? new Response(JSON.stringify({ error: `No stream ${code}` }), {
              status: code,
            })
          : daemon.fetchFn(input, init),
    })
    await service.start('first')
    await waitUntil(
      () => service.snapshot(CONVERSATION_ID)?.status === 'failed',
      'terminal stream refusal',
    )
    expect(service.snapshot(CONVERSATION_ID)?.streamError).toBe(
      `No stream ${code}`,
    )
    await service.dispose()
  },
)

it('lists two saved records newest first — mutation: reverse service comparator', async () => {
  const { service, store } = buildService()
  await store.create({
    id: 'old',
    title: 'Old',
    createdAt: '2026-09-01',
    providerId: 'claude',
  })
  await store.create({
    id: 'new',
    title: 'New',
    createdAt: '2026-09-07',
    providerId: 'claude',
  })
  await service.hydrate()
  expect(service.list().map((row) => row.id)).toEqual(['new', 'old'])
  await service.dispose()
})

it('records one restart notice and keeps old and fresh turns through replay — mutations: drop restarted fact or refuse it on replay', async () => {
  let forgotten = false
  const fresh = createStubDaemon()
  const { service, store } = buildService({
    fetchFn: async (input, init) => {
      if (forgotten && String(input).includes('/commands'))
        return new Response(JSON.stringify({ error: 'Session gone' }), {
          status: 404,
        })
      return (forgotten ? fresh : daemon).fetchFn(input, init)
    },
  })
  await service.start('first')
  daemon.emit(add(1, item({ id: 'answer', text: 'Earlier answer' })))
  daemon.emit(status(2, 'completed'))
  await waitUntil(
    () => service.snapshot(CONVERSATION_ID)?.status === 'idle',
    'old turn settled',
  )
  forgotten = true
  await service.send(CONVERSATION_ID, 'again')
  const expected =
    "The agent's earlier memory of this conversation is gone on the server; it starts again from here."
  const notice =
    service
      .snapshot(CONVERSATION_ID)
      ?.items.filter((row) => row.text === expected) ?? []
  // Capture the primary missing fact before any later await can obscure it.
  expect(notice).toHaveLength(1)
  fresh.emit(add(1, item({ id: 'answer', text: 'Fresh answer' })))
  fresh.emit(status(2, 'completed'))
  await waitUntil(
    () => service.snapshot(CONVERSATION_ID)?.status === 'idle',
    'fresh turn settled',
  )
  const texts = service.snapshot(CONVERSATION_ID)?.items.map((row) => row.text)
  expect(texts).toEqual(['Earlier answer', expected, 'Fresh answer'])
  await service.dispose()
  const replay = buildService({ store })
  await replay.service.hydrate()
  expect(
    replay.service.snapshot(CONVERSATION_ID)?.items.map((row) => row.text),
  ).toEqual(texts)
  expect(
    (await store.readLog(CONVERSATION_ID)).entries.filter(
      (entry) => entry.kind === 'local' && entry.fact === 'restarted',
    ),
  ).toHaveLength(1)
  await replay.service.dispose()
})

it('quit drains a refusal append already in flight — mutation: omit store drain', async () => {
  const { service, store } = buildService({
    fetchFn: async (input, init) =>
      String(input).includes('/commands')
        ? new Response(JSON.stringify({ error: 'refused' }), { status: 401 })
        : daemon.fetchFn(input, init),
  })
  await service.start('first')
  daemon.emit(status(1, 'completed'))
  await waitUntil(
    () => service.snapshot(CONVERSATION_ID)?.status === 'idle',
    'settled',
  )
  const held = deferred()
  appendGate.held = held.promise
  appendGate.entered = false
  try {
    const sending = service.send(CONVERSATION_ID, 'again')
    await waitUntil(() => appendGate.entered, 'refusal append entered')
    let stopped = false
    const stopping = service.dispose().then(() => {
      stopped = true
    })
    await new Promise((resolve) => setImmediate(resolve))
    const stoppedBeforeAppend = stopped
    held.release()
    await Promise.all([sending, stopping])
    expect(stoppedBeforeAppend).toBe(false)
    expect((await store.readLog(CONVERSATION_ID)).entries.at(-1)).toMatchObject(
      { fact: 'refused' },
    )
  } finally {
    held.release()
    appendGate.held = null
    await service.dispose()
  }
})
