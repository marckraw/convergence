import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
    read: (id) => real.read(id),
    create: (value) => real.create(value),
    readLog: (id) => real.readLog(id),
    appendEntry: (id, entry) => {
      if (entry.kind !== 'wire' || refused >= refusals) {
        return real.appendEntry(id, entry)
      }
      refused += 1
      return Promise.reject(new Error('disk is full'))
    },
  }
}
