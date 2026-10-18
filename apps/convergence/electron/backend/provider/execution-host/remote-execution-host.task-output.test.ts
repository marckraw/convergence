import { beforeEach, describe, expect, it } from 'vitest'
import {
  createStubDaemon,
  DAEMON_HEALTH_FIXTURE_0_26_1,
  type StubDaemon,
} from '@convergence/execution-host-client'
import { EXECUTION_HOST_TASK_OUTPUT_CAPABILITY } from './execution-host-wire-mapping.pure'
import { RemoteExecutionHost } from './remote-execution-host'

/** The 0.26.1 capture with `tasks.output.v1` added, as a 0.24-protocol host says. */
function healthWithTaskOutput(): string {
  const body = JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1) as {
    executionProtocol: { capabilities: string[] }
  }
  body.executionProtocol.capabilities.push(
    EXECUTION_HOST_TASK_OUTPUT_CAPABILITY,
  )
  return JSON.stringify(body)
}

const OUTPUT_ANSWER = {
  sessionId: 's-1',
  taskId: 'bash-1',
  status: 'running',
  text: 'line one\nline two\n',
  startOffset: 10,
  endOffset: 28,
  totalBytes: 28,
  truncated: true,
  readAt: '2026-10-18T10:00:00.000Z',
}

interface OutputRequest {
  url: string
  authorization: string | null
}

/**
 * The output route is not one the stub daemon serves, so this wraps its fetch
 * and answers the route from `respond`, recording what was asked.
 */
function withOutputRoute(
  stub: StubDaemon,
  respond: () => Response | Promise<Response>,
): { fetch: typeof fetch; requests: OutputRequest[] } {
  const requests: OutputRequest[] = []
  const wrapped = (async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    if (/\/tasks\/[^/]+\/output(\?|$)/.test(url)) {
      const headers = init?.headers as Record<string, string> | undefined
      requests.push({ url, authorization: headers?.Authorization ?? null })
      return respond()
    }
    return stub.fetchFn(input as Parameters<typeof fetch>[0], init)
  }) as typeof fetch
  return { fetch: wrapped, requests }
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * A remote task's output tail (`tasks.output.v1`, MAR-4275): asked of the host
 * that runs the session, only where it advertises the route, as a session and
 * a task id and never a path, and answered with the host's coded refusals.
 */
describe('RemoteExecutionHost readTaskOutput', () => {
  let stub: StubDaemon
  let answer: () => Response | Promise<Response>
  let requests: OutputRequest[]
  let host: RemoteExecutionHost

  beforeEach(() => {
    stub = createStubDaemon()
    answer = () => json(OUTPUT_ANSWER)
    const route = withOutputRoute(stub, () => answer())
    requests = route.requests
    host = new RemoteExecutionHost({
      onEventSeq: () => {},
      connection: {
        resolveConnection: async () => ({
          baseUrl: 'http://daemon.test',
          token: 'test-token',
        }),
      },
      fetch: route.fetch,
    })
  })

  describe('on a host that advertises tasks.output.v1', () => {
    beforeEach(async () => {
      stub.setHealthBody(healthWithTaskOutput())
      await host.refreshProviders()
    })

    /** Mutation: ask for another path, drop the token, or pass the task id unencoded, and this is red. */
    it('asks for the most the route gives by session and task id, and returns the host-redacted tail', async () => {
      const reading = await host.readTaskOutput('s-1', 'bash-1')

      expect(requests).toEqual([
        {
          url: 'http://daemon.test/v0/execution/sessions/s-1/tasks/bash-1/output?tail=65536',
          authorization: 'Bearer test-token',
        },
      ])
      expect(reading).toEqual({
        kind: 'output',
        text: 'line one\nline two\n',
        status: 'running',
        truncated: true,
        totalBytes: 28,
        readAt: '2026-10-18T10:00:00.000Z',
      })
      expect(host.readsTaskOutput()).toBe(true)
    })

    /** Mutation: build the target with a path from the row, or skip the protocol's id check, and this is red. */
    it('refuses an id the route cannot name without sending anything', async () => {
      expect(await host.readTaskOutput('s-1', '../etc/passwd')).toEqual({
        kind: 'refused',
        code: 'rejected',
      })
      expect(requests).toEqual([])
    })

    /** Mutation: map the refusal from the message text, or from the status alone, and one row of this table is red. */
    it.each([
      [404, { error: 'x', code: 'session-unknown' }, 'session-unknown'],
      [404, { error: 'x', code: 'task-unknown' }, 'task-unknown'],
      [404, { error: 'x', code: 'no-output' }, 'no-output'],
      [403, { error: 'x', code: 'read-refused' }, 'read-refused'],
      [400, { error: 'x', code: 'rejected' }, 'rejected'],
      // No code on a 404: a host without the route, or a proxy.
      [404, { error: 'not found' }, 'unsupported'],
      // A code this build does not know is never "no route".
      [404, { error: 'x', code: 'newer-code' }, 'rejected'],
      // A known code with a status the protocol does not give it.
      [403, { error: 'x', code: 'no-output' }, 'rejected'],
    ])('reads a %i %j refusal as %s', async (status, body, code) => {
      answer = () => json(body, status)

      expect(await host.readTaskOutput('s-1', 'bash-1')).toEqual({
        kind: 'refused',
        code,
      })
    })

    /** Mutation: accept a 2xx without checking whom it is about and this is red. */
    it('calls an answer about another task malformed', async () => {
      answer = () => json({ ...OUTPUT_ANSWER, taskId: 'other-task' })

      expect(await host.readTaskOutput('s-1', 'bash-1')).toEqual({
        kind: 'refused',
        code: 'malformed',
      })
    })

    /** Mutation: turn every failure into a refusal and this is red; a host that cannot be reached says nothing of the task. */
    it('throws, rather than refusing, when the host cannot be reached or the token is refused', async () => {
      answer = () => {
        throw new Error('connect ECONNREFUSED')
      }
      await expect(host.readTaskOutput('s-1', 'bash-1')).rejects.toThrow(
        /unreachable/,
      )

      answer = () => json({ error: 'bad token' }, 401)
      await expect(host.readTaskOutput('s-1', 'bash-1')).rejects.toThrow(
        'bad token',
      )

      answer = () => json({ error: 'boom' }, 500)
      await expect(host.readTaskOutput('s-1', 'bash-1')).rejects.toThrow('boom')
    })
  })

  describe('on a host that does not advertise it', () => {
    beforeEach(async () => {
      await host.refreshProviders()
    })

    /** Mutation: drop the capability check from `readTaskOutput` and this is red. */
    it('is refused as unsupported without asking the host', async () => {
      expect(host.readsTaskOutput()).toBe(false)

      expect(await host.readTaskOutput('s-1', 'bash-1')).toEqual({
        kind: 'refused',
        code: 'unsupported',
      })
      expect(requests).toEqual([])
    })
  })

  describe('on a host that said nothing readable', () => {
    /** Mutation: read an unknown handshake as "advertises" and this is red; stop-task is withheld from such a host for the same reason. */
    it('is not asked either', async () => {
      stub.setHealthBody(null)
      await host.refreshProviders()

      expect(host.readsTaskOutput()).toBe(false)
      expect(await host.readTaskOutput('s-1', 'bash-1')).toEqual({
        kind: 'refused',
        code: 'unsupported',
      })
      expect(requests).toEqual([])
    })
  })
})
