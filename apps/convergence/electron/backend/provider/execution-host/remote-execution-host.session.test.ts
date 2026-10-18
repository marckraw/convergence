import {
  executionHostRegistryFor,
  seedExecutionHostEndpoint,
  TEST_EXECUTION_HOST_ENDPOINT_ID,
} from '../../execution-host-endpoint/execution-host-endpoint.fixture'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import {
  closeDatabase,
  getDatabase,
  resetDatabase,
} from '../../database/database'
import { SessionService } from '../../session/session.service'
import { ProviderRegistry } from '../provider-registry'
import {
  createStubDaemon,
  DAEMON_HEALTH_FIXTURE_0_26_1,
  envelope,
  waitUntil,
  type StubDaemon,
} from '@convergence/execution-host-client'
import { LocalExecutionHost } from './local-execution-host'
import { RemoteExecutionHost } from './remote-execution-host'
import { EXECUTION_HOST_STOP_TASK_CAPABILITY } from './execution-host-wire-mapping.pure'
import type { HarnessEvidence } from '../../session/harness-evidence.types'
import type { ProviderExecutionHost } from './execution-host.types'
import type { SessionHandle } from '../provider.types'
import type { SessionDelta } from '../../session/conversation-item.types'
import type { ProviderDebugEntry } from '../../provider-debug/provider-debug.types'
import { TEST_REMOTE_WORK_ADDRESS } from '../../session/session-work-address.fixture'
import { parallelWorkStatus } from '../../../../src/shared/lib/parallel-work.pure'

/**
 * The real remote host, wrapped so a handle the service has released can still
 * be made to speak.
 *
 * The remote adapter goes silent when it is disposed -- that is its own
 * canary, in the adapter suite -- and the session service does not take that
 * on trust. This wrapper is a host that does keep talking: it swallows
 * `dispose()` and keeps every delta listener the service registered, so a test
 * can deliver an event through a handle that is no longer the session's.
 *
 * The wire underneath is unchanged; only the handle misbehaves.
 */
function createLingeringHandleHost(inner: RemoteExecutionHost): {
  host: ProviderExecutionHost
  emitFromHandle: (index: number, delta: SessionDelta) => void
} {
  const listeners: Array<Array<(delta: SessionDelta) => void>> = []

  const wrap = (handle: SessionHandle): SessionHandle => {
    const own: Array<(delta: SessionDelta) => void> = []
    listeners.push(own)
    return {
      ...handle,
      onDelta: (callback) => {
        own.push(callback)
        handle.onDelta(callback)
      },
      dispose: () => {},
    }
  }

  return {
    host: {
      capabilities: () => inner.capabilities(),
      capabilitiesFor: (providerId) => inner.capabilitiesFor(providerId),
      describe: () => inner.describe(),
      assertProviderRunnable: (providerId) =>
        inner.assertProviderRunnable(providerId),
      start: (providerId, config) => wrap(inner.start(providerId, config)),
      attach: (providerId, config, afterSeq, recordedAttention) =>
        wrap(inner.attach(providerId, config, afterSeq, recordedAttention)),
      oneShot: (providerId, input) => inner.oneShot(providerId, input),
    },
    emitFromHandle: (index, delta) => {
      for (const listener of listeners[index] ?? []) listener(delta)
    },
  }
}

/**
 * The seam MAR-2582 was lost in: a wire event arrives at the adapter and the
 * *session record* has to change because of it. The adapter tests prove what
 * `RemoteExecutionHost` emits; these prove what the session then holds, which
 * is the only claim that matters to a user — a remote session that can carry a
 * second turn.
 *
 * They run a real `SessionService` over a real database against a stub daemon,
 * because every cheaper arrangement would have passed on master: the deltas
 * existed, the callbacks fired, and the session still never left `running`.
 */
