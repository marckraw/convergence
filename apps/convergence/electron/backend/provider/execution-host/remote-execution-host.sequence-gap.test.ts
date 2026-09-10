import { beforeEach, describe, expect, it } from 'vitest'
import {
  createStubDaemon,
  envelope,
  waitUntil,
  type StubDaemon,
} from '@convergence/execution-host-client'
import { RemoteExecutionHost } from './remote-execution-host'
import type { SessionStartConfig, SessionStatus } from '../provider.types'
import type { SessionDelta } from '../../session/conversation-item.types'
import type { ProviderDebugEntry } from '../../provider-debug/provider-debug.types'

/**
 * A gap in the daemon's sequence numbers reconnects from the last contiguous
 * one, and never steps over the hole (MAR-2779).
 *
 * `docs/architecture/execution-host-wire-protocol.md`: "a gap in received seq
 * numbers means events were missed and the client must reconnect with its last
 * contiguous seq rather than continue." This adapter did the opposite -- it took
 * any higher sequence as the new mark -- so a frame lost between the daemon and
 * the app left a transcript missing an event and a cursor that had already moved
 * past the only sequence that could have asked for it again.
 *
 * The stub's `loseFrame` is what makes the scenario real rather than staged:
 * the daemon LOGS the envelope and does not write it to the open stream, so the
 * resume the protocol asks for is one the daemon can actually answer. Emitting
 * `1, 2, 4` from a daemon whose log is also `1, 2, 4` would prove only that the
 * client reconnects in a circle.
 */
