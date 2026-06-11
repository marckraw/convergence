import { describe, expect, it } from 'vitest'
import {
  decodeExecutionHostCommandEnvelope,
  decodeExecutionHostEventEnvelope,
  decodeExecutionHostStartRequest,
  encodeExecutionHostCommandEnvelope,
  encodeExecutionHostEventEnvelope,
  encodeExecutionHostStartRequest,
} from './execution-host-protocol.pure'
import {
  EXECUTION_HOST_PROTOCOL_VERSION,
  type ExecutionHostCommandEnvelope,
  type ExecutionHostEvent,
  type ExecutionHostEventEnvelope,
  type ExecutionHostStartRequest,
} from './execution-host-protocol.types'

function eventEnvelope(event: ExecutionHostEvent): ExecutionHostEventEnvelope {
  return {
    protocolVersion: EXECUTION_HOST_PROTOCOL_VERSION,
    sessionId: 'session-1',
    seq: 7,
    event,
  }
}

describe('execution host event envelope codec', () => {
  const events: ExecutionHostEvent[] = [
    {
      kind: 'delta',
      delta: { kind: 'session.patch', patch: { status: 'running' } },
    },
    { kind: 'status', status: 'running' },
    { kind: 'attention', attention: 'needs-approval' },
    { kind: 'continuation-token', token: 'tok-123' },
    {
      kind: 'context-window',
      contextWindow: {
        availability: 'unavailable',
        source: 'provider',
        reason: 'not reported',
      },
    },
    { kind: 'activity', activity: 'tool:Bash' },
    { kind: 'activity', activity: null },
    { kind: 'heartbeat' },
  ]

  it.each(events.map((e) => [e.kind, e] as const))(
    'round-trips %s events',
    (_kind, event) => {
      const envelope = eventEnvelope(event)
      const decoded = decodeExecutionHostEventEnvelope(
        encodeExecutionHostEventEnvelope(envelope),
      )
      expect(decoded).toEqual({ ok: true, value: envelope })
    },
  )

  it('rejects malformed json', () => {
    expect(decodeExecutionHostEventEnvelope('{nope')).toEqual({
      ok: false,
      reason: 'malformed-json',
    })
  })

  it('rejects unsupported protocol versions', () => {
    const raw = JSON.stringify({
      ...eventEnvelope({ kind: 'heartbeat' }),
      protocolVersion: 99,
    })
    expect(decodeExecutionHostEventEnvelope(raw)).toEqual({
      ok: false,
      reason: 'unsupported-protocol-version',
    })
  })

  it('rejects envelopes without a positive integer seq', () => {
    const raw = JSON.stringify({
      ...eventEnvelope({ kind: 'heartbeat' }),
      seq: 0,
    })
    expect(decodeExecutionHostEventEnvelope(raw)).toEqual({
      ok: false,
      reason: 'invalid-envelope',
    })
  })

  it('rejects unknown event kinds', () => {
    const raw = JSON.stringify(
      eventEnvelope({ kind: 'telepathy' } as unknown as ExecutionHostEvent),
    )
    expect(decodeExecutionHostEventEnvelope(raw)).toEqual({
      ok: false,
      reason: 'unknown-kind',
    })
  })

  it('rejects invalid event payloads', () => {
    const raw = JSON.stringify(
      eventEnvelope({
        kind: 'status',
        status: 'exploded',
      } as unknown as ExecutionHostEvent),
    )
    expect(decodeExecutionHostEventEnvelope(raw)).toEqual({
      ok: false,
      reason: 'invalid-payload',
    })
  })

  it('rejects invalid activity signals', () => {
    const raw = JSON.stringify(
      eventEnvelope({
        kind: 'activity',
        activity: 'dancing',
      } as unknown as ExecutionHostEvent),
    )
    expect(decodeExecutionHostEventEnvelope(raw)).toEqual({
      ok: false,
      reason: 'invalid-payload',
    })
  })
})

