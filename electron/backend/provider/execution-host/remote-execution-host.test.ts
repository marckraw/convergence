import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import type {
  AttentionState,
  SessionStartConfig,
  SessionStatus,
} from '../provider.types'
import type { ExecutionHostEventEnvelope } from './execution-host-protocol.types'
import {
  describeProviderExecutionHostContract,
  type ExecutionHostContractContext,
} from './execution-host.contract'
import { RemoteExecutionHost } from './remote-execution-host'
import { RemoteExecutionHostError } from './remote-execution-host.types'

const DAEMON_META = {
  providers: [
    {
      id: 'claude',
      label: 'Claude Code',
      available: true,
      authenticated: true,
      models: [{ slug: 'sonnet', label: 'Claude Sonnet' }],
      features: { resume: true, followup: true },
    },
    {
      id: 'codex',
      label: 'Codex',
      available: true,
      authenticated: true,
      models: [{ slug: 'gpt-5.5', label: 'GPT-5.5' }],
      features: { resume: false, followup: true },
    },
  ],
}

interface StubDaemon {
  fetchFn: typeof fetch
  emit: (envelope: ExecutionHostEventEnvelope) => void
  dropStream: () => void
  startRequests: Array<Record<string, unknown>>
  commandEnvelopes: Array<Record<string, unknown>>
  eventStreamLastEventIds: Array<string | null>
  setMetaStatus: (status: number) => void
  setStartStatus: (status: number) => void
  setCommandStatus: (status: number) => void
  setEventsStatus: (status: number) => void
}

function createStubDaemon(): StubDaemon {
  const encoder = new TextEncoder()
  const log: ExecutionHostEventEnvelope[] = []
  const startRequests: Array<Record<string, unknown>> = []
  const commandEnvelopes: Array<Record<string, unknown>> = []
  const eventStreamLastEventIds: Array<string | null> = []
  const current: {
    controller: ReadableStreamDefaultController<Uint8Array> | null
  } = { controller: null }
  let metaStatus = 200
  let startStatus = 201
  let commandStatus = 202
  let eventsStatus = 200

  const sseChunk = (envelope: ExecutionHostEventEnvelope): Uint8Array =>
    encoder.encode(`id: ${envelope.seq}\ndata: ${JSON.stringify(envelope)}\n\n`)

  const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  const headerValue = (
    headers: RequestInit['headers'],
    name: string,
  ): string | null => {
    if (!headers) return null
    const record = headers as Record<string, string>
    return record[name] ?? null
  }

  const fetchFn = (async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'

    if (url.endsWith('/v0/meta')) {
      if (metaStatus !== 200) {
        return jsonResponse({ error: 'meta unavailable' }, metaStatus)
      }
      return jsonResponse(DAEMON_META)
    }

    if (method === 'POST' && url.endsWith('/v0/execution/sessions')) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      startRequests.push(body)
      if (startStatus !== 201) {
        return jsonResponse({ error: 'start rejected' }, startStatus)
      }
      const config = body.config as { sessionId: string }
      return jsonResponse(
        { protocolVersion: 1, sessionId: config.sessionId },
        201,
      )
    }

    if (method === 'POST' && url.includes('/commands')) {
      if (commandStatus !== 202) {
        return jsonResponse({ error: 'command rejected' }, commandStatus)
      }
      commandEnvelopes.push(
        JSON.parse(String(init?.body)) as Record<string, unknown>,
      )
      return jsonResponse({ accepted: true }, 202)
    }

    if (url.includes('/events')) {
      const lastEventId = headerValue(init?.headers, 'Last-Event-ID')
      eventStreamLastEventIds.push(lastEventId)
      if (eventsStatus !== 200) {
        return jsonResponse({ error: 'stream rejected' }, eventsStatus)
      }
      const afterSeq = lastEventId ? Number(lastEventId) : 0
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          current.controller = controller
          for (const envelope of log) {
            if (envelope.seq > afterSeq) controller.enqueue(sseChunk(envelope))
          }
          init?.signal?.addEventListener('abort', () => {
            if (current.controller === controller) current.controller = null
            try {
              controller.error(new Error('aborted'))
            } catch {
              // Stream may already be closed.
            }
          })
        },
        cancel() {
          if (current.controller) current.controller = null
        },
      })
      return new Response(stream, { status: 200 })
    }

    throw new Error(`Unexpected request: ${method} ${url}`)
  }) as typeof fetch

  return {
    fetchFn,
    emit(envelope) {
      log.push(envelope)
      current.controller?.enqueue(sseChunk(envelope))
    },
    dropStream() {
      const controller = current.controller
      current.controller = null
      controller?.close()
    },
    startRequests,
    commandEnvelopes,
    eventStreamLastEventIds,
    setMetaStatus(status) {
      metaStatus = status
    },
    setStartStatus(status) {
      startStatus = status
    },
    setCommandStatus(status) {
      commandStatus = status
    },
    setEventsStatus(status) {
      eventsStatus = status
    },
  }
}

