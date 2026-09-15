import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createStubDaemon,
  envelope,
  waitUntil,
  type StubDaemon,
} from '@convergence/execution-host-client'
import {
  HOST_UNREACHABLE_RETRY_MS,
  RemoteExecutionHost,
} from './remote-execution-host'
import type {
  ActivitySignal,
  AttentionState,
  SessionHandle,
  SessionStartConfig,
  SessionStatus,
} from '../provider.types'
import type { SessionDelta } from '../../session/conversation-item.types'
import type { ProviderDebugEntry } from '../../provider-debug/provider-debug.types'

/**
 * A viewer that cannot reach its host has not watched a run fail (MAR-3051 S2).
 *
 * The daemon runs the agent on another machine. When the wire between this app
 * and that machine goes down — wifi, Tailscale, a laptop lid — the run carries
 * on: on the seat this ticket was filed for, the horse committed four times,
 * opened a PR and reported to Linear, all after the card read "Failed". The
 * `failed` patch was this app's own, written when its reconnect budget ran out,
 * and it cost three things at once: the card lied, the real `completed`
 * terminal was never applied (so `RelayEngine` recorded `skipped-failed` and
 * the baton died), and the seat stayed poisoned because a fail-patch carries no
 * `executionHostSeq`, so every later turn attached at the same cursor and died
 * the same way.
 *
 * So the budget stops being a verdict. It still rate-limits reconnects — that
 * is what it was for (MAR-2779 round 2) — and when it is spent the run says the
 * honest thing instead: the status stays whatever the daemon last said, the
 * attention says this viewer is blind, and the loop keeps looking, slowly,
 * until the session is stopped.
 */
