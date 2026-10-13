import { beforeEach, describe, expect, it } from 'vitest'
import {
  createStubDaemon,
  deferred,
  envelope,
  waitUntil,
  type StubDaemon,
} from '@convergence/execution-host-client'
import { RemoteExecutionHost } from './remote-execution-host'
import type { SessionStartConfig } from '../provider.types'
import type { SessionDelta } from '../../session/conversation-item.types'

/**
 * The count a reattach reads from the snapshot is the oldest word, never the
 * last (MAR-3987).
 *
 * The read runs beside the resumed stream so a hung request cannot hold the
 * stream shut, which means its answer can arrive after the stream has already
 * said a newer count. The snapshot is held here until it has, to pin that
 * order rather than hope for it.
 */
describe('the running tasks a reattach reads back', () => {
  let stub: StubDaemon

  const config: SessionStartConfig = {
    sessionId: 's-1',
    workingDirectory: '/work',
    initialMessage: 'hello',
    model: null,
    effort: null,
    continuationToken: null,
  }

  beforeEach(() => {
    stub = createStubDaemon()
    stub.setSessionSnapshot('s-1', { status: 'answered', runningTasks: 1 })
  })

  function hostWithSnapshotGate(gate: Promise<void>): RemoteExecutionHost {
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input)
      if (
        (init?.method ?? 'GET') === 'GET' &&
        /\/v0\/execution\/sessions\/[^/]+$/.test(url)
      )
        await gate
      return stub.fetchFn(input, init)
    }
    return new RemoteExecutionHost({
      connection: {
        resolveConnection: async () => ({
          baseUrl: 'http://daemon.test',
          token: 'test-token',
        }),
      },
      fetch: fetchFn,
      onEventSeq: () => {},
      reconnect: {
        maxAttempts: 2,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
      },
    })
  }

  function counts(deltas: SessionDelta[]): number[] {
    return deltas.flatMap((delta) =>
      delta.kind === 'session.patch' && delta.patch.runningTasks !== undefined
        ? [delta.patch.runningTasks]
        : [],
    )
  }

  /**
   * Mutation: drop the `streamSaidRunningTasks` check, and the snapshot's 1
   * lands over the stream's 0 -- a finished task read as running -- red.
   */
  it('lets a count the stream already gave stand over the snapshot', async () => {
    const gate = deferred()
    const host = hostWithSnapshotGate(gate.promise)
    await host.refreshProviders()
    const deltas: SessionDelta[] = []
    const handle = host.attach('claude', config, 5)
    handle.onDelta((delta) => deltas.push(delta))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the resumed stream to open',
    )
    stub.emit(
      envelope(6, {
        kind: 'delta',
        delta: { kind: 'session.patch', patch: { runningTasks: 0 } },
      }),
    )
    await waitUntil(() => counts(deltas).length === 1, 'the stream count')

    gate.release()
    await waitUntil(
      () => stub.snapshotRequests.length === 1,
      'the snapshot to be read',
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(counts(deltas)).toEqual([0])

    handle.stop()
  })

  it('gives the snapshot count when the stream has said none', async () => {
    const gate = deferred()
    gate.release()
    const host = hostWithSnapshotGate(gate.promise)
    await host.refreshProviders()
    const deltas: SessionDelta[] = []
    const handle = host.attach('claude', config, 5)
    handle.onDelta((delta) => deltas.push(delta))

    await waitUntil(() => counts(deltas).length === 1, 'the snapshot count')
    expect(counts(deltas)).toEqual([1])

    handle.stop()
  })
})
