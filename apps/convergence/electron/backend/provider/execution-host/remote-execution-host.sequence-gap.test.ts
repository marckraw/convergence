import { beforeEach, describe, expect, it } from 'vitest'
import {
  createStubDaemon,
  envelope,
  waitUntil,
  type StubDaemon,
} from '@convergence/execution-host-client'
import { RemoteExecutionHost } from './remote-execution-host'
import type {
  AttentionState,
  SessionStartConfig,
  SessionStatus,
} from '../provider.types'
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
  /** Every delay the reconnect loop asked for, in order. */
  let waits: number[]

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
        wait: (ms) => {
          waits.push(ms)
          return new Promise((resolve) => setTimeout(resolve, 0))
        },
      },
      // The reader's own report of what it kept, whatever the event kind:
      // only some kinds reach the transcript as a delta carrying a sequence,
      // and the claim here is about every envelope.
      onEventSeq: (_sessionId, seq) => kept.push(seq),
      debugSink: { record: (entry) => entries.push(entry) },
    })
  }

  /**
   * The note a failed session leaves on the transcript, which is the only place
   * its last word can be read: `failSession` says it once, as a note, and the
   * status alone cannot carry a sentence.
   */
  function noteText(deltas: SessionDelta[]): string | null {
    const note = deltas.find(
      (delta) =>
        delta.kind === 'conversation.item.add' && delta.item.kind === 'note',
    )
    return note?.kind === 'conversation.item.add' && note.item.kind === 'note'
      ? note.item.text
      : null
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
    waits = []
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
  it('says the host is unreachable rather than carry a hole when the budget is spent', async () => {
    const host = hostWith(1)
    await host.refreshProviders()
    const statuses: SessionStatus[] = []
    const attentions: AttentionState[] = []
    const handle = host.start('claude', startConfig('s-1'))
    handle.onStatusChange((status) => statuses.push(status))
    handle.onAttentionChange((attention) => attentions.push(attention))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'activity', activity: 'thinking' }))
    // On the wire and nowhere in the log: the resume is answered with nothing,
    // so the hole stays open. A hole the daemon's own replay REPEATS is its
    // pruned history and is accepted instead (MAR-3051 R1) -- that case is the
    // prune canary below, and this one is what remains a loss.
    stub.emitUnlogged(envelope(4, { kind: 'status', status: 'completed' }))

    await waitUntil(
      () => attentions.includes('host-unreachable'),
      'the viewer to say it cannot reach the host',
    )
    // The run is somebody else's machine's business: this app went blind, and
    // a blind viewer does not get to end a session (MAR-3051 R2).
    expect(statuses).not.toContain('failed')
    // The skipped envelope never reached the transcript, and the mark never
    // moved past the hole: 4 is absent, and nothing claims to have seen it.
    expect(kept).not.toContain(4)
    expect(kept).toEqual([1, 2])
    expect(statuses).not.toContain('completed')
    expect(stub.eventStreamLastEventIds[0]).toBe(null)

    handle.stop()
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
    const attentions: AttentionState[] = []
    const deltas: SessionDelta[] = []
    const handle = host.start('claude', startConfig('s-1'))
    handle.onStatusChange((status) => statuses.push(status))
    handle.onAttentionChange((attention) => attentions.push(attention))
    handle.onDelta((delta) => deltas.push(delta))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'activity', activity: 'thinking' }))
    // On the wire only. A daemon that replays the same hole is now read as a
    // prune (MAR-3051 R1), so the case that still spends a budget is the one
    // where the resume is answered with nothing at all.
    stub.emitUnlogged(envelope(4, { kind: 'status', status: 'completed' }))

    // Each resume is answered with an empty stream, and the daemon holds it
    // open: the drops below are what end those reads.
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 2,
      'the resume the gap asked for',
    )
    stub.dropStream()
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 3,
      'the re-open after the first empty read',
    )
    stub.dropStream()

    await waitUntil(
      () => attentions.includes('host-unreachable'),
      'the viewer to say it cannot reach the host',
    )
    // The run is somebody else's machine's business: this app went blind, and
    // a blind viewer does not get to end a session (MAR-3051 R2).
    expect(statuses).not.toContain('failed')
    // Three opens, not three hundred. The first delivered 1 and 2 and renewed
    // the budget; the two that delivered nothing spent it.
    // Three opens, not three hundred: the first delivered 1 and 2 and renewed
    // the budget; the two that delivered nothing spent it. The slow retry that
    // follows may add more, so this reads the first three.
    expect(stub.eventStreamLastEventIds.slice(0, 3)).toEqual([null, '2', '2'])
    expect(kept).toEqual([1, 2])
    expect(statuses).not.toContain('completed')
    // The sentence is the one this adapter already uses for a stream it could
    // not re-establish, CARRYING the hole that ended it: without the suffix the
    // last word a person is left with is "the stream dropped", which is true of
    // every exhausted budget and says nothing about the frame that is missing
    // (MAR-2779 round 3).
    //
    // Mutation: drop the suffix and this is red on the sentence.
    expect(noteText(deltas)).toBe(
      'Remote session event stream dropped and could not be re-established: expected 3, got 4.',
    )

    handle.stop()
  }, 5_000)

  /**
   * The OTHER way this loop gives up says which hole it left behind too
   * (MAR-2779 round 4).
   *
   * A budget runs out in one of two places: on reads that closed empty, and on
   * opens the daemon would not answer at all. Only the first carried the hole,
   * so a gap followed by a daemon that stopped answering left the person with
   * "the event stream is unavailable" and no word about the frame that is
   * missing -- while the Studio client, reading the same wire through the same
   * organ, said it. Two clients disagreeing is how this whole ticket started.
   *
   * The 500 is set on the same tick as the emits, before the reader has run:
   * the read that gaps is the one already open, and every open after it is
   * refused, so the budget is spent entirely by failing OPENS.
   *
   * Mutation: report the bare `unavailable` sentence and this is red on the
   * suffix.
   */
  it('names the hole it left behind when the re-open is refused', async () => {
    const host = hostWith(3)
    await host.refreshProviders()
    const statuses: SessionStatus[] = []
    const attentions: AttentionState[] = []
    const deltas: SessionDelta[] = []
    const handle = host.start('claude', startConfig('s-1'))
    handle.onStatusChange((status) => statuses.push(status))
    handle.onAttentionChange((attention) => attentions.push(attention))
    handle.onDelta((delta) => deltas.push(delta))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'activity', activity: 'thinking' }))
    stub.emit(envelope(4, { kind: 'heartbeat' }))
    stub.setEventsStatus(500)

    await waitUntil(
      () => attentions.includes('host-unreachable'),
      'the viewer to say it cannot reach the host',
    )
    // The run is somebody else's machine's business: this app went blind, and
    // a blind viewer does not get to end a session (MAR-3051 R2).
    expect(statuses).not.toContain('failed')
    expect(kept).toEqual([1, 2])
    expect(noteText(deltas)).toBe(
      'Remote session event stream is unavailable: Remote execution host ' +
        'event stream failed with 500. (HTTP 500): expected 3, got 4.',
    )

    handle.stop()
  }, 5_000)

  /**
   * The hole belongs to the run, not to the read that found it: re-opens that
   * deliver nothing leave it exactly as they found it (MAR-2779 round 4).
   *
   * `streamGap` is one read's business and is cleared when the next one opens,
   * and the read that spends the last attempt is usually one that delivered
   * nothing at all -- so a sentence taken from it would be the bare one, on a
   * run whose transcript is missing a frame. This is the case the test above
   * cannot show: there, every re-open reads the same hole again, and reading
   * either variable gives the same answer.
   *
   * `emitUnlogged` is what makes the difference visible. The daemon never
   * logged 4, so the resume it is asked for is answered with NOTHING: the
   * re-opens below are empty, not gapped.
   *
   * Mutation: read `this.streamGap` at the `failSession` site instead of the
   * carried `unhealedGap` and this is red on the missing suffix.
   */
  it('carries the hole across re-opens that delivered nothing', async () => {
    const host = hostWith(3)
    await host.refreshProviders()
    const statuses: SessionStatus[] = []
    const attentions: AttentionState[] = []
    const deltas: SessionDelta[] = []
    const handle = host.start('claude', startConfig('s-1'))
    handle.onStatusChange((status) => statuses.push(status))
    handle.onAttentionChange((attention) => attentions.push(attention))
    handle.onDelta((delta) => deltas.push(delta))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'activity', activity: 'thinking' }))
    // On the wire, and nowhere in the daemon's log.
    stub.emitUnlogged(envelope(4, { kind: 'heartbeat' }))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 2,
      'the resume the gap asked for',
    )
    stub.dropStream()
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 3,
      'the re-open after the first empty read',
    )
    stub.dropStream()

    await waitUntil(
      () => attentions.includes('host-unreachable'),
      'the budget to run out',
    )
    expect(statuses).not.toContain('failed')
    // Both resumes asked from the last contiguous sequence and were answered
    // with an empty stream; neither of them saw a gap of its own.
    expect(stub.eventStreamLastEventIds.slice(0, 3)).toEqual([null, '2', '2'])
    expect(kept).toEqual([1, 2])
    expect(noteText(deltas)).toBe(
      'Remote session event stream dropped and could not be re-established: expected 3, got 4.',
    )

    handle.stop()
  }, 5_000)

  /**
   * And the hole stops being carried the moment a read delivers: the resume is
   * the one thing that heals one, and a stream that gives up long afterwards
   * must not name a frame the daemon already replayed (MAR-2779 round 4).
   *
   * Without this, "carry the hole across reads" has only its holding half
   * pinned, and a run that recovered at 09:00 and lost its host at 17:00 blames
   * a hole that was filled eight hours earlier.
   *
   * Three drops: the first ends the read that delivered the replay and renews
   * the budget, and the two after it spend it on empty ones.
   *
   * Mutation: delete `else if (envelopes > 0) unhealedGap = null` and this is
   * red -- the last word carries `: expected 3, got 4.` for a hole that healed.
   */
  it('stops carrying a hole a later read has healed', async () => {
    const host = hostWith(3)
    await host.refreshProviders()
    const statuses: SessionStatus[] = []
    const attentions: AttentionState[] = []
    const deltas: SessionDelta[] = []
    const handle = host.start('claude', startConfig('s-1'))
    handle.onStatusChange((status) => statuses.push(status))
    handle.onAttentionChange((attention) => attentions.push(attention))
    handle.onDelta((delta) => deltas.push(delta))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'activity', activity: 'thinking' }))
    stub.loseFrame(envelope(3, { kind: 'heartbeat' }))
    stub.emit(envelope(4, { kind: 'heartbeat' }))

    await waitUntil(() => kept.length === 4, 'the resume to heal the hole')
    stub.dropStream()
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 3,
      'the re-open after the healed stream dropped',
    )
    stub.dropStream()
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 4,
      'the re-open after the first empty read',
    )
    stub.dropStream()

    await waitUntil(
      () => attentions.includes('host-unreachable'),
      'the budget to run out',
    )
    expect(statuses).not.toContain('failed')
    expect(kept).toEqual([1, 2, 3, 4])
    expect(noteText(deltas)).toBe(
      'Remote session event stream dropped and could not be re-established.',
    )

    handle.stop()
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
  it('stops spending its budget within the default attempts rather than re-dial forever', async () => {
    const host = hostWith()
    await host.refreshProviders()
    const statuses: SessionStatus[] = []
    const attentions: AttentionState[] = []
    const handle = host.start('claude', startConfig('s-1'))
    handle.onStatusChange((status) => statuses.push(status))
    handle.onAttentionChange((attention) => attentions.push(attention))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'activity', activity: 'thinking' }))
    // Wire-only, so the hole is a real loss (MAR-3051 R1 reads a repeated hole
    // as the daemon's pruned history instead), and then the daemon stops
    // answering at all: ten refused opens, and no eleventh at full speed.
    stub.emitUnlogged(envelope(4, { kind: 'status', status: 'completed' }))
    stub.setEventsStatus(500)

    await waitUntil(
      () => attentions.includes('host-unreachable'),
      'the viewer to say it cannot reach the host',
    )
    // The run is somebody else's machine's business: this app went blind, and
    // a blind viewer does not get to end a session (MAR-3051 R2).
    expect(statuses).not.toContain('failed')
    expect(stub.eventStreamLastEventIds.length).toBeGreaterThanOrEqual(10)
    expect(kept).toEqual([1, 2])

    handle.stop()
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
    const attentions: AttentionState[] = []
    const handle = host.start('claude', startConfig('s-1'))
    handle.onStatusChange((status) => statuses.push(status))
    handle.onAttentionChange((attention) => attentions.push(attention))

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
   * Mutation: drop the `count === 0` guard in `traceFramesAboveHole` and this
   * is red on the absence of the row -- the hole traces "0 frames above the
   * hole discarded in this read", which is the sentence this test exists to
   * keep out of the log.
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

  /**
   * The rule that heals the poisoned seat (MAR-3051 R1).
   *
   * The daemon deletes superseded streaming patches out of the middle of its
   * own log (MAR-2218a), so a resume answers with a number above the cursor and
   * no frames in between: 15838 then 15841 on the real seat. Read strictly that
   * is a gap the resume can never fill, and the session died of it every 2.5
   * minutes forever. Read here: the resume is the only thing that CAN heal a
   * gap, and it just said there is nothing to heal.
   *
   * Mutation: drop the `resumed` phase (`readEnvelopeSeq(this.lastSeq,
   * envelope.seq)`) and this run re-opens the same hole until the budget is
   * gone -- 5 never reaches the transcript and the poll below times out red.
   */
  it("accepts the first frame of a resume that sits above the daemon's pruned history", async () => {
    const host = hostWith(5)
    await host.refreshProviders()
    const handle = host.start('claude', startConfig('s-1'))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'activity', activity: 'thinking' }))
    await waitUntil(() => kept.length === 2, 'the live frames to land')
    // 3 and 4 were this item's streaming patches; the daemon pruned them and
    // its log now jumps from 2 to 5.
    stub.dropStream()
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 2,
      'the resume to open',
    )
    stub.emit(envelope(5, { kind: 'status', status: 'completed' }))

    await waitUntil(() => kept.length === 3, 'the resumed frame to be kept')
    expect(kept).toEqual([1, 2, 5])
    // One reconnect -- the drop -- and none for the hole.
    expect(stub.eventStreamLastEventIds).toEqual([null, '2'])
    expect(
      entries.some((entry) =>
        entry.note?.includes("pruned history confirmed by the daemon's replay"),
      ),
    ).toBe(true)

    handle.stop()
  })

  /**
   * The forgiveness is one frame wide. A resume answers the cursor once; a
   * second hole further down the same stream is a frame lost in transit like
   * any other, and MAR-2779's reconnect still owns it.
   *
   * Mutation: keep the `resumed` phase for the whole stream (never call
   * `nextEnvelopeSeqPhase`) and 7/8 are stepped over -- red on both the order
   * and the third resume header.
   */
  it('still reconnects for a hole later in the same resumed stream', async () => {
    const host = hostWith(5)
    await host.refreshProviders()
    const handle = host.start('claude', startConfig('s-1'))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    await waitUntil(() => kept.length === 1, 'the first frame to land')
    stub.dropStream()
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 2,
      'the resume to open',
    )
    // The pruned jump, forgiven, and then a genuine loss above it.
    stub.emit(envelope(5, { kind: 'activity', activity: 'thinking' }))
    stub.emit(envelope(6, { kind: 'activity', activity: 'thinking' }))
    stub.loseFrame(envelope(7, { kind: 'attention', attention: 'none' }))
    stub.emit(envelope(8, { kind: 'status', status: 'completed' }))

    await waitUntil(
      () => kept.length === 5,
      'the second resume to replay what was lost',
    )
    expect(kept).toEqual([1, 5, 6, 7, 8])
    expect(stub.eventStreamLastEventIds).toEqual([null, '1', '6'])

    handle.stop()
  })

  /**
   * R3, the seat itself: `execution_host_last_seq` is 15838 and the daemon's
   * next frame is 15841. Every turn on that session attached at the hole and
   * died at it; with the reading above the attach moves on.
   *
   * Mutation: drop the `resumed` phase and the attach never keeps a frame.
   */
  it('attaches at a cursor inside a pruned range and moves on', async () => {
    const host = hostWith(5)
    await host.refreshProviders()
    const handle = host.attach('claude', startConfig('s-1'), 15838)

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the attach stream to open',
    )
    expect(stub.eventStreamLastEventIds).toEqual(['15838'])
    // The daemon's log jumps 15838 -> 15841: 15839 and 15840 were the
    // streaming patches of the item that completed at 15841.
    stub.emit(envelope(15841, { kind: 'activity', activity: 'thinking' }))
    stub.emit(envelope(15842, { kind: 'status', status: 'completed' }))

    await waitUntil(() => kept.length === 2, 'the attached frames to be kept')
    expect(kept).toEqual([15841, 15842])
    // One stream, no reconnect: the attach did not die at the hole.
    expect(stub.eventStreamLastEventIds).toEqual(['15838'])

    handle.stop()
  })

  /**
   * The deployed daemon's replay (`414f7403`), frame for frame (MAR-3052 lap
   * 2): every replayed envelope is written `event: replay` + `id` + `data`,
   * the one standalone frame is `caught-up {throughSeq}`, and live frames
   * follow. 2, 4, 6 and 7 are the daemon's pruned history.
   *
   * 8 landing without a reconnect is the cursor standing at `throughSeq`: a
   * cursor left at 5 reads 8 as a live gap and re-opens from 5.
   *
   * Mutation: return early on a `replay` frame instead of falling through to
   * decode it, and 3 and 5 never reach the run -- red on the poll.
   */
  it("keeps the deployed daemon's named replay, then stands where caught-up says", async () => {
    const host = hostWith(5)
    await host.refreshProviders()
    const handle = host.start('claude', startConfig('s-1'))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    await waitUntil(() => kept.length === 1, 'the live frame to land')
    stub.dropStream()
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 2,
      'the resume to open',
    )
    const replayed = (seq: number): void =>
      stub.emitNamed(
        'replay',
        JSON.stringify(
          envelope(seq, { kind: 'activity', activity: 'thinking' }),
        ),
        seq,
      )
    replayed(3)
    replayed(5)
    stub.emitNamed('caught-up', JSON.stringify({ throughSeq: 7 }))
    stub.emit(envelope(8, { kind: 'status', status: 'completed' }))

    await waitUntil(
      () => kept.length === 4,
      'the replay and the live frame to be kept',
    )
    expect(kept).toEqual([1, 3, 5, 8])
    expect(stub.eventStreamLastEventIds).toEqual([null, '1'])
    expect(
      entries.some(
        (entry) => entry.note === 'replay complete; strict sequencing resumes',
      ),
    ).toBe(true)

    handle.stop()
  })

  /**
   * `caught-up` moves the cursor the next resume asks from, even when the
   * replay it closes delivered nothing (MAR-3052 lap 2).
   *
   * Mutation: drop `this.lastSeq = throughSeq` and the third open asks from 1
   * again -- red on the headers.
   */
  it('resumes from the sequence a caught-up frame named', async () => {
    const host = hostWith(5)
    await host.refreshProviders()
    const handle = host.start('claude', startConfig('s-1'))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    await waitUntil(() => kept.length === 1, 'the live frame to land')
    stub.dropStream()
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 2,
      'the resume to open',
    )
    // Everything from 2 to 4 was pruned: the replay is empty and says so.
    stub.emitNamed('caught-up', JSON.stringify({ throughSeq: 4 }))
    stub.dropStream()

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 3,
      'the next resume to open',
    )
    expect(stub.eventStreamLastEventIds).toEqual([null, '1', '4'])
    expect(kept).toEqual([1])

    handle.stop()
  })

  /**
   * Two holes of different kinds back to back (MAR-3052 lap 2). A live gap on
   * the third frame of a stream, and the resume it provokes answering with a
   * first frame that is itself above a further prune: the daemon carried 4,
   * lost 3 on the wire, and pruned both before the resume arrived.
   *
   * The resume is a new stream with its own `resumed` phase; the `live` phase
   * the gapped stream ended in must not follow it across the re-open.
   *
   * Mutation: set `streamPhase = 'resumed'` only for the first stream, and 5
   * is read as a second gap -- the budget re-opens from 2 until it is spent,
   * red on the poll.
   */
  it('accepts a resume that lands above a further pruned hole after a gap', async () => {
    const host = hostWith(5)
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
    await waitUntil(() => kept.length === 2, 'the live frames to land')
    // The daemon's log already reads 1, 2, 5; the wire still carries 4.
    stub.loseFrame(envelope(5, { kind: 'activity', activity: 'thinking' }))
    stub.emitUnlogged(envelope(4, { kind: 'activity', activity: 'thinking' }))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 2,
      'the gap to resume',
    )
    stub.emit(envelope(6, { kind: 'status', status: 'completed' }))

    await waitUntil(() => kept.length === 4, 'the resume to be kept')
    expect(kept).toEqual([1, 2, 5, 6])
    // One reconnect -- the gap -- and none for the prune under the resume.
    expect(stub.eventStreamLastEventIds).toEqual([null, '2'])
    expect(statuses).not.toContain('failed')

    handle.stop()
  })
})