describe('a remote stream that skips a sequence', () => {
  let stub: StubDaemon
  let entries: ProviderDebugEntry[]
  let kept: number[]

  /**
   * Omitting the budget leaves the shipped one (`DEFAULT_MAX_RECONNECT_ATTEMPTS`)
   * in place, which is the number a real session runs on. Only the LENGTH of
   * the backoff is stubbed: a zero-length wait is still a timer, as the real
   * one is, and that matters here. `async () => {}` resolves on a microtask, so
   * a reconnect loop that never terminates starves every timer in the process —
   * the poll below, and the test timeout meant to catch it. The suite hangs
   * instead of failing, which is also the honest shape of the defect: this loop
   * spinning does not merely re-dial, it stops the app's event loop dead.
   */
  function hostWith(maxAttempts?: number): RemoteExecutionHost {
    return new RemoteExecutionHost({
      connection: {
        resolveConnection: async () => ({
          baseUrl: 'http://daemon.test',
          token: 'test-token',
        }),
      },
      fetch: stub.fetchFn,
      reconnect: {
        ...(maxAttempts === undefined ? {} : { maxAttempts }),
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
      },
      // The reader's own report of what it kept, whatever the event kind:
      // only some kinds reach the transcript as a delta carrying a sequence,
      // and the claim here is about every envelope.
      onEventSeq: (_sessionId, seq) => kept.push(seq),
      debugSink: { record: (entry) => entries.push(entry) },
    })
  }

  function startConfig(sessionId: string): SessionStartConfig {
    return {
      sessionId,
      workingDirectory: '/work',
      initialMessage: 'hello',
      model: null,
      effort: null,
      continuationToken: null,
    }
  }

  beforeEach(() => {
    stub = createStubDaemon()
    entries = []
    kept = []
  })

  /**
   * The headline canary. `3` is lost in transit; the transcript still ends up
   * holding 1, 2, 3, 4 in order, because the reconnect asked for everything
   * after 2.
   *
   * Mutation: accept the gap (`this.lastSeq = envelope.seq` for any higher
   * sequence, as before) and the run receives 1, 2, 4 -- red on both the order
   * and the resume header.
   */
  it('reconnects from the last contiguous sequence and loses nothing', async () => {
    const host = hostWith(5)
    await host.refreshProviders()
    const handle = host.start('claude', startConfig('s-1'))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'activity', activity: 'thinking' }))
    // The daemon holds 3; the wire drops it.
    stub.loseFrame(envelope(3, { kind: 'attention', attention: 'none' }))
    stub.emit(envelope(4, { kind: 'status', status: 'completed' }))

    await waitUntil(
      () => kept.length === 4,
      'the replayed frames to reach the run',
    )
    expect(kept).toEqual([1, 2, 3, 4])
    // The resume asked for everything after the last CONTIGUOUS sequence, not
    // after the one that arrived.
    expect(stub.eventStreamLastEventIds).toEqual([null, '2'])

    handle.stop()
  })

  /**
   * The gap is on the record. A remote session's debug log is the only place
   * its wire can be inspected, and a stream that quietly re-opened would look
   * exactly like a daemon that went briefly silent.
   */
  it('writes one row naming the hole and the resume', async () => {
    const host = hostWith(5)
    await host.refreshProviders()
    const handle = host.start('claude', startConfig('s-1'))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'heartbeat' }))
    stub.loseFrame(envelope(3, { kind: 'heartbeat' }))
    stub.emit(envelope(4, { kind: 'status', status: 'completed' }))

    await waitUntil(
      () => entries.some((entry) => entry.note?.startsWith('gap: expected 3')),
      'the gap to be traced',
    )
    expect(
      entries.filter((entry) => entry.note?.startsWith('gap:')),
    ).toHaveLength(1)
    expect(entries.find((entry) => entry.note?.startsWith('gap:'))?.note).toBe(
      'gap: expected 3, got 4; reconnecting from 2',
    )

    handle.stop()
  })

  /**
   * A replay that re-delivers the boundary is normal and is not a gap: one
   * duplicate is dropped and the stream is left alone.
   *
   * Mutation: read `duplicate` as `gap` and this reconnects -- red on the
   * single opened stream.
   */
  it('drops a re-delivered sequence without reconnecting', async () => {
    const host = hostWith(5)
    await host.refreshProviders()
    const handle = host.start('claude', startConfig('s-1'))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'activity', activity: 'thinking' }))
    stub.emit(envelope(2, { kind: 'activity', activity: 'thinking' }))
    stub.emit(envelope(3, { kind: 'status', status: 'completed' }))

    await waitUntil(() => kept.length === 3, 'the three kept events')
    expect(kept).toEqual([1, 2, 3])
    expect(
      entries.filter(
        (entry) => entry.note === 'dropped: already-seen sequence',
      ),
    ).toHaveLength(1)
    // One stream, start to finish: a duplicate is not a reason to re-dial.
    expect(stub.eventStreamLastEventIds).toEqual([null])
    expect(entries.some((entry) => entry.note?.startsWith('gap:'))).toBe(false)

    handle.stop()
  })

  /**
   * A gap the reconnect budget cannot cover fails the session out loud, with
   * the sentence the adapter already uses for a stream it could not
   * re-establish. The one outcome that must never happen is the quiet one:
   * carrying on with a transcript that is missing an event.
   *
   * The budget is one attempt, so the gap spends it immediately.
   *
   * Mutation: dispatch the gapped envelope anyway and the session completes
   * instead of failing -- red.
   */
  it('fails the session rather than carry a hole when the budget is spent', async () => {
    const host = hostWith(1)
    await host.refreshProviders()
    const statuses: SessionStatus[] = []
    const handle = host.start('claude', startConfig('s-1'))
    handle.onStatusChange((status) => statuses.push(status))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'activity', activity: 'thinking' }))
    stub.loseFrame(envelope(3, { kind: 'heartbeat' }))
    stub.emit(envelope(4, { kind: 'status', status: 'completed' }))

    await waitUntil(() => statuses.includes('failed'), 'the session to fail')
    // The skipped envelope never reached the transcript, and the mark never
    // moved past the hole: 4 is absent, and nothing claims to have seen it.
    expect(kept).not.toContain(4)
    expect(kept).toEqual([1, 2])
    expect(statuses).not.toContain('completed')
    expect(stub.eventStreamLastEventIds).toEqual([null])
  })

  /**
   * A hole the daemon cannot heal spends the budget and fails the session,
   * rather than re-dialling forever (MAR-2779 round 2).
   *
   * The staging is the one `loseFrame` exists to avoid, and here that is the
   * point: nothing ever logged a `3`, so the daemon's log is `1, 2, 4` too and
   * every resume from `2` replays the same hole. `loseFrame` would make this
   * daemon able to answer the resume, which is the healing case two tests
   * above; this is its opposite, and the only one that puts the reconnect
   * budget under load, because each re-open delivers nothing.
   *
   * What it pins is the budget's meaning. An attempt only counts as having
   * WORKED once the daemon delivered an envelope, so the budget resets on an
   * accepted envelope and never on a successful open -- which is what the
   * Studio client already does (`daemon-client.ts`, `followSession`).
   * Resetting on the open alone gave this loop an unlimited one: open, gap,
   * close, reopen, at whatever rate the machine allows -- 775 re-opens per
   * second measured, a session that never fails, and a debug ring flushed of
   * everything that would explain it.
   *
   * Mutation: reset the budget on a successful open and this never fails --
   * red on the timeout, which is the spin itself.
   */
  it('spends the reconnect budget on a hole the daemon cannot heal', async () => {
    const host = hostWith(3)
    await host.refreshProviders()
    const statuses: SessionStatus[] = []
    const deltas: SessionDelta[] = []
    const handle = host.start('claude', startConfig('s-1'))
    handle.onStatusChange((status) => statuses.push(status))
    handle.onDelta((delta) => deltas.push(delta))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'activity', activity: 'thinking' }))
    // No `loseFrame`: as far as this daemon is concerned, 3 never existed.
    stub.emit(envelope(4, { kind: 'status', status: 'completed' }))

    await waitUntil(() => statuses.includes('failed'), 'the session to fail')
    // Three opens, not three hundred. The first delivered 1 and 2 and renewed
    // the budget; the two that delivered nothing spent it.
    expect(stub.eventStreamLastEventIds).toEqual([null, '2', '2'])
    expect(kept).toEqual([1, 2])
    expect(statuses).not.toContain('completed')
    // The sentence is the one this adapter already uses for a stream it could
    // not re-establish, CARRYING the hole that ended it: without the suffix the
    // last word a person is left with is "the stream dropped", which is true of
    // every exhausted budget and says nothing about the frame that is missing
    // (MAR-2779 round 3).
    //
    // Mutation: drop the suffix and this is red on the sentence.
    const note = deltas.find(
      (delta) =>
        delta.kind === 'conversation.item.add' && delta.item.kind === 'note',
    )
    expect(
      note?.kind === 'conversation.item.add' && note.item.kind === 'note'
        ? note.item.text
        : null,
    ).toBe(
      'Remote session event stream dropped and could not be re-established: expected 3, got 4.',
    )
  }, 5_000)

  /**
   * The same hole against the budget a real session actually runs on.
   *
   * The test above could be passed by a budget that resets on the open as long
   * as one gap happened to equal the whole allowance; ten cannot be reached by
   * accident. This is the assertion that says the loop terminates at all.
   *
   * Mutation: reset the budget on a successful open and this never fails -- red.
   */
  it('gives up within the default budget rather than re-dial forever', async () => {
    const host = hostWith()
    await host.refreshProviders()
    const statuses: SessionStatus[] = []
    const handle = host.start('claude', startConfig('s-1'))
    handle.onStatusChange((status) => statuses.push(status))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'activity', activity: 'thinking' }))
    stub.emit(envelope(4, { kind: 'status', status: 'completed' }))

    await waitUntil(() => statuses.includes('failed'), 'the session to fail')
    expect(stub.eventStreamLastEventIds).toHaveLength(10)
    expect(kept).toEqual([1, 2])
  }, 5_000)

  /**
   * The other direction of the same rule: a stream that KEEPS DELIVERING may
   * drop as often as it likes.
   *
   * Without this, "the budget resets on an accepted envelope" is pinned only
   * from one side -- deleting the reset entirely leaves every other test in
   * this file green, and turns a long remote session that reconnects now and
   * then into one that dies on its fourth blip with a three-attempt budget.
   * The budget is for a host that has stopped answering, not for a connection
   * that is merely long.
   *
   * Five drops against a budget of three, each one after an envelope landed.
   *
   * Mutation: delete `if (envelopes > 0) attempt = 0` and this is red -- the
   * session fails on the third drop.
   */
  it('renews the budget for a stream that keeps delivering', async () => {
    const host = hostWith(3)
    await host.refreshProviders()
    const statuses: SessionStatus[] = []
    const handle = host.start('claude', startConfig('s-1'))
    handle.onStatusChange((status) => statuses.push(status))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    await waitUntil(() => kept.length === 1, 'the first envelope')

    for (let drop = 0; drop < 5; drop += 1) {
      const opens = stub.eventStreamLastEventIds.length
      stub.dropStream()
      await waitUntil(
        () => stub.eventStreamLastEventIds.length === opens + 1,
        `the reconnect after drop ${drop + 1}`,
      )
      stub.emit(envelope(drop + 2, { kind: 'heartbeat' }))
      await waitUntil(
        () => kept.length === drop + 2,
        `the envelope after drop ${drop + 1}`,
      )
    }

    stub.emit(envelope(7, { kind: 'status', status: 'completed' }))
    await waitUntil(
      () => statuses.includes('completed'),
      'the session to settle',
    )
    expect(statuses).not.toContain('failed')
    expect(kept).toEqual([1, 2, 3, 4, 5, 6, 7])

    handle.stop()
  }, 5_000)

  /**
   * Everything after a gap in the SAME batch is discarded, and the discarding
   * is written down.
   *
   * A daemon replay arrives coalesced, so one read can carry the hole and
   * several frames above it. Those frames are dropped on purpose -- they sit
   * over a hole whatever their own sequence says -- and the resume brings them
   * back. Until now they were the only drop in this adapter that left no
   * trace, so a debug log showed a gap at 4 and then, unexplained, a 5 and a 6
   * that had plainly been on the wire.
   *
   * Mutation: drop the trace row and this is red on the count.
   */
  it('names the frames it discarded above the hole', async () => {
    const host = hostWith(5)
    await host.refreshProviders()
    const handle = host.start('claude', startConfig('s-1'))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'heartbeat' }))
    stub.loseFrame(envelope(3, { kind: 'heartbeat' }))
    // One read, three frames: the hole and the two that sit above it.
    stub.emitBatch([
      envelope(4, { kind: 'activity', activity: 'thinking' }),
      envelope(5, { kind: 'heartbeat' }),
      envelope(6, { kind: 'status', status: 'completed' }),
    ])

    await waitUntil(() => kept.length === 6, 'the resume to heal the hole')
    expect(kept).toEqual([1, 2, 3, 4, 5, 6])
    expect(
      entries.filter(
        (entry) =>
          entry.note === '2 frames above the hole discarded in this read',
      ),
    ).toHaveLength(1)

    handle.stop()
  }, 5_000)

  /**
   * The count is what the SAME read carried, and the row says so.
   *
   * The daemon writes when it likes: the hole can be the last frame of its own
   * chunk while more are already queued behind it. Those are cancelled unread
   * when the reader walks away, so the adapter never sees them to count them --
   * the same two frames that traced "2 frames above the hole discarded" in the
   * test above trace nothing here, having arrived one chunk later. Both are
   * replayed by the resume either way, which is what the transcript below says.
   *
   * Without the qualifier a debug log reads "0 discarded" as "nothing else was
   * on the wire", which is exactly the wrong conclusion to draw about a hole.
   *
   * Mutation: count the frames the reader never read (anything but the current
   * batch) and this is red on the absence of the row.
   */
  it('counts only the frames the read that gapped was holding', async () => {
    const host = hostWith(5)
    await host.refreshProviders()
    const handle = host.start('claude', startConfig('s-1'))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'heartbeat' }))
    stub.loseFrame(envelope(3, { kind: 'heartbeat' }))
    // The hole arrives alone; 5 and 6 are still queued behind it when the
    // reader cancels the body.
    stub.emitBatch([envelope(4, { kind: 'activity', activity: 'thinking' })])
    stub.emitBatch([
      envelope(5, { kind: 'heartbeat' }),
      envelope(6, { kind: 'status', status: 'completed' }),
    ])

    await waitUntil(() => kept.length === 6, 'the resume to heal the hole')
    expect(kept).toEqual([1, 2, 3, 4, 5, 6])
    expect(
      entries.filter(
        (entry) => entry.note?.includes('above the hole') ?? false,
      ),
    ).toEqual([])

    handle.stop()
  }, 5_000)
})