describe('a remote session whose host stops answering', () => {
  let stub: StubDaemon
  let waits: number[]
  let entries: ProviderDebugEntry[]
  /**
   * Every run a test started. A test that goes red before its own
   * `handle.stop()` would otherwise leave a live retry loop scheduling timers
   * into the next test -- which is how one mutation's red once showed up in a
   * second test that had nothing to do with it.
   */
  let handles: SessionHandle[]

  function track(handle: SessionHandle): SessionHandle {
    handles.push(handle)
    return handle
  }

  function hostWith(maxAttempts: number): RemoteExecutionHost {
    return new RemoteExecutionHost({
      connection: {
        resolveConnection: async () => ({
          baseUrl: 'http://daemon.test',
          token: 'test-token',
        }),
      },
      fetch: stub.fetchFn,
      // A record that accepts every cursor write. Without it the host has no
      // one to tell a kept sequence to, and each dispatch would end its read by
      // throwing -- the local refusal this adapter still fails a run for.
      onEventSeq: () => {},
      debugSink: { record: (entry) => entries.push(entry) },
      reconnect: {
        maxAttempts,
        // Only the LENGTH of each wait is stubbed; the delay the loop ASKED
        // for is recorded, which is the only way a 60-second cadence can be
        // asserted in a test that must finish in milliseconds.
        wait: (ms) => {
          waits.push(ms)
          return new Promise((resolve) => setTimeout(resolve, 0))
        },
      },
    })
  }

  function startConfig(): SessionStartConfig {
    return {
      sessionId: 's-1',
      workingDirectory: '/work',
      initialMessage: 'hello',
      model: null,
      effort: null,
      continuationToken: null,
    }
  }

  function noteTexts(deltas: SessionDelta[]): string[] {
    return deltas.flatMap((delta) =>
      delta.kind === 'conversation.item.add' && delta.item.kind === 'note'
        ? [delta.item.text]
        : [],
    )
  }

  function attentionPatches(deltas: SessionDelta[]): AttentionState[] {
    return deltas.flatMap((delta) =>
      delta.kind === 'session.patch' && delta.patch.attention
        ? [delta.patch.attention]
        : [],
    )
  }

  function lifecycleNotes(): string[] {
    return entries.flatMap((entry) =>
      entry.channel === 'lifecycle' && entry.note ? [entry.note] : [],
    )
  }

  beforeEach(() => {
    stub = createStubDaemon()
    waits = []
    entries = []
    handles = []
  })

  afterEach(() => {
    for (const handle of handles) handle.stop()
    vi.useRealTimers()
  })

  /**
   * The ticket's canary: the host goes quiet for longer than the budget, then
   * comes back, and the session was never failed.
   *
   * Mutation: call `failSession` at the spent budget again (the shipped
   * behaviour before this change) and every assertion below is red — the
   * status, the attention, and the terminal that arrives afterwards, which a
   * dead run drops on the floor.
   */
  it('keeps the run alive, says the host is unreachable, and catches up when it returns', async () => {
    const host = hostWith(3)
    await host.refreshProviders()
    const statuses: SessionStatus[] = []
    const attentions: AttentionState[] = []
    const deltas: SessionDelta[] = []
    const handle = track(host.start('claude', startConfig()))
    handle.onStatusChange((status) => statuses.push(status))
    handle.onAttentionChange((attention) => attentions.push(attention))
    handle.onDelta((delta) => deltas.push(delta))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    await waitUntil(
      () => statuses.includes('running'),
      'the run to report itself running',
    )

    // The wire goes down: every open is refused for longer than the budget.
    stub.setEventsStatus(503)
    stub.dropStream()
    await waitUntil(
      () => attentions.includes('host-unreachable'),
      'the viewer to say it cannot reach the host',
    )
    expect(statuses).not.toContain('failed')
    expect(attentionPatches(deltas)).toContain('host-unreachable')
    // The sentence the person reads is the one this adapter already used for a
    // stream it could not re-establish; only the verdict changed.
    expect(noteTexts(deltas).at(-1)).toContain(
      'Remote session event stream is unavailable',
    )
    // The budget's backoff is over; from here it is one look a minute.
    expect(waits).toContain(HOST_UNREACHABLE_RETRY_MS)
    // The debug log is the only place the outage can be read afterwards, and
    // it names the cadence and the cursor the looks resume from (MAR-3052 lap
    // 2: both lines were invisible to every mutation before).
    expect(lifecycleNotes()).toContain(
      'host unreachable; retrying every 60s from seq 1 until this run is stopped',
    )
    const opensWhileBlind = stub.eventStreamLastEventIds.length

    // The host comes back, and the daemon still has everything above the
    // cursor, terminal included.
    stub.setEventsStatus(200)
    stub.emit(envelope(2, { kind: 'status', status: 'completed' }))

    await waitUntil(
      () => statuses.includes('completed'),
      'the terminal the daemon held to reach the run',
    )
    expect(statuses).not.toContain('failed')
    // The warning comes down by itself: the first kept envelope is the proof
    // that this app can see again. What follows it is the terminal's own
    // attention (`finished`), which is the daemon's word rather than ours.
    expect(attentions.indexOf('none')).toBeGreaterThan(
      attentions.indexOf('host-unreachable'),
    )
    expect(attentions.at(-1)).toBe('finished')
    expect(attentionPatches(deltas).indexOf('none')).toBeGreaterThan(
      attentionPatches(deltas).indexOf('host-unreachable'),
    )
    // Said before the terminal is dispatched, at the cursor it arrived above.
    expect(lifecycleNotes()).toContain('host reachable again at seq 1')
    expect(stub.eventStreamLastEventIds.length).toBeGreaterThan(opensWhileBlind)
    // One settle, not two: the run was never failed, so `completed` is the
    // first terminal this session ever saw and the relay has a baton to carry.
    expect(statuses.filter((status) => status === 'completed')).toHaveLength(1)

    handle.stop()
  }, 5_000)

  /**
   * The attention is said once per outage, not once per look.
   *
   * A note per retry would bury the transcript it exists to explain — and at
   * one a minute, an overnight outage would write several hundred of them.
   *
   * Mutation: drop the `hostUnreachable` guard in `noteHostUnreachable` and
   * this is red on the count.
   */
  it('says it once, however many times it looks again', async () => {
    const host = hostWith(2)
    await host.refreshProviders()
    const deltas: SessionDelta[] = []
    const handle = track(host.start('claude', startConfig()))
    handle.onDelta((delta) => deltas.push(delta))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.setEventsStatus(503)
    stub.dropStream()

    await waitUntil(
      () => attentionPatches(deltas).includes('host-unreachable'),
      'the viewer to say it cannot reach the host',
    )
    await waitUntil(
      () => waits.filter((ms) => ms === HOST_UNREACHABLE_RETRY_MS).length >= 3,
      'three slow looks',
    )

    expect(
      noteTexts(deltas).filter((text) =>
        text.includes('Remote session event stream'),
      ),
    ).toHaveLength(1)
    expect(
      attentionPatches(deltas).filter((state) => state === 'host-unreachable'),
    ).toHaveLength(1)

    handle.stop()
  }, 5_000)

  /**
   * An outage laid over a pending request must not take the request with it
   * (MAR-3052 lap 2).
   *
   * The daemon raised `needs-approval` at 1, below the cursor every look
   * resumes from, so it will never say it again: the only copy of that fact
   * this app still holds is the one it saw. Clearing the warning to `none`
   * left a run blocked on a person with a card that said nothing was owed.
   *
   * Mutation: clear to `'none'` unconditionally (lap 1) -- red on the restore.
   */
  it('puts back the attention the daemon last said when the host returns', async () => {
    const host = hostWith(2)
    await host.refreshProviders()
    const attentions: AttentionState[] = []
    const activities: ActivitySignal[] = []
    const deltas: SessionDelta[] = []
    const handle = track(host.start('claude', startConfig()))
    handle.onAttentionChange((attention) => attentions.push(attention))
    handle.onActivityChange((activity) => activities.push(activity))
    handle.onDelta((delta) => deltas.push(delta))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the first stream to open',
    )
    stub.emit(envelope(1, { kind: 'attention', attention: 'needs-approval' }))
    await waitUntil(
      () => attentions.includes('needs-approval'),
      'the request to reach the card',
    )

    stub.setEventsStatus(503)
    stub.dropStream()
    await waitUntil(
      () => attentions.includes('host-unreachable'),
      'the viewer to say it cannot reach the host',
    )

    // The host comes back with a frame that says nothing about attention.
    stub.setEventsStatus(200)
    stub.emit(envelope(2, { kind: 'activity', activity: 'thinking' }))
    await waitUntil(
      () => activities.includes('thinking'),
      'the first kept envelope after the outage',
    )

    expect(attentions).toEqual([
      'needs-approval',
      'host-unreachable',
      'needs-approval',
    ])
    expect(attentionPatches(deltas)).toEqual([
      'needs-approval',
      'host-unreachable',
      'needs-approval',
    ])

    handle.stop()
  }, 5_000)

  /**
   * `stop()` during the minute-long look is noticed at once, not when the
   * minute is over (MAR-3052 lap 2).
   *
   * The REAL wait, deliberately, under fake timers: an injected wait resolves
   * at once and cannot tell an abortable wait from a fast one. The run is
   * stopped five seconds into sixty; the loop must have ended and left no timer
   * behind before the clock moves again.
   *
   * Mutations: await `policy.wait` directly with a bare `setTimeout` default
   * (lap 1) and the loop has not ended at five seconds -- red on the trace and
   * the timer. Keep the early resolve but a bare default and the loop ends
   * while a sixty-second timer is still scheduled -- red on the count.
   */
  it('lets go of the minute-long wait the moment the run is stopped', async () => {
    const host = new RemoteExecutionHost({
      connection: {
        resolveConnection: async () => ({
          baseUrl: 'http://daemon.test',
          token: 'test-token',
        }),
      },
      fetch: stub.fetchFn,
      onEventSeq: () => {},
      debugSink: { record: (entry) => entries.push(entry) },
      reconnect: { maxAttempts: 1 },
    })
    await host.refreshProviders()
    stub.setEventsStatus(503)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    const attentions: AttentionState[] = []
    const handle = track(host.start('claude', startConfig()))
    handle.onAttentionChange((attention) => attentions.push(attention))
    for (let turn = 0; turn < 100; turn += 1) {
      if (attentions.includes('host-unreachable')) break
      await vi.advanceTimersByTimeAsync(0)
    }
    expect(attentions).toContain('host-unreachable')
    // Precondition: the loop is inside the one-minute look, and nothing else.
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(5_000)
    handle.stop()
    await vi.advanceTimersByTimeAsync(0)

    expect(
      lifecycleNotes().some((note) =>
        note.startsWith('event stream loop ended'),
      ),
    ).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(stub.eventStreamLastEventIds).toHaveLength(1)
  }, 5_000)
})