describe('execution host command envelope codec', () => {
  const commands: ExecutionHostCommandEnvelope['command'][] = [
    {
      kind: 'send-message',
      text: 'hello',
      options: { deliveryMode: 'normal', queuedInputId: 'q-1' },
    },
    { kind: 'approve', providerApprovalId: 'appr-1' },
    { kind: 'deny' },
    { kind: 'stop' },
  ]

  it.each(commands.map((c) => [c.kind, c] as const))(
    'round-trips %s commands',
    (_kind, command) => {
      const envelope: ExecutionHostCommandEnvelope = {
        protocolVersion: EXECUTION_HOST_PROTOCOL_VERSION,
        sessionId: 'session-1',
        command,
      }
      const decoded = decodeExecutionHostCommandEnvelope(
        encodeExecutionHostCommandEnvelope(envelope),
      )
      expect(decoded).toEqual({ ok: true, value: envelope })
    },
  )

  it('rejects send-message commands without text', () => {
    const raw = JSON.stringify({
      protocolVersion: EXECUTION_HOST_PROTOCOL_VERSION,
      sessionId: 'session-1',
      command: { kind: 'send-message' },
    })
    expect(decodeExecutionHostCommandEnvelope(raw)).toEqual({
      ok: false,
      reason: 'invalid-payload',
    })
  })

  it('rejects unknown command kinds', () => {
    const raw = JSON.stringify({
      protocolVersion: EXECUTION_HOST_PROTOCOL_VERSION,
      sessionId: 'session-1',
      command: { kind: 'restart' },
    })
    expect(decodeExecutionHostCommandEnvelope(raw)).toEqual({
      ok: false,
      reason: 'unknown-kind',
    })
  })
})

describe('execution host start request codec', () => {
  it('round-trips a start request', () => {
    const request: ExecutionHostStartRequest = {
      protocolVersion: EXECUTION_HOST_PROTOCOL_VERSION,
      providerId: 'claude-code',
      config: {
        sessionId: 'session-1',
        workingDirectory: '/work/repo',
        initialMessage: 'hello',
        model: 'claude-fable-5',
        effort: 'medium',
        continuationToken: null,
      },
    }
    const decoded = decodeExecutionHostStartRequest(
      encodeExecutionHostStartRequest(request),
    )
    expect(decoded).toEqual({ ok: true, value: request })
  })

  it('round-trips a start request with a workspace source', () => {
    const request: ExecutionHostStartRequest = {
      protocolVersion: EXECUTION_HOST_PROTOCOL_VERSION,
      providerId: 'claude-code',
      config: {
        sessionId: 'session-1',
        workingDirectory: '',
        initialMessage: 'hello',
        model: null,
        effort: null,
        continuationToken: null,
      },
      workspace: {
        repository: 'https://github.com/example/repo.git',
        ref: 'main',
        branchName: 'agent/session-1',
      },
    }
    const decoded = decodeExecutionHostStartRequest(
      encodeExecutionHostStartRequest(request),
    )
    expect(decoded).toEqual({ ok: true, value: request })
  })

  it('rejects start requests with an invalid workspace source', () => {
    const raw = JSON.stringify({
      protocolVersion: EXECUTION_HOST_PROTOCOL_VERSION,
      providerId: 'claude-code',
      config: {
        sessionId: 'session-1',
        workingDirectory: '',
        initialMessage: 'hello',
        model: null,
        effort: null,
        continuationToken: null,
      },
      workspace: { repository: '' },
    })
    expect(decodeExecutionHostStartRequest(raw)).toEqual({
      ok: false,
      reason: 'invalid-payload',
    })
  })

  it('rejects start requests with incomplete config', () => {
    const raw = JSON.stringify({
      protocolVersion: EXECUTION_HOST_PROTOCOL_VERSION,
      providerId: 'claude-code',
      config: { sessionId: 'session-1' },
    })
    expect(decodeExecutionHostStartRequest(raw)).toEqual({
      ok: false,
      reason: 'invalid-envelope',
    })
  })
})