function createHost(stub: StubDaemon): RemoteExecutionHost {
  return new RemoteExecutionHost({
    connection: {
      resolveConnection: async () => ({
        baseUrl: 'http://daemon.test',
        token: 'test-token',
      }),
    },
    fetch: stub.fetchFn,
    reconnect: { maxAttempts: 2, wait: async () => {} },
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

function envelope(
  seq: number,
  event: ExecutionHostEventEnvelope['event'],
  sessionId = 's-1',
): ExecutionHostEventEnvelope {
  return { protocolVersion: 1, sessionId, seq, event }
}

async function waitUntil(
  predicate: () => boolean,
  description: string,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${description}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('RemoteExecutionHost', () => {
  let stub: StubDaemon
  let host: RemoteExecutionHost

  beforeEach(async () => {
    stub = createStubDaemon()
    host = createHost(stub)
    await host.refreshProviders()
  })

  describe('contract suite', () => {
    let ctx: ExecutionHostContractContext

    beforeEach(() => {
      ctx = {
        host,
        fullProviderId: 'claude',
        noOneShotProviderId: 'codex',
        unknownProviderId: 'missing-provider',
        hostSupportsOneShot: false,
      }
    })

    describeProviderExecutionHostContract('RemoteExecutionHost', () => ctx)
  })

  it('classifies meta auth failures', async () => {
    stub.setMetaStatus(401)
    await expect(host.refreshProviders()).rejects.toMatchObject({
      name: 'RemoteExecutionHostError',
      kind: 'auth',
    })
  })

  it('classifies unreachable daemons as network errors', async () => {
    const offline = new RemoteExecutionHost({
      connection: {
        resolveConnection: async () => ({
          baseUrl: 'http://daemon.test',
          token: 'tok',
        }),
      },
      fetch: (async () => {
        throw new Error('ECONNREFUSED')
      }) as typeof fetch,
    })
    await expect(offline.refreshProviders()).rejects.toMatchObject({
      kind: 'network',
    })
  })

  it('keeps the previous provider cache when describe cannot reach the daemon', async () => {
    stub.setMetaStatus(500)
    const descriptors = await host.describe()
    expect(descriptors.map((d) => d.id)).toEqual(['claude', 'codex'])
  })

  it('starts a session, posts the start request, and streams events in order', async () => {
    const deltas: SessionDelta[] = []
    const statuses: SessionStatus[] = []
    const tokens: string[] = []
    const heartbeats: number[] = []

    const handle = host.start('claude', startConfig('s-1'))
    handle.onDelta((delta) => deltas.push(delta))
    handle.onStatusChange((status) => statuses.push(status))
    handle.onContinuationToken((token) => tokens.push(token))
    handle.onActivityHeartbeat?.(() => heartbeats.push(1))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'event stream to open',
    )
    expect(stub.startRequests[0]).toMatchObject({
      protocolVersion: 1,
      providerId: 'claude',
      config: { sessionId: 's-1', initialMessage: 'hello' },
    })

    stub.emit(
      envelope(1, {
        kind: 'delta',
        delta: { kind: 'session.patch', patch: { status: 'running' } },
      }),
    )
    stub.emit(envelope(2, { kind: 'status', status: 'running' }))
    stub.emit(envelope(3, { kind: 'continuation-token', token: 'resume-1' }))
    stub.emit(envelope(4, { kind: 'heartbeat' }))

    await waitUntil(() => heartbeats.length === 1, 'all events to arrive')
    expect(deltas).toEqual([
      { kind: 'session.patch', patch: { status: 'running' } },
    ])
    expect(statuses).toEqual(['running'])
    expect(tokens).toEqual(['resume-1'])

    handle.stop()
  })

  it('resumes a dropped stream from the last processed sequence', async () => {
    const statuses: SessionStatus[] = []
    const handle = host.start('claude', startConfig('s-1'))
    handle.onStatusChange((status) => statuses.push(status))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'first stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    await waitUntil(() => statuses.length === 1, 'first event')

    stub.dropStream()
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 2,
      'reconnect after drop',
    )
    expect(stub.eventStreamLastEventIds[1]).toBe('1')

    stub.emit(envelope(2, { kind: 'status', status: 'completed' }))
    await waitUntil(() => statuses.length === 2, 'event after resume')
    expect(statuses).toEqual(['running', 'completed'])

    handle.stop()
  })

  it('queues commands sent before start completes and posts them as envelopes', async () => {
    const handle = host.start('claude', startConfig('s-1'))
    handle.sendMessage('follow up', undefined, undefined, {
      deliveryMode: 'follow-up',
    })
    handle.approve('approval-1')

    await waitUntil(
      () => stub.commandEnvelopes.length === 2,
      'queued commands to flush',
    )
    expect(stub.commandEnvelopes[0]).toEqual({
      protocolVersion: 1,
      sessionId: 's-1',
      command: {
        kind: 'send-message',
        text: 'follow up',
        options: { deliveryMode: 'follow-up' },
      },
    })
    expect(stub.commandEnvelopes[1]).toEqual({
      protocolVersion: 1,
      sessionId: 's-1',
      command: { kind: 'approve', providerApprovalId: 'approval-1' },
    })

    handle.stop()
    await waitUntil(
      () => stub.commandEnvelopes.length === 3,
      'stop command to post',
    )
    expect(stub.commandEnvelopes[2]).toMatchObject({
      command: { kind: 'stop' },
    })
  })

  it('surfaces a failed start through deltas and status, not thrown errors', async () => {
    stub.setStartStatus(400)
    const deltas: SessionDelta[] = []
    const statuses: SessionStatus[] = []
    const attentions: AttentionState[] = []

    const handle = host.start('claude', startConfig('s-1'))
    handle.onDelta((delta) => deltas.push(delta))
    handle.onStatusChange((status) => statuses.push(status))
    handle.onAttentionChange((attention) => attentions.push(attention))

    await waitUntil(() => statuses.length === 1, 'failure to surface')
    expect(statuses).toEqual(['failed'])
    expect(attentions).toEqual(['failed'])

    const note = deltas.find((d) => d.kind === 'conversation.item.add')
    expect(note).toBeDefined()
    if (note?.kind === 'conversation.item.add' && note.item.kind === 'note') {
      expect(note.item.text).toContain('failed to start')
    }
    const patch = deltas.find((d) => d.kind === 'session.patch')
    if (patch?.kind === 'session.patch') {
      expect(patch.patch.status).toBe('failed')
      expect(patch.patch.attention).toBe('failed')
    }
  })

  it('fails the session after exhausting stream reconnect attempts', async () => {
    stub.setEventsStatus(500)
    const statuses: SessionStatus[] = []
    const handle = host.start('claude', startConfig('s-1'))
    handle.onStatusChange((status) => statuses.push(status))

    await waitUntil(() => statuses.length === 1, 'stream failure to surface')
    expect(statuses).toEqual(['failed'])
  })

  it('surfaces lost commands as attention without killing the session', async () => {
    const attentions: AttentionState[] = []
    const statuses: SessionStatus[] = []
    const deltas: SessionDelta[] = []

    const handle = host.start('claude', startConfig('s-1'))
    handle.onAttentionChange((attention) => attentions.push(attention))
    handle.onStatusChange((status) => statuses.push(status))
    handle.onDelta((delta) => deltas.push(delta))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'session to start',
    )
    stub.setCommandStatus(500)
    handle.sendMessage('lost message')

    await waitUntil(() => attentions.length === 1, 'attention to surface')
    expect(attentions).toEqual(['failed'])
    expect(statuses).toEqual([])
    const note = deltas.find((d) => d.kind === 'conversation.item.add')
    expect(note).toBeDefined()

    handle.stop()
  })

  it('attaches to a running session without posting a start request', async () => {
    const statuses: SessionStatus[] = []
    const handle = host.attach('claude', startConfig('s-1'), 3)
    handle.onStatusChange((status) => statuses.push(status))

    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'attach stream to open',
    )
    expect(stub.startRequests).toHaveLength(0)
    expect(stub.eventStreamLastEventIds[0]).toBe('3')

    stub.emit(envelope(4, { kind: 'status', status: 'running' }))
    await waitUntil(() => statuses.length === 1, 'resumed event')
    expect(statuses).toEqual(['running'])

    handle.sendMessage('still there?')
    await waitUntil(
      () => stub.commandEnvelopes.length === 1,
      'command after attach',
    )
    expect(stub.commandEnvelopes[0]).toMatchObject({
      command: { kind: 'send-message', text: 'still there?' },
    })

    handle.stop()
  })

  it('reports processed event sequences through onEventSeq', async () => {
    const seqs: Array<[string, number]> = []
    const seqHost = new RemoteExecutionHost({
      connection: {
        resolveConnection: async () => ({
          baseUrl: 'http://daemon.test',
          token: 'test-token',
        }),
      },
      fetch: stub.fetchFn,
      reconnect: { maxAttempts: 2, wait: async () => {} },
      onEventSeq: (sessionId, seq) => seqs.push([sessionId, seq]),
    })
    await seqHost.refreshProviders()

    const handle = seqHost.start('claude', startConfig('s-1'))
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'stream to open',
    )
    stub.emit(envelope(1, { kind: 'status', status: 'running' }))
    stub.emit(envelope(2, { kind: 'heartbeat' }))

    await waitUntil(() => seqs.length === 2, 'sequence callbacks')
    expect(seqs).toEqual([
      ['s-1', 1],
      ['s-1', 2],
    ])

    handle.stop()
  })

  it('throws synchronously for unknown providers on start', () => {
    expect(() => host.start('missing', startConfig('s-x'))).toThrow(
      'Provider not found: missing',
    )
  })

  it('rejects one-shot execution with canonical errors', async () => {
    await expect(
      host.oneShot('missing', {
        prompt: 'p',
        modelId: 'm',
        workingDirectory: '/tmp',
      }),
    ).rejects.toThrow('Provider not found: missing')
    await expect(
      host.oneShot('claude', {
        prompt: 'p',
        modelId: 'm',
        workingDirectory: '/tmp',
      }),
    ).rejects.toThrow('Provider claude does not support one-shot execution')
  })

  it('exposes remote error metadata on the error type', () => {
    const error = new RemoteExecutionHostError('nope', 'http', 503)
    expect(error.kind).toBe('http')
    expect(error.status).toBe(503)
  })
})
