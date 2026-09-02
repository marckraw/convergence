import { describe, expect, it } from 'vitest'
import {
  decodeExecutionStartRequest,
  encodeExecutionEventEnvelope,
  encodeExecutionStartRequest,
  EXECUTION_PROTOCOL_VERSION,
  type ExecutionHostEventEnvelope,
} from '@mrck-labs/execution-host-protocol'
import type { EndpointHandshakeResult } from '@convergence/execution-host-client'
import {
  buildSendMessageEnvelope,
  buildStopEnvelope,
  buildStudioStartRequest,
  daemonUrl,
  describeDaemonFailure,
  describeDaemonStatus,
  readEnvelopeFrame,
  reconnectDelayMs,
} from './daemon-wire.pure'

const START = {
  sessionId: 'c-1',
  providerId: 'claude',
  workingDirectory: '/srv/projects/studio',
  initialMessage: 'make me a landing page',
}

describe('buildStudioStartRequest', () => {
  /**
   * The artifact, not the intent: the request is asserted through the
   * protocol's own encode/decode round trip, so a field this build invents or
   * misspells is one the wire contract itself rejects.
   *
   * Mutation: drop `workingDirectory` from the config and the decoded request
   * loses the only thing that says where the Entity works -> red.
   */
  it('encodes a request the protocol reads back unchanged', () => {
    const encoded = encodeExecutionStartRequest(buildStudioStartRequest(START))
    const decoded = decodeExecutionStartRequest(encoded)
    expect(decoded.ok).toBe(true)
    expect(decoded.ok && decoded.value).toEqual({
      protocolVersion: EXECUTION_PROTOCOL_VERSION,
      providerId: 'claude',
      config: {
        sessionId: 'c-1',
        workingDirectory: '/srv/projects/studio',
        initialMessage: 'make me a landing page',
        model: null,
        effort: null,
        continuationToken: null,
      },
    })
  })

  /**
   * This run owns no workspace, no room, no permission preset and no
   * attachments, and a request that carried one would be asking the daemon for
   * something no part of Studio can honour.
   *
   * Mutation: add `roomId: 'r-1'` to the config and this goes red.
   */
  it('asks for nothing this run does not own', () => {
    const request = buildStudioStartRequest(START)
    expect(Object.keys(request).sort()).toEqual([
      'config',
      'protocolVersion',
      'providerId',
    ])
    expect(Object.keys(request.config).sort()).toEqual([
      'continuationToken',
      'effort',
      'initialMessage',
      'model',
      'sessionId',
      'workingDirectory',
    ])
  })

  it('carries the configured provider id rather than a product name', () => {
    expect(
      buildStudioStartRequest({ ...START, providerId: 'codex' }).providerId,
    ).toBe('codex')
  })
})

describe('command envelopes', () => {
  it('builds a send-message the daemon can address to the session', () => {
    expect(buildSendMessageEnvelope('c-1', 'and make it blue')).toEqual({
      protocolVersion: EXECUTION_PROTOCOL_VERSION,
      sessionId: 'c-1',
      command: { kind: 'send-message', text: 'and make it blue' },
    })
  })

  it('builds a stop', () => {
    expect(buildStopEnvelope('c-1')).toEqual({
      protocolVersion: EXECUTION_PROTOCOL_VERSION,
      sessionId: 'c-1',
      command: { kind: 'stop' },
    })
  })
})

const envelope = (
  seq: number,
  sessionId = 'c-1',
): ExecutionHostEventEnvelope => ({
  protocolVersion: EXECUTION_PROTOCOL_VERSION,
  sessionId,
  seq,
  event: { kind: 'status', status: 'running' },
})

