import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import type {
  AttentionState,
  SessionHandle,
  SessionStartConfig,
} from '../provider.types'
import {
  createStubDaemon,
  DAEMON_HEALTH_FIXTURE_0_26_1,
  envelope,
  waitUntil,
  type StubDaemon,
} from '@convergence/execution-host-client'
import { EXECUTION_HOST_STOP_TASK_CAPABILITY } from './execution-host-wire-mapping.pure'
import { RemoteExecutionHost } from './remote-execution-host'

function createHost(stub: StubDaemon): RemoteExecutionHost {
  return new RemoteExecutionHost({
    onEventSeq: () => {},
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
  })
}

/** The 0.26.1 capture with `stop-task` added, as a 0.19-protocol host says. */
function healthWithStopTask(): string {
  const body = JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1) as {
    executionProtocol: { capabilities: string[] }
  }
  body.executionProtocol.capabilities.push(EXECUTION_HOST_STOP_TASK_CAPABILITY)
  return JSON.stringify(body)
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

/** The handle's optional `stopTask`, which a remote run always carries. */
function stopTaskOf(handle: SessionHandle): (id: string) => Promise<void> {
  const stopTask = handle.stopTask
  if (!stopTask) throw new Error('expected the remote handle to carry stopTask')
  return stopTask
}

/** Lets every already-scheduled continuation run before the test goes on. */
async function settleScheduledWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * The parallel-work panel's Stop on one task of a remote run (MAR-3684):
 * offered only where the host takes `stop-task`, posted as one command, and a
 * refusal handed back to the panel rather than written into the transcript.
 */
describe('RemoteExecutionHost stop-task', () => {
  let stub: StubDaemon
  let host: RemoteExecutionHost

  beforeEach(() => {
    stub = createStubDaemon()
    host = createHost(stub)
  })

  async function startedHandle(sessionId: string): Promise<SessionHandle> {
    const handle = host.start('claude', startConfig(sessionId))
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'event stream to open',
    )
    return handle
  }

  describe('on a host that advertises commands.stopTask.v1', () => {
    beforeEach(async () => {
      stub.setHealthBody(healthWithStopTask())
      await host.refreshProviders()
    })

    /** Mutation: post the envelope to another session's URL, or build any command but `{ kind: 'stop-task', taskId }`, and this is red. */
    it('offers Stop once the run started and posts exactly one stop-task envelope', async () => {
      const handle = await startedHandle('s-stop')
      const deltas: SessionDelta[] = []
      handle.onDelta((delta) => deltas.push(delta))
      stub.emit(envelope(1, { kind: 'status', status: 'running' }, 's-stop'))
      await waitUntil(() => deltas.length === 1, 'the stream to deliver')

      expect(handle.canStopTasks).toBe(true)
      await stopTaskOf(handle)('bash-task')

      expect(stub.commandEnvelopes).toEqual([
        {
          protocolVersion: 1,
          sessionId: 's-stop',
          command: { kind: 'stop-task', taskId: 'bash-task' },
        },
      ])
      expect(stub.commandRequests.map((request) => request.sessionId)).toEqual([
        's-stop',
      ])

      handle.stop()
    })

    /** Mutation: drop the `!this.stopped` check from `canStopTasks()` and this is red. */
    it('stops offering Stop once the run is stopped', async () => {
      const handle = await startedHandle('s-stopped')
      expect(handle.canStopTasks).toBe(true)

      handle.stop()

      expect(handle.canStopTasks).toBe(false)
      await expect(stopTaskOf(handle)('bash-task')).rejects.toThrow(
        'Stop is not available on this remote host',
      )
      expect(
        stub.commandEnvelopes.filter(
          (posted) =>
            (posted.command as { kind?: string } | undefined)?.kind ===
            'stop-task',
        ),
      ).toHaveLength(0)
    })

    /** Mutation: have `dispose()` leave `stopped` unset and this is red. */
    it('stops offering Stop once the run is disposed', async () => {
      const handle = await startedHandle('s-disposed')
      expect(handle.canStopTasks).toBe(true)

      void handle.dispose?.()

      expect(handle.canStopTasks).toBe(false)
    })

    /** Mutation: route `stopTask` through `enqueueCommand`/`postCommand` (which notes an undelivered command), or swallow the failure, and this is red. */
    it('throws a refused stop back to the caller without writing a note or raising attention', async () => {
      const handle = await startedHandle('s-refused')
      const deltas: SessionDelta[] = []
      const attentions: AttentionState[] = []
      handle.onDelta((delta) => deltas.push(delta))
      handle.onAttentionChange((attention) => attentions.push(attention))
      stub.setCommandStatus(500)

      const refusal = await stopTaskOf(handle)('bash-task').then(
        () => null,
        (error: unknown) => error,
      )

      expect(refusal).toBeInstanceOf(Error)
      expect((refusal as Error).message).toMatch(
        /^The remote host did not stop the task/,
      )
      await settleScheduledWork()
      expect(deltas).toEqual([])
      expect(attentions).toEqual([])
      expect(stub.commandEnvelopes).toHaveLength(0)
      expect(handle.canStopTasks).toBe(true)

      stub.setCommandStatus(202)
      handle.stop()
    })
  })

  describe('on a host that does not advertise it', () => {
    beforeEach(async () => {
      await host.refreshProviders()
    })

    /** Mutation: make `canStopTasks()` ignore the handshake's capabilities and this is red. */
    it('does not offer Stop and refuses stopTask without posting anything', async () => {
      const handle = await startedHandle('s-old-host')

      expect(handle.canStopTasks).toBe(false)
      await expect(stopTaskOf(handle)('bash-task')).rejects.toThrow(
        'Stop is not available on this remote host',
      )
      expect(stub.commandEnvelopes).toHaveLength(0)

      handle.stop()
    })
  })
})