describe('remote wire events reaching the session record', () => {
  let db: Database.Database
  let stub: StubDaemon
  let service: SessionService
  let host: RemoteExecutionHost
  let tempDir: string
  let sessionId: string
  let cursorWrites: CursorWriteObservation[]
  /**
   * One entry per handle the service released. Releasing a handle is what a
   * settle *does*, so counting releases is how "this event ended a run" is
   * observed without reaching inside the service.
   */
  let releases: string[]
  /**
   * What the session row held at the instant the settle released the handle.
   *
   * The settle does three things in one beat -- writes the row, queues the
   * `SessionSettled` event relays trigger on, and releases the handle -- so
   * this is the observer that runs *inside* the settle. It is the only place
   * that can tell one write from two: a status and an attention written
   * separately are both present by the end of the turn either way, and differ
   * only in whether anything could observe the gap between them.
   */
  let releaseObservations: Array<{ status: string; attention: string }>
  /**
   * Every traced wire line. The remote adapter drops events on purpose and
   * names each drop, so this is where "the daemon said something we ignored"
   * is distinguishable from "the daemon never said it".
   */
  let debugEntries: ProviderDebugEntry[]

  const PROJECT_ID = 'remote-wire-project'

  /**
   * What the session row held at the instant the adapter asked for the stream
   * cursor to be persisted — the gap between the two writes MAR-2582 fell
   * into. Reading the row from inside that callback is the only place the
   * question "were these two ever apart?" can be answered; a test that reads
   * the final state cannot tell an atomic write from an eventually-consistent
   * pair.
   */
  interface CursorWriteObservation {
    seq: number
    status: string
    lastSeq: number
    settledSeq: number
  }

  function readRow(): {
    status: string
    execution_host_last_seq: number
    execution_host_settled_seq: number
  } {
    return db
      .prepare(
        'SELECT status, execution_host_last_seq, execution_host_settled_seq FROM sessions WHERE id = ?',
      )
      .get(sessionId) as {
      status: string
      execution_host_last_seq: number
      execution_host_settled_seq: number
    }
  }

  async function createRemoteSession(): Promise<string> {
    const id = service.create({
      projectId: PROJECT_ID,
      workspaceId: null,
      providerId: 'claude-code',
      model: 'sonnet',
      effort: null,
      name: 'remote session',
      executionHost: TEST_EXECUTION_HOST_ENDPOINT_ID,
      workAddress: TEST_REMOTE_WORK_ADDRESS,
    }).id
    return id
  }

  /** One assistant reply, as the daemon streams it: a wire conversation item. */
  function assistantMessage(
    seq: number,
    text: string,
  ): ReturnType<typeof envelope> {
    return envelope(
      seq,
      {
        kind: 'delta',
        delta: {
          kind: 'conversation.item.add',
          item: {
            id: `assistant-${seq}`,
            kind: 'message',
            actor: 'assistant',
            text,
            state: 'complete',
            createdAt: '2026-08-23T10:00:00.000Z',
            updatedAt: '2026-08-23T10:00:00.000Z',
            providerMeta: {
              providerId: 'claude',
              providerItemId: null,
              providerEventType: 'message',
            },
          },
        },
      },
      sessionId,
    )
  }

  function noteTexts(): string[] {
    return service
      .getConversation(sessionId)
      .filter(
        (item): item is Extract<typeof item, { kind: 'note' }> =>
          item.kind === 'note',
      )
      .map((item) => item.text)
  }

  function assistantTexts(): string[] {
    return service
      .getConversation(sessionId)
      .filter(
        (item): item is Extract<typeof item, { kind: 'message' }> =>
          item.kind === 'message' && item.actor === 'assistant',
      )
      .map((item) => item.text)
  }

  beforeEach(async () => {
    db = getDatabase()
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-remote-wire-'))
    const repoPath = join(tempDir, 'repo')
    mkdirSync(repoPath)
    mkdirSync(join(repoPath, '.git'))
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES (?, 'remote', ?)",
    ).run(PROJECT_ID, repoPath)
    seedExecutionHostEndpoint(db)

    stub = createStubDaemon()
    cursorWrites = []
    releases = []
    releaseObservations = []
    debugEntries = []
    service = new SessionService(
      db,
      new LocalExecutionHost(new ProviderRegistry()),
      join(tempDir, 'global-sessions'),
    )
    host = new RemoteExecutionHost({
      connection: {
        resolveConnection: async () => ({
          baseUrl: 'http://daemon.test',
          token: 'test-token',
        }),
      },
      fetch: stub.fetchFn,
      reconnect: {
        maxAttempts: 2,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
      },
      onEventSeq: (id, seq) => {
        const row = readRow()
        cursorWrites.push({
          seq,
          status: row.status,
          lastSeq: row.execution_host_last_seq,
          settledSeq: row.execution_host_settled_seq,
        })
        service.recordRemoteEventSeq(id, seq)
      },
      debugSink: { record: (entry) => debugEntries.push(entry) },
    })
    await host.refreshProviders()
    service.setRemoteExecutionHosts(
      executionHostRegistryFor({
        [TEST_EXECUTION_HOST_ENDPOINT_ID]: host,
      }),
    )
    service.setRemoteWorkspaceSourceResolver(() => ({
      repository: 'git@github.com:acme/repo.git',
    }))

    service.setSessionTerminatedListener((id) => {
      releases.push(id)
      releaseObservations.push(
        db
          .prepare('SELECT status, attention FROM sessions WHERE id = ?')
          .get(id) as { status: string; attention: string },
      )
    })

    sessionId = await createRemoteSession()
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('stores the continuation token a wire continuation-token event carries', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )

    expect(service.getById(sessionId)?.continuationToken).toBeNull()

    stub.emit(
      envelope(1, { kind: 'continuation-token', token: 'resume-1' }, sessionId),
    )

    await waitUntil(
      () => service.getById(sessionId)?.continuationToken === 'resume-1',
      'the continuation token to be stored',
    )
  })

  /**
   * The same vestigial-callback loss MAR-2582 found for `status` and
   * `continuation-token`, one event later: the adapter forwarded wire
   * `attention` to `attentionListeners`, and nothing in Convergence subscribes
   * to those. So a remote session's attention never reached the record and it
   * sat at `'none'` for its whole life -- a remote turn could never report
   * that it had finished, or that it was blocked on Marcin (MAR-2590).
   *
   * Asserted on the session record, not on the callback, because the callback
   * fired on master too and the record still never moved.
   */
  it('records the attention a wire attention event carries', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )

    expect(service.getById(sessionId)?.attention).toBe('none')

    stub.emit(
      envelope(1, { kind: 'attention', attention: 'finished' }, sessionId),
    )

    await waitUntil(
      () => service.getById(sessionId)?.attention === 'finished',
      'the attention to reach the session record',
    )
  })

  /**
   * The attention a human has to act on is the one that matters most, and it
   * arrives mid-turn: the run is still `running` when the agent asks. Pinned
   * separately from `finished` because a bridge that only survived terminal
   * attention would still lose every approval prompt.
   */
  it('records a mid-turn approval request without ending the turn', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )

    stub.emit(envelope(1, { kind: 'status', status: 'running' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'running',
      'the turn to report running',
    )

    stub.emit(
      envelope(
        2,
        { kind: 'attention', attention: 'needs-approval' },
        sessionId,
      ),
    )
    await waitUntil(
      () => service.getById(sessionId)?.attention === 'needs-approval',
      'the approval request to reach the session record',
    )

    // Attention is not a settle. The turn is still the daemon's, and the
    // handle that is carrying it must still be the session's.
    expect(service.getById(sessionId)?.status).toBe('running')
    expect(releases).toEqual([])
  })

  it('moves the session out of running when a wire status event completes the turn', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )

    stub.emit(envelope(1, { kind: 'status', status: 'running' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'running',
      'the session to report running',
    )

    stub.emit(envelope(2, { kind: 'status', status: 'completed' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the session to leave running',
    )
    // The spinner Marcin watched never stop is this field: an activity that
    // outlives the turn keeps the header alive even once the answer has landed.
    expect(service.getById(sessionId)?.activity).toBeNull()
  })

  /**
   * The daemon's real settle, in the order the daemon sends it:
   * `running` -> `continuation-token` -> `completed` -> `attention: finished`.
   *
   * That order is the whole defect and it is not reorderable for convenience.
   * The token arriving before the settle is what makes the settle release the
   * handle (`session.service.ts:2214-2219`), and a released handle is exactly
   * what the trailing `finished` frame then arrives too late to reach. So the
   * daemon does announce that the turn finished, and on master the session
   * record never heard it: a completed remote session showed no outcome at all
   * (MAR-2590).
   *
   * The fix is not to let that frame through -- a post-disposal frame
   * overwriting the attention of the run that replaced it is the class
   * MAR-2582 closed. It is that a terminal status and its attention are one
   * fact and are written together, exactly as the local path has always
   * written them (`claude-code-provider.ts:1071-1072`).
   */
  it('leaves a completed remote turn reporting finished, in the daemon order', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )

    stub.emitBatch([
      envelope(1, { kind: 'status', status: 'running' }, sessionId),
      envelope(2, { kind: 'continuation-token', token: 'resume-1' }, sessionId),
      envelope(3, { kind: 'status', status: 'completed' }, sessionId),
      envelope(4, { kind: 'attention', attention: 'finished' }, sessionId),
    ])

    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the turn to settle',
    )

    // Both halves of the settle, on the row a human reads.
    expect(service.getById(sessionId)?.status).toBe('completed')
    expect(service.getById(sessionId)?.attention).toBe('finished')
    // And together, not merely both eventually: the observer that runs inside
    // the settle already sees the pair. Two writes would leave a window here
    // in which the session is on disk as finished work with nothing to report,
    // and the settle event relays fire on is queued inside that window.
    expect(releaseObservations).toEqual([
      { status: 'completed', attention: 'finished' },
    ])
  })

  /**
   * The other terminal status, pinned separately because it maps to a
   * different attention: `failed` -> `failed`, the pairing the service already
   * applies when it settles an approval nobody is left to answer
   * (`session.service.ts:1362-1368`). A fix that only paired `completed` would
   * leave every failed remote turn silently blank.
   */
  it('leaves a failed remote turn reporting failed', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )

    stub.emit(envelope(1, { kind: 'status', status: 'running' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'running',
      'the turn to report running',
    )

    stub.emit(envelope(2, { kind: 'status', status: 'failed' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'failed',
      'the turn to settle failed',
    )

    expect(service.getById(sessionId)?.attention).toBe('failed')
  })

  /**
   * What the daemon's now-redundant `finished` frame costs: nothing.
   *
   * This is the frame in Marcin's MAR-2590 QA capture, traced as
   * "dropped: the run is disposed - 133 bytes" -- the debug facility recorded
   * the bug before the review found it. It still arrives, it is still dropped
   * by the guard that keeps a released handle from speaking over its
   * successor, and now it carries a value the row already holds, so the drop
   * loses nothing.
   *
   * Asserted on the trace, not on the value: a row that reads `finished`
   * cannot by itself tell "the frame was dropped" from "the frame was
   * applied and happened to agree". The trace is what says which.
   */
  it('drops the daemon trailing finished frame without error and without moving the row', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )

    stub.emitBatch([
      envelope(1, { kind: 'status', status: 'running' }, sessionId),
      envelope(2, { kind: 'continuation-token', token: 'resume-1' }, sessionId),
      envelope(3, { kind: 'status', status: 'completed' }, sessionId),
      envelope(4, { kind: 'attention', attention: 'finished' }, sessionId),
    ])

    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the turn to settle',
    )
    await waitUntil(
      () =>
        debugEntries.some(
          (entry) => entry.note === 'dropped: the run is disposed',
        ),
      'the trailing attention frame to be dropped and named',
    )

    const settled = service.getById(sessionId)
    // The drop moved nothing: the settle already wrote both halves.
    expect(settled?.status).toBe('completed')
    expect(settled?.attention).toBe('finished')
    // It is not an error, and a human is told nothing about it.
    expect(noteTexts()).toEqual([])
    // And it did not end a second thing: one settle, one released handle.
    expect(releases).toEqual([sessionId])
  })

  /**
   * The settle's other encoding, in the same real order.
   *
   * A `session.patch` carrying a terminal status ends the turn exactly as the
   * dedicated `status` event does -- `SessionService.applyDelta` runs the same
   * lifecycle for both, and the service's own docblock names them the two
   * supported encodings (`session.service.ts`, `isReplayedHostSettle`). So a
   * pairing that lived only on the dedicated bridge left this encoding
   * settling the row into `completed` with nothing to report: the exact defect
   * MAR-2590 closed for its twin, still open one branch away.
   *
   * Everything around the settle is the captured daemon order -- `running`,
   * the continuation token that makes the settle release the handle, then the
   * trailing `attention` frame that arrives too late to reach a released
   * handle. Only the settle's own encoding differs, because that is the one
   * thing under test. Daemon 0.26.1 writes a settle as the dedicated pair and
   * puts only `prUrl`/`roomId` in a session patch
   * (`execution-session-manager.ts:1150,2045`); the patch encoding is the wire
   * shape it and every other host is free to send, and the one Convergence
   * already treats as a settle.
   */
  it('leaves a completed remote turn reporting finished when the settle arrives as a session patch', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )

    stub.emitBatch([
      envelope(1, { kind: 'status', status: 'running' }, sessionId),
      envelope(2, { kind: 'continuation-token', token: 'resume-1' }, sessionId),
      envelope(
        3,
        {
          kind: 'delta',
          delta: { kind: 'session.patch', patch: { status: 'completed' } },
        },
        sessionId,
      ),
      envelope(4, { kind: 'attention', attention: 'finished' }, sessionId),
    ])

    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the turn to settle',
    )

    // Both halves, on the row a human reads.
    expect(service.getById(sessionId)?.status).toBe('completed')
    expect(service.getById(sessionId)?.attention).toBe('finished')
    // And together: the observer that runs inside the settle already sees the
    // pair, so no window exists in which this session is finished work with
    // nothing to show for it.
    expect(releaseObservations).toEqual([
      { status: 'completed', attention: 'finished' },
    ])
  })

  /**
   * The half the pairing must never take: an attention the host stated itself.
   *
   * The wire models `status` and `attention` on one patch precisely so a host
   * can say both, and a host is the authority on what its own run needs. A
   * derivation that overwrote an explicit value would turn a run still waiting
   * on a human into one reporting `finished` -- a worse lie than the silence
   * MAR-2590 started from, because it points away from the session that needs
   * something.
   */
  it('keeps the attention a settling session patch states for itself', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )

    stub.emitBatch([
      envelope(1, { kind: 'status', status: 'running' }, sessionId),
      envelope(
        2,
        {
          kind: 'delta',
          delta: {
            kind: 'session.patch',
            patch: { status: 'completed', attention: 'needs-input' },
          },
        },
        sessionId,
      ),
    ])

    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the turn to settle',
    )

    expect(service.getById(sessionId)?.attention).toBe('needs-input')
  })

  /**
   * The shape of a remote conversation: one start, then a command per turn.
   * A second start for the same session id is refused by the daemon with 409
   * `Session already exists` (`execution-session-manager.ts:436-438`), and
   * Emergence — the working client for this daemon — has no second start
   * anywhere: every follow-up is a `send-message` on the session it already
   * has (`execution-client.service.ts:411-425`).
   */
  it('carries a second turn as a command on the run the daemon already has', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )

    stub.emit(envelope(1, { kind: 'status', status: 'running' }, sessionId))
    stub.emit(
      envelope(2, { kind: 'continuation-token', token: 'resume-1' }, sessionId),
    )
    stub.emit(envelope(3, { kind: 'status', status: 'completed' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the first turn to settle',
    )

    // On master this threw `Session cannot be resumed: missing continuation
    // state. Start a new session.` — the whole defect, in one call.
    await service.sendMessage(sessionId, { text: 'second' })

    await waitUntil(
      () => stub.commandRequests.length === 1,
      'the second turn to reach the daemon as a command',
    )
    expect(stub.startRequests).toHaveLength(1)
    expect(stub.commandRequests[0]).toMatchObject({
      sessionId,
      envelope: {
        sessionId,
        command: { kind: 'send-message', text: 'second' },
      },
    })

    // Reattached from where the first turn left off, so the daemon's replay
    // cannot repeat what the transcript already holds.
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 2,
      'the stream to reopen for the second turn',
    )
    expect(stub.eventStreamLastEventIds[1]).toBe('3')

    // Dispatched is not answered. The turn only happened if the reply came
    // back over the wire and reached the session record.
    stub.emit(envelope(4, { kind: 'status', status: 'running' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'running',
      'the second turn to report running',
    )
    stub.emit(assistantMessage(5, 'the second answer'))
    stub.emit(envelope(6, { kind: 'status', status: 'completed' }, sessionId))

    await waitUntil(
      () => assistantTexts().includes('the second answer'),
      "the second turn's answer to reach the session",
    )
    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the second turn to settle',
    )
  })

  /**
   * The other way a turn reaches a remote session with no live handle: it was
   * written while the previous turn was still running, so Convergence held it
   * and dispatched it at the settle — by which point the handle has been
   * released. Same wire shape, a different caller, and it went through the
   * same second start before this fix.
   */
  it('carries a queued follow-up on the same run once the turn it waited on settles', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )

    stub.emit(envelope(1, { kind: 'status', status: 'running' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'running',
      'the first turn to report running',
    )

    await service.sendMessage(sessionId, { text: 'queued' })
    expect(stub.commandRequests).toHaveLength(0)

    stub.emit(
      envelope(2, { kind: 'continuation-token', token: 'resume-1' }, sessionId),
    )
    stub.emit(envelope(3, { kind: 'status', status: 'completed' }, sessionId))

    await waitUntil(
      () => stub.commandRequests.length === 1,
      'the queued follow-up to reach the daemon as a command',
    )
    expect(stub.startRequests).toHaveLength(1)
    expect(stub.commandRequests[0]).toMatchObject({
      sessionId,
      envelope: { command: { kind: 'send-message', text: 'queued' } },
    })
  })

  /**
   * A fix that only works on first start is half a fix. A reattached run is
   * the one a user cannot see failing: the transcript is still on screen after
   * a restart whatever the daemon does, so the only honest evidence is that a
   * session reattached mid-run still settles and still stores its token.
   */
  it('settles and stores a token through a handle obtained by reattach', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first event stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'running',
      'the session to report running',
    )

    // The restart: a second service over the same database reattaches every
    // remote session still marked running the moment the host is wired.
    const revived = new SessionService(
      db,
      new LocalExecutionHost(new ProviderRegistry()),
      join(tempDir, 'global-sessions'),
    )
    revived.setRemoteExecutionHosts(
      executionHostRegistryFor({
        [TEST_EXECUTION_HOST_ENDPOINT_ID]: host,
      }),
    )
    revived.setRemoteWorkspaceSourceResolver(() => ({
      repository: 'git@github.com:acme/repo.git',
    }))
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 2,
      'the reattached stream to open',
    )
    expect(stub.eventStreamLastEventIds[1]).toBe('1')
    expect(stub.startRequests).toHaveLength(1)

    stub.emit(
      envelope(2, { kind: 'continuation-token', token: 'resume-2' }, sessionId),
    )
    stub.emit(envelope(3, { kind: 'status', status: 'completed' }, sessionId))

    await waitUntil(
      () => revived.getById(sessionId)?.status === 'completed',
      'the reattached session to settle',
    )
    expect(revived.getById(sessionId)?.continuationToken).toBe('resume-2')
  })

  /**
   * The settle and the cursor are one write (MAR-2582).
   *
   * They used to be two: the status patch committed, and the sequence that
   * produced it was persisted afterwards by a separate statement. An
   * interruption in the gap left a session recorded as settled with a cursor
   * pointing at the event *before* the settle — and the record cannot tell,
   * later, that it is missing anything.
   *
   * Pinned at the gap rather than at the outcome. Both orderings agree on the
   * final row, so a test that reads the row at the end passes either way; the
   * only moment that distinguishes them is the instant between the two writes,
   * which is where the adapter's cursor callback runs.
   */
  it('has already committed the cursor when the settle reaches the cursor write', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )

    stub.emit(envelope(1, { kind: 'status', status: 'running' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'running',
      'the session to report running',
    )
    stub.emit(envelope(2, { kind: 'status', status: 'completed' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the session to leave running',
    )

    const atTheGap = cursorWrites.find((write) => write.seq === 2)
    expect(atTheGap).toBeDefined()
    // Interrupt here and the row is still consistent: it says settled, it says
    // which sequence settled it, and its cursor is not behind either of them.
    expect(atTheGap).toEqual({
      seq: 2,
      status: 'completed',
      lastSeq: 2,
      settledSeq: 2,
    })
  })

  /**
   * The settle marker records a settle, not whatever the last event said
   * (MAR-2582, ea696c33).
   *
   * A remote session keeps taking events after it comes to rest -- the
   * continuation token often lands last -- and every one of them advances the
   * stream cursor. If the marker followed the cursor it would climb above the
   * settle it is supposed to name, and the next stream resume would hand back
   * a terminal event sitting below a marker that had never seen it.
   *
   * The row invariant is `0 < settled_seq <= last_seq`, never equality: the
   * two are equal only until something arrives after the settle.
   */
  it('leaves the settle marker where the settle was when a later event carries no status', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )

    stub.emit(envelope(1, { kind: 'status', status: 'running' }, sessionId))
    stub.emit(envelope(2, { kind: 'status', status: 'completed' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the turn to settle',
    )
    expect(readRow()).toMatchObject({
      execution_host_last_seq: 2,
      execution_host_settled_seq: 2,
    })

    // The token the daemon reports after the turn has already come to rest.
    stub.emit(
      envelope(3, { kind: 'continuation-token', token: 'resume-1' }, sessionId),
    )
    await waitUntil(
      () => service.getById(sessionId)?.continuationToken === 'resume-1',
      'the token to be stored',
    )

    const row = readRow()
    expect(row.execution_host_settled_seq).toBe(2)
    expect(row.execution_host_last_seq).toBe(3)
    expect(row.execution_host_settled_seq).toBeGreaterThan(0)
    expect(row.execution_host_settled_seq).toBeLessThanOrEqual(
      row.execution_host_last_seq,
    )
  })

  /**
   * A settle ends the run of the handle that began it, and of no other
   * (MAR-2582).
   *
   * This is the row the migration leaves behind, built to the shape the
   * migration actually produces: the backfill sets
   * `settled_seq = last_seq`, and for a session whose cursor write was lost in
   * the gap between the status and the cursor, that cursor points at the event
   * *before* the settle. So both columns hold N-1 and the settle at N sits
   * above the marker -- "later sequence" is indistinguishable from "new
   * event", and the marker cannot save this row. Nothing can heal it after the
   * fact either; the only thing that helps is that the handle carrying turn 2
   * did not begin the run that settle came from.
   */
  it('does not let the settle a migrated row never marked end the turn that follows it', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )

    stub.emit(envelope(1, { kind: 'status', status: 'running' }, sessionId))
    stub.emit(
      envelope(2, { kind: 'continuation-token', token: 'resume-1' }, sessionId),
    )
    stub.emit(envelope(3, { kind: 'status', status: 'completed' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the first turn to settle',
    )
    expect(releases).toEqual([sessionId])

    // The migrated row: terminal status, cursor one short of its own settle,
    // marker backfilled to match the cursor
    // (`database.ts`, `ensureSessionSettledSeqColumn`).
    db.prepare(
      `UPDATE sessions
          SET execution_host_last_seq = 2,
              execution_host_settled_seq = 2
        WHERE id = ?`,
    ).run(sessionId)

    await service.sendMessage(sessionId, { text: 'second' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 2,
      'the stream to reopen for the second turn',
    )
    // Resumed from the stale cursor, so the daemon replays the settle above
    // the marker -- the test is worthless unless it does.
    expect(stub.eventStreamLastEventIds[1]).toBe('2')
    await waitUntil(
      () => cursorWrites.filter((write) => write.seq === 3).length === 2,
      'the daemon to replay the settle',
    )
    await waitUntil(
      () => stub.commandRequests.length === 1,
      'the second turn to reach the daemon as a command',
    )

    // The new handle survived the replay: the turn it carries reports running,
    // answers, and settles, none of which can reach a released handle.
    stub.emit(envelope(4, { kind: 'status', status: 'running' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'running',
      'the second turn to report running',
    )
    stub.emit(assistantMessage(5, 'the second answer'))
    stub.emit(envelope(6, { kind: 'status', status: 'completed' }, sessionId))
    await waitUntil(
      () => assistantTexts().includes('the second answer'),
      "the second turn's answer to reach the session",
    )
    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the second turn to settle',
    )

    // One start for the session's whole life, one stream per turn, and one
    // release per turn. A handle released by the replay would have shown up as
    // a third stream and a third release.
    expect(stub.startRequests).toHaveLength(1)
    expect(stub.eventStreamLastEventIds).toHaveLength(2)
    expect(releases).toEqual([sessionId, sessionId])
    expect(readRow().execution_host_settled_seq).toBe(6)
  })

  /**
   * One settle, both encodings, one release (MAR-2582).
   *
   * The daemon can report the same turn ending twice over: once as a dedicated
   * `status` event and once as a `session.patch` delta carrying the status.
   * The duplicate lands at a *higher* sequence than the settle it repeats,
   * which is exactly what a genuinely new settle looks like -- so no sequence
   * marker can tell them apart, and this row's marker is not even stale.
   *
   * Here the duplicate reaches the app the way it actually would: the first
   * encoding released the handle, so the second sat unread in the daemon's log
   * until the next turn's stream resumed over it.
   */
  it('does not let a settle repeated in its other encoding end the turn that follows it', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )

    stub.emit(envelope(1, { kind: 'status', status: 'running' }, sessionId))
    stub.emit(
      envelope(2, { kind: 'continuation-token', token: 'resume-1' }, sessionId),
    )
    stub.emit(envelope(3, { kind: 'status', status: 'completed' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the first turn to settle',
    )
    expect(releases).toEqual([sessionId])

    // The same settle, said again the other way, after the handle that would
    // have heard it is gone.
    stub.emit(
      envelope(
        4,
        {
          kind: 'delta',
          delta: { kind: 'session.patch', patch: { status: 'completed' } },
        },
        sessionId,
      ),
    )
    // Nothing local moved: the record's marker still names sequence 3, which
    // is why the marker cannot recognise the duplicate when it is replayed.
    expect(readRow()).toMatchObject({
      execution_host_last_seq: 3,
      execution_host_settled_seq: 3,
    })

    await service.sendMessage(sessionId, { text: 'second' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 2,
      'the stream to reopen for the second turn',
    )
    expect(stub.eventStreamLastEventIds[1]).toBe('3')
    await waitUntil(
      () => cursorWrites.some((write) => write.seq === 4),
      'the daemon to replay the duplicate settle',
    )

    stub.emit(envelope(5, { kind: 'status', status: 'running' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'running',
      'the second turn to report running',
    )
    stub.emit(assistantMessage(6, 'the second answer'))
    stub.emit(envelope(7, { kind: 'status', status: 'completed' }, sessionId))
    await waitUntil(
      () => assistantTexts().includes('the second answer'),
      "the second turn's answer to reach the session",
    )
    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the second turn to settle',
    )

    expect(stub.startRequests).toHaveLength(1)
    expect(stub.eventStreamLastEventIds).toHaveLength(2)
    expect(releases).toEqual([sessionId, sessionId])
  })

  /**
   * A settle ends the run of the handle it came from, and a released handle
   * has no run left to end (MAR-2582).
   *
   * The other half of the same rule as the two tests above: there, a live
   * handle was handed someone else's settle; here, a handle the service has
   * already let go of reports one of its own. Its sequence is far above the
   * marker -- a released handle can say anything -- so nothing but the
   * attribution stops it from releasing the handle now carrying the session.
   */
  it('lets a released handle report a settle without ending the run that replaced it', async () => {
    const lingering = createLingeringHandleHost(host)
    service.setRemoteExecutionHosts(
      executionHostRegistryFor({
        [TEST_EXECUTION_HOST_ENDPOINT_ID]: lingering.host,
      }),
    )

    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }, sessionId))
    stub.emit(
      envelope(2, { kind: 'continuation-token', token: 'resume-1' }, sessionId),
    )
    stub.emit(envelope(3, { kind: 'status', status: 'completed' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the first turn to settle',
    )
    expect(releases).toEqual([sessionId])

    await service.sendMessage(sessionId, { text: 'second' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 2,
      'the stream to reopen for the second turn',
    )
    stub.emit(envelope(4, { kind: 'status', status: 'running' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'running',
      'the second turn to report running',
    )

    // The released handle, speaking out of turn.
    lingering.emitFromHandle(0, {
      kind: 'session.patch',
      patch: { status: 'completed' },
      executionHostSeq: 99,
    })

    // The turn it did not begin is still running on the handle that did.
    expect(releases).toEqual([sessionId])
    stub.emit(assistantMessage(5, 'the second answer'))
    stub.emit(envelope(6, { kind: 'status', status: 'completed' }, sessionId))
    await waitUntil(
      () => assistantTexts().includes('the second answer'),
      "the second turn's answer to reach the session",
    )
    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the second turn to settle',
    )
    expect(releases).toEqual([sessionId, sessionId])
  })

  /**
   * An attach that fails is a run ending, and it ends on the handle that
   * failed (MAR-2582).
   *
   * The rule above suppresses a terminal event a handle inherited from the run
   * it joined. A transport failure is not inherited: the adapter raises it
   * about this handle, and it carries no wire sequence because it never came
   * off the wire. Read as an inherited settle it was swallowed, and the dead
   * handle stayed installed as the session's active one -- the record said
   * failed while every later message went into a run that could not carry it
   * and vanished without a turn, a note, or an error.
   */
  it('releases the handle an attach failed on, so the next message is not swallowed', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }, sessionId))
    stub.emit(
      envelope(2, { kind: 'continuation-token', token: 'resume-1' }, sessionId),
    )
    stub.emit(envelope(3, { kind: 'status', status: 'completed' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'completed',
      'the first turn to settle',
    )
    expect(releases).toEqual([sessionId])

    // The daemon refuses the stream the next turn attaches with, so the run
    // dies before it ever reports itself running.
    stub.setEventsStatus(404)
    await service.sendMessage(sessionId, { text: 'second' })
    await waitUntil(
      () => service.getById(sessionId)?.status === 'failed',
      'the failed attach to reach the session record',
    )
    expect(
      noteTexts().some((text) =>
        text.includes('Remote session event stream is unavailable'),
      ),
    ).toBe(true)

    // The invariant: the handle that failed is the handle that was released.
    await waitUntil(
      () => releases.length === 2,
      'the handle the attach failed on to be released',
    )

    // And so the session has nothing left to swallow the next message: it
    // reaches the daemon on a stream of its own.
    stub.setEventsStatus(200)
    const streamsBefore = stub.eventStreamLastEventIds.length
    await service.sendMessage(sessionId, { text: 'third' })
    await waitUntil(
      () => stub.commandRequests.length === 2,
      'the next turn to reach the daemon as a command',
    )
    await waitUntil(
      () => stub.eventStreamLastEventIds.length > streamsBefore,
      'the stream to reopen for the next turn',
    )
    stub.emit(envelope(4, { kind: 'status', status: 'running' }, sessionId))
    await waitUntil(
      () => service.getById(sessionId)?.status === 'running',
      'the next turn to report running',
    )
    expect(stub.startRequests).toHaveLength(1)
  })
  // -- MAR-3023: an accepted turn is never a failed send when its recording fails --

  /**
   * Door (3)'s happy path, beside its refusal case (MAR-3023 lap 3, K): with
   * a record that takes writes, a refused command still surfaces -- the note
   * and `attention: 'failed'` land.
   */
  it('MAR-3023 door (3): a refused remote command surfaces its note and failed attention when the record takes writes', async () => {
    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )
    stub.setCommandStatus(500)

    await service.sendMessage(sessionId, {
      text: 'mid-run turn the daemon refuses',
    })

    await waitUntil(
      () => service.getById(sessionId)?.attention === 'failed',
      'attention to surface',
    )
    expect(
      service
        .getConversation(sessionId)
        .some(
          (item) =>
            item.kind === 'note' &&
            item.text.startsWith('Remote session command was not delivered'),
        ),
    ).toBe(true)
  })

  /**
   * Door (3), remote — proven at the delivery-failure path, per the ticket's
   * STOP ruling: the daemon's 2xx for a posted command is invisible to the door
   * (`enqueueCommand` is fire-and-forget, remote-execution-host.ts).
   *
   * Here the daemon refuses the command AND the local record refuses both
   * writes of the report — the note and the attention change (E). The report
   * must throw nowhere (it runs under a `void`, so a throw is an unhandled
   * rejection), and it must not claim the message was sent: the command was
   * refused, so the boundary's "do not resend" note would talk the user out of
   * the one retry that is right (the rule of A — the witness of acceptance is
   * the far side's answer, and here it said no).
   */
  it('MAR-3023 door (3), E: a refused remote command whose report cannot be recorded throws nowhere and claims no delivery', async () => {
    const failures: import('../../session/session.types').AcceptedRecordingFailureEvent[] =
      []
    service.onAcceptedRecordingFailure((event) => failures.push(event))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rejections: unknown[] = []
    const onRejection = (reason: unknown) => rejections.push(reason)
    process.on('unhandledRejection', onRejection)

    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )
    db.exec(`CREATE TEMP TRIGGER refuse_undelivered_note
    BEFORE INSERT ON session_conversation_items
    WHEN NEW.kind = 'note'
         AND json_extract(NEW.payload_json, '$.text') LIKE 'Remote session command was not delivered%'
    BEGIN SELECT RAISE(ABORT, 'fixture remote note refused'); END`)
    db.exec(`CREATE TEMP TRIGGER refuse_failed_attention
    BEFORE UPDATE ON sessions
    WHEN NEW.attention = 'failed' AND OLD.attention IS NOT 'failed'
    BEGIN SELECT RAISE(ABORT, 'fixture attention refused'); END`)
    stub.setCommandStatus(500)

    const dispatchId = await service.sendMessage(sessionId, {
      text: 'mid-run turn the daemon refuses',
    })
    expect(dispatchId).toBeTypeOf('string')

    // Both writes of the report were attempted and logged, in order — the
    // attention write is reached only if the note's refusal did not escape.
    const reported = (label: string) =>
      errors.mock.calls.some((call) =>
        String(call[0]).includes(`${label} could not be recorded either`),
      )
    await waitUntil(
      () => reported('the undelivered-command attention'),
      'the attention write to be refused and logged',
    )
    expect(reported('the undelivered-command note')).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(rejections).toEqual([])
    process.off('unhandledRejection', onRejection)

    // The command went out exactly once: nothing re-sent it.
    expect(
      debugEntries.filter(
        (entry) => entry.direction === 'out' && entry.method === 'send-message',
      ),
    ).toHaveLength(1)
    // And nothing says it was delivered: no accepted-turn fact, no note.
    expect(failures).toEqual([])
    expect(
      service
        .getConversation(sessionId)
        .filter(
          (item) =>
            item.kind === 'note' &&
            item.providerMeta.providerEventType === 'recording-failed',
        ),
    ).toEqual([])
    expect(service.getById(sessionId)?.status).not.toBe('failed')
    errors.mockRestore()
  })

  describe('a resident session on protocol 0.23 (MAR-3987)', () => {
    function turnAdd(
      seq: number,
      sequence: number,
      origin: 'user' | 'harness',
    ): ReturnType<typeof envelope> {
      return envelope(
        seq,
        {
          kind: 'delta',
          delta: {
            kind: 'turn.add',
            turn: {
              id: `turn-${sequence}`,
              sessionId,
              sequence,
              startedAt: '2026-10-13T10:00:00.000Z',
              endedAt: null,
              status: 'running',
              summary: null,
              origin,
            },
          },
        },
        sessionId,
      )
    }

    function turnCompleted(
      seq: number,
      sequence: number,
    ): ReturnType<typeof envelope> {
      return envelope(
        seq,
        {
          kind: 'delta',
          delta: {
            kind: 'turn.patch',
            turnId: `turn-${sequence}`,
            patch: { status: 'completed', endedAt: '2026-10-13T10:01:00.000Z' },
          },
        },
        sessionId,
      )
    }

    function sessionPatch(
      seq: number,
      patch: {
        status?: 'answered' | 'completed'
        attention?: 'none'
        runningTasks?: number
      },
    ): ReturnType<typeof envelope> {
      return envelope(
        seq,
        { kind: 'delta', delta: { kind: 'session.patch', patch } },
        sessionId,
      )
    }

    function summary() {
      const found = service.getSummaryById(sessionId)
      if (!found) throw new Error('the session summary is gone')
      return found
    }

    function answerWindowStart(): number {
      return (
        db
          .prepare(
            'SELECT answer_window_start_sequence AS start FROM sessions WHERE id = ?',
          )
          .get(sessionId) as { start: number }
      ).start
    }

    /** The user's turn, answered while one task still runs. */
    async function answerWithATaskRunning(): Promise<void> {
      await service.start(sessionId, { text: 'build it' })
      await waitUntil(
        () => stub.eventStreamLastEventIds.length === 1,
        'the event stream to open',
      )
      stub.emit(turnAdd(1, 1, 'user'))
      stub.emit(envelope(2, { kind: 'status', status: 'running' }, sessionId))
      stub.emit(assistantMessage(3, 'The build runs in the background.'))
      stub.emit(sessionPatch(4, { runningTasks: 1 }))
      stub.emit(
        sessionPatch(5, {
          status: 'answered',
          attention: 'none',
          runningTasks: 1,
        }),
      )
      await waitUntil(
        () => service.getById(sessionId)?.status === 'answered',
        'the session to read answered',
      )
    }

    it("reads agents-daemon #187's timeline: running, answered with its task, the harness turn, the real settle", async () => {
      await answerWithATaskRunning()

      // Answered, as a local resident session is: still working, nothing for
      // a person to do, and the run's handle kept for the turn to come.
      expect(summary()).toMatchObject({
        status: 'answered',
        attention: 'none',
        parallelWork: { running: 1 },
      })
      expect(parallelWorkStatus(summary())).toBe('answered · 1 tasks running')
      expect(releases).toEqual([])
      const window = answerWindowStart()

      stub.emit(turnCompleted(6, 1))
      stub.emit(sessionPatch(7, { runningTasks: 0 }))
      await waitUntil(
        () => summary().parallelWork?.running === 0,
        'the task count to reach 0',
      )
      expect(summary().status).toBe('answered')
      expect(parallelWorkStatus(summary())).toBe('answered · finishing')

      // Claude Code reports back on its own: a harness turn.
      stub.emit(turnAdd(8, 2, 'harness'))
      stub.emit(envelope(9, { kind: 'status', status: 'running' }, sessionId))
      await waitUntil(
        () => service.getById(sessionId)?.status === 'running',
        'the harness turn to run',
      )
      // It reports on the same answer, so it opens no window of its own.
      expect(answerWindowStart()).toBe(window)

      stub.emit(assistantMessage(10, 'The build passed.'))
      stub.emit(
        envelope(11, { kind: 'status', status: 'completed' }, sessionId),
      )
      stub.emit(turnCompleted(12, 2))
      stub.emit(
        envelope(13, { kind: 'attention', attention: 'finished' }, sessionId),
      )
      await waitUntil(
        () => service.getById(sessionId)?.status === 'completed',
        'the real settle',
      )
      expect(summary()).toMatchObject({
        status: 'completed',
        attention: 'finished',
        parallelWork: { running: 0 },
      })
      expect(parallelWorkStatus(summary())).toBeNull()
      expect(assistantTexts()).toEqual([
        'The build runs in the background.',
        'The build passed.',
      ])
      // Nothing on the way was refused or dropped as unreadable.
      expect(
        debugEntries.filter((entry) => entry.note?.startsWith('dropped')),
      ).toEqual([])
    })

    it('opens a new answer window for a user turn sent while answered', async () => {
      await answerWithATaskRunning()
      const window = answerWindowStart()

      stub.emit(turnAdd(6, 2, 'user'))
      stub.emit(envelope(7, { kind: 'status', status: 'running' }, sessionId))
      await waitUntil(
        () => service.getById(sessionId)?.status === 'running',
        'the user turn to run',
      )
      expect(answerWindowStart()).toBeGreaterThan(window)
    })

    it('never leaves an answered session at its task count once it settles without one', async () => {
      await answerWithATaskRunning()

      stub.emit(envelope(6, { kind: 'status', status: 'completed' }, sessionId))
      await waitUntil(
        () => service.getById(sessionId)?.status === 'completed',
        'the settle',
      )
      expect(summary().parallelWork?.running).toBe(0)
      expect(parallelWorkStatus(summary())).toBeNull()
    })

    /**
     * Stop aborts the stream #187's settle would arrive on, so the record
     * settles here, as a local orphaned answer does: completed and finished,
     * never left answered and never failed. A crew seat on a remote host is
     * handed the answer it was waiting for. Mutation: drop the remote settle
     * after `stopAndRelease`, and the session sits at "answered · 1 tasks
     * running" with no handle -- red.
     */
    it('settles an answered remote session it stops as completed, its answer delivered', async () => {
      await answerWithATaskRunning()

      service.stop(sessionId)
      await waitUntil(() => releases.length === 1, 'the handle to be released')
      await waitUntil(
        () =>
          stub.commandEnvelopes.some(
            (sent) =>
              (sent as { command?: { kind?: string } }).command?.kind ===
              'stop',
          ),
        'the wire stop to post',
      )
      await waitUntil(
        () => service.getById(sessionId)?.status === 'completed',
        'the stopped answer to settle',
      )
      expect(summary()).toMatchObject({
        status: 'completed',
        attention: 'finished',
        parallelWork: { running: 0 },
      })
      expect(parallelWorkStatus(summary())).toBeNull()
      expect(assistantTexts()).toEqual(['The build runs in the background.'])
    })

    /**
     * The panel's Stop, refused by the service for a remote host that does
     * not take `stop-task`, in a remote host's words rather than a Claude
     * Code version's (MAR-3684 review). Mutation: throw the local words for
     * every session again, and this turns red.
     */
    it('refuses Stop on one task of a remote session whose host does not take it, saying so', async () => {
      await answerWithATaskRunning()
      stub.emit(
        envelope(
          6,
          {
            kind: 'delta',
            delta: {
              kind: 'evidence',
              turnId: 'turn-1',
              evidence: {
                kind: 'task.changed',
                taskId: 'bash-task',
                at: '2026-10-18T10:00:00.000Z',
                patch: { taskType: 'local_bash', status: 'running' },
              },
            },
          },
          sessionId,
        ),
      )
      await waitUntil(
        () => service.listTasks(sessionId).length === 1,
        'the task to be recorded',
      )
      await expect(service.stopTask(sessionId, 'bash-task')).rejects.toThrow(
        'Stop is not available on this remote host',
      )
      expect(stub.commandEnvelopes).toEqual([])
    })

    /**
     * Stop on an answered remote session, through the service (MAR-3684
     * review). The host takes `stop-task`, so Stop asks it to stop each row
     * the session's evidence says still runs, once per task (an agent run is
     * stopped as its linked task), and never a row that ended; only then the
     * session's own `stop`, and the settle the aborted stream will not bring.
     * Mutations: drop `stopTask` from the remote handle, stop a row that
     * ended, or stop the session before its tasks, and this turns red. The
     * service does not read `canStopTasks` here: `stopTask` refuses on a host
     * without the capability, and `allSettled` goes on to the session's stop.
     */
    it('stops each running task of an answered remote session, then the session, then settles it', async () => {
      const health = JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1) as {
        executionProtocol: { capabilities: string[] }
      }
      health.executionProtocol.capabilities.push(
        EXECUTION_HOST_STOP_TASK_CAPABILITY,
      )
      stub.setHealthBody(JSON.stringify(health))
      await host.refreshProviders()

      await service.start(sessionId, { text: 'build it' })
      await waitUntil(
        () => stub.eventStreamLastEventIds.length === 1,
        'the event stream to open',
      )
      const at = '2026-10-18T10:00:00.000Z'
      const evidence = (seq: number, fact: HarnessEvidence) =>
        envelope(
          seq,
          {
            kind: 'delta',
            delta: { kind: 'evidence', turnId: 'turn-1', evidence: fact },
          },
          sessionId,
        )
      stub.emit(turnAdd(1, 1, 'user'))
      stub.emit(envelope(2, { kind: 'status', status: 'running' }, sessionId))
      stub.emit(
        envelope(
          3,
          {
            kind: 'delta',
            delta: {
              kind: 'conversation.item.add',
              item: {
                id: 'spawn-item',
                kind: 'tool-call',
                toolName: 'Agent',
                inputText: '{"subagent_type":"Explore"}',
                state: 'complete',
                createdAt: at,
                updatedAt: at,
                providerMeta: {
                  providerId: 'claude',
                  providerItemId: 'agent-call',
                  providerEventType: 'tool-use',
                },
              },
            },
          },
          sessionId,
        ),
      )
      stub.emit(
        evidence(4, {
          kind: 'agent.started',
          run: {
            id: 'agent-call',
            spawnedByItemId: 'spawn-item',
            agentType: 'Explore',
            description: 'Look around',
            model: null,
            depth: 1,
            startedAt: at,
            transcriptPath: null,
          },
        }),
      )
      stub.emit(
        evidence(5, {
          kind: 'task.changed',
          taskId: 'agent-run',
          at,
          patch: {
            toolUseId: 'agent-call',
            taskType: 'local_agent',
            status: 'running',
            startedAt: at,
          },
        }),
      )
      stub.emit(
        evidence(6, {
          kind: 'agent.identified',
          spawnedByItemId: 'spawn-item',
          id: 'agent-run',
          agentType: 'Explore',
          description: 'Look around',
          depth: 1,
          transcriptPath: null,
        }),
      )
      stub.emit(
        evidence(7, {
          kind: 'task.changed',
          taskId: 'bash-task',
          at,
          patch: {
            toolUseId: 'bash-call',
            taskType: 'local_bash',
            status: 'running',
            startedAt: at,
          },
        }),
      )
      stub.emit(
        evidence(8, {
          kind: 'task.changed',
          taskId: 'done-task',
          at,
          patch: {
            toolUseId: 'done-call',
            taskType: 'local_bash',
            status: 'completed',
            startedAt: at,
            endedAt: at,
          },
        }),
      )
      stub.emit(
        sessionPatch(9, {
          status: 'answered',
          attention: 'none',
          runningTasks: 2,
        }),
      )
      await waitUntil(
        () =>
          service.getById(sessionId)?.status === 'answered' &&
          service.listTasks(sessionId).length === 3,
        'the session to read answered, with its tasks',
      )
      expect(stub.commandEnvelopes).toEqual([])

      service.stop(sessionId)
      await waitUntil(() => releases.length === 1, 'the handle to be released')
      await waitUntil(
        () => service.getById(sessionId)?.status === 'completed',
        'the stopped answer to settle',
      )

      const commands = stub.commandRequests.map(
        ({ sessionId: addressed, envelope: sent }) => ({
          addressed,
          command: (sent as { command: { kind: string; taskId?: string } })
            .command,
        }),
      )
      expect(commands.map(({ addressed }) => addressed)).toEqual([
        sessionId,
        sessionId,
        sessionId,
      ])
      expect(commands.slice(0, 2).map(({ command }) => command)).toEqual(
        expect.arrayContaining([
          { kind: 'stop-task', taskId: 'agent-run' },
          { kind: 'stop-task', taskId: 'bash-task' },
        ]),
      )
      expect(commands[2]?.command).toEqual({ kind: 'stop' })
      expect(summary()).toMatchObject({
        status: 'completed',
        attention: 'finished',
        parallelWork: { running: 0 },
      })
    })

    /**
     * The resume replays only what came after the cursor, so the count the
     * daemon sent before the restart never comes back on the stream. The
     * snapshot says it. Mutation: skip the reattach read, and the revived
     * session reads "answered · finishing" while its task runs -- red.
     */
    it('reads the running tasks back from the snapshot when it reattaches mid-task', async () => {
      await answerWithATaskRunning()
      stub.setSessionSnapshot(sessionId, {
        status: 'answered',
        attention: 'none',
        runningTasks: 1,
      })

      const revived = new SessionService(
        db,
        new LocalExecutionHost(new ProviderRegistry()),
        join(tempDir, 'global-sessions'),
      )
      revived.setRemoteExecutionHosts(
        executionHostRegistryFor({
          [TEST_EXECUTION_HOST_ENDPOINT_ID]: host,
        }),
      )
      revived.setRemoteWorkspaceSourceResolver(() => ({
        repository: 'git@github.com:acme/repo.git',
      }))
      await waitUntil(
        () => stub.eventStreamLastEventIds.length === 2,
        'the reattached stream to open',
      )
      expect(stub.eventStreamLastEventIds[1]).toBe('5')

      await waitUntil(
        () => revived.getSummaryById(sessionId)?.parallelWork?.running === 1,
        'the count to be read back',
      )
      const revivedSummary = revived.getSummaryById(sessionId)!
      expect(revivedSummary.status).toBe('answered')
      expect(parallelWorkStatus(revivedSummary)).toBe(
        'answered · 1 tasks running',
      )
    })

    /**
     * #187's `settleAnswered` with a plan still waiting for review: `completed`,
     * `runningTasks: 0`, and no attention, on purpose. The request stays the
     * person's to answer. Mutation: let the settle fill `finished` -- red.
     */
    it('keeps a request still open when the answer it came with settles', async () => {
      await answerWithATaskRunning()
      stub.emit(
        envelope(6, { kind: 'attention', attention: 'needs-input' }, sessionId),
      )
      stub.emit(sessionPatch(7, { status: 'completed', runningTasks: 0 }))
      await waitUntil(
        () => service.getById(sessionId)?.status === 'completed',
        'the settle',
      )
      expect(service.getById(sessionId)?.attention).toBe('needs-input')
      expect(summary().parallelWork?.running).toBe(0)
    })

    /**
     * The other side of keeping an open request: one the daemon resolved
     * before the settle is gone, and the settle is finished. Keeping a stale
     * request would leave a done session asking for input nobody owes.
     * Mutation: remember any request ever raised, not the last word -- red.
     */
    it('settles finished once a request the answer raised is resolved', async () => {
      await answerWithATaskRunning()
      stub.emit(
        envelope(6, { kind: 'attention', attention: 'needs-input' }, sessionId),
      )
      stub.emit(
        envelope(7, { kind: 'attention', attention: 'none' }, sessionId),
      )
      stub.emit(sessionPatch(8, { status: 'completed', runningTasks: 0 }))
      await waitUntil(
        () => service.getById(sessionId)?.status === 'completed',
        'the settle',
      )
      expect(service.getById(sessionId)?.attention).toBe('finished')
    })

    /**
     * A plan review raised before the app closed sits below the resume's
     * cursor, so the reattached run never hears it again. Its settle is #187's
     * `completed` with no attention, which must not clear the request.
     * Mutation: start the reattached run's attention at null, as before, and
     * the settle fills `finished` -- red.
     */
    it('keeps a request raised before a restart open through the settle after it', async () => {
      await answerWithATaskRunning()
      stub.emit(
        envelope(6, { kind: 'attention', attention: 'needs-input' }, sessionId),
      )
      await waitUntil(
        () => service.getById(sessionId)?.attention === 'needs-input',
        'the request to reach the record',
      )

      // The app closes: its run goes with it, and only the reattached one
      // hears what comes next.
      await service.disposeAll()
      const revived = new SessionService(
        db,
        new LocalExecutionHost(new ProviderRegistry()),
        join(tempDir, 'global-sessions'),
      )
      revived.setRemoteExecutionHosts(
        executionHostRegistryFor({
          [TEST_EXECUTION_HOST_ENDPOINT_ID]: host,
        }),
      )
      revived.setRemoteWorkspaceSourceResolver(() => ({
        repository: 'git@github.com:acme/repo.git',
      }))
      await waitUntil(
        () => stub.eventStreamLastEventIds.length === 2,
        'the reattached stream to open',
      )
      expect(stub.eventStreamLastEventIds[1]).toBe('6')

      stub.emit(sessionPatch(7, { status: 'completed', runningTasks: 0 }))
      await waitUntil(
        () => revived.getById(sessionId)?.status === 'completed',
        'the settle',
      )
      expect(revived.getById(sessionId)?.attention).toBe('needs-input')
    })

    /** A row left answered with no handle: after a crash, or a failed reattach. */
    function leaveHandleless(status: 'answered' | 'running'): void {
      db.prepare(
        "UPDATE sessions SET status = ?, attention = 'none' WHERE id = ?",
      ).run(status, sessionId)
    }

    it('settles a handle-less answered remote session on Stop as completed, not failed', () => {
      leaveHandleless('answered')

      expect(() => service.stop(sessionId)).not.toThrow()
      expect(service.getById(sessionId)).toMatchObject({
        status: 'completed',
        attention: 'finished',
      })
    })

    it('settles a handle-less answered remote session on an approval as completed, not failed', () => {
      leaveHandleless('answered')

      expect(() => service.approve(sessionId)).not.toThrow()
      expect(service.getById(sessionId)).toMatchObject({
        status: 'completed',
        attention: 'finished',
      })
    })

    /**
     * The other half of the line: a run Convergence lost mid-turn has no
     * answer to settle, and still reads failed. Mutation: send `running` to
     * `completeOrphanAnswer` too -- red.
     */
    it('still fails a handle-less running remote session on Stop', () => {
      leaveHandleless('running')

      service.stop(sessionId)
      expect(service.getById(sessionId)?.status).toBe('failed')
    })

    /**
     * The origin is spent on the first `running` of its turn. A continuation
     * recovery reports the same turn `running` a second time; read as the
     * user's turn again, it would move the answer window past the reply the
     * turn already gave. Mutation: delete the reset in `withAddedTurnOrigin`
     * -- red.
     */
    it("keeps the answer window through a user turn's second running", async () => {
      await service.start(sessionId, { text: 'build it' })
      await waitUntil(
        () => stub.eventStreamLastEventIds.length === 1,
        'the event stream to open',
      )
      stub.emit(turnAdd(1, 1, 'user'))
      stub.emit(envelope(2, { kind: 'status', status: 'running' }, sessionId))
      stub.emit(assistantMessage(3, 'Half of the answer.'))
      await waitUntil(
        () => assistantTexts().length === 1,
        'the first reply to land',
      )
      const window = answerWindowStart()

      stub.emit(envelope(4, { kind: 'status', status: 'running' }, sessionId))
      stub.emit(assistantMessage(5, 'The rest of it.'))
      stub.emit(envelope(6, { kind: 'status', status: 'completed' }, sessionId))
      await waitUntil(
        () => service.getById(sessionId)?.status === 'completed',
        'the turn to settle',
      )
      expect(answerWindowStart()).toBe(window)
    })
  })
})