describe('readEnvelopeFrame', () => {
  it('reads a frame the daemon encoded', () => {
    const reading = readEnvelopeFrame(
      encodeExecutionEventEnvelope(envelope(1)),
      'c-1',
    )
    expect(reading.ok && reading.envelope.seq).toBe(1)
  })

  /**
   * A frame about another run is not evidence about this one. Without this
   * check it would be appended to this conversation's log and replayed forever
   * as though the Entity had said it.
   *
   * Mutation: delete the `sessionId` comparison and this goes red.
   */
  it('refuses a frame naming another session, and says which', () => {
    const reading = readEnvelopeFrame(
      encodeExecutionEventEnvelope(envelope(1, 'someone-else')),
      'c-1',
    )
    expect(reading.ok).toBe(false)
    expect(reading.ok ? '' : reading.reason).toContain('someone-else')
    expect(reading.ok ? '' : reading.reason).toContain('c-1')
  })

  /**
   * Mutation: return `{ ok: true }` for an undecodable frame and this goes red
   * — a frame that is not JSON would otherwise reach the log as an envelope.
   */
  it('refuses a frame it cannot decode', () => {
    const reading = readEnvelopeFrame('not json at all', 'c-1')
    expect(reading.ok).toBe(false)
    expect(reading.ok ? '' : reading.reason).toContain('cannot read')
  })
})

describe('daemonUrl', () => {
  it.each([
    ['https://d.example', 'https://d.example/v0/meta'],
    ['https://d.example/', 'https://d.example/v0/meta'],
    ['https://d.example///', 'https://d.example/v0/meta'],
  ])('joins %s without doubling the separator', (baseUrl, expected) => {
    expect(daemonUrl(baseUrl, '/v0/meta')).toBe(expected)
  })
})

describe('reconnectDelayMs', () => {
  it('backs off exponentially and stops at thirty seconds', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(reconnectDelayMs)).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000,
    ])
  })
})

const handshake = (
  over: Partial<EndpointHandshakeResult>,
): EndpointHandshakeResult => ({
  status: 'connected',
  daemonVersion: '0.26.1',
  daemonGitSha: null,
  daemonBuildTime: null,
  apiVersion: 'v0',
  uptimeSeconds: null,
  providers: { claude: true, codex: true },
  providerReadiness: {},
  executionProtocolCapabilities: [],
  sessionDirectorySearch: false,
  transcriptSearch: false,
  detail: null,
  ...over,
})

describe('describeDaemonStatus', () => {
  it('reports a handshake that worked', () => {
    const view = describeDaemonStatus(handshake({}), 'claude')
    expect(view).toEqual({
      status: 'connected',
      headline: 'Connected to the daemon.',
      detail: null,
      advertisedProviders: ['claude', 'codex'],
      providerMissing: false,
    })
  })

  /**
   * The seed's canary, carried forward (MAR-2737): every status gets its own
   * sentence and no failing one borrows the connected sentence.
   *
   * Mutation: return the connected headline for `incompatible` -> red.
   */
  it('never reports a failure as a handshake', () => {
    const said = (['unauthorized', 'incompatible', 'unreachable'] as const).map(
      (status) =>
        describeDaemonStatus(handshake({ status }), 'claude').headline,
    )
    expect(said).toEqual([
      'The daemon refused the token.',
      'The daemon speaks a protocol this build cannot read.',
      'The daemon did not answer.',
    ])
    expect(said).not.toContain('Connected to the daemon.')
  })

  /**
   * The failure this run expects to meet: a provider id the daemon does not
   * have. The names it does have are the half that fixes it.
   *
   * Mutation: drop the `!advertisedProviders.includes(providerId)` term -> red.
   */
  it('says when the configured provider is not one the daemon offers', () => {
    const view = describeDaemonStatus(handshake({}), 'claude-code')
    expect(view.providerMissing).toBe(true)
    expect(view.advertisedProviders).toEqual(['claude', 'codex'])
  })

  /**
   * A machine that never answered advertises nothing, and reading its silence
   * as "your provider is gone" is a second wrong answer on top of the first.
   *
   * Mutation: drop the `status === 'connected'` term and this goes red.
   */
  it('does not blame the provider when the daemon never answered', () => {
    const view = describeDaemonStatus(
      handshake({ status: 'unreachable', providers: {} }),
      'claude',
    )
    expect(view.providerMissing).toBe(false)
  })
})

describe('describeDaemonFailure', () => {
  it("prefers the daemon's own words", () => {
    expect(
      describeDaemonFailure(new Error('Unknown provider: claude-code')),
    ).toBe('Unknown provider: claude-code')
  })

  it('still says something when handed a value that is not an error', () => {
    expect(describeDaemonFailure(new Error('   '))).toBe('Error:    ')
    expect(describeDaemonFailure('plain')).toBe('plain')
  })
})
