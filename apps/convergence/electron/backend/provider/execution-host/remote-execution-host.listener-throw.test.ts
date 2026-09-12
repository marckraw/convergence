import { beforeEach, describe, expect, it } from 'vitest'
import {
  createStubDaemon,
  envelope,
  waitUntil,
  type StubDaemon,
} from '@convergence/execution-host-client'
import { RemoteExecutionHost } from './remote-execution-host'
import type {
  ActivitySignal,
  SessionStartConfig,
  SessionStatus,
} from '../provider.types'
import type { ProviderDebugEntry } from '../../provider-debug/provider-debug.types'

/**
 * A session listener that throws leaves the resume cursor where the last
 * DELIVERED event was (MAR-2901).
 *
 * `dispatchRawEvent` used to set `this.lastSeq` before handing the envelope to
 * the listeners. A listener that throws escapes into `readStream`'s catch, so
 * the frame was never counted toward the reconnect budget and `notifyEventSeq`
 * never ran -- both correct -- but this run's in-memory cursor had already
 * moved past it, and the reconnect asked the daemon for everything AFTER the
 * event the session never saw. The one frame that failed was the one frame no
 * resume could bring back.
 *
 * The stub daemon is what makes this real: its log still holds the envelope,
 * so a resume from the right sequence can actually re-deliver it.
 */
describe('a session listener that throws mid-dispatch', () => {
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
      reconnect: {
        maxAttempts,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
      },
      // The durable half of "seen": what the session record would be told to
      // remember. It must not move for an event no listener finished.
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
   * The headline canary. The activity listener throws on the third envelope
   * once; the resume asks from 2, not 3, and the replay re-delivers 3 and 4.
   *
   * Mutation: assign the cursor before the dispatch (as before) and the resume
   * header reads `3` and the run never receives the third event -- red on both
   * assertions.
   */
  it('resumes from the last delivered sequence, not the one that threw', async () => {
    const host = hostWith(5)
    await host.refreshProviders()
    const handle = host.start('claude', startConfig('s-1'))

    // Throws once, so the replay of the same frame can succeed: the claim is
    // about where the cursor stands after a failed dispatch, not about a
    // listener that is permanently broken.
    let thrown = false
    const seen: ActivitySignal[] = []
    handle.onActivityChange((activity) => {
      if (activity === 'tool:Bash' && !thrown) {
        thrown = true
        throw new Error('listener exploded')
      }
      seen.push(activity)
    })

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'activity', activity: 'thinking' }))
    stub.emit(envelope(2, { kind: 'activity', activity: 'thinking' }))
    stub.emit(envelope(3, { kind: 'activity', activity: 'tool:Bash' }))
    stub.emit(envelope(4, { kind: 'status', status: 'completed' }))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 2,
      'the stream to re-open after the throw',
    )
    // The resume asked for everything after the last event a listener actually
    // finished with.
    expect(stub.eventStreamLastEventIds).toEqual([null, '2'])

    await waitUntil(() => kept.includes(4), 'the replayed frames to be kept')
    // The durable cursor never recorded the failed sequence on the first pass;
    // the replay is what puts 3 on the record.
    expect(kept).toEqual([1, 2, 3, 4])
    expect(seen).toEqual(['thinking', 'thinking', 'tool:Bash'])

    handle.stop()
  })

  /**
   * The other half, re-pinned: a listener that returns moves both cursors, and
   * nothing re-dials. Without this the fix could be "never advance the cursor"
   * and the headline canary above would still pass.
   */
  it('moves both cursors when every listener returns', async () => {
    const host = hostWith(5)
    await host.refreshProviders()
    const handle = host.start('claude', startConfig('s-1'))
    const seen: ActivitySignal[] = []
    handle.onActivityChange((activity) => seen.push(activity))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'activity', activity: 'thinking' }))
    stub.emit(envelope(2, { kind: 'activity', activity: 'thinking' }))
    stub.emit(envelope(3, { kind: 'activity', activity: 'tool:Bash' }))

    await waitUntil(() => kept.length === 3, 'the three kept events')
    expect(kept).toEqual([1, 2, 3])
    expect(seen).toEqual(['thinking', 'thinking', 'tool:Bash'])
    // One stream, start to finish.
    expect(stub.eventStreamLastEventIds).toEqual([null])

    handle.stop()
  })

  /**
   * The frame a listener threw on is not a frame the run kept, so it buys no
   * reconnect budget. A listener that throws every time must fail the session
   * out loud rather than spin forever on a resume that keeps re-delivering the
   * same envelope -- the budget is what stops it, exactly as it stops a daemon
   * that answers and gaps (MAR-2779 round 2).
   *
   * The budget is one attempt here, so the first throw spends it.
   */
  it('spends the reconnect budget rather than spin on a listener that always throws', async () => {
    const host = hostWith(1)
    await host.refreshProviders()
    const handle = host.start('claude', startConfig('s-1'))
    const statuses: SessionStatus[] = []
    handle.onStatusChange((status) => statuses.push(status))
    handle.onActivityChange(() => {
      throw new Error('listener always explodes')
    })

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'activity', activity: 'thinking' }))

    await waitUntil(() => statuses.includes('failed'), 'the session to fail')
    // Nothing was ever kept: the first frame's dispatch never returned.
    expect(kept).toEqual([])
    // And the last resume the run attempted asked from 0 -- the cursor never
    // moved off the start.
    expect(stub.eventStreamLastEventIds).toEqual([null])
    // The frame was read and traced before the listener took it down, so the
    // debug log still explains where the run got to.
    expect(
      entries.some(
        (entry) => entry.channel === 'event' && entry.method === 'activity',
      ),
    ).toBe(true)

    handle.stop()
  })
})
