import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
  envelope,
  waitUntil,
  type StubDaemon,
} from './execution-host-daemon.fixture'
import { LocalExecutionHost } from './local-execution-host'
import { RemoteExecutionHost } from './remote-execution-host'
import type { ProviderExecutionHost } from './execution-host.types'
import type { SessionHandle } from '../provider.types'
import type { SessionDelta } from '../../session/conversation-item.types'

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
      start: (providerId, config) => wrap(inner.start(providerId, config)),
      attach: (providerId, config, afterSeq) =>
        wrap(inner.attach(providerId, config, afterSeq)),
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
      executionHost: 'remote',
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

    stub = createStubDaemon()
    cursorWrites = []
    releases = []
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
      reconnect: { maxAttempts: 2, wait: async () => {} },
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
    })
    await host.refreshProviders()
    service.setRemoteExecutionHost(host)
    service.setRemoteWorkspaceSourceResolver(() => ({
      repository: 'git@github.com:acme/repo.git',
    }))

    service.setSessionTerminatedListener((id) => releases.push(id))

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
    revived.setRemoteExecutionHost(host)
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
    service.setRemoteExecutionHost(lingering.host)

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
})
