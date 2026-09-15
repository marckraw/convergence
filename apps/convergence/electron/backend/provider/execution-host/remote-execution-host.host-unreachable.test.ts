import { beforeEach, describe, expect, it } from 'vitest'
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
  AttentionState,
  SessionStartConfig,
  SessionStatus,
} from '../provider.types'
import type { SessionDelta } from '../../session/conversation-item.types'

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

  beforeEach(() => {
    stub = createStubDaemon()
    waits = []
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
    const kept: number[] = []
    const handle = host.start('claude', startConfig())
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
    const opensWhileBlind = stub.eventStreamLastEventIds.length

    // The host comes back, and the daemon still has everything above the
    // cursor, terminal included.
    stub.setEventsStatus(200)
    stub.emit(envelope(2, { kind: 'status', status: 'completed' }))

    await waitUntil(
      () => statuses.includes('completed'),
      'the terminal the daemon held to reach the run',
    )
    handle.onDelta(() => {})
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
    expect(stub.eventStreamLastEventIds.length).toBeGreaterThan(opensWhileBlind)
    // One settle, not two: the run was never failed, so `completed` is the
    // first terminal this session ever saw and the relay has a baton to carry.
    expect(statuses.filter((status) => status === 'completed')).toHaveLength(1)

    handle.stop()
    void kept
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
    const handle = host.start('claude', startConfig())
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
})
