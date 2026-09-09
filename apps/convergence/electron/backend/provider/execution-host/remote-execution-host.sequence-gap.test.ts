import { beforeEach, describe, expect, it } from 'vitest'
import {
  createStubDaemon,
  envelope,
  waitUntil,
  type StubDaemon,
} from '@convergence/execution-host-client'
import { RemoteExecutionHost } from './remote-execution-host'
import type { SessionStartConfig, SessionStatus } from '../provider.types'
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

  function hostWith(maxAttempts: number): RemoteExecutionHost {
    return new RemoteExecutionHost({
      connection: {
        resolveConnection: async () => ({
          baseUrl: 'http://daemon.test',
          token: 'test-token',
        }),
      },
      fetch: stub.fetchFn,
      reconnect: { maxAttempts, wait: async () => {} },
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
})
