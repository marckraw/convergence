import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createStubDaemon,
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
import type { ConversationSnapshot } from '../../../src/shared/studio-api/studio-api.types'
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

function buildService(over: { store?: JsonFileConversationStore } = {}) {
  const store = over.store ?? new JsonFileConversationStore(root)
  const client = new DaemonClient({
    baseUrl: 'https://daemon.test',
    token: 'tok-secret',
    fetchFn: daemon.fetchFn,
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
        updatedAt: '2026-09-02T09:00:01.000Z',
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
    const store = new JsonFileConversationStore(root)
    const failing = Object.assign(
      Object.create(
        JsonFileConversationStore.prototype,
      ) as JsonFileConversationStore,
      {
        list: () => store.list(),
        read: (id: string) => store.read(id),
        create: (value: Parameters<JsonFileConversationStore['create']>[0]) =>
          store.create(value),
        readLog: (id: string) => store.readLog(id),
        appendEnvelope: () => Promise.reject(new Error('disk is full')),
      },
    )

    const { service } = buildService({ store: failing })
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
